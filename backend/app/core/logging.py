"""로그 가림막.

고민 원문이 트레이스백에 통째로 실릴 수 있다. 본문 필드 이름을 가림 목록에 둔다.

가림 목록에 `message` 가 있어서 로그의 이벤트 이름까지 함께 사라지던 자리를 갈랐다.
로그 호출의 첫 인자는 우리가 쓰는 이벤트 이름(`llm_call` 같은 소문자 코드)이라 그 모양일
때만 남기고, 그 밖의 문자열은 본문일 수 있으니 예전처럼 통째로 가린다.
그래서 `log.warning("고민: %s", text)` 같은 호출은 여전히 ***** 로 찍힌다.
"""

from __future__ import annotations

import logging
import re
import sys

from pythonjsonlogger import json as jsonlogger

# 값을 통째로 가릴 키. 고민 원문과 답변 본문이 여기로 샌다.
MASKED_KEYS = frozenset(
    {
        "text",
        "concern",
        "raw_text",
        "message",
        "opening",
        "closing",
        "scripture_explanation",
        "personal_analysis",
        "api_key",
        "authorization",
        "x_anon_key",
        "anon_key",
    }
)

# 길게 이어진 숫자열(연락처·계좌)은 값 안에서도 가린다.
_LONG_DIGITS = re.compile(r"\d{7,}")

# 이벤트 이름의 모양. 영소문자·숫자·밑줄만 있는 짧은 코드다.
# 한글·공백·구두점이 하나라도 섞이면 사람이 쓴 문장으로 보고 가린다
_EVENT_NAME = re.compile(r"^[a-z][a-z0-9_]{2,63}$")


def mask(value: object) -> object:
    if isinstance(value, dict):
        return {k: ("***" if k.lower() in MASKED_KEYS else mask(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [mask(v) for v in value]
    if isinstance(value, str):
        return _LONG_DIGITS.sub("***", value)
    return value


def mask_message(value: object) -> object:
    """로그 본문 자리. 이벤트 이름이면 남기고 아니면 가린다.

    이 자리가 통째로 가려지면 어떤 일이 일어났는지 로그에서 읽을 수 없다.
    반대로 아무 문자열이나 남기면 원문이 새어 나간다. 그래서 모양으로 가른다.
    """
    if isinstance(value, str) and _EVENT_NAME.match(value):
        return value
    return "***"


class MaskingFormatter(jsonlogger.JsonFormatter):
    def add_fields(self, log_record, record, message_dict):  # type: ignore[no-untyped-def]
        super().add_fields(log_record, record, message_dict)
        for key in list(log_record):
            if key == "message":
                log_record[key] = mask_message(log_record[key])
            elif key.lower() in MASKED_KEYS:
                log_record[key] = "***"
            else:
                log_record[key] = mask(log_record[key])


def configure_logging(level: str) -> None:
    # 남의 로거는 이벤트 이름 규칙을 모른다. httpx 의 「HTTP Request: ...」 줄이 매 호출마다
    # ***** 로 찍혀 우리 줄을 덮으므로 경고부터만 받는다
    logging.getLogger("httpx").setLevel(logging.WARNING)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(MaskingFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
