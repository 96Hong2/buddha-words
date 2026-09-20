"""되짚기 알림 예약과 발송.

**모으는 자리(예약)와 보내는 자리(발송)를 각각 진짜로 돌린다.** 토스 호출만 가짜다.
저장은 실제 저장 자리를 쓰고, 발송 판정(누가 차례인가)도 실제 함수를 부른다.

여기서 지키려는 약속은 셋이다.
  1. 화면이 「내일 알림으로 여쭤볼게요」라고 말했으면 그 예약이 실제로 남아 있다
  2. 한 사람에게 하루에 두 통 가지 않는다
  3. 담긴 것에 고민 원문이 없다
"""

from __future__ import annotations

import asyncio
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from app.domains.reminder import service, store
from app.main import app


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


def test_rejects_a_dueat_that_is_not_a_number():
    """NaN 은 어떤 비교에도 False 라 범위 검사를 그냥 빠져나간다.

    그렇게 들어간 줄은 보낼 때도 안 걸리고 치울 때도 안 걸려서 영영 남는다.
    """
    now = time.time()
    with pytest.raises(service.InvalidReminderError):
        service.reserve("anon-1", due_at=float("nan"), action_title="산책", now=now)


@pytest.mark.anyio
async def test_overlapping_jobs_do_not_send_twice():
    """1분 잡이 1분을 넘기면 다음 회차와 겹친다. 그때 같은 사람에게 두 통이 가면 안 된다."""
    now = time.time()
    service.reserve("anon-1", due_at=now + 3600, action_title="산책", now=now)
    later = now + 3600

    sent: list[str] = []
    started = asyncio.Event()

    async def send(reminder: store.Reminder) -> bool:
        # 한 회차가 보내는 중에 다음 회차가 같은 줄을 집어 가는 순간을 만든다
        started.set()
        await asyncio.sleep(0.05)
        sent.append(reminder.anon_key)
        return True

    await asyncio.gather(service.send_due(send, later), service.send_due(send, later + 1))
    assert sent == ["anon-1"]


@pytest.mark.anyio
async def test_stub_run_does_not_burn_the_reservation():
    """아무것도 안 보내는 스텁이 예약을 마감하면, 발송을 켜도 그 기간 사람들은 못 받는다."""
    now = time.time()
    service.reserve("anon-1", due_at=now + 3600, action_title="산책", now=now)
    later = now + 3600

    async def never_sends(reminder: store.Reminder) -> bool:
        return False

    assert await service.send_due(never_sends, later, record=False) == 0
    # 예약이 그대로 남아 있어야 발송을 켠 뒤에 나간다
    assert [r.anon_key for r in service.due(later)] == ["anon-1"]


@pytest.mark.anyio
async def test_a_setup_failure_stops_the_whole_run():
    """한 사람 실패가 아니라 설정이 틀린 것이다. 삼키면 잡이 초록으로 끝나고 아무도 모른다."""
    now = time.time()
    service.reserve("anon-1", due_at=now + 3600, action_title="산책", now=now)

    async def send(reminder: store.Reminder) -> bool:
        raise service.ReminderSendFatalError("템플릿이 검수 승인 전이에요.")

    with pytest.raises(service.ReminderSendFatalError):
        await service.send_due(send, now + 3600)


@pytest.mark.anyio
async def test_re_reserving_during_a_run_is_not_marked_as_sent():
    """잡이 보내는 사이에 다시 누르면, 그 새 예약을 보낸 것으로 덮으면 안 된다."""
    now = time.time()
    service.reserve("anon-1", due_at=now + 3600, action_title="산책", now=now)
    later = now + 3600

    async def send(reminder: store.Reminder) -> bool:
        # 보내는 동안 사람이 버튼을 다시 눌러 내일로 재예약했다
        service.reserve("anon-1", due_at=later + 86_400, action_title="전화 한 통", now=later)
        return True

    await service.send_due(send, later)
    rows = store.table().due(later + 86_401)
    assert [r.action_title for r in rows] == ["전화 한 통"]


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


# ── 라우트를 실제로 두드린다 ────────────────────────────────────────────
#
# 계층 시험만으로는 안 잡히는 것이 둘 있다. 예비요청(CORS)에서 막히는 메서드와,
# 화면이 보낸 이상한 값이 라우트를 어떻게 빠져나가는가다.


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def headers() -> dict[str, str]:
    return {"X-Anon-Key": f"anon-{uuid.uuid4().hex}", "X-Timezone": "Asia/Seoul"}


def test_reserve_and_cancel_through_the_api(client: TestClient, headers: dict[str, str]):
    due_at = time.time() + 86_400
    res = client.post("/reminder", json={"dueAt": due_at, "actionTitle": "산책"}, headers=headers)
    assert res.status_code == 200, res.text
    assert service.due(due_at + 1)

    res = client.request("DELETE", "/reminder", headers=headers)
    assert res.status_code == 200, res.text
    assert service.due(due_at + 1) == []


def test_api_rejects_a_dueat_that_is_not_a_number(client: TestClient, headers: dict[str, str]):
    """NaN 이 들어가면 SQLite 에서는 500, PostgreSQL 에서는 영영 안 나가는 행이 남았다."""
    res = client.post(
        "/reminder",
        # json 모듈이 NaN 리터럴을 그대로 쓴다. 화면이 계산을 틀리면 이 모양으로 온다
        content=b'{"dueAt": NaN, "actionTitle": "\xec\x82\xb0\xec\xb1\x85"}',
        headers={**headers, "Content-Type": "application/json"},
    )
    assert res.status_code == 400, res.text


def test_cancel_is_allowed_through_cors(client: TestClient):
    """DELETE 가 허용 메서드에 없으면 WebView 에서 취소가 통째로 실패한다.

    예비요청이 막히면 본 요청은 아예 나가지 않아서, 화면에는 아무 일도 없는 것처럼 보이고
    답한 사람에게 알림이 한 번 더 간다.
    """
    res = client.options(
        "/reminder",
        headers={
            "Origin": "https://buddha-words.apps.tossmini.com",
            "Access-Control-Request-Method": "DELETE",
            "Access-Control-Request-Headers": "X-Anon-Key",
        },
    )
    assert res.status_code == 200, res.text
    assert "DELETE" in res.headers.get("access-control-allow-methods", "")
