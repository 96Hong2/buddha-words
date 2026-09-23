"""재기동을 넘겨야 하는 것.

공유 링크와 답변 행이 프로세스 메모리에 살았다. 서버를 새로 띄우면 같이 사라진다. 공유 링크는
30일을 약속하고 카톡에 붙어 돌아다니는데, 배포 한 번에 그 전에 나간 링크가 전부 죽어 링크를
누른 사람에게 깨진 화면이 갔다. 그래서 **저장되는 자리만** 파일로 옮긴다. 부르는 쪽의 함수
이름과 인자는 그대로다.

SQLite 를 쓴다. 파이썬에 들어 있어 의존성이 늘지 않고, 파일 하나라 따로 띄울 서버가 없다.
담는 모양은 열쇠 하나에 JSON 한 덩이이고, 무엇을 담을지는 부르는 쪽이 정한다.

**쓰기 실패를 삼키지 않는다.** 파일에 못 썼는데 답을 돌려주면 「재기동을 넘긴다」가 거짓이 된다.

배포는 Cloud Run 이라 파일조차 인스턴스와 함께 사라진다. 그래서 아래쪽에 PostgreSQL 자리를
함께 두고, `bind(이름)` 이 설정을 보고 둘 중 하나를 고른다. 담는 모양은 두 자리가 같다.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
from pathlib import Path
from typing import Any, Protocol

from app.core.config import get_settings

# 테이블 이름은 SQL 문자열에 그대로 박힌다. 부르는 쪽이 상수로만 쓰지만 한 번 걸러 둔다
_NAME = re.compile(r"^[a-z][a-z0-9_]{0,40}$")

# PostgreSQL 에 붙는 데 기다리는 상한(초). 페일오버로 끊긴 주소를 오래 붙들지 않는다
CONNECT_TIMEOUT = 5

# 요청은 스레드풀에서 온다. 연결 하나를 이 잠금으로 감싸 쓴다
_LOCK = threading.Lock()
_CONN: sqlite3.Connection | None = None
_CONN_PATH: Path | None = None
_READY: set[str] = set()


def _connection() -> sqlite3.Connection:
    """설정이 가리키는 파일에 붙는다. 경로가 바뀌면 새로 연다."""
    global _CONN, _CONN_PATH
    path = get_settings().state_db_path
    if _CONN is not None and _CONN_PATH == path:
        return _CONN
    if _CONN is not None:
        _CONN.close()
    path.parent.mkdir(parents=True, exist_ok=True)
    _CONN = sqlite3.connect(path, check_same_thread=False)
    # 읽는 쪽이 쓰는 쪽을 기다리지 않게 한다. 카톡 크롤러가 몰려 올 때 읽기가 막히면 안 된다
    _CONN.execute("PRAGMA journal_mode=WAL")
    _CONN_PATH = path
    _READY.clear()
    return _CONN


def close() -> None:
    """붙어 있던 파일을 놓는다. 다음에 부를 때 설정이 가리키는 파일에 새로 붙는다.

    테스트가 재기동을 흉내 낼 때 부른다. 새 프로세스는 파일을 처음부터 다시 연다.
    """
    global _CONN, _CONN_PATH
    with _LOCK:
        if _CONN is not None:
            _CONN.close()
        _CONN = None
        _CONN_PATH = None
        _READY.clear()


class Table:
    """열쇠 → JSON 한 덩이. 만든 시각을 함께 두어 TTL 청소가 여기서 돈다."""

    def __init__(self, name: str) -> None:
        if not _NAME.match(name):
            raise ValueError(f"테이블 이름으로 쓸 수 없어요: {name}")
        self.name = name

    def _ensure(self, conn: sqlite3.Connection) -> None:
        if self.name in _READY:
            return
        conn.execute(
            f"CREATE TABLE IF NOT EXISTS {self.name} "
            "(key TEXT PRIMARY KEY, created_at REAL NOT NULL, value TEXT NOT NULL)"
        )
        conn.commit()
        _READY.add(self.name)

    def put(self, key: str, value: dict[str, Any], created_at: float) -> None:
        with _LOCK:
            conn = _connection()
            self._ensure(conn)
            conn.execute(
                f"INSERT OR REPLACE INTO {self.name} (key, created_at, value) VALUES (?, ?, ?)",
                (key, created_at, json.dumps(value, ensure_ascii=False)),
            )
            conn.commit()

    def get(self, key: str) -> tuple[dict[str, Any], float] | None:
        """담아 둔 값과 만든 시각. 없으면 None."""
        with _LOCK:
            conn = _connection()
            self._ensure(conn)
            found = conn.execute(
                f"SELECT value, created_at FROM {self.name} WHERE key = ?", (key,)
            ).fetchone()
        return (json.loads(found[0]), found[1]) if found else None

    def claim(self, key: str, value: dict[str, Any], created_at: float) -> bool:
        """이 열쇠를 **처음 넣는 사람만 True** 를 받는다. 이미 있으면 안 덮고 False.

        `put` 과 달리 「먼저 확인하고 그다음 쓴다」를 한 문장으로 만든다. 둘로 나누면 그
        사이에 다른 요청이 같은 확인을 통과한다. 한 번뿐인 것을 나눠 줄 때 쓴다.
        """
        with _LOCK:
            conn = _connection()
            self._ensure(conn)
            cur = conn.execute(
                f"INSERT OR IGNORE INTO {self.name} (key, created_at, value) VALUES (?, ?, ?)",
                (key, created_at, json.dumps(value, ensure_ascii=False)),
            )
            conn.commit()
            return cur.rowcount > 0

    def delete(self, key: str) -> None:
        """한 줄만 지운다. 잡아 둔 자리를 되돌리는 쪽이 쓴다."""
        with _LOCK:
            conn = _connection()
            self._ensure(conn)
            conn.execute(f"DELETE FROM {self.name} WHERE key = ?", (key,))
            conn.commit()

    def sweep(self, ttl: float, now: float) -> None:
        """TTL 이 지난 것을 지운다. 재기동 뒤에 만료분이 살아 돌아오지 않게 한다."""
        with _LOCK:
            conn = _connection()
            self._ensure(conn)
            conn.execute(f"DELETE FROM {self.name} WHERE created_at <= ?", (now - ttl,))
            conn.commit()

    def clear(self) -> None:
        """테스트가 격리하려고 부른다."""
        with _LOCK:
            conn = _connection()
            self._ensure(conn)
            conn.execute(f"DELETE FROM {self.name}")
            conn.commit()


class KeyValueTable(Protocol):
    """저장 자리가 갖춰야 하는 모양. 열쇠 하나에 JSON 한 덩이와 만든 시각.

    무엇을 담을지는 부르는 쪽이 정하고, 이 자리는 담고 꺼내고 만료분을 치우는 것만 한다.
    """

    def put(self, key: str, value: dict[str, Any], created_at: float) -> None: ...

    def get(self, key: str) -> tuple[dict[str, Any], float] | None: ...

    def claim(self, key: str, value: dict[str, Any], created_at: float) -> bool: ...

    def delete(self, key: str) -> None: ...

    def sweep(self, ttl: float, now: float) -> None: ...

    def clear(self) -> None: ...

    def close(self) -> None: ...


class SqliteTable(Table):
    """파일 자리. 닫는 것만 더한다.

    연결은 이 모듈이 하나로 들고 있어서 닫는 것도 여기다.
    """

    def close(self) -> None:
        close()


class PostgresTable:
    """PostgreSQL 자리. 배포가 쓰는 쪽이다.

    담는 모양을 SQLite 와 똑같이 맞춘다. 값을 JSONB 가 아니라 글자로 두어 두 자리에 적히는
    글자가 완전히 같게 했다. 저장된 것을 훑는 시험이 어느 자리에서든 같은 것을 보게 된다.

    연결은 하나를 잠금으로 감싸 쓴다. Cloud SQL 은 오래 놀던 연결을 끊는데, 담아 둔 것이
    한참 뒤에 처음 긁힐 수도 있다. 끊긴 연결을 만나면 한 번은 다시 붙어 보고, 그래도 안
    되면 터뜨린다. **쓰기 실패를 삼키지 않는다.** 못 썼는데 됐다고 답하면 「재기동을
    넘긴다」가 거짓이 된다.
    """

    def __init__(self, name: str, url: str) -> None:
        if not _NAME.match(name):
            raise ValueError(f"테이블 이름으로 쓸 수 없어요: {name}")
        self.name = name
        self._url = url
        self._lock = threading.Lock()
        self._conn: Any = None

    def _connection(self) -> Any:
        if self._conn is not None and not self._conn.closed:
            return self._conn
        # SQLite 만 쓰는 개발이 이 라이브러리를 열지 않게 여기서 가져온다
        import psycopg

        # ⚠ **기다리는 시간에 상한을 둔다.** 이 자리는 답을 만드는 길목이기도 해서
        # (`quota/free_once.py`), 붙는 데 오래 걸리면 그 인스턴스의 다른 요청까지 함께
        # 멈춘다. 리눅스 기본 TCP 타임아웃은 2분이 넘는다.
        conn = psycopg.connect(self._url, autocommit=True, connect_timeout=CONNECT_TIMEOUT)
        conn.execute(
            f"CREATE TABLE IF NOT EXISTS {self.name} "
            '("key" TEXT PRIMARY KEY, created_at DOUBLE PRECISION NOT NULL, "value" TEXT NOT NULL)'
        )
        self._conn = conn
        return conn

    def _drop(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                # 이미 끊긴 연결을 놓는 중이다. 여기서 더 할 일이 없다
                pass
            self._conn = None

    def _run(self, sql: str, args: tuple[Any, ...], *, fetch: bool = False) -> Any:
        import psycopg

        with self._lock:
            for last in (False, True):
                try:
                    with self._connection().cursor() as cur:
                        cur.execute(sql, args)
                        return cur.fetchone() if fetch else None
                except (psycopg.OperationalError, psycopg.InterfaceError):
                    self._drop()
                    if last:
                        raise
        return None

    def put(self, key: str, value: dict[str, Any], created_at: float) -> None:
        self._run(
            f'INSERT INTO {self.name} ("key", created_at, "value") VALUES (%s, %s, %s) '
            'ON CONFLICT ("key") DO UPDATE SET created_at = EXCLUDED.created_at, '
            '"value" = EXCLUDED."value"',
            (key, created_at, json.dumps(value, ensure_ascii=False)),
        )

    def get(self, key: str) -> tuple[dict[str, Any], float] | None:
        found = self._run(
            f'SELECT "value", created_at FROM {self.name} WHERE "key" = %s', (key,), fetch=True
        )
        return (json.loads(found[0]), found[1]) if found else None

    def claim(self, key: str, value: dict[str, Any], created_at: float) -> bool:
        found = self._run(
            f'INSERT INTO {self.name} ("key", created_at, "value") VALUES (%s, %s, %s) '
            'ON CONFLICT ("key") DO NOTHING RETURNING "key"',
            (key, created_at, json.dumps(value, ensure_ascii=False)),
            fetch=True,
        )
        return found is not None

    def delete(self, key: str) -> None:
        self._run(f'DELETE FROM {self.name} WHERE "key" = %s', (key,))

    def sweep(self, ttl: float, now: float) -> None:
        self._run(f"DELETE FROM {self.name} WHERE created_at <= %s", (now - ttl,))

    def clear(self) -> None:
        self._run(f"DELETE FROM {self.name}", ())

    def close(self) -> None:
        with self._lock:
            self._drop()


# 이름마다 지금 붙어 있는 자리. 설정 값과 함께 들고 있다가 값이 바뀌면 새로 만든다.
# 요청은 스레드풀에서 오므로 만드는 자리를 잠근다. 잠그지 않으면 아직 아무도 안 쓴
# 프로세스에 요청이 동시에 들어올 때 둘이 각각 연결을 열고, 진 쪽 연결이 닫히지 않는다
_BOUND: dict[str, tuple[str | None, KeyValueTable]] = {}
_BIND_LOCK = threading.Lock()


def bind(name: str) -> KeyValueTable:
    """이 이름으로 담을 자리. `DATABASE_URL` 이 있으면 PostgreSQL, 없으면 SQLite 파일이다.

    Cloud Run 은 인스턴스 안 파일이 배포·유휴 종료·오토스케일마다 사라지고 인스턴스끼리
    서로 다른 파일을 본다. 그래서 배포에서는 반드시 PostgreSQL 이다.
    """
    url = get_settings().database_url
    bound = _BOUND.get(name)
    if bound is not None and bound[0] == url:
        return bound[1]
    with _BIND_LOCK:
        # 기다리는 사이에 다른 스레드가 만들어 뒀을 수 있다. 다시 본다
        again = _BOUND.get(name)
        if again is not None and again[0] == url:
            return again[1]
        if again is not None:
            again[1].close()
        table: KeyValueTable = PostgresTable(name, url) if url else SqliteTable(name)
        _BOUND[name] = (url, table)
        return table


def unbind(name: str) -> None:
    """붙어 있던 자리를 놓는다. 테스트가 설정을 갈아 끼울 때 부른다."""
    with _BIND_LOCK:
        bound = _BOUND.pop(name, None)
    if bound is not None:
        bound[1].close()
