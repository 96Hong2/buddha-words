"""알림 한 통을 실제로 보내는 자리.

둘뿐이다: 토스 스마트발송으로 진짜 보내는 것과, 로그만 남기는 스텁. **스텁으로 조용히
내려가지 않는다.** 템플릿 코드가 있는데 인증서가 없으면 발송 잡이 멈춘다. 조용히 스텁이
되면 배포는 성공으로 보이고 알림만 안 간다. 1호 제품에서 사흘 동안 그런 적이 있다.
"""

from __future__ import annotations

import logging
from typing import Protocol

from app.domains.reminder.service import ReminderSendFatalError
from app.domains.reminder.store import Reminder
from app.integrations.apps_in_toss.client import TossApiClient, TossBusinessError
from app.integrations.apps_in_toss.smart_message import (
    ERROR_CODE_TEMPLATE_NOT_APPROVED,
    send_smart_message,
)

logger = logging.getLogger(__name__)

__all__ = ["LogReminderSender", "ReminderSender", "TossSmartMessageSender"]


class ReminderSender(Protocol):
    """한 통 보낸다. 실제로 갔으면 True."""

    @property
    def is_stub(self) -> bool: ...

    async def send(self, reminder: Reminder) -> bool: ...


class LogReminderSender:
    """템플릿 코드가 없을 때. 누구에게 갈 뻔했는지만 남긴다.

    익명키는 싣지 않는다. 서버 로그에 사람을 가리키는 값을 남기지 않는 것이 이 저장소 규칙이다.
    """

    @property
    def is_stub(self) -> bool:
        return True

    async def send(self, reminder: Reminder) -> bool:
        logger.info(
            "reminder_stub",
            extra={"event": "reminder_stub", "due_at": reminder.due_at},
        )
        return False


class TossSmartMessageSender:
    """콘솔 기능성 캠페인으로 한 통 보낸다."""

    def __init__(self, client: TossApiClient, *, template_set_code: str) -> None:
        self._client = client
        self._code = template_set_code

    @property
    def is_stub(self) -> bool:
        return False

    async def send(self, reminder: Reminder) -> bool:
        try:
            result = await send_smart_message(
                self._client,
                anon_key=reminder.anon_key,
                template_set_code=self._code,
                # 템플릿이 쓰는 변수. 사용자 글은 행동 제목 하나뿐이다
                context={"actionTitle": reminder.action_title},
            )
        except TossBusinessError as error:
            if error.error_code == ERROR_CODE_TEMPLATE_NOT_APPROVED:
                # 설정 문제라 다음 사람도 똑같이 실패한다. 한 사람 실패로 삼켜지지 않게
                # 전용 예외로 바꿔 올린다. 발송 잡이 그걸 보고 멈춘다
                logger.error(
                    "reminder_template_unapproved",
                    extra={"event": "reminder_template_unapproved"},
                )
                raise ReminderSendFatalError(
                    "메시지 템플릿이 검수 승인 전이에요. 콘솔에서 승인을 받아야 보낼 수 있어요."
                ) from error
            logger.warning(
                "reminder_send_failed",
                extra={
                    "event": "reminder_send_failed",
                    "code": error.error_code,
                    "reason": error.reason,
                },
            )
            return False

        if result.is_known_empty:
            logger.warning(
                "reminder_delivered_none",
                extra={"event": "reminder_delivered_none", "reason": result.reason},
            )
        return result.delivered is None or result.delivered > 0
