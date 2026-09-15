"""재기동을 넘겨야 하는 것.

공유 링크와 답변 행이 프로세스 메모리에 살았다. 서버를 새로 띄우면 같이 사라진다. 공유 링크는
30일을 약속하고 카톡에 붙어 돌아다니는데, 배포 한 번에 그 전에 나간 링크가 전부 죽어 링크를
누른 사람에게 깨진 화면이 갔다. 그래서 **저장되는 자리만** 파일로 옮긴다. 부르는 쪽의 함수
이름과 인자는 그대로다.

SQLite 를 쓴다. 파이썬에 들어 있어 의존성이 늘지 않고, 파일 하나라 따로 띄울 서버가 없다.
담는 모양은 열쇠 하나에 JSON 한 덩이이고, 무엇을 담을지는 부르는 쪽이 정한다.

**쓰기 실패를 삼키지 않는다.** 파일에 못 썼는데 답을 돌려주면 「재기동을 넘긴다」가 거짓이 된다.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
from pathlib import Path
from typing import Any

from app.core.config import get_settings

# 테이블 이름은 SQL 문자열에 그대로 박힌다. 부르는 쪽이 상수로만 쓰지만 한 번 걸러 둔다
_NAME = re.compile(r"^[a-z][a-z0-9_]{0,40}$")

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
