"""되짚기 알림 예약과 발송.

**모으는 자리(예약)와 보내는 자리(발송)를 각각 진짜로 돌린다.** 토스 호출만 가짜다.
저장은 실제 저장 자리를 쓰고, 발송 판정(누가 차례인가)도 실제 함수를 부른다.

여기서 지키려는 약속은 셋이다.
  1. 화면이 「내일 알림으로 여쭤볼게요」라고 말했으면 그 예약이 실제로 남아 있다
  2. 한 사람에게 하루에 두 통 가지 않는다
  3. 담긴 것에 고민 원문이 없다
"""

from __future__ import annotations

import time

import pytest

from app.domains.reminder import service, store


@pytest.fixture(autouse=True)
def clean_store():
    store.reset()
    yield
    store.reset()


def test_reservation_is_stored():
    now = time.time()
    service.reserve("anon-1", due_at=now + 3600, action_title="전화 한 통", now=now)

    rows = store.table().due(now + 3601)
    assert [r.anon_key for r in rows] == ["anon-1"]
    assert rows[0].action_title == "전화 한 통"


def test_not_due_before_its_time():
    now = time.time()
    service.reserve("anon-1", due_at=now + 3600, action_title="산책", now=now)

    assert service.due(now) == []
    assert [r.anon_key for r in service.due(now + 3600)] == ["anon-1"]


def test_pressing_again_replaces_the_reservation():
    """한 사람에 한 줄이다. 줄이 쌓이면 하루에 여러 통이 간다."""
    now = time.time()
    service.reserve("anon-1", due_at=now + 3600, action_title="산책", now=now)
    service.reserve("anon-1", due_at=now + 7200, action_title="전화 한 통", now=now)

    rows = store.table().due(now + 7201)
    assert len(rows) == 1
    assert rows[0].action_title == "전화 한 통"


@pytest.mark.parametrize("lead", [60, 30 * 24 * 3600])
def test_rejects_too_near_or_too_far(lead: float):
    now = time.time()
    with pytest.raises(service.InvalidReminderError):
        service.reserve("anon-1", due_at=now + lead, action_title="산책", now=now)


def test_rejects_empty_action_title():
    now = time.time()
    with pytest.raises(service.InvalidReminderError):
        service.reserve("anon-1", due_at=now + 3600, action_title="   ", now=now)


def test_cancelled_reservation_is_not_due():
    now = time.time()
    service.reserve("anon-1", due_at=now + 3600, action_title="산책", now=now)
    service.cancel("anon-1")

    assert service.due(now + 3600) == []


@pytest.mark.anyio
async def test_never_sends_twice_to_the_same_person():
    """보낸 뒤 적는다. 다음 분에 같은 사람이 또 대상이 되면 하루에 두 통이 간다."""
    now = time.time()
    service.reserve("anon-1", due_at=now + 3600, action_title="산책", now=now)
    later = now + 3600

    sent: list[str] = []

    async def send(reminder: store.Reminder) -> bool:
        sent.append(reminder.anon_key)
        return True

    assert await service.send_due(send, later) == 1
    assert await service.send_due(send, later + 60) == 0
    assert sent == ["anon-1"]


@pytest.mark.anyio
async def test_one_failure_does_not_block_the_rest():
    """한 사람의 잘못된 익명키가 그날 모든 알림을 막으면 안 된다."""
    now = time.time()
    for key in ("anon-1", "anon-2"):
        service.reserve(key, due_at=now + 3600, action_title="산책", now=now)
    later = now + 3600

    async def send(reminder: store.Reminder) -> bool:
        if reminder.anon_key == "anon-1":
            raise RuntimeError("익명키가 틀렸다")
        return True

    assert await service.send_due(send, later) == 1


@pytest.mark.anyio
async def test_skips_reservations_that_are_far_too_late():
    """사흘 늦은 「어제 그거」는 되짚기가 아니다."""
    now = time.time()
    service.reserve("anon-1", due_at=now + 3600, action_title="산책", now=now)
    much_later = now + 3600 + service.STALE_AFTER_SECONDS + 60

    async def send(reminder: store.Reminder) -> bool:
        raise AssertionError("보내면 안 된다")

    assert await service.send_due(send, much_later) == 0


def test_stored_row_has_no_room_for_the_concern_text():
    """알림 문구에 실릴 수 있는 사용자 글은 행동 제목 하나로 끝난다."""
    now = time.time()
    service.reserve("anon-1", due_at=now + 3600, action_title="전화 한 통", now=now)

    row = store.table().due(now + 3601)[0]
    # 담는 칸이 넷뿐이라 원문이 들어갈 자리가 없다
    assert set(vars(row) if hasattr(row, "__dict__") else row.__slots__) == {
        "anon_key",
        "due_at",
        "action_title",
        "sent_at",
    }
