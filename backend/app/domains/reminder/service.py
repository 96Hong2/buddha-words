"""예약을 받고, 보낼 차례가 된 것을 보낸다.

화면은 「내일 알림으로 여쭤볼게요」 하나만 약속한다. 그 약속을 지키는 자리가 여기다.

**언제 보낼지는 화면이 정해서 보낸다.** 사람이 설정에서 고른 시각과 기기 시간대를 아는 쪽이
화면이라, 절대 시각(epoch 초)으로 받아 서버는 그대로 담는다. 서버가 시간대를 다시 계산하면
기기와 어긋난 시각에 알림이 가고, 그 어긋남은 사람이 알아채기 어렵다.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Awaitable, Callable

from app.domains.reminder.store import ACTION_TITLE_MAX, Reminder, table

logger = logging.getLogger(__name__)

# 너무 가깝거나 너무 먼 예약은 받지 않는다. 화면이 계산을 틀리면 여기서 걸린다
MIN_LEAD_SECONDS = 30 * 60
MAX_LEAD_SECONDS = 8 * 24 * 60 * 60

# 보낼 때가 한참 지난 줄은 보내지 않고 버린다. 사흘 늦은 「어제 그거」는 되짚기가 아니다
STALE_AFTER_SECONDS = 36 * 60 * 60

# 다 지난 줄을 치우는 기준. 보냈든 못 보냈든 이 뒤로는 쓸모가 없다
SWEEP_TTL_SECONDS = 14 * 24 * 60 * 60


class InvalidReminderError(ValueError):
    """화면이 보낸 예약을 받을 수 없다."""


class ReminderSendFatalError(RuntimeError):
    """한 사람이 아니라 설정이 틀렸다. 다음 사람도 똑같이 실패하므로 그 자리에서 멈춘다."""


def reserve(anon_key: str, *, due_at: float, action_title: str, now: float) -> Reminder:
    """한 사람에 한 줄. 새로 누르면 앞의 예약을 덮는다."""
    title = action_title.strip()
    if not title:
        raise InvalidReminderError("무엇을 여쭤볼지가 비어 있어요.")

    # NaN 은 어떤 비교에도 False 라 아래 범위 검사를 그냥 빠져나간다. 그렇게 들어간 줄은
    # 보낼 때도 안 걸리고 치울 때도 안 걸려서 영영 남는다
    if not math.isfinite(due_at):
        raise InvalidReminderError("알림 시각이 숫자가 아니에요.")

    lead = due_at - now
    if lead < MIN_LEAD_SECONDS or lead > MAX_LEAD_SECONDS:
        raise InvalidReminderError("알림 시각이 너무 가깝거나 너무 멀어요.")

    reminder = Reminder(
        anon_key=anon_key,
        due_at=due_at,
        # 알림 문구에 실리는 유일한 사용자 글이다. 길면 자른다
        action_title=title[:ACTION_TITLE_MAX],
        sent_at=None,
    )
    table().upsert(reminder)
    return reminder


def cancel(anon_key: str) -> None:
    """이미 답한 사람에게는 보내지 않는다."""
    table().delete(anon_key)


def due(now: float) -> list[Reminder]:
    """보낼 차례가 된 줄. 너무 늦은 것은 빼고 준다."""
    return [r for r in table().due(now) if now - r.due_at <= STALE_AFTER_SECONDS]


Sender = Callable[[Reminder], Awaitable[bool]]


async def send_due(send: Sender, now: float, *, record: bool = True) -> int:
    """보낼 차례인 사람에게 보낸다.

    **보내기 전에 그 줄을 먼저 잡는다(claim). 잡은 쪽만 보낸다.** 1분마다 도는 잡이 한 회차를
    1분 안에 못 끝내면 다음 회차가 겹치는데, 읽고 → 보내고 → 그 뒤에 적는 순서면 같은 사람에게
    두 통이 간다. 먼저 잡으면 진 쪽은 아무것도 안 보낸다.

    잡는 조건에 `due_at` 을 함께 건다. 잡이 대상을 읽고 보내는 사이에 사람이 버튼을 다시 눌러
    내일로 재예약하면, 그 새 예약을 보낸 것으로 덮어 버리기 때문이다.

    **보내다 실패해도 다시 보내지 않는다.** 응답이 없어도 알림은 이미 갔을 수 있고,
    두 번 울리는 쪽이 못 간 것보다 나쁘다.

    `record=False` 는 **아무것도 안 보내는 스텁**이 쓴다. 안 보냈는데 보낸 것으로 적으면
    템플릿 검수를 기다리는 동안 쌓인 예약이 매분 조용히 마감되고, 나중에 발송을 켜도 그
    기간 사람들은 영영 못 받는다.
    """
    store = table()

    # 너무 늦어 보내지 않기로 한 줄은 다시 보지 않게 잡아만 둔다
    for reminder in store.due(now):
        if now - reminder.due_at > STALE_AFTER_SECONDS:
            logger.info(
                "reminder_stale",
                extra={"event": "reminder_stale", "late_seconds": round(now - reminder.due_at)},
            )
            store.claim(reminder, now)

    sent = 0
    for reminder in due(now):
        # 다른 회차가 먼저 잡았거나 그 사이에 사람이 다시 예약했으면 건너뛴다
        if record and not store.claim(reminder, now):
            continue
        try:
            delivered = await send(reminder)
        except ReminderSendFatalError:
            # 설정이 틀렸다. 다음 사람도 똑같이 실패하므로 여기서 멈추고 잡을 빨갛게 만든다
            raise
        except Exception:
            logger.exception("reminder_send_failed", extra={"event": "reminder_send_failed"})
            continue
        if delivered:
            sent += 1

    store.sweep(now, SWEEP_TTL_SECONDS)
    return sent
