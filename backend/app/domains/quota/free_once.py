"""첫 이야기를 이미 쓴 사람. **배포를 넘겨야 한다.**

무료는 익명키마다 평생 한 번이다(계획 X38). 그런데 그 장부가 프로세스 메모리에만 있었다.
Cloud Run 은 배포·유휴 종료·오토스케일마다 인스턴스를 갈아치우므로, 새로 뜬 인스턴스는
아무도 쓴 적이 없다고 답한다. 그러면 저장소를 지웠거나 기기를 바꾼 사람에게 무료가 한 번
더 열린다. 실기기에서 그대로 나왔다(2026-09-23: 「오늘 첫 사용이지만 앱 첫 사용은 아닌데
연꽃 없이 답을 받는다」). 기기 사본(`frontend/.../quota.ts`)이 단조라 대부분은 막지만,
기기 값이 없는 순간에는 서버가 정본이고 그 정본이 비어 있었다.

그래서 `core/persist.py` 가 고르는 자리(배포는 PostgreSQL, 개발은 SQLite 파일)에 담는다.

**읽기는 메모리에서 끝낸다.** 이 값은 생성 요청마다 보는데, 매번 DB 를 긁으면 답을 만드는
길목에 왕복이 하나 늘어난다. 한 번 「썼다」로 확인된 키는 다시 풀리지 않으므로(쓰기가
실패해 되돌리는 경우만 예외) 캐시가 낡아서 틀릴 일이 없다. 모르는 키만 저장 자리에 묻는다.

**저장 자리가 흔들려도 답은 나간다.** 이 자리는 답을 만드는 길목이라, 여기서 터뜨리면
Cloud SQL 이 잠깐 끊기는 동안 앱 전체가 죽는다. 그렇다고 실패를 「안 썼다」로 읽으면 못
적은 채로 무료를 내주게 되고, 그 사람은 다음에도 또 무료다. 그래서 **실패하면 무료를 주지
않는 쪽으로 기운다.** 그 사람은 광고를 한 편 보고 답을 받는다. 못 적은 것은 로그로 남긴다.
기다리는 시간에도 상한이 있다(`persist.CONNECT_TIMEOUT`). 끊긴 주소를 오래 붙들면
그 인스턴스의 다른 요청까지 함께 멈춘다.

**무료를 잡는 일은 한 문장이다**(`claim`). 확인과 적기를 나누면 그 사이에 다른 요청이
같은 확인을 통과한다. `used` 는 그 앞에 서는 빠른 길일 뿐이고, 한 번뿐인 것을 가르는
것은 언제나 `claim` 이다.

⚠ **익명키를 그대로 적지 않는다.** 저장 자리에 사람을 가리키는 값을 남기지 않기로 했고
(`tests/test_persistence.py` 가 파일을 훑어 그것을 지킨다), 여기서 필요한 것은 「이 열쇠를
전에 본 적이 있나」뿐이라 되돌릴 수 있는 값일 이유가 없다. 해시 한 겹을 씌워 담는다.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time

from app.core import persist

log = logging.getLogger(__name__)

TABLE_NAME = "quota_free_once"

# 해시 앞에 붙이는 말. 다른 곳에서 같은 익명키를 해시하더라도 값이 겹치지 않게 한다
_SALT = "buddha.quota.free_once.v1"

# 담는 값. 열쇠가 곧 사실이라 값에 담을 것이 없지만, 저장 자리가 JSON 한 덩이를 받는다
_MARK = {"used": True}

# 확인이 끝난 키. **양쪽 다 담는다**: 쓴 사람(True)과 아직 안 쓴 사람(False).
# False 를 담지 않으면 처음 오는 사람마다 DB 를 한 번씩 긁는다.
#
# 지우는 자리가 없어 이 프로세스가 사는 동안 사람 수만큼 는다. 한 줄이 백 바이트 남짓이라
# 십만 명이 와도 10MB 안쪽이고 Cloud Run 인스턴스는 그보다 훨씬 자주 바뀐다. 이 가정이
# 깨지는 규모가 오면 LRU 로 바꾼다.
_CACHE: dict[str, bool] = {}
_LOCK = threading.Lock()

# ── 저장 자리가 넘어졌을 때 얼마나 쉬나 ─────────────────────────────────────
#
# ⚠ **답을 만드는 길이 `async` 인데 여기 호출은 동기다.** 붙는 데 오래 걸리면 그 인스턴스의
# **진행 중인 다른 요청까지 함께 멈춘다.** 연결 상한(`persist.CONNECT_TIMEOUT`)이 한 번의
# 기다림을 5초로 묶어 주지만, 장애가 이어지면 새 익명키가 올 때마다 5초씩 다시 낸다.
#
# 그래서 한 번 넘어지면 이만큼 쉰다. 쉬는 동안 「썼다」로 답해서 사람은 광고 문을 만나고
# 답은 그대로 받는다. 잃는 것은 그 창 안에 처음 온 사람의 무료 한 번뿐이다.
_REST_SECONDS = 30.0
_rest_until = 0.0


def _resting(now: float) -> bool:
    return now < _rest_until


def _fell(now: float) -> None:
    global _rest_until
    _rest_until = now + _REST_SECONDS


def _stood_up() -> None:
    global _rest_until
    _rest_until = 0.0


def _table() -> persist.KeyValueTable:
    return persist.bind(TABLE_NAME)


def _row_key(anon_key: str) -> str:
    """저장 자리에 적히는 열쇠. 익명키를 되돌릴 수 없는 값으로 바꾼다."""
    return hashlib.sha256(f"{_SALT}:{anon_key}".encode()).hexdigest()


def used(anon_key: str) -> bool:
    """이 사람이 무료 한 번을 이미 썼나.

    저장 자리를 못 읽으면 **썼다고 본다.** 그 사람은 광고 문을 만나고 답은 그대로 받는다.
    반대로 기울면 장애가 이어지는 동안 오는 사람마다 무료를 한 번씩 더 준다.
    그때의 값은 캐시에 담지 않는다. 잠깐의 장애를 이 프로세스가 사는 내내 붙들면 안 된다.
    """
    with _LOCK:
        known = _CACHE.get(anon_key)
    if known is not None:
        return known
    now = time.monotonic()
    if _resting(now):
        return True
    try:
        found = _table().get(_row_key(anon_key)) is not None
    except Exception:
        log.warning("free_once_read_failed", exc_info=True)
        _fell(now)
        return True
    _stood_up()
    with _LOCK:
        # 기다리는 사이에 `mark` 가 True 로 적어 뒀을 수 있다. 그 값을 덮지 않는다
        return _CACHE.setdefault(anon_key, found)


def claim(anon_key: str) -> bool:
    """무료 한 번을 지금 잡는다. **내가 처음 잡은 사람이면 True.**

    ⚠ **확인과 적기를 나누지 않는다.** 한때 `used()` 로 보고 그다음에 적었는데, 둘 사이가
    DB 왕복 두 번만큼 벌어져 있었다. 같은 익명키로 몇 밀리초 안에 두 번 보내면 둘 다 빈
    자리를 읽고 둘 다 무료로 나갔다(분당 제한이 6이라 여섯 번까지). 지금은 저장 자리가
    「처음 넣는 사람」을 한 문장으로 가른다.

    **못 적었으면 무료를 주지 않는다.** 적히지도 않은 무료를 내주면 그 사람은 다음에도,
    그다음에도 무료다. 그때는 캐시에도 「썼다」로 적는다. 그래야 같은 요청이 내는
    사용량 표(`snapshot`)가 문(gate)과 같은 말을 한다. 저장 자리가 도로 살아나면
    그 사람은 다음 프로세스에서 무료를 제대로 받는다.
    """
    now = time.monotonic()
    if _resting(now):
        with _LOCK:
            _CACHE[anon_key] = True
        return False
    try:
        first = _table().claim(_row_key(anon_key), _MARK, 0.0)
    except Exception:
        log.error("free_once_write_failed", exc_info=True)
        _fell(now)
        with _LOCK:
            _CACHE[anon_key] = True
        return False
    _stood_up()
    with _LOCK:
        _CACHE[anon_key] = True
    return first


def unmark(anon_key: str) -> None:
    """생성이 실패했다. 잡아 둔 한 번을 되돌린다.

    못 지워도 터뜨리지 않는다. 이미 실패한 요청을 정리하는 중이라, 여기서 한 번 더
    터지면 사람이 보는 것은 원래 오류가 아니라 이 오류가 된다. 그 사람은 무료 한 번을
    잃지만 앱은 그대로 돈다.
    """
    try:
        _table().delete(_row_key(anon_key))
    except Exception:
        log.warning("free_once_undo_failed", exc_info=True)
        return
    with _LOCK:
        _CACHE[anon_key] = False


def reset_all() -> None:
    """테스트가 격리하려고 부른다. 저장 자리와 캐시를 둘 다 비운다."""
    _table().clear()
    _stood_up()
    with _LOCK:
        _CACHE.clear()


def forget_binding() -> None:
    """붙어 있던 저장 자리를 놓는다. 재기동을 흉내 내는 시험이 부른다.

    캐시는 **함께 비운다.** 캐시만 남으면 프로세스가 새로 떴다는 가정이 깨져서,
    저장이 메모리로 되돌아가도 시험이 초록으로 남는다.
    """
    persist.unbind(TABLE_NAME)
    _stood_up()
    with _LOCK:
        _CACHE.clear()
