"""HTTP 겉면.

프론트가 부르는 다섯 자리다. 판정은 `domains/routing`, 조립은 `domains/answer`,
사용량은 `domains/quota` 가 한다. 여기서는 받고 넘기고 돌려주기만 한다.

**응답에 고민 원문을 담지 않는다. 서버는 원문을 저장하지 않는다.**
"""

from __future__ import annotations

import logging
from datetime import date as date_type
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import AnonKey
from app.domains.answer import compose
from app.domains.quota import usage
from app.domains.routing.rules import (
    ClassifierVerdict,
    RouteDecision,
    merge,
    needs_classifier,
    route_by_rules,
)
from app.domains.scripture import repo
from app.integrations.llm import get_llm_client

log = logging.getLogger(__name__)

router = APIRouter()

MAX_TEXT_CHARS = 5000


async def user_zone(
    x_timezone: Annotated[str | None, Header(alias="X-Timezone")] = None,
) -> ZoneInfo:
    """사용량 자정 기준. 기기가 자기 시간대를 보낸다. 모르면 기본값으로 떨어진다."""
    return usage.resolve_zone(x_timezone)


UserZone = Annotated[ZoneInfo, Depends(user_zone)]


class ConcernRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    text: str = Field(max_length=MAX_TEXT_CHARS)
    idempotency_key: str | None = Field(default=None, alias="idempotencyKey", max_length=128)


class Pass2Request(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    answer_id: str = Field(alias="answerId", max_length=64)
    idempotency_key: str | None = Field(default=None, alias="idempotencyKey", max_length=128)


class ContinueRequest(BaseModel):
    text: str = Field(max_length=MAX_TEXT_CHARS)


class ExtensionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    answer_id: str = Field(alias="answerId", max_length=64)


async def _decide(text: str, llm: Any) -> RouteDecision:
    """1층 rules → 필요하면 2층 classifier. 분류가 실패해도 답변은 나간다."""
    rules = route_by_rules(text)
    if not needs_classifier(rules):
        return rules
    try:
        raw = await llm.classify(text)
        verdict = ClassifierVerdict(
            route=raw["route"],
            confidence=float(raw["confidence"]),
            reasons=list(raw.get("reasons") or []),
            minor=bool(raw.get("minor")),
            abuse=bool(raw.get("abuse")),
        )
    except Exception:  # noqa: BLE001 - 사유만 남긴다. 원문은 남기지 않는다
        log.warning("classifier_failed", extra={"stage": "classifier"})
        verdict = None
    return merge(rules, verdict)


@router.post("/concern")
async def concern(body: ConcernRequest, anon_key: AnonKey, zone: UserZone) -> dict[str, Any]:
    """1차 패스. 화면 앞쪽(태그 · 오늘의 부처의 말 · 경전)을 먼저 내보낸다."""
    llm = get_llm_client()
    decision = await _decide(body.text, llm)

    if decision.route == "invalid":
        # 사용량을 차감하지 않는다. 모델을 부르지 않는다
        return compose.compose_invalid(decision, usage.snapshot(anon_key, zone))
    if decision.route == "crisis":
        # 경전·풀이·행동·광고가 없다. 모델을 부르지 않고 사용량도 세지 않는다
        return compose.compose_crisis(decision)

    route = decision.route if decision.route in ("normal", "deep") else "light"
    outcome = usage.reserve(anon_key, route, zone, body.idempotency_key)
    if not outcome.allowed:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            {"reason": "quota_exhausted", "quota": outcome.quota},
        )

    try:
        if route == "light":
            return await compose.compose_light(body.text, llm, outcome.quota)
        payload = await compose.compose_pass1(body.text, decision, llm, anon_key, outcome.quota)
    except Exception:
        # 성공한 생성만 센다. 실패하면 잡아 둔 자리를 되돌린다
        usage.release(anon_key, outcome.gate, zone, body.idempotency_key)
        log.exception("pass1_failed", extra={"route": route})
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "답변을 만들지 못했어요.") from None

    if payload.get("responseType") != "answer":
        # 모델이 crisis 를 올렸거나 답하지 않기로 했다. 둘 다 세지 않는다
        usage.release(anon_key, outcome.gate, zone, body.idempotency_key)
        payload.pop("quota", None)
    return payload


@router.post("/concern/pass2")
async def concern_pass2(body: Pass2Request, anon_key: AnonKey, zone: UserZone) -> dict[str, Any]:
    """2차 패스. 구절 id 는 pending 행에서 읽는다. 클라이언트가 보낸 구절을 믿지 않는다."""
    row = compose.get_pending(body.answer_id, anon_key)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "그 답변을 찾을 수 없어요.")
    return await compose.compose_pass2(row, get_llm_client(), usage.snapshot(anon_key, zone))


@router.post("/concern/continue")
async def concern_continue(body: ContinueRequest, anon_key: AnonKey) -> dict[str, Any]:
    """「그래도 이야기를 들어주세요」. 서버가 같은 글을 다시 판정해 열릴 때만 연다.

    클라이언트가 보낸 canContinue 를 믿지 않는다. acute 는 여기서 막혀 모델에 닿지 않는다.
    사용량은 세지 않는다.
    """
    decision = await _decide(body.text, get_llm_client())
    return await compose.compose_solace(body.text, decision, get_llm_client())


@router.post("/concern/extension")
async def concern_extension(body: ExtensionRequest, anon_key: AnonKey) -> dict[str, Any]:
    """보상형 광고를 본 뒤 한 번. 다른 경전 1 + 다른 관점 1 + 행동 1.

    보상 토큰 검증은 광고 연동이 붙을 때 이 앞에 선다. 그전까지 자리만 비워 둔다.
    """
    row = compose.get_pending(body.answer_id, anon_key)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "그 답변을 찾을 수 없어요.")
    payload = await compose.compose_extension(row, get_llm_client())
    if payload is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "더 드릴 구절이 남아 있지 않아요.")
    return payload


@router.get("/daily")
async def daily(
    anon_key: AnonKey,
    zone: UserZone,
    date: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
) -> dict[str, Any]:
    """오늘의 한마디. 같은 날에는 누구에게나 같은 구절이다."""
    day = date or usage.today_in(zone).isoformat()
    try:
        date_type.fromisoformat(day)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "날짜 형식이 올바르지 않아요.") from None
    picked = repo.daily(day)
    return {"date": day, "scripture": picked.to_api(), "line": picked.daily_line}
