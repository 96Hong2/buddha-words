"""답변 조립.

모델이 낸 것과 서버가 채운 것을 여기서 합친다. 규칙은 셋이다.

1. 경전 본문은 언제나 서버가 채운다. 모델은 id 만 고르고, **후보 밖의 id 는 버린다.**
2. crisis 는 어느 층이 올리든 올라간다. crisis 면 본 답변을 만들지 않는다.
3. 위로 답변(solace)은 `escalate_to_solace` 가 허락할 때만 만든다.
   만든 뒤 `SOLACE_FORBIDDEN` 에 걸리면 문장을 고치지 않고 통째로 버리고 고정 문구로 바꾼다.

응답에 고민 원문을 담지 않는다.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Any

from app.domains.routing.rules import (
    SOLACE_FALLBACK,
    SOLACE_FORBIDDEN,
    RouteDecision,
    escalate_to_solace,
)
from app.domains.scripture import repo

# spec/answer.schema.json 의 EmotionTag. 모델이 새 태그를 만들면 other 로 접는다
EMOTION_TAGS = frozenset(
    {
        "anxiety",
        "comparison",
        "approval",
        "attachment",
        "anger",
        "regret",
        "loneliness",
        "emptiness",
        "confusion",
        "fatigue",
        "other",
    }
)
# spec/answer.schema.json 의 VisualTheme
VISUAL_THEMES = frozenset(
    {
        "anxiety",
        "anger",
        "loss",
        "comparison",
        "choice",
        "sleepless",
        "attachment",
        "emptiness",
        "relationship",
        "approval",
    }
)
# 모델이 알 수 없는 테마를 내면 여기로 접는다. 중립이라 어떤 글에 붙어도 어긋나지 않는다
FALLBACK_THEME = "choice"
# 위로 답변에 붙일 구절을 찾는 테마. 흔들리는 마음을 약함으로 보지 않는 구절이 걸린다
SOLACE_THEME = "anxiety"

# 위기 창구. 위에서부터 그리는 순서다. 문구·번호는 여기서만 정한다
CHANNELS_BASE = ("109", "madeleine")
CHANNELS_MINOR = ("1388",)
CHANNELS_ABUSE = ("1366", "112")

# rules 의 판정 근거 코드 → ApiInvalid.messageKey 고정 4종
INVALID_MESSAGE_KEY = {
    "empty_or_symbols": "empty",
    "injection_pattern": "injection",
    "low_entropy": "repetition",
    "random_string": "repetition",
}

MAX_SCRIPTURES = 2
PENDING_TTL_SECONDS = 30 * 60


# ────────────────────────────────────────────────────────────────────────────
# pending 행. 요청 2(2차 패스)와 Extension 이 이 행을 읽는다
# ────────────────────────────────────────────────────────────────────────────


@dataclass
class Pending:
    answer_id: str
    anon_key: str
    route: str
    visual_theme: str
    emotion_tags: list[str]
    modern_message: str
    scripture_ids: list[str]
    candidate_ids: list[str]
    safety: str
    route_note: str | None
    created_at: float
    # 고민 원문. **프로세스 메모리에만 산다.** 컬럼·로그·이벤트·응답 어디에도 나가지 않고
    # TTL 이 지나면 행과 함께 사라진다. 2차 패스와 Extension 이 모델을 부를 때만 쓴다
    text: str = ""
    pass2: dict[str, Any] | None = None
    extension_used: bool = False


# 여기는 DB 가 붙을 자리다. consultations 테이블(멱등키 유니크 · TTL 삭제)로 바뀐다.
# 지금은 프로세스 메모리라 서버를 새로 띄우면 비고, 인스턴스가 둘이면 서로 못 본다.
_PENDING: dict[str, Pending] = {}


def _sweep(now: float) -> None:
    stale = [k for k, v in _PENDING.items() if now - v.created_at > PENDING_TTL_SECONDS]
    for key in stale:
        del _PENDING[key]


def get_pending(answer_id: str, anon_key: str) -> Pending | None:
    """남의 답변은 없는 것으로 본다. 있다 없다를 알려 주지 않는다."""
    _sweep(time.time())
    row = _PENDING.get(answer_id)
    if row is None or row.anon_key != anon_key:
        return None
    return row


def reset_store() -> None:
    """테스트가 격리하려고 부른다."""
    _PENDING.clear()


# ────────────────────────────────────────────────────────────────────────────
# 공통 조각
# ────────────────────────────────────────────────────────────────────────────


def _new_answer_id() -> str:
    return f"ans_{uuid.uuid4().hex[:16]}"


def fold_emotion_tags(raw: Any) -> list[str]:
    """고정 코드 10종 밖의 태그는 other 로 접는다. 중복은 버리고 4개까지만."""
    out: list[str] = []
    for tag in raw if isinstance(raw, list) else []:
        code = tag if tag in EMOTION_TAGS else "other"
        if code not in out:
            out.append(code)
    return out[:4] or ["other"]


def _fold_theme(raw: Any) -> str:
    return raw if raw in VISUAL_THEMES else FALLBACK_THEME


def channels_for(minor: bool, abuse: bool) -> list[str]:
    out = list(CHANNELS_BASE)
    if minor:
        out += list(CHANNELS_MINOR)
    if abuse:
        out += list(CHANNELS_ABUSE)
    return out


def candidate_pool() -> tuple[repo.Scripture, ...]:
    """모델에게 넘길 후보. 의미 검색(RAG)이 붙기 전이라 감수된 씨앗 전부를 넘긴다.
    검색이 붙으면 이 함수만 바꾼다. 화이트리스트 검증은 그대로 둔다.
    """
    return repo.all_scriptures()


def _candidate_payload(pool: tuple[repo.Scripture, ...]) -> list[dict[str, str]]:
    """모델이 고르는 데 필요한 것만 넘긴다."""
    return [{"id": s.id, "citation": s.citation, "modern_gloss": s.modern_gloss} for s in pool]


def _scripture_for_model(s: repo.Scripture) -> dict[str, str]:
    return {
        "id": s.id,
        "citation": s.citation,
        "text": s.text,
        "modern_gloss": s.modern_gloss,
    }


# ────────────────────────────────────────────────────────────────────────────
# INVALID · CRISIS. 둘 다 모델을 부르지 않는다
# ────────────────────────────────────────────────────────────────────────────


def compose_invalid(decision: RouteDecision, quota: dict[str, Any] | None = None) -> dict[str, Any]:
    key = "playful"
    for reason in decision.reasons:
        if reason in INVALID_MESSAGE_KEY:
            key = INVALID_MESSAGE_KEY[reason]
            break
    out: dict[str, Any] = {"responseType": "invalid", "messageKey": key, "retryAllowed": True}
    if quota is not None:
        out["quota"] = quota
    return out


def compose_crisis(decision: RouteDecision) -> dict[str, Any]:
    # 결을 모르면 acute 로 본다. 모르는 쪽으로 열어 주지 않는다
    level = decision.crisis_level or "acute"
    # 이어 듣기가 열리는 문은 escalate_to_solace 하나뿐이다. 여기서 따로 판단하지 않는다
    can_continue = escalate_to_solace(decision) is not None
    return {
        "responseType": "crisis",
        "channels": channels_for(decision.flags.minor, decision.flags.abuse),
        "flags": {"minor": decision.flags.minor, "abuse": decision.flags.abuse},
        "crisisLevel": level,
        "canContinue": can_continue,
    }


# ────────────────────────────────────────────────────────────────────────────
# LIGHT
# ────────────────────────────────────────────────────────────────────────────


async def compose_light(text: str, llm: Any, quota: dict[str, Any] | None = None) -> dict[str, Any]:
    raw = await llm.light(text)
    out: dict[str, Any] = {
        "responseType": "light",
        "answerId": _new_answer_id(),
        "message": str(raw.get("message", "")),
        "emotionTags": fold_emotion_tags(raw.get("emotionTags")),
        "visualTheme": "choice",
        "cta": "deeper",
    }
    if quota is not None:
        out["quota"] = quota
    return out


# ────────────────────────────────────────────────────────────────────────────
# NORMAL · DEEP. 1차 패스 → 화이트리스트 → 조립
# ────────────────────────────────────────────────────────────────────────────


def _answer_payload(row: Pending, quota: dict[str, Any] | None) -> dict[str, Any]:
    scriptures = [s.to_api() for s in (repo.by_id(i) for i in row.scripture_ids) if s is not None]
    out: dict[str, Any] = {
        "responseType": "answer",
        "answerId": row.answer_id,
        "route": row.route,
        "safety": row.safety,
        "emotionTags": row.emotion_tags,
        "modernBuddhaMessage": row.modern_message,
        "scriptures": scriptures,
        "visualTheme": row.visual_theme,
        # 광고를 띄울 수 있는지는 기기가 안다. 서버는 쓸 구절이 남았는지만 본다
        "extensionAvailable": bool(_unused_candidate(row)) and not row.extension_used,
        "pass2": row.pass2 or {"status": "pending"},
    }
    if row.route_note:
        out["routeNote"] = row.route_note
    if quota is not None:
        out["quota"] = quota
    return out


async def compose_pass1(
    text: str,
    decision: RouteDecision,
    llm: Any,
    anon_key: str,
    quota: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """1차 패스. 3~5초 안에 나가는 화면 앞쪽을 만든다.

    모델이 crisis 를 올리면 본 답변을 버리고 위기 안내로 간다. 내리는 길은 없다.
    """
    pool = candidate_pool()
    raw = await llm.pass1(text, _candidate_payload(pool))

    if raw.get("safetyFlag") == "crisis":
        return compose_crisis(decision)
    if raw.get("responseType") == "refusal":
        # 모델이 답하지 않기로 했다. 고정 거절 문구로 돌려준다
        return {"responseType": "invalid", "messageKey": "playful", "retryAllowed": True}

    theme = _fold_theme(raw.get("visualTheme"))
    picked = repo.whitelist(list(raw.get("scriptureIds") or []), pool)[:MAX_SCRIPTURES]
    if not picked:
        # 후보 밖의 id 였다. 모델이 고른 것을 버리고 서버가 테마로 고른다
        picked = list(repo.candidates(theme, limit=1))

    row = Pending(
        answer_id=_new_answer_id(),
        anon_key=anon_key,
        route=decision.route if decision.route in ("normal", "deep") else "normal",
        visual_theme=theme,
        emotion_tags=fold_emotion_tags(raw.get("emotionTags")),
        modern_message=str(raw.get("modernBuddhaMessage", "")),
        scripture_ids=[s.id for s in picked],
        candidate_ids=[s.id for s in pool],
        safety="concern" if raw.get("safetyFlag") == "concern" else "none",
        route_note="promoted_topic" if "floor_applied" in decision.reasons else None,
        created_at=time.time(),
        text=text,
    )
    _sweep(row.created_at)
    _PENDING[row.answer_id] = row
    return _answer_payload(row, quota)


async def compose_pass2(
    row: Pending, llm: Any, quota: dict[str, Any] | None = None
) -> dict[str, Any]:
    """2차 패스. 구절 id 는 pending 행에서 읽는다. 클라이언트가 보낸 값을 쓰지 않는다."""
    if row.pass2 and row.pass2.get("status") == "done":
        return _answer_payload(row, quota)

    scripture = repo.by_id(row.scripture_ids[0]) if row.scripture_ids else None
    if scripture is None:
        row.pass2 = {"status": "failed", "retryable": False}
        return _answer_payload(row, quota)

    try:
        raw = await llm.pass2(row.text, _scripture_for_model(scripture), row.route == "deep")
    except Exception:  # noqa: BLE001 - 사유를 남기되 원문은 남기지 않는다
        row.pass2 = {"status": "failed", "retryable": True}
        return _answer_payload(row, quota)

    block: dict[str, Any] = {
        "status": "done",
        "scriptureExplanation": str(raw.get("scriptureExplanation", "")),
        "personalAnalysis": list(raw.get("personalAnalysis") or []),
        "actions": list(raw.get("actions") or []),
        "closingMessage": str(raw.get("closingMessage", "")),
    }
    terms = raw.get("terms")
    if terms:
        block["terms"] = list(terms)
    row.pass2 = block
    return _answer_payload(row, quota)


# ────────────────────────────────────────────────────────────────────────────
# EXTENSION. 보상형 광고를 본 뒤 한 번
# ────────────────────────────────────────────────────────────────────────────


def _unused_candidate(row: Pending) -> repo.Scripture | None:
    """1차에서 쓰지 않은 후보 하나. 없으면 Extension 을 열지 않는다."""
    used = set(row.scripture_ids)
    for cid in row.candidate_ids:
        if cid not in used:
            found = repo.by_id(cid)
            if found is not None:
                return found
    return None


async def compose_extension(row: Pending, llm: Any) -> dict[str, Any] | None:
    """다른 경전 1 + 다른 관점 1 + 행동 1.

    LLM 포트에 extension 이 따로 없어 2차 패스를 **다른 구절로** 한 번 더 부르고
    마지막 관점과 마지막 행동만 꺼낸다. 본 답변과 같은 말을 반복하지 않게 뒤쪽을 고른다.
    """
    alt = _unused_candidate(row)
    if alt is None or row.extension_used:
        return None

    raw = await llm.pass2(row.text, _scripture_for_model(alt), True)
    sections = list(raw.get("personalAnalysis") or [])
    actions = list(raw.get("actions") or [])
    if not sections or not actions:
        return None

    row.extension_used = True
    return {
        "responseType": "extension",
        "answerId": row.answer_id,
        "scripture": alt.to_api(),
        "alternativeAnalysis": sections[-1],
        "action": actions[-1],
    }


# ────────────────────────────────────────────────────────────────────────────
# SOLACE. 위기 안내를 본 사람이 스스로 이어 듣기를 눌렀을 때만
# ────────────────────────────────────────────────────────────────────────────


def solace_blocked(opening: str, closing: str) -> bool:
    body = f"{opening}\n{closing}"
    return any(p.search(body) for p in SOLACE_FORBIDDEN)


async def compose_solace(text: str, decision: RouteDecision, llm: Any) -> dict[str, Any]:
    """문은 escalate_to_solace 하나다. acute 는 여기서 막혀 모델에 닿지 않는다."""
    allowed = escalate_to_solace(decision)
    if allowed is None:
        return compose_crisis(decision)

    pool = repo.candidates(SOLACE_THEME, limit=1)
    scripture = pool[0] if pool else repo.all_scriptures()[0]
    raw = await llm.solace(text, _scripture_for_model(scripture))
    opening = str(raw.get("opening", ""))
    closing = str(raw.get("closing", ""))

    fallback_used = False
    if solace_blocked(opening, closing):
        # 문장을 고치지 않는다. 통째로 버리고 고정 문구로 바꾼다. 다시 만들지 않는다
        opening, _, closing = SOLACE_FALLBACK.partition("\n")
        fallback_used = True

    out: dict[str, Any] = {
        "responseType": "solace",
        "opening": opening,
        "scripture": scripture.to_api(),
        "closing": closing,
        # 창구 카드는 위로 답변의 위아래에 항상 붙는다. 조건부로 감추지 않는다
        "channels": channels_for(allowed.flags.minor, allowed.flags.abuse),
    }
    if fallback_used:
        out["fallbackUsed"] = True
    return out
