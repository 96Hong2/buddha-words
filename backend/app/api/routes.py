"""HTTP 겉면.

프론트가 부르는 다섯 자리다. 판정은 `domains/routing`, 조립은 `domains/answer`,
사용량은 `domains/quota` 가 한다. 여기서는 받고 넘기고 돌려주기만 한다.

**응답에 고민 원문을 담지 않는다. 서버는 원문을 저장하지 않는다.**
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
from collections import OrderedDict
from dataclasses import replace
from datetime import date as date_type
from functools import lru_cache
from html import escape
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import Response

from app.api.deps import AnonKey
from app.core.config import get_settings
from app.domains import share
from app.domains.answer import compose
from app.domains.quota import usage
from app.domains.reminder import service as reminder
from app.domains.routing.rules import (
    ClassifierVerdict,
    RouteDecision,
    merge,
    needs_classifier,
    route_by_rules,
)
from app.domains.scripture import repo
from app.domains.share import tokens as color
from app.integrations.embedding import get_embedding_client
from app.integrations.llm import budget, get_llm_client

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
    # 이어가기 광고를 끝까지 보고 다시 보낸 길인가.
    # 보상 토큰 검증은 광고 연동이 붙을 때 이 값 앞에 선다
    ad_watched: bool = Field(default=False, alias="adWatched")


class Pass2Request(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    answer_id: str = Field(alias="answerId", max_length=64)
    idempotency_key: str | None = Field(default=None, alias="idempotencyKey", max_length=128)


class ContinueRequest(BaseModel):
    text: str = Field(max_length=MAX_TEXT_CHARS)


class ExtensionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    answer_id: str = Field(alias="answerId", max_length=64)


class ReminderRequest(BaseModel):
    """「내일 알림으로 여쭤볼게요」를 누른 사람의 예약.

    **언제 보낼지는 화면이 정한다.** 사람이 고른 시각과 기기 시간대를 아는 쪽이 화면이다.
    담기는 사용자 글은 행동 제목 하나뿐이고 고민 원문은 오지 않는다.
    """

    model_config = ConfigDict(populate_by_name=True)

    due_at: float = Field(alias="dueAt")
    action_title: str = Field(alias="actionTitle", max_length=200)


async def _classify(text: str, llm: Any) -> ClassifierVerdict | None:
    try:
        raw = await llm.classify(text)
        return ClassifierVerdict(
            route=raw["route"],
            confidence=float(raw["confidence"]),
            reasons=list(raw.get("reasons") or []),
            minor=bool(raw.get("minor")),
            abuse=bool(raw.get("abuse")),
        )
    except Exception:  # noqa: BLE001 - 사유만 남긴다. 원문은 남기지 않는다
        log.warning("classifier_failed", extra={"stage": "classifier"})
        return None


async def _decide(
    text: str, llm: Any, use_classifier: bool = True, use_embedding: bool = True
) -> tuple[RouteDecision, list[float] | None]:
    """1층 rules → 필요하면 2층 classifier. 분류가 실패해도 답변은 나간다.

    경전 후보를 좁힐 벡터를 **분류와 같이** 만든다. 분류를 기다리는 1~2초 안에 끝나므로
    화면이 기다리는 시간은 늘지 않는다. 순서대로 하면 0.5~0.9초가 그대로 얹힌다(실측).

    벡터를 여기서 만드는 데는 또 다른 이유가 있다. rules 가 위기·잘못된 입력으로 확정하면
    이 함수는 그 전에 돌아가므로 **그 글은 임베딩에도 가지 않는다.** 위기 글을 모델에 보내지
    않는다는 규칙은 분류기만이 아니라 임베딩에도 걸린다.

    `use_embedding` 을 끄면 분류만 하고 벡터는 만들지 않는다. 답변을 어차피 만들지 않아
    경전을 찾을 일이 없을 때 쓴다.

    `use_classifier` 를 끄면 모델을 아예 부르지 않고 rules 만으로 판정한다. 위기 글을
    놓치는 자리라서 **새 고민을 받는 길에서는 쓰지 않는다.**
    """
    rules = route_by_rules(text)
    if not needs_classifier(rules):
        return rules, None
    if not use_classifier:
        return merge(rules, None), None
    if not use_embedding:
        return merge(rules, await _classify(text, llm)), None
    verdict, vector = await asyncio.gather(
        _classify(text, llm),
        get_embedding_client().embed(text),
    )
    return merge(rules, verdict), vector


# 광고 문 앞에서 한 번, 광고를 보고 와서 한 번. 같은 글이 두 번 오지만 판정은 한 번만 한다.
# **원문을 남기지 않는다.** 열쇠는 익명키와 원문 해시이고, 값은 판정과 경전 검색 벡터다.
# 프로세스 메모리라 서버를 새로 띄우면 비고, 그때는 한 번 더 판정할 뿐 답이 달라지지 않는다.
_DECIDED: OrderedDict[str, tuple[float, RouteDecision, list[float] | None]] = OrderedDict()
_DECIDED_MAX = 64
_DECIDED_TTL_S = 900.0


def _rules_saw_crisis(text: str) -> bool:
    """규칙층이 위기로 본 글인가. 분류기가 내렸어도 광고는 붙이지 않으려고 본다.

    분류기가 규칙층 판정을 내릴 수 있는 것은 그대로 둔다. 창구로 보내지 않는 것까지가
    그 권한이고, 광고를 붙이는 것은 아니다. 「이제 그만하고 싶어요. 아무 의미가 없어요」가
    실제로 그렇게 걸렸다. 규칙층은 위기로 올렸고 분류기가 normal 로 내렸는데, 그 사람이
    받은 것은 상담 창구도 답변도 아닌 광고 시트였다(5회 중 5회).

    답은 그냥 준다. 이어가기 자리는 세므로 하루 천장은 그대로 선다.
    """
    return route_by_rules(text).route == "crisis"


def _decided_key(anon_key: str, text: str) -> str:
    return hashlib.sha256(f"{anon_key}\0{text}".encode()).hexdigest()


def _decided_get(key: str) -> tuple[RouteDecision, list[float] | None] | None:
    row = _DECIDED.get(key)
    if row is None:
        return None
    born, decision, vector = row
    if time.monotonic() - born > _DECIDED_TTL_S:
        del _DECIDED[key]
        return None
    # 뒤에서 사유·힌트를 덧붙여도 저장해 둔 판정이 물들지 않게 목록은 새로 뜬다
    return replace(decision, reasons=list(decision.reasons), hints=list(decision.hints)), vector


def _decided_put(key: str, decision: RouteDecision, vector: list[float] | None) -> None:
    _DECIDED[key] = (time.monotonic(), decision, vector)
    _DECIDED.move_to_end(key)
    while len(_DECIDED) > _DECIDED_MAX:
        _DECIDED.popitem(last=False)


@router.post("/concern")
async def concern(body: ConcernRequest, anon_key: AnonKey, zone: UserZone) -> dict[str, Any]:
    """1차 패스. 화면 앞쪽(태그 · 오늘의 부처의 말 · 경전)을 먼저 내보낸다."""
    llm = get_llm_client()
    # 전역 일일 예산이 차단선을 넘으면 새 고민을 받지 않는다(계획 1.3 「비용 방어」).
    # 이미 시작한 답변의 뒷부분(2차 패스)과 광고를 본 뒤의 Extension 은 이 문을 지나지 않는다
    #
    # **문이 닫혀 있어도 분류기까지 돌린다.** rules 만으로는 위기 글의 절반을 놓친다.
    # 「돌아오지 않는 여행을 가려고 해요」 「팔을 긋게 돼요」는 사전에 없어 rules 가 normal 로
    # 두고, 그러면 아래 429 로 떨어져 창구 대신 「잠시 뒤에 다시 보내 주세요」가 뜬다.
    # 분류는 싼 등급 한 번이고, 문이 막으려는 것은 그 뒤의 답변 생성이다. 벡터는 건너뛴다.
    closed = budget.blocked()
    decided_key = _decided_key(anon_key, body.text)
    # **광고를 보고 온 길에서만 꺼내 쓴다.** 광고 앞에서 같은 글을 다시 보낸 것은 사람이 한 번
    # 더 물은 것이다. 저장해 둔 판정을 그대로 주면 분류기가 놓친 위기 글은 몇 번을 다시 보내도
    # 같은 광고 시트 앞에 선다. 분류기 판정은 같은 글에도 회차마다 흔들려서, 다시 물으면
    # 창구로 가는 글이 실제로 있다. 광고 전후로 분류가 두 번 도는 일은 이 조건으로 막힌다
    cached = _decided_get(decided_key) if body.ad_watched else None
    if cached is not None:
        decision, query_vector = cached
    else:
        decision, query_vector = await _decide(body.text, llm, use_embedding=not closed)

    if decision.route == "invalid":
        # 사용량을 차감하지 않는다. 모델을 부르지 않는다
        return compose.compose_invalid(decision, usage.snapshot(anon_key, zone))
    if decision.route == "crisis":
        # 경전·풀이·행동·광고가 없다. 모델을 부르지 않고 사용량도 세지 않는다
        return compose.compose_crisis(decision)
    if closed:
        log.warning("budget_blocked", extra={"event": "budget_blocked", **budget.snapshot()})
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            {"reason": "budget_blocked", "quota": usage.snapshot(anon_key, zone)},
        )

    # 하루 천장을 없앤 자리에 서는 문이다. **위기·잘못 적은 입력을 지나서 선다.**
    # 앞에 세우면 급히 여러 번 보낸 사람의 위기 글이 여기서 막힌다.
    if usage.too_fast(anon_key):
        log.warning("too_fast", extra={"event": "too_fast", "max_per_minute": usage.MAX_PER_MINUTE})
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            {"reason": "too_fast", "quota": usage.snapshot(anon_key, zone)},
        )

    route = decision.route if decision.route in ("normal", "deep") else "light"
    outcome = usage.reserve(anon_key, route, zone, body.idempotency_key)
    if outcome.replay is not None:
        # 같은 멱등키가 이미 만든 답이 있다. 모델을 부르지 않고 그 답을 그대로 돌려준다
        return outcome.replay
    if outcome.in_progress:
        # 앞선 요청이 아직 만드는 중이다. 여기서 또 만들면 한 번 센 자리로 두 번 만들게 된다
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"reason": "in_progress", "quota": outcome.quota},
        )
    if outcome.gate == "ad_continue" and not body.ad_watched and not _rules_saw_crisis(body.text):
        # 오늘 무료분을 다 썼다. 광고를 보기 전이라 여기서 멈춘다.
        #
        # **이 자리가 위기 판정 뒤에 있어야 한다.** 화면이 먼저 광고 시트를 띄우면
        # 분류기가 잡을 위기 글이 서버에 닿지 못한 채 광고에 막힌다. 그래서 문은 서버가 열고,
        # 잡아 둔 자리는 되돌린다(멱등키도 같이 풀려 광고를 본 뒤 다시 보낼 수 있다).
        quota = usage.release(anon_key, outcome.gate, zone, body.idempotency_key)
        _decided_put(decided_key, decision, query_vector)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            {"reason": "ad_required", "quota": quota},
        )

    before_usd = budget.spent_today()
    try:
        if route == "light":
            light = await compose.compose_light(body.text, llm, outcome.quota)
            _log_llm_spend("light", route, before_usd)
            usage.remember(anon_key, body.idempotency_key, light, zone)
            return light
        payload = await compose.compose_pass1(
            body.text, decision, llm, anon_key, outcome.quota, query_vector
        )
        _log_llm_spend("pass1", route, before_usd)
    except Exception:
        # 성공한 생성만 센다. 실패하면 잡아 둔 자리를 되돌린다
        usage.release(anon_key, outcome.gate, zone, body.idempotency_key)
        log.exception("pass1_failed", extra={"route": route})
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "답변을 만들지 못했어요.") from None

    if payload.get("responseType") != "answer":
        # 모델이 crisis 를 올렸거나 답하지 않기로 했다. 둘 다 세지 않는다
        usage.release(anon_key, outcome.gate, zone, body.idempotency_key)
        payload.pop("quota", None)
    else:
        usage.remember(anon_key, body.idempotency_key, payload, zone)
    return payload


def _log_llm_spend(stage: str, route: str, before: float) -> None:
    """모델을 한 번 지나는 데 든 값을 한 줄 남긴다.

    **왜 여기냐면**, 비용을 아는 곳은 서버뿐이고 광고 수익을 아는 곳은 콘솔뿐이다.
    기여이익(광고 + 결제 − LLM 비용)을 계산하려면 세 번째 자리인 비용이 날짜별로 남아야 한다.
    행동 로그(토스 Analytics)에는 실을 수 없다. 기기가 이 값을 모르기 때문이다.

    장부의 앞뒤 차이로 잰다. 한 인스턴스에서 요청이 겹치면 **어느 답에 얼마가 들었는지는
    어긋날 수 있지만 하루 합계는 정확하다.** 필요한 것이 합계라 이 정도로 충분하고,
    이 값을 정확히 나누려면 provider 가 호출마다 값을 돌려주게 고쳐야 한다.

    고민 글도 답변 본문도 익명키도 싣지 않는다. 남기는 것은 단계·갈래·금액뿐이다.
    """
    spent = round(budget.spent_today() - before, 6)
    if spent <= 0:
        return
    log.info(
        "llm_spend",
        extra={"event": "llm_spend", "stage": stage, "route": route, "cost_usd": spent},
    )


@router.post("/concern/pass2")
async def concern_pass2(body: Pass2Request, anon_key: AnonKey, zone: UserZone) -> dict[str, Any]:
    """2차 패스. 구절 id 는 pending 행에서 읽는다. 클라이언트가 보낸 구절을 믿지 않는다."""
    row = compose.get_pending(body.answer_id, anon_key)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "그 답변을 찾을 수 없어요.")
    before_usd = budget.spent_today()
    try:
        return await compose.compose_pass2(row, get_llm_client(), usage.snapshot(anon_key, zone))
    finally:
        _log_llm_spend("pass2", row.route, before_usd)


@router.post("/concern/continue")
async def concern_continue(body: ContinueRequest, anon_key: AnonKey) -> dict[str, Any]:
    """「그래도 이야기를 들어주세요」. 서버가 같은 글을 다시 판정해 열릴 때만 연다.

    클라이언트가 보낸 canContinue 를 믿지 않는다. acute 는 여기서 막혀 모델에 닿지 않는다.
    사용량은 세지 않는다. 사용량은 안 세도 **비용은 센다.** 예산 문이 닫혀 있으면 분류기도
    임베딩도 위로 생성도 부르지 않고 고정 위로 문구와 창구 카드만 내보낸다. 이 자리가 문을
    지나지 않으면 차단선을 넘긴 뒤에도 같은 익명키로 얼마든지 모델을 부를 수 있다.
    """
    llm = get_llm_client()
    closed = budget.blocked()
    decision, _ = await _decide(body.text, llm, use_classifier=not closed)
    if closed:
        log.warning(
            "budget_blocked",
            extra={"event": "budget_blocked", "stage": "solace", **budget.snapshot()},
        )
    return await compose.compose_solace(body.text, decision, llm, allow_model=not closed)


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


@router.post("/reminder")
async def reminder_reserve(body: ReminderRequest, anon_key: AnonKey) -> dict[str, Any]:
    """내일 한 번 여쭤보기로 한다. 한 사람에 한 줄이고, 새로 누르면 앞의 것을 덮는다.

    예약만 담는다. 실제 발송은 1분마다 도는 `scripts/send_reminders.py` 가 한다.
    """
    try:
        reminder.reserve(
            anon_key,
            due_at=body.due_at,
            action_title=body.action_title,
            now=time.time(),
        )
    except reminder.InvalidReminderError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error
    return {"reserved": True}


@router.delete("/reminder")
async def reminder_cancel(anon_key: AnonKey) -> dict[str, Any]:
    """이미 답했거나 그만 받겠다고 했다. 보내지 않는다."""
    reminder.cancel(anon_key)
    return {"reserved": False}


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


# ────────────────────────────────────────────────────────────────────────────
# 공유 카드 (M5). 서버가 그린다
#
# 링크를 받은 사람은 익명키가 없다. 그래서 답변 행을 그대로 열어 주지 않고, 카드에 그릴
# 다섯 조각만 따로 떼어 추측할 수 없는 토큰 뒤에 둔다. **고민 원문은 그 다섯에 없다.**
# ────────────────────────────────────────────────────────────────────────────

SHARE_ID = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
# 카드는 한 번 만들어지면 바뀌지 않는다. 미리보기 크롤러가 여러 번 와도 다시 그리지 않게 한다
CARD_CACHE = "public, max-age=31536000, immutable"


class ShareRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    answer_id: str = Field(alias="answerId", max_length=64)
    # 무엇을 보낼지. 기본은 경전 구절 카드다. 화면이 고르지 않으면 적게 나가는 쪽으로 간다
    scope: Literal["scripture", "full"] = "scripture"


@router.post("/share")
async def share_create(body: ShareRequest, anon_key: AnonKey, request: Request) -> dict[str, Any]:
    """공유 링크를 연다. 카드에 실릴 것이 여기서 정해진다.

    **카톡에 붙는 주소(`landingUrl`)를 서버가 만들어 같이 내려준다.** 화면이 자기 origin 으로
    조립하면 SPA 주소가 나가고, 그 자리는 CSR 이라 크롤러 눈에 빈 문서다. 미리보기가 앱 소개
    그림으로 뜨는 원인이 그것이었다. 주소는 배포마다 달라서 지어낼 수도 없다.
    """
    row = compose.get_pending(body.answer_id, anon_key)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "그 답변을 찾을 수 없어요.")
    scripture = repo.by_id(row.scripture_ids[0]) if row.scripture_ids else None
    if scripture is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "카드에 실을 구절이 없어요.")
    card = share.card_from_row(row, scripture)
    # 전체 보내기를 고른 링크에만 답변 본문이 함께 담긴다. 고민 원문은 어느 쪽에도 없다
    full = (
        share.full_from_row(row, getattr(row, "modern_message", "") or "")
        if body.scope == "full"
        else None
    )
    # 그릴 수 없는 글자가 있으면 링크를 만들기 전에 막는다. 두부가 찍힌 카드는 되돌릴 수 없다
    try:
        share.check_renderable(card)
    except share.UnrenderableTextError as exc:
        # 사유는 extra 로 싣는다. 로그 본문에 붙이면 이벤트 이름이 사유에 묻힌다
        log.warning(
            "share_card_unrenderable",
            extra={"event": "share_card_unrenderable", "why": str(exc)},
        )
        raise HTTPException(status.HTTP_409_CONFLICT, "카드로 만들 수 없는 글자가 있어요.") from exc
    share_id = share.put(card, full)
    return {
        "shareId": share_id,
        "scope": "full" if full is not None else "scripture",
        # 링크로 나가는 주소. 절대주소라야 메신저에 그대로 붙는다
        "landingUrl": f"{_origin(request)}/s/{share_id}",
        "cardUrl": f"/share/{share_id}/card.png",
        "ogUrl": f"/share/{share_id}/og.png",
    }


def _card_png(share_id: str, kind: str, make: Any) -> Response:
    if not SHARE_ID.match(share_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "그 카드를 찾을 수 없어요.")
    png = share.rendered(share_id, kind, make)
    if png is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "그 카드를 찾을 수 없어요.")
    return Response(png, media_type="image/png", headers={"Cache-Control": CARD_CACHE})


# 아래 둘은 일부러 async 가 아니다. 그림을 그리는 동안 CPU 를 쥐고 있어서
# 이벤트 루프에 그대로 올리면 그 사이 다른 요청이 전부 멈춘다. Starlette 이 스레드로 뺀다.


@router.get("/share/{share_id}/card.png")
def share_card_png(share_id: str) -> Response:
    """1080×1620. 링크 랜딩과 이미지 저장. 링크를 받은 사람이 여는 자리라 익명키를 묻지 않는다."""
    return _card_png(share_id, "card", share.render_card)


@router.get("/share/{share_id}/og.png")
def share_og_png(share_id: str) -> Response:
    """1200×600. 카톡 같은 메신저의 미리보기 크롤러가 긁어 가는 자리."""
    return _card_png(share_id, "og", share.render_og)


# ────────────────────────────────────────────────────────────────────────────
# 공유 링크 랜딩 `/s/{token}`
#
# 카톡·트위터 미리보기 크롤러는 자바스크립트를 돌리지 않는다. 같은 경로를 프론트가 CSR 로
# 그리고 있어 크롤러 눈에는 빈 문서였고, 그래서 공유 링크에 미리보기가 하나도 뜨지 않았다.
# 서버가 이 경로를 받아 OG 메타가 박힌 한 장짜리 문서를 내려준다.
#
# **서버는 메타까지만 지고 사람은 SPA 랜딩으로 넘긴다.** 여기 문서에는 입력창이 없어서,
# 사람이 그대로 머물면 계획이 요구하는 「링크 → 전송 2탭」이 안 나온다. 넘기는 방법은
# 문서 안의 `location.replace` 한 줄이다. 크롤러는 자바스크립트를 안 돌려 위의 메타를 그대로
# 읽고, 사람만 넘어간다. User-Agent 로만 가르면 목록에 없는 크롤러가 새므로 그쪽을 주로 쓰지
# 않고, 스크립트를 도는 크롤러가 미리보기를 놓치지 않게 아는 이름만 덧대어 막는다.
# 자바스크립트가 꺼진 사람을 위해 본문에도 같은 곳으로 가는 버튼을 둔다.
#
# **미리보기 글에도 고민 원문이 실리지 않는다.** 여기서 읽는 것은 `ShareCardData` 뿐이고,
# 그중에서도 경전 구절과 귀속까지다. 한 줄 풀이는 싣지 않는다. 그 문장은 구절의 뜻을 적은
# 것이지만 미리보기 한 줄에 몰아 넣으면 무엇이 감수 원문인지 흐려진다. 그림이 그것을 진다.
# ────────────────────────────────────────────────────────────────────────────

# 미리보기에 싣는 글 길이. 메신저가 어차피 뒤를 자르므로 여기서 먼저 단정하게 끊는다
OG_TEXT_CHARS = 180

# 링크가 죽는 날이 있어 카드 그림(1년)만큼 길게 두지 않는다
LANDING_CACHE = "public, max-age=600"

# 같은 주소인데 크롤러와 사람에게 다른 문서가 나간다. 이 줄이 없으면 앞에 선 CDN·프록시가
# 크롤러가 받아 간 판(넘김 없는 판)을 사람에게 그대로 내준다
LANDING_VARY = "User-Agent"

# 토스 앱에서 이 미니앱을 여는 주소. 공유 링크가 쓰는 스킴과 같다
APP_SCHEME = "intoss://buddha-words"

# 스크립트를 도는 미리보기 크롤러. 여기 걸리면 넘기지 않고 메타를 그대로 보여 준다.
# 카톡 인앱 브라우저(UA 에 KAKAOTALK 이 그냥 들어 있다)를 사람으로 남기려고 `scrap` 까지 본다
CRAWLER_UA = re.compile(r"bot|crawler|spider|scrap|facebookexternalhit|preview|curl|wget", re.I)

LANDING_TITLE = "친구가 보낸 말씀 · 부처의 말"
GONE_TITLE = "이 말씀은 더 볼 수 없어요"
GONE_TEXT = "링크가 만료됐거나 보낸 사람이 지웠어요. 대신 오늘 당신의 이야기를 들려주세요."
LANDING_CTA = "토스에서 나도 이야기해보기"
# 토스가 없는 사람과 PC 에서 갈 곳. 딥링크 하나만 두면 여기가 막다른 곳이 된다
WEB_CTA = "웹에서 바로 이야기해보기"
# 받는 사람이 가장 먼저 궁금해하는 것. 화면 랜딩과 같은 문장이다
NO_CONCERN_NOTE = "보낸 사람의 고민 내용은 담기지 않아요"


def _hex(name: str) -> str:
    """색 정본은 `design/foundations/_tokens.css` 하나다. 여기서 값을 만들지 않는다."""
    return "#{:02X}{:02X}{:02X}".format(*color.rgb(name))


@lru_cache
def _landing_style() -> str:
    return (
        ":root{color-scheme:light}"
        "*{box-sizing:border-box}"
        f"body{{margin:0;padding:28px 18px 40px;background:{_hex('bg')};color:{_hex('text')};"
        "font-family:'Pretendard',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',"
        "'Malgun Gothic',sans-serif;line-height:1.6;-webkit-text-size-adjust:100%}"
        "main{max-width:380px;margin:0 auto;text-align:center}"
        f".from{{margin:0 0 14px;font-size:14px;font-weight:600;color:{_hex('accent-text')}}}"
        "img{display:block;width:100%;height:auto;margin:0 auto 22px;border-radius:18px;"
        f"background:{_hex('surface-illust')}}}"
        "h1{margin:0 0 10px;font-size:21px;line-height:1.45}"
        f"p{{margin:0 0 18px;font-size:15px;color:{_hex('text-muted')}}}"
        f"a.cta{{display:block;padding:15px 18px;border-radius:14px;background:{_hex('btn')};"
        f"color:{_hex('on-btn')};font-size:16px;font-weight:600;text-decoration:none}}"
        f"a.sub{{display:block;margin-top:10px;padding:15px 18px;border-radius:14px;"
        f"border:1px solid {_hex('accent-rule')};background:transparent;color:{_hex('text')};"
        "font-size:16px;font-weight:600;text-decoration:none}"
        f"p.foot{{margin:16px 0 0;font-size:13px;color:{_hex('text-weak')}}}"
        # ── 전체 보내기 랜딩. 앱의 답변 화면과 같은 차례로 읽힌다 ──
        # 본문은 읽는 글이라 왼쪽으로 맞춘다. 가운데로 맞춘 긴 글은 줄마다 시작점이 흔들린다
        f".full{{margin:0 0 22px;text-align:left}}"
        f".full .msg{{margin:0 0 18px;font-size:19px;line-height:1.62;font-weight:600;"
        f"color:{_hex('text')}}}"
        f".full blockquote{{margin:0 0 22px;padding:18px 18px 16px;border-radius:16px;"
        f"background:{_hex('surface-illust')};border:1px solid {_hex('accent-rule')}}}"
        f".full .qlab{{display:inline-block;margin-bottom:8px;font-size:12px;font-weight:700;"
        f"letter-spacing:.02em;color:{_hex('accent-text')}}}"
        f".full blockquote p{{margin:0 0 10px;font-size:16px;line-height:1.72;"
        f"color:{_hex('text')}}}"
        f".full cite{{display:block;font-size:13px;font-style:normal;color:{_hex('text-weak')}}}"
        f".full h2{{margin:24px 0 10px;font-size:15px;font-weight:700;color:{_hex('accent-text')}}}"
        f".full h3{{margin:16px 0 6px;font-size:15px;font-weight:600;color:{_hex('text')}}}"
        f".full p.body{{margin:0 0 12px;font-size:15px;line-height:1.75;color:{_hex('text')}}}"
        f".full ol{{margin:0;padding-left:20px}}"
        f".full li{{margin:0 0 12px;font-size:15px;line-height:1.72;color:{_hex('text')}}}"
        f".full li .why{{display:block;margin-top:4px;font-size:14px;color:{_hex('text-muted')}}}"
        f".full .closing{{margin:22px 0 0;padding-top:18px;font-size:15px;line-height:1.75;"
        f"border-top:1px solid {_hex('accent-rule')};color:{_hex('text-muted')}}}"
        f".full .madeby{{margin:18px 0 0;font-size:12px;color:{_hex('text-weak')}}}"
    )


def _web_origin() -> str | None:
    """사람을 넘길 SPA 주소. 없으면 넘기지 않고 이 문서에 머문다.

    설정에 없으면 그걸로 끝이다. CORS 허용 목록에서 주워 오지 않는다. 그 목록은 「이 주소에서
    오는 요청을 받는다」는 뜻이고, 사람을 그리로 보내도 된다는 뜻이 아니다. 예전에는 목록의 첫
    https 주소로 떨어졌는데 그 값이 토스 미니앱 WebView 주소여서, 카톡에서 링크를 누른 사람이
    `location.replace` 로 말없이 거기로 갔다. 백엔드 랜딩의 출구는 보이지도 않았다.

    값이 꼴을 갖췄는지는 `core/config.py` 의 기동 가드가 본다. 여기까지 왔으면 주소다.
    """
    raw = (get_settings().web_origin or "").strip().rstrip("/")
    return raw or None


def _place(url: str) -> tuple[str, str]:
    """주소에서 「어느 자리인가」만 남긴다. 대소문자·기본 포트·http/https 차이를 지운다."""
    parts = urlsplit(url)
    host = parts.hostname or ""
    port = parts.port
    if port in (80, 443):
        port = None
    return (f"{host}:{port}" if port else host, parts.path)


def _forward_to(request: Request, path: str) -> str | None:
    """넘길 곳. 자기 자신으로 넘기면 무한히 도니 그때는 넘기지 않는다.

    글자 그대로 비교하지 않는다. `https://Api.example.com` 처럼 대문자가 섞이거나,
    프록시가 `X-Forwarded-Proto` 를 안 보내 이쪽은 http 로 보이는데 설정에는 https 로
    적힌 배포에서는 같은 자리인데 글자가 달라 가드가 샌다. 그러면 문서가 자기 자신을
    다시 열고 그 문서가 또 같은 줄을 돌려 브라우저가 초당 수백 번 도는 화면이 된다.
    """
    web = _web_origin()
    if web is None:
        return None
    target = f"{web}{path}"
    if _place(target) == _place(f"{_origin(request)}{request.url.path}"):
        return None
    return target


def _forward_script(target: str) -> str:
    """사람만 넘어간다. 크롤러는 스크립트를 안 돌려 위의 메타를 그대로 읽는다."""
    literal = json.dumps(target).replace("<", "\\u003C")
    return f"<script>location.replace({literal})</script>"


def _clip(text: str, limit: int) -> str:
    flat = " ".join(text.split())
    if len(flat) <= limit:
        return flat
    return flat[: limit - 1].rstrip() + "…"


# 전체 보내기 랜딩의 머리말과 꼬리말
FULL_FROM = "친구가 받은 답이에요"
FULL_MADE_BY = "풀이와 조언은 AI 가 썼고, 경전 원문은 문헌에서 옮긴 것이에요"
FULL_NO_CONCERN = "보낸 사람이 적은 고민 글은 담기지 않아요"

# 앱 화면과 같은 소제목을 쓴다. 받은 사람이 앱에 들어와도 같은 차례를 본다
FULL_HEAD_EXPLANATION = "이 말씀은 이런 뜻이에요"
FULL_HEAD_ANALYSIS = "당신의 이야기를 보면"
FULL_HEAD_ACTIONS = "지금 할 수 있는 것"


def _full_body(card: share.ShareCardData, full: share.ShareFullData) -> str:
    """답변 전체를 앱에서 보던 차례 그대로 그린다.

    여기 실리는 글은 전부 저장 자리에서 읽은 것이다. 고민 원문은 담긴 적이 없어 그릴 수도 없다.
    모든 글은 escape 를 지나간다. 경전 구절도 모델이 쓴 글도 우리가 만든 태그가 아니다.
    """
    parts: list[str] = ['<div class="full">']

    if full.buddha_message:
        parts.append(f'<p class="msg">{escape(full.buddha_message)}</p>')

    parts.append(
        "<blockquote>"
        f'<span class="qlab">{escape(share.QUOTE_LABEL)}</span>'
        f"<p>{escape(card.scripture_text)}</p>"
        f"<cite>{escape(card.scripture_attribution)}</cite>"
        "</blockquote>"
    )

    if full.explanation:
        parts.append(f"<h2>{escape(FULL_HEAD_EXPLANATION)}</h2>")
        parts.append(f'<p class="body">{escape(full.explanation)}</p>')

    sections = [item for item in full.analysis if item.get("body")]
    if sections:
        parts.append(f"<h2>{escape(FULL_HEAD_ANALYSIS)}</h2>")
        for item in sections:
            heading = item.get("heading") or ""
            if heading:
                parts.append(f"<h3>{escape(heading)}</h3>")
            parts.append(f'<p class="body">{escape(item["body"])}</p>')

    actions = [item for item in full.actions if item.get("title")]
    if actions:
        parts.append(f"<h2>{escape(FULL_HEAD_ACTIONS)}</h2><ol>")
        for item in actions:
            why = item.get("why") or ""
            tail = f'<span class="why">{escape(why)}</span>' if why else ""
            parts.append(f'<li>{escape(item["title"])}{tail}</li>')
        parts.append("</ol>")

    if full.closing:
        parts.append(f'<p class="closing">{escape(full.closing)}</p>')

    parts.append(f'<p class="madeby">{escape(FULL_MADE_BY)}</p>')
    parts.append("</div>")
    return "".join(parts)


def _preview_text(scripture: str, attribution: str) -> str:
    """미리보기 글. 구절을 먼저 줄이고 귀속 자리를 남긴다.

    이어 붙인 뒤 통째로 자르면 뒤에 선 귀속이 먼저 없어진다. 후보 399구절 중 70개가
    누구의 말인지 없이 나갔고, 몇 개는 출처 이름 한가운데서 끊겼다.
    귀속이 너무 길어 구절 자리가 남지 않을 때만 예전처럼 통째로 자른다.
    """
    attr = " ".join(attribution.split())
    room = OG_TEXT_CHARS - len(attr) - 3
    if room < 20:
        return _clip(f"{scripture} · {attr}", OG_TEXT_CHARS)
    return f"{_clip(scripture, room)} · {attr}"


def _origin(request: Request) -> str:
    """바깥에서 보이는 주소. 프록시 뒤에서도 https 를 잃지 않는다.

    og:image 는 절대 주소라야 크롤러가 가져간다. 상대 주소로 두면 미리보기가 그림 없이 뜬다.
    """
    forwarded = request.headers.get("x-forwarded-proto", "")
    scheme = forwarded.split(",")[0].strip() or request.url.scheme
    host = request.headers.get("x-forwarded-host", "").split(",")[0].strip() or request.url.netloc
    return f"{scheme}://{host}"


def _landing_document(
    *,
    title: str,
    description: str,
    canonical: str,
    image: str | None,
    body: str,
    script: str = "",
) -> str:
    """OG 메타가 박힌 문서 한 장. 크롤러는 머리만 읽고 사람은 SPA 로 넘어간다."""
    safe_title = escape(title, quote=True)
    safe_description = escape(description, quote=True)
    safe_canonical = escape(canonical, quote=True)
    picture = ""
    if image is not None:
        safe_image = escape(image, quote=True)
        width, height = share.OG_SIZE
        picture = (
            f'<meta property="og:image" content="{safe_image}" />'
            f'<meta property="og:image:width" content="{width}" />'
            f'<meta property="og:image:height" content="{height}" />'
            '<meta property="og:image:alt" content="경전 구절이 적힌 카드" />'
            f'<meta name="twitter:image" content="{safe_image}" />'
        )
    return (
        "<!doctype html>"
        '<html lang="ko"><head><meta charset="utf-8" />'
        '<meta name="viewport" content="width=device-width, initial-scale=1" />'
        f"<title>{safe_title}</title>"
        f'<meta name="description" content="{safe_description}" />'
        '<meta property="og:type" content="website" />'
        '<meta property="og:site_name" content="부처의 말" />'
        '<meta property="og:locale" content="ko_KR" />'
        f'<meta property="og:title" content="{safe_title}" />'
        f'<meta property="og:description" content="{safe_description}" />'
        f'<meta property="og:url" content="{safe_canonical}" />'
        f"{picture}"
        '<meta name="twitter:card" content="summary_large_image" />'
        f'<meta name="twitter:title" content="{safe_title}" />'
        f'<meta name="twitter:description" content="{safe_description}" />'
        f"<style>{_landing_style()}</style>"
        f"{script}"
        f"</head><body><main>{body}</main></body></html>"
    )


@router.get("/s/{token}")
def share_landing(token: str, request: Request) -> Response:
    """공유 링크를 받은 쪽이 여는 자리. 크롤러에게는 미리보기, 사람은 SPA 랜딩으로."""
    found = share.get_full(token) if SHARE_ID.match(token) else None
    card = found[0] if found else None
    full = found[1] if found else None
    origin = _origin(request)
    canonical = f"{origin}/s/{token}"

    # 넘길 곳은 같은 경로다. 살아 있으면 카드와 입력창, 죽었으면 SPA 의 만료 화면이 맞는다
    web = _forward_to(request, f"/s/{token}")
    crawler = CRAWLER_UA.search(request.headers.get("user-agent", "")) is not None
    # 전체 보내기 링크는 **넘기지 않는다.** 답변 본문은 이 문서에만 있고 SPA 랜딩은 카드만
    # 그린다. 넘기면 받은 사람이 보러 온 글을 못 보고 카드 한 장에서 끝난다
    script = "" if web is None or crawler or full is not None else _forward_script(web)
    # 스크립트가 안 도는 사람(자바스크립트 꺼짐 · 넘김을 막은 UA)이 쓰는 버튼.
    # 딥링크만 두면 토스가 없는 사람과 PC 에서 막다른 곳이 된다
    web_cta = (
        ""
        if web is None
        else f'<a class="cta" href="{escape(web, quote=True)}">{escape(WEB_CTA)}</a>'
    )
    app_class = "sub" if web is not None else "cta"

    if card is None:
        # 없는 링크라고 곧이곧대로 404 를 낸다. 토큰이 추측할 수 없는 난수라 「없다」는 말로
        # 새어 나가는 것이 없다. 다만 사람이 열었을 때 막다른 곳이 되지 않게 나갈 길을 둔다
        body = (
            f"<h1>{escape(GONE_TITLE)}</h1>"
            f"<p>{escape(GONE_TEXT)}</p>"
            f"{web_cta}"
            f'<a class="{app_class}" href="{APP_SCHEME}">{escape(LANDING_CTA)}</a>'
        )
        return Response(
            _landing_document(
                title=GONE_TITLE,
                description=GONE_TEXT,
                canonical=canonical,
                image=None,
                body=body,
                script=script,
            ),
            status_code=status.HTTP_404_NOT_FOUND,
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": "no-store"},
        )

    # 미리보기에 싣는 것은 여기까지다. 경전 구절과 그 말을 한 이가 누구인가.
    #
    # ⚠ 전체 보내기 링크도 **미리보기 글은 똑같다.** 대화방 목록에 그대로 펼쳐지는 자리라,
    # 여기에 개인 풀이를 실으면 링크를 연 적도 없는 사람들이 먼저 읽는다. 링크를 눌러
    # 들어온 사람만 전체를 본다. 그림도 경전 카드 그대로다
    description = _preview_text(card.scripture_text, card.scripture_attribution)
    if full is not None:
        body = (
            f'<p class="from">{escape(FULL_FROM)}</p>'
            f"{_full_body(card, full)}"
            f"{web_cta}"
            f'<a class="{app_class}" href="{APP_SCHEME}">{escape(LANDING_CTA)}</a>'
            f'<p class="foot">{escape(FULL_NO_CONCERN)}</p>'
        )
    else:
        body = (
            '<p class="from">친구가 보낸 말씀이에요</p>'
            f'<img src="/share/{token}/card.png" alt="친구가 보낸 말씀 카드" '
            f'width="{share.CARD_SIZE[0]}" height="{share.CARD_SIZE[1]}" />'
            f"{web_cta}"
            f'<a class="{app_class}" href="{APP_SCHEME}/s/{token}">{escape(LANDING_CTA)}</a>'
            f'<p class="foot">{escape(NO_CONCERN_NOTE)}</p>'
        )
    return Response(
        _landing_document(
            title=LANDING_TITLE,
            description=description,
            canonical=canonical,
            image=f"{origin}/share/{token}/og.png",
            body=body,
            script=script,
        ),
        media_type="text/html; charset=utf-8",
        headers={"Cache-Control": LANDING_CACHE, "Vary": LANDING_VARY},
    )
