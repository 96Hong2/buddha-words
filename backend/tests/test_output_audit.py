"""나가는 문장의 의료 어휘 사후 검사.

안전 불변식은 「병명·진단·치료·처방 어휘는 프롬프트 금지어와 사후 검사 둘 다에 있다.
사후 검사는 막지 않고 로그만」이다. 프롬프트가 한 겹이고 이 검사가 나머지 한 겹이다.

목으로 격리하지 않는다. provider 만 금지 어휘를 내는 것으로 바꾸고 라우터·조립·응답은
진짜로 돈다. 기대값은 불변식 문장에서 왔다. 실행 출력에서 베끼지 않았다.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api import routes
from app.domains.answer import compose
from app.domains.quota import usage
from app.integrations.llm import budget
from app.integrations.llm.stub import StubClient
from app.main import app

BAD_MESSAGE = "우울증일 수 있으니 정신과 전문가와 상담해 보셔요."
BAD_EXPLANATION = "이 구절은 공황장애를 앓는 마음에 처방처럼 닿습니다."
NORMAL_CONCERN = "회사 가기 싫어요. 팀장님이 매일 아침 회의에서 제 보고서만 지적해요."
LIGHT_CONCERN = "점심 뭐 먹지?"


class MedicalClient(StubClient):
    """금지 어휘를 내는 모델. 다른 필드는 stub 그대로다."""

    async def pass1(
        self, text: str, candidates: list[dict[str, str]], tier: Any
    ) -> dict[str, object]:
        raw = await super().pass1(text, candidates, tier)
        raw["modernBuddhaMessage"] = BAD_MESSAGE
        return raw

    async def pass2(
        self, text: str, scripture: dict[str, str], deep: bool, tier: Any
    ) -> dict[str, object]:
        raw = await super().pass2(text, scripture, deep, tier)
        raw["scriptureExplanation"] = BAD_EXPLANATION
        return raw

    async def light(self, text: str) -> dict[str, object]:
        raw = await super().light(text)
        raw["message"] = BAD_MESSAGE
        return raw


@pytest.fixture(autouse=True)
def _isolate() -> None:
    usage.reset_all()
    compose.reset_store()
    budget.reset_all()


@pytest.fixture
def headers() -> dict[str, str]:
    return {"X-Anon-Key": f"anon-{uuid.uuid4().hex}", "X-Timezone": "Asia/Seoul"}


def _events(caplog: pytest.LogCaptureFixture) -> list[tuple[str, list[str]]]:
    return [
        (record.field, record.terms)  # type: ignore[attr-defined]
        for record in caplog.records
        if getattr(record, "event", None) == "medical_term_in_output"
    ]


def test_medical_terms_are_logged_with_field_and_terms(
    monkeypatch: pytest.MonkeyPatch, headers: dict[str, str], caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(routes, "get_llm_client", MedicalClient)
    client = TestClient(app)

    with caplog.at_level(logging.WARNING, logger="app.domains.answer.compose"):
        first = client.post("/concern", json={"text": NORMAL_CONCERN}, headers=headers).json()
        client.post("/concern/pass2", json={"answerId": first["answerId"]}, headers=headers)

    fields = {field for field, _ in _events(caplog)}
    assert "pass1.modernBuddhaMessage" in fields
    assert "pass2.scriptureExplanation" in fields
    terms = dict(_events(caplog))
    assert set(terms["pass1.modernBuddhaMessage"]) == {"counseling", "psychiatry", "disease_name"}
    assert set(terms["pass2.scriptureExplanation"]) == {"prescription", "disease_name"}


def test_audit_does_not_block_the_answer(
    monkeypatch: pytest.MonkeyPatch, headers: dict[str, str]
) -> None:
    """불변식이 「막지 않고 로그만」이다. 답을 버리거나 고쳐 쓰지 않는다."""
    monkeypatch.setattr(routes, "get_llm_client", MedicalClient)
    client = TestClient(app)

    payload = client.post("/concern", json={"text": NORMAL_CONCERN}, headers=headers).json()
    assert payload["responseType"] == "answer"
    assert payload["modernBuddhaMessage"] == BAD_MESSAGE


def test_light_answer_passes_the_audit(
    monkeypatch: pytest.MonkeyPatch, headers: dict[str, str], caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(routes, "get_llm_client", MedicalClient)
    client = TestClient(app)

    with caplog.at_level(logging.WARNING, logger="app.domains.answer.compose"):
        payload = client.post("/concern", json={"text": LIGHT_CONCERN}, headers=headers).json()

    assert payload["responseType"] == "light"
    assert "light.message" in {field for field, _ in _events(caplog)}


def test_plain_answer_logs_nothing(
    headers: dict[str, str], caplog: pytest.LogCaptureFixture
) -> None:
    """stub 이 쓰는 평범한 문장에 걸리면 로그가 쓸모없어진다."""
    client = TestClient(app)

    with caplog.at_level(logging.WARNING, logger="app.domains.answer.compose"):
        payload = client.post("/concern", json={"text": NORMAL_CONCERN}, headers=headers).json()
        client.post("/concern/pass2", json={"answerId": payload["answerId"]}, headers=headers)
        client.post("/concern/extension", json={"answerId": payload["answerId"]}, headers=headers)

    assert _events(caplog) == []
