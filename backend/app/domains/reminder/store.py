"""「내일 알림으로 여쭤볼게요」 예약을 담는 자리.

기기(localStorage)가 아니라 **서버**에 담는다. 알림은 앱이 꺼져 있을 때 가야 하고, 그러려면
보낼 시각에 서버가 대상을 알고 있어야 한다. 기기에만 있으면 앱을 열어야 알 수 있어서
「앱을 열면 묻는다」 밖으로 못 나간다.

**담는 것은 넷뿐이다**: 누구(익명키) · 언제 · 무슨 행동이었나 · 보냈나.
고민 원문과 답변 본문은 어디에도 담지 않는다. 알림 문구에 나갈 수 있는 것은 행동 제목 하나다.

한 사람에 한 줄이다. 새로 누르면 앞의 예약을 덮는다. 줄이 쌓이면 하루에 여러 통이 가고,
그것은 리텐션이 아니라 스팸이다.

저장 자리는 `DATABASE_URL` 이 있으면 PostgreSQL, 없으면 SQLite 파일이다. 공유 카드 저장과
같은 구조를 쓴다. Cloud Run 은 컨테이너가 사라지므로 운영에서는 반드시 PostgreSQL 이다.
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from typing import Any, Protocol

from app.core.config import get_settings

# 같은 SQLite 연결을 `persist.Table` 과 나눠 쓴다. 그래서 **잠금도 같은 것을 쓴다.**
# 공유 카드 저장은 스레드풀에서(`def` 라우트), 예약은 이벤트 루프에서(`async def` 라우트)
# 돌아서, 각자 다른 잠금을 쓰면 두 스레드가 같은 연결을 동시에 만진다.
from app.core.persist import _LOCK as _SQLITE_LOCK
from app.core.persist import _connection as _sqlite_connection
from app.core.persist import close as _sqlite_close

TABLE_NAME = "reminders"

# 테이블 이름은 SQL 문자열에 그대로 박힌다. 상수로만 쓰지만 한 번 걸러 둔다
_NAME = re.compile(r"^[a-z][a-z0-9_]{0,40}$")

# 알림 문구에 실리는 유일한 사용자 글이다. 길면 잘라서 담는다.
#
# 30자로 잡은 근거: 공식 문구 가이드가 **내용 25자 이내**(띄어쓰기 포함, 변수는 2글자로
# 계산)를 요구한다. 템플릿의 고정 문구를 빼면 변수에 쓸 수 있는 자리가 그만큼 좁다.
# 80자를 그대로 담으면 등록은 통과해도 실제 푸시에서 문장이 잘려 나온다.
ACTION_TITLE_MAX = 30


@dataclass(frozen=True, slots=True)
class Reminder:
    """보낼 차례가 되면 이 줄 하나로 한 통을 만든다."""

    anon_key: str
    """언제 보낼까. epoch 초(UTC)"""
    due_at: float
    """그날 적어 드린 행동 하나의 제목"""
    action_title: str
    """보낸 시각. 아직이면 None"""
    sent_at: float | None = None


class ReminderTable(Protocol):
    def upsert(self, reminder: Reminder) -> None: ...

    def due(self, now: float) -> list[Reminder]: ...

    def claim(self, reminder: Reminder, now: float) -> bool: ...

    def delete(self, anon_key: str) -> None: ...

    def sweep(self, now: float, ttl: float) -> None: ...

    def clear(self) -> None: ...

    def close(self) -> None: ...


_CREATE_SQLITE = (
    f"CREATE TABLE IF NOT EXISTS {TABLE_NAME} ("
    "anon_key TEXT PRIMARY KEY, due_at REAL NOT NULL, "
    "action_title TEXT NOT NULL, sent_at REAL)"
)

_CREATE_POSTGRES = (
    f"CREATE TABLE IF NOT EXISTS {TABLE_NAME} ("
    "anon_key TEXT PRIMARY KEY, due_at DOUBLE PRECISION NOT NULL, "
    "action_title TEXT NOT NULL, sent_at DOUBLE PRECISION)"
)


def _row(values: Any) -> Reminder:
    return Reminder(
        anon_key=values[0],
        due_at=float(values[1]),
        action_title=values[2],
        sent_at=None if values[3] is None else float(values[3]),
    )


class SqliteReminders:
    """파일 자리. 개발과 테스트가 쓴다.

    **테이블이 있나를 캐시하지 않는다.** 연결은 `persist` 가 모듈 하나로 들고 있고 설정이
    가리키는 파일이 바뀌면 조용히 새 파일로 갈아탄다. 이쪽에 「만들어 뒀다」를 기억해 두면
    새 파일에서 CREATE 를 건너뛰어 `no such table` 이 난다. `IF NOT EXISTS` 는 싸다.
    """

    def _conn(self) -> Any:
        conn = _sqlite_connection()
        conn.execute(_CREATE_SQLITE)
        return conn

    def upsert(self, reminder: Reminder) -> None:
        with _SQLITE_LOCK:
            conn = self._conn()
            conn.execute(
                f"INSERT OR REPLACE INTO {TABLE_NAME} "
                "(anon_key, due_at, action_title, sent_at) VALUES (?, ?, ?, ?)",
                (reminder.anon_key, reminder.due_at, reminder.action_title, reminder.sent_at),
            )
            conn.commit()

    def due(self, now: float) -> list[Reminder]:
        with _SQLITE_LOCK:
            rows = (
                self._conn()
                .execute(
                    f"SELECT anon_key, due_at, action_title, sent_at FROM {TABLE_NAME} "
                    "WHERE sent_at IS NULL AND due_at <= ? ORDER BY due_at",
                    (now,),
                )
                .fetchall()
            )
        return [_row(r) for r in rows]

    def claim(self, reminder: Reminder, now: float) -> bool:
        with _SQLITE_LOCK:
            conn = self._conn()
            cur = conn.execute(
                f"UPDATE {TABLE_NAME} SET sent_at = ? "
                "WHERE anon_key = ? AND due_at = ? AND sent_at IS NULL",
                (now, reminder.anon_key, reminder.due_at),
            )
            conn.commit()
            return cur.rowcount > 0

    def delete(self, anon_key: str) -> None:
        with _SQLITE_LOCK:
            conn = self._conn()
            conn.execute(f"DELETE FROM {TABLE_NAME} WHERE anon_key = ?", (anon_key,))
            conn.commit()

    def sweep(self, now: float, ttl: float) -> None:
        with _SQLITE_LOCK:
            conn = self._conn()
            conn.execute(f"DELETE FROM {TABLE_NAME} WHERE due_at <= ?", (now - ttl,))
            conn.commit()

    def clear(self) -> None:
        with _SQLITE_LOCK:
            conn = self._conn()
            conn.execute(f"DELETE FROM {TABLE_NAME}")
            conn.commit()

    def close(self) -> None:
        _sqlite_close()


class PostgresReminders:
    """PostgreSQL 자리. 배포가 쓰는 쪽이다.

    Cloud SQL 은 오래 놀던 연결을 끊는다. 발송 잡은 1분마다 잠깐 붙었다 나가므로 끊긴 연결을
    만나기 쉽다. 한 번은 다시 붙어 보고 그래도 안 되면 터뜨린다. **쓰기 실패를 삼키지 않는다.**
    삼키면 예약이 안 남았는데 화면은 「알림 드릴게요」라고 말하게 된다.
    """

    def __init__(self, url: str) -> None:
        if not _NAME.match(TABLE_NAME):
            raise ValueError(f"테이블 이름으로 쓸 수 없어요: {TABLE_NAME}")
        self._url = url
        self._lock = threading.Lock()
        self._conn: Any = None

    def _connection(self) -> Any:
        if self._conn is not None and not self._conn.closed:
            return self._conn
        # SQLite 만 쓰는 개발이 이 라이브러리를 열지 않게 여기서 가져온다
        import psycopg

        conn = psycopg.connect(self._url, autocommit=True)
        conn.execute(_CREATE_POSTGRES)
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
                        return cur.fetchall() if fetch else None
                except (psycopg.OperationalError, psycopg.InterfaceError):
                    self._drop()
                    if last:
                        raise
        return None

    def upsert(self, reminder: Reminder) -> None:
        self._run(
            f"INSERT INTO {TABLE_NAME} (anon_key, due_at, action_title, sent_at) "
            "VALUES (%s, %s, %s, %s) ON CONFLICT (anon_key) DO UPDATE SET "
            "due_at = EXCLUDED.due_at, action_title = EXCLUDED.action_title, "
            "sent_at = EXCLUDED.sent_at",
            (reminder.anon_key, reminder.due_at, reminder.action_title, reminder.sent_at),
        )

    def due(self, now: float) -> list[Reminder]:
        rows = self._run(
            f"SELECT anon_key, due_at, action_title, sent_at FROM {TABLE_NAME} "
            "WHERE sent_at IS NULL AND due_at <= %s ORDER BY due_at",
            (now,),
            fetch=True,
        )
        return [_row(r) for r in rows or []]

    def claim(self, reminder: Reminder, now: float) -> bool:
        rows = self._run(
            f"UPDATE {TABLE_NAME} SET sent_at = %s "
            "WHERE anon_key = %s AND due_at = %s AND sent_at IS NULL RETURNING anon_key",
            (now, reminder.anon_key, reminder.due_at),
            fetch=True,
        )
        return bool(rows)

    def delete(self, anon_key: str) -> None:
        self._run(f"DELETE FROM {TABLE_NAME} WHERE anon_key = %s", (anon_key,))

    def sweep(self, now: float, ttl: float) -> None:
        self._run(f"DELETE FROM {TABLE_NAME} WHERE due_at <= %s", (now - ttl,))

    def clear(self) -> None:
        self._run(f"DELETE FROM {TABLE_NAME}", ())

    def close(self) -> None:
        with self._lock:
            self._drop()


# 지금 붙어 있는 자리. 설정 값과 함께 들고 있다가 값이 바뀌면 새로 만든다
_BOUND: tuple[str | None, ReminderTable] | None = None
_BIND_LOCK = threading.Lock()


def table() -> ReminderTable:
    """설정이 가리키는 저장 자리. 값 하나로 갈린다."""
    global _BOUND
    url = get_settings().database_url
    bound = _BOUND
    if bound is not None and bound[0] == url:
        return bound[1]
    with _BIND_LOCK:
        if _BOUND is not None and _BOUND[0] == url:
            return _BOUND[1]
        if _BOUND is not None:
            _BOUND[1].close()
        made: ReminderTable = PostgresReminders(url) if url else SqliteReminders()
        _BOUND = (url, made)
        return made


def close() -> None:
    """프로세스가 들고 있던 연결을 놓는다. 저장 자리에 적힌 것은 그대로 둔다."""
    global _BOUND
    if _BOUND is not None:
        _BOUND[1].close()
        _BOUND = None


def reset() -> None:
    """테스트가 격리하려고 부른다."""
    table().clear()
