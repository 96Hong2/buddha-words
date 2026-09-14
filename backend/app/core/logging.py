"""로그 가림막.

고민 원문이 트레이스백에 통째로 실릴 수 있다. 본문 필드 이름을 가림 목록에 둔다.
"""

from __future__ import annotations

import logging
import re
import sys

from pythonjsonlogger import json as jsonlogger

# 값을 통째로 가릴 키. 고민 원문과 답변 본문이 여기로 샌다.
MASKED_KEYS = frozenset(
    {
        "text", "concern", "raw_text", "message", "opening", "closing",
        "scripture_explanation", "personal_analysis", "api_key", "authorization",
        "x_anon_key", "anon_key",
    }
)

# 길게 이어진 숫자열(연락처·계좌)은 값 안에서도 가린다.
_LONG_DIGITS = re.compile(r"\d{7,}")


def mask(value: object) -> object:
    if isinstance(value, dict):
        return {k: ("***" if k.lower() in MASKED_KEYS else mask(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [mask(v) for v in value]
    if isinstance(value, str):
        return _LONG_DIGITS.sub("***", value)
    return value


class MaskingFormatter(jsonlogger.JsonFormatter):
    def add_fields(self, log_record, record, message_dict):  # type: ignore[no-untyped-def]
        super().add_fields(log_record, record, message_dict)
        for key in list(log_record):
            if key.lower() in MASKED_KEYS:
                log_record[key] = "***"
            else:
                log_record[key] = mask(log_record[key])


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(MaskingFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
