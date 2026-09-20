"""「어제 이야기드린 그거, 해 보셨나요?」를 보낼 차례인 사람에게 보낸다.

**1분마다 부르는 진입점이다**(Cloud Scheduler). 판정이 「정한 시각이 지났나」라 더 뜸하게
불러도 알림은 가지만, 사람이 고른 시각보다 늦게 간다.

    uv run python scripts/send_reminders.py --dry-run   # 누가 대상인지만 센다
    uv run python scripts/send_reminders.py             # 실제로 보내고 보낸 것으로 적는다

`TOSS_REMINDER_TEMPLATE_SET_CODE` 가 있으면 토스 스마트발송으로 진짜 보낸다. 없으면 로그
스텁으로 돈다(알림이 안 간다). 템플릿 코드는 있는데 mTLS 인증서가 없으면 **멈춘다.**
조용히 스텁으로 내려가면 배포는 성공으로 보이고 알림만 안 간다.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.config import Settings, get_settings  # noqa: E402
from app.core.logging import configure_logging  # noqa: E402
from app.domains.reminder import service, store  # noqa: E402
from app.domains.reminder.sender import (  # noqa: E402
    LogReminderSender,
    ReminderSender,
    TossSmartMessageSender,
)
from app.integrations.apps_in_toss.client import TossApiClient, TossApiSettings  # noqa: E402

logger = logging.getLogger("app.scripts.send_reminders")


class ReminderSenderMisconfiguredError(RuntimeError):
    """보낼 수단을 고를 수 없는 설정."""


def build_sender(settings: Settings) -> tuple[ReminderSender, TossApiClient | None]:
    """설정을 보고 발송기를 고른다. 만든 HTTP 클라이언트는 부른 쪽이 닫는다."""
    code = (settings.toss_reminder_template_set_code or "").strip()
    if not code:
        logger.warning(
            "스마트발송 템플릿 코드가 없어 로그 스텁으로 돈다. 알림은 실제로 가지 않는다"
        )
        return LogReminderSender(), None

    api_settings = TossApiSettings(
        base_url=settings.toss_api_base_url,
        client_cert_path=settings.toss_mtls_cert_path,
        client_key_path=settings.toss_mtls_key_path,
    )
    if not api_settings.has_client_certificate:
        raise ReminderSenderMisconfiguredError(
            "스마트발송을 부르려면 mTLS 클라이언트 인증서가 있어야 한다. "
            "인증서는 미니앱마다 다르다. docs/DEPLOY.md 의 mTLS 절을 본다."
        )

    client = TossApiClient(api_settings)
    return TossSmartMessageSender(client, template_set_code=code), client


async def run(dry_run: bool) -> int:
    settings = get_settings()
    now = time.time()
    try:
        if dry_run:
            logger.info(
                "보낼 차례인 사람",
                extra={"event": "reminder_due", "count": len(service.due(now)), "dry_run": True},
            )
            return 0

        sender, client = build_sender(settings)
        try:
            # 스텁은 아무것도 안 보낸다. 보낸 것으로 적으면 검수를 기다리는 동안 쌓인
            # 예약이 매분 조용히 마감되고, 발송을 켜도 그 기간 사람들은 영영 못 받는다
            sent = await service.send_due(sender.send, now, record=not sender.is_stub)
        finally:
            if client is not None:
                await client.aclose()
        logger.info(
            "되짚기 알림을 보냈다",
            extra={"event": "reminder_sent", "count": sent, "stub": sender.is_stub},
        )
        return 0
    finally:
        store.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="되짚기 알림 발송")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="보내지 않고 지금 대상이 몇 명인지만 센다",
    )
    args = parser.parse_args(argv)

    configure_logging(get_settings().log_level)
    try:
        return asyncio.run(run(args.dry_run))
    except ReminderSenderMisconfiguredError:
        logger.exception("발송기를 만들지 못했다")
        return 2
    except service.ReminderSendFatalError:
        # 한 사람이 아니라 설정이 틀렸다. 잡을 빨갛게 두어 사람이 보게 한다
        logger.exception("설정 때문에 아무에게도 보낼 수 없다")
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
