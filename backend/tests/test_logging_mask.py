"""로그 가림막. 이벤트 이름은 읽히고 고민 원문은 새지 않는다.

진짜 로거에 진짜 포매터를 달고 찍어서 나온 줄을 읽는다. 가짜 포매터를 만들지 않는다.
"""

from __future__ import annotations

import io
import json
import logging

from app.core.logging import MaskingFormatter

CONCERN = "남편이 다른 사람을 만나는 것 같아요. 이혼해야 할까요?"


def _emit(call: object) -> dict:
    """한 줄 찍고 그 JSON 을 돌려준다."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(MaskingFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    log = logging.getLogger(f"test.mask.{id(call)}")
    log.handlers = [handler]
    log.propagate = False
    log.setLevel("INFO")
    call(log)  # type: ignore[operator]
    return json.loads(stream.getvalue())


def test_event_name_stays_readable() -> None:
    row = _emit(
        lambda log: log.info(
            "llm_call", extra={"event": "llm_call", "stage": "pass1", "model": "gpt-5.4-mini"}
        )
    )
    assert row["message"] == "llm_call"
    assert row["stage"] == "pass1"


def test_concern_never_reaches_the_line() -> None:
    """본문 자리에 고민을 실으면 통째로 가린다. 필드 이름이 text 여도 마찬가지다."""
    row = _emit(lambda log: log.warning("고민 원문: %s", CONCERN))
    assert row["message"] == "***"
    assert CONCERN not in json.dumps(row, ensure_ascii=False)

    row = _emit(lambda log: log.info("pass1_failed", extra={"text": CONCERN}))
    assert row["message"] == "pass1_failed"
    assert row["text"] == "***"
    assert CONCERN not in json.dumps(row, ensure_ascii=False)


def test_answer_body_is_masked_even_nested() -> None:
    body = {"message": "오지 않은 일을 미리 앓지 마라.", "quota": {"freeUsed": 1}}
    row = _emit(lambda log: log.info("answer_sent", extra={"payload": body}))
    assert row["message"] == "answer_sent"
    assert row["payload"]["message"] == "***"
    assert row["payload"]["quota"]["freeUsed"] == 1


def test_long_digit_runs_are_masked_inside_values() -> None:
    row = _emit(lambda log: log.info("contact_seen", extra={"note": "연락처 01012345678 남김"}))
    assert row["message"] == "contact_seen"
    assert "01012345678" not in row["note"]
