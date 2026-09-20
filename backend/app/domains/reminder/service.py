"""예약을 받고, 보낼 차례가 된 것을 보낸다.

화면은 「내일 알림으로 여쭤볼게요」 하나만 약속한다. 그 약속을 지키는 자리가 여기다.

**언제 보낼지는 화면이 정해서 보낸다.** 사람이 설정에서 고른 시각과 기기 시간대를 아는 쪽이
화면이라, 절대 시각(epoch 초)으로 받아 서버는 그대로 담는다. 서버가 시간대를 다시 계산하면
기기와 어긋난 시각에 알림이 가고, 그 어긋남은 사람이 알아채기 어렵다.
"""

from __future__ import annotations

import logging
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


def reserve(anon_key: str, *, due_at: float, action_title: str, now: float) -> Reminder:
    """한 사람에 한 줄. 새로 누르면 앞의 예약을 덮는다."""
    title = action_title.strip()
    if not title:
        raise InvalidReminderError("무엇을 여쭤볼지가 비어 있어요.")

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


async def send_due(send: Sender, now: float) -> int:
    """보낼 차례인 사람에게 보낸다. 보낸 줄만 보낸 것으로 적는다.

    한 사람이 실패해도 나머지는 보낸다. 실패를 통째로 터뜨리면 한 사람의 잘못된 익명키가
    그날 모든 알림을 막는다.

    **보낸 뒤에 적는다.** 먼저 적고 보내면, 보내다 죽었을 때 안 간 알림이 간 것으로 남는다.
    반대로 적기 전에 죽으면 다음 분에 한 번 더 간다. 둘 중에는 뒤가 낫다.
    """
    store = table()
    # 너무 늦어 보내지 않기로 한 줄도 다시 보지 않게 치운다
    stale = [r for r in store.due(now) if now - r.due_at > STALE_AFTER_SECONDS]
    for reminder in stale:
        logger.info(
            "reminder_stale",
            extra={"event": "reminder_stale", "late_seconds": round(now - reminder.due_at)},
        )
        store.mark_sent(reminder.anon_key, now)

    sent = 0
    for reminder in due(now):
        try:
            delivered = await send(reminder)
        except Exception:
            logger.exception("reminder_send_failed", extra={"event": "reminder_send_failed"})
            continue
        store.mark_sent(reminder.anon_key, now)
        if delivered:
            sent += 1

    store.sweep(now, SWEEP_TTL_SECONDS)
    return sent
