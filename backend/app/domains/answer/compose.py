"""답변 조립.

모델이 낸 것과 서버가 채운 것을 여기서 합친다. 규칙은 셋이다.

1. 경전 본문은 언제나 서버가 채운다. 모델은 id 만 고르고, **후보 밖의 id 는 버린다.**
2. crisis 는 어느 층이 올리든 올라간다. crisis 면 본 답변을 만들지 않는다.
3. 위로 답변(solace)은 `escalate_to_solace` 가 허락할 때만 만든다.
   만든 뒤 `SOLACE_FORBIDDEN` 에 걸리면 문장을 고치지 않고 통째로 버리고 고정 문구로 바꾼다.

응답에 고민 원문을 담지 않는다.
"""

from __future__ import annotations

import logging
import re
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
from app.domains.scripture import repo, safety
from app.integrations.llm import budget
from app.integrations.llm.port import Tier

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

log = logging.getLogger(__name__)

# 의료로 읽히면 안 되는 말. 프롬프트 금지 목록(integrations/llm/prompts.py)과 같은 말이고
# 나가는 길에서 한 번 더 본다. 막지 않고 사건만 남긴다(안전 불변식 「사후 검사는 막지 않고 로그만」)
MEDICAL_TERMS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("counseling", re.compile(r"상담")),
    ("treatment", re.compile(r"치료")),
    ("diagnosis", re.compile(r"진단")),
    ("prescription", re.compile(r"처방")),
    ("psychiatry", re.compile(r"정신과")),
    (
        "disease_name",
        re.compile(
            r"우울증|공황장애|조울증|양극성\s?장애|불안장애|강박장애|적응장애"
            r"|불면증|외상\s?후\s?스트레스|트라우마|PTSD|ADHD"
        ),
    ),
)


def medical_terms(text: str) -> list[str]:
    """의료로 읽히는 말이 들어 있는지. 걸린 말의 코드 이름만 돌려준다."""
    return [name for name, pattern in MEDICAL_TERMS if pattern.search(text)]


def audit_output(field: str, text: str, answer_id: str | None = None) -> list[str]:
    """모델이 쓴 문장이 화면으로 나가기 전에 한 번 본다.

    **막지 않는다.** 걸린 답을 버리거나 고쳐 쓰면 사람이 정하지 않은 자리에서 답이 사라진다.
    무엇이 걸렸는지만 남겨 두고, 실제로 얼마나 나오는지는 로그로 본 뒤에 정한다.
    문장도 고민 글도 싣지 않는다. 어느 자리에서 어떤 말이 걸렸는지만 코드로 남긴다.
    """
    found = medical_terms(text)
    if not found:
        return found
    extra: dict[str, Any] = {
        "event": "medical_term_in_output",
        "field": field,
        "terms": found,
    }
    if answer_id:
        extra["answer_id"] = answer_id
    log.warning("medical_term_in_output", extra=extra)
    return found


def audit_items(prefix: str, items: list[Any], answer_id: str | None = None) -> None:
    """분석 절·행동처럼 여러 칸이 들어 있는 것. 칸마다 따로 본다."""
    for index, item in enumerate(items):
        if isinstance(item, dict):
            for key in ("heading", "body", "title", "why"):
                value = item.get(key)
                if isinstance(value, str):
                    audit_output(f"{prefix}[{index}].{key}", value, answer_id)
        elif isinstance(item, str):
            audit_output(f"{prefix}[{index}]", item, answer_id)


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
    # 경전을 누가 골랐나. "model" 이면 후보를 다 읽은 모델이 고른 것이고,
    # "server_fallback" 이면 모델이 고른 것이 후보 밖이거나 안전 규칙에 걸려 서버가 대신
    # 고른 것이다. 화면이 「이 고민과 닿아 있는」이라고 단정할 근거가 가장 약한 자리라
    # 다음 갈래가 문구를 낮출 때 읽을 신호로 남긴다(계획 02 의 5-2-2)
    scripture_source: str = "model"
    # 고민 원문. **프로세스 메모리에만 산다.** 컬럼·로그·이벤트·응답 어디에도 나가지 않고
    # TTL 이 지나면 행과 함께 사라진다. 2차 패스와 Extension 이 모델을 부를 때만 쓴다
    text: str = ""
    pass2: dict[str, Any] | None = None
    extension_used: bool = False


# **이 행은 파일로 내리지 않는다.** 공유 링크는 파일로 옮겼는데(`domains/share/store.py`)
# 여기는 그대로 둔 이유가 있다. 행이 들고 있는 `modern_message` 와 `pass2` 는 그 고민을 읽고
# 쓴 글이라 상황이 그대로 비친다. 실제로 재 보니 답변 해설에 「집에 오는 길에 가라앉은 마음」
# 처럼 적으신 글의 대목이 그대로 들어 있었다. 그런데 앱은 세 자리에서 반대로 약속한다.
# 개인정보 안내 「만들어진 답변도 서버에 남기지 않아요」, 이용권 시트 「적으신 글과 답변을
# 서버에 남기지 않거든요」(계획 00 399줄 · 06 812줄). 이용권 시트 쪽은 결제 전에 하는 고지다.
# 메모리에 30분 들고 있는 것과 파일에 적어 두는 것은 이 약속 앞에서 무게가 다르다.
#
# 글이 아닌 칸만 골라 담는 길도 재 봤지만 접었다. 그러면 되살린 행이 한마디도 해설도 없는
# 껍데기라, 화면이 빈 인용 상자를 그린다(`AnswerBody.tsx` 의 modernBuddhaMessage). 그 화면을
# 그리느니 지금처럼 「그 답변을 찾을 수 없어요」가 낫다.
#
# 그래서 재기동은 답변 조회와 Extension 을 여전히 끊는다. 이것을 살리려면 답변을 서버에
# 남겨도 되는지부터 정해야 하고, 그것은 문구를 고치는 일이라 코드가 혼자 정할 수 없다.
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


# 테마를 아직 모를 때 repo.candidates 에 넘기는 값. 걸리는 구절이 없으면 전체가 후보가 된다
NO_THEME = ""


def candidate_pool(
    text: str,
    query_vector: list[float] | None = None,
    contexts: frozenset[str] = frozenset(),
) -> tuple[repo.Scripture, ...]:
    """1차 패스에 넘길 후보. 고민 글로 좁히고 repo.MAX_CANDIDATES(20) 개까지만 넘긴다.

    **테마로 거르지 않고 고민 글로만 좁히는 이유.** 테마를 정하는 것이 바로 이 1차 패스라
    후보를 만드는 시점에는 아직 테마가 없다. 앞에서 테마를 얻을 길이 둘 다 막혀 있다.

    · rules(1층)는 테마를 내지 않는다. 내는 것은 갈래(light·normal·deep·invalid·crisis)와
      승격 바닥과 힌트뿐이라, 그걸로는 열 가지 테마 중 어느 것인지 좁혀지지 않는다.
    · 테마를 먼저 물으려면 모델을 한 번 더 불러야 한다. 이 자리의 화면 예산은 3~5초다.

    그래서 `retrieval_text` 와 고민 글이 겹치는 낱말로 400구절에서 20개를 자른다. 이 순위는
    관련성 판정이 아니라 **자르는 순서**다(repo.candidates 주석). 고르는 일은 후보를 다 읽는
    모델이 한다. 계획 00 이 「관련성을 못 보는 규칙이 관련성 판단자보다 먼저 후보를 깎는다」를
    경계한 대로, 규칙은 상한까지만 줄이고 판단은 넘기지 않는다.

    `contexts` 만은 규칙이 먼저 깎는다. 관련성이 아니라 **붙이면 안 되는 자리**를 보기
    때문이다. 학대 고민에 「참아라」가 후보에 남아 있으면 모델이 그것을 고를 수 있다.
    """
    return repo.candidates(
        NO_THEME,
        limit=repo.MAX_CANDIDATES,
        query=text,
        query_vector=query_vector,
        contexts=contexts,
    )


def _candidate_payload(pool: tuple[repo.Scripture, ...]) -> list[dict[str, str]]:
    """모델이 고르는 데 필요한 것만 넘긴다.

    `retrieval_text`(「이럴 때」)를 함께 싣는다. 게송은 은유라 고민 글과 잘 만나지 않고,
    구절이 어떤 상황에 서는지는 이 문단에만 적혀 있다(계획 00 「후보에 retrieval_text 를
    함께 실어 재순위 근거로 쓴다」).
    """
    return [
        {
            "id": s.id,
            "citation": s.citation,
            "modern_gloss": s.modern_gloss,
            "retrieval_text": s.retrieval_text,
        }
        for s in pool
    ]


def tier_for_route(route: str) -> Tier:
    """계획 00 1.3 등급 표. DEEP 은 premium, NORMAL 은 cheap."""
    return "premium" if route == "deep" else "cheap"


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
    message = str(raw.get("message", ""))
    answer_id = _new_answer_id()
    audit_output("light.message", message, answer_id)
    out: dict[str, Any] = {
        "responseType": "light",
        "answerId": answer_id,
        "message": message,
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


def _log_scripture_pick(row: Pending, pool: tuple[repo.Scripture, ...]) -> None:
    """경전이 어떻게 뽑혔는지 한 줄 남긴다. **고민 글은 싣지 않는다.**

    화면은 이 자리에 「이 고민과 닿아 있는 실제 가르침」이라고 적는다. 그 말이 실제로
    맞는지는 로그로만 잴 수 있다. 남기는 것은 셋이다.
      source   모델이 골랐나, 서버가 대신 골랐나
      rank     그 구절이 후보에서 몇 번째였나. 20번째로 겨우 든 구절이면 검색이 밀지 않은 것이다
      pool     그때 후보가 몇 구절이었나
    """
    ranks = [pool_index for pool_index, s in enumerate(pool) if s.id in set(row.scripture_ids)]
    log.info(
        "scripture_pick",
        extra={
            "event": "scripture_pick",
            "answer_id": row.answer_id,
            "source": row.scripture_source,
            "scripture_ids": list(row.scripture_ids),
            "ranks": ranks,
            "candidates": len(pool),
        },
    )


def _route_note(decision: RouteDecision, downgraded: bool) -> str | None:
    """화면에 한 줄로 밝히는 말. 스키마가 값을 하나만 받아 둘이 겹치면 강등이 이긴다.

    강등된 답은 실제로 더 얕게 나가므로, 그 자리에서 「깊게 봤어요」라고 말하면 사실이 아니다.
    """
    if downgraded:
        return "downgraded_budget"
    if "floor_applied" in decision.reasons:
        return "promoted_topic"
    return None


async def compose_pass1(
    text: str,
    decision: RouteDecision,
    llm: Any,
    anon_key: str,
    quota: dict[str, Any] | None = None,
    query_vector: list[float] | None = None,
) -> dict[str, Any]:
    """1차 패스. 3~5초 안에 나가는 화면 앞쪽을 만든다.

    모델이 crisis 를 올리면 본 답변을 버리고 위기 안내로 간다. 내리는 길은 없다.
    """
    tier, downgraded = budget.effective_tier(tier_for_route(decision.route))
    # 고민 글의 상태를 먼저 판정한다. 1층 rules 가 세운 깃발을 그대로 받아 쓰고,
    # rules 가 안 보는 자책·자기 가치는 safety 가 본다. 걸린 구절은 모델이 보기 전에 빠진다
    contexts = safety.contexts_of(text, abuse=decision.flags.abuse, minor=decision.flags.minor)
    pool = candidate_pool(text, query_vector, contexts)
    raw = await llm.pass1(text, _candidate_payload(pool), tier)

    if raw.get("safetyFlag") == "crisis":
        return compose_crisis(decision)
    if raw.get("responseType") == "refusal":
        # 모델이 답하지 않기로 했다. 고정 거절 문구로 돌려준다
        return {"responseType": "invalid", "messageKey": "playful", "retryAllowed": True}

    theme = _fold_theme(raw.get("visualTheme"))
    # 모델이 신고한 상태를 서버 판정에 더한다. 서버가 못 본 학대를 모델이 볼 수 있고
    # 그 반대도 있다. 어느 한쪽이 세우면 선다
    contexts = safety.contexts_of(
        text,
        abuse=decision.flags.abuse,
        minor=decision.flags.minor,
        reported=list(raw.get("contextFlags") or []),
    )
    picked = repo.whitelist(list(raw.get("scriptureIds") or []), pool)[:MAX_SCRIPTURES]
    # 후보를 만든 뒤에 선 상태가 있으면 여기서 다시 잰다. 모델이 고른 것이라도 뺀다
    picked = [s for s in picked if safety.allowed(s, contexts)]
    scripture_source = "model" if picked else "server_fallback"
    if not picked:
        # 후보 밖의 id 였다. 모델이 고른 것을 버리고 서버가 테마로 고른다.
        # 이때도 고민 글을 함께 넘긴다. 테마만으로 고르면 그 테마의 시드 첫 줄이 늘 나와,
        # 빚 이야기에 「겨울밤에 잘 잤느냐」가 붙는 일이 생긴다(실측). 글로 순위를 매기면
        # 같은 자리에 「빚」 구절이 온다. 순위식은 후보를 자를 때 쓰는 것과 같은 것이다.
        # 이 자리도 안전 규칙을 지난다. 서버가 고른다고 예외를 두지 않는다
        picked = list(
            repo.candidates(
                theme, limit=1, query=text, query_vector=query_vector, contexts=contexts
            )
        )

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
        route_note=_route_note(decision, downgraded),
        created_at=time.time(),
        text=text,
        scripture_source=scripture_source,
    )
    _log_scripture_pick(row, pool)
    audit_output("pass1.modernBuddhaMessage", row.modern_message, row.answer_id)
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

    tier, downgraded = budget.effective_tier(tier_for_route(row.route))
    # 예산 문이 닫히면 모델만 내리지 않고 분량 지시도 보통 답변으로 함께 내린다
    # (계획 1.3 「DEEP → NORMAL 강등」). 비싼 자리에서 긴 글을 뽑는 것이 값의 대부분이다
    deep = row.route == "deep" and not downgraded
    if downgraded:
        row.route_note = "downgraded_budget"

    try:
        raw = await llm.pass2(row.text, _scripture_for_model(scripture), deep, tier)
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

    audit_output("pass2.scriptureExplanation", block["scriptureExplanation"], row.answer_id)
    audit_items("pass2.personalAnalysis", block["personalAnalysis"], row.answer_id)
    audit_items("pass2.actions", block["actions"], row.answer_id)
    audit_output("pass2.closingMessage", block["closingMessage"], row.answer_id)

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

    등급은 standard 다(계획 1.3 등급 표 「standard: Deep Extension」). 분량도 보통 답변으로
    부른다. 여기서 쓰는 것은 관점 하나와 행동 하나뿐이고, 화면 예산이 광고 뒤 8초라
    깊은 답변의 분량과 생각 깊이를 살 자리가 아니다.
    """
    alt = _unused_candidate(row)
    if alt is None or row.extension_used:
        return None

    # 자리를 먼저 잡는다. 모델을 기다리는 몇 초 사이에 같은 답변으로 요청이 한 번 더 오면
    # 둘 다 검사를 지나 광고 하나에 보상이 둘 나가고 모델 값도 두 번 든다.
    # 실패하면 되돌린다(사용량 reserve · release 와 같은 결)
    row.extension_used = True

    tier, _ = budget.effective_tier("standard")
    try:
        raw = await llm.pass2(row.text, _scripture_for_model(alt), False, tier)
    except Exception:  # noqa: BLE001 - 잡은 자리만 되돌리고 오류는 그대로 올려보낸다
        row.extension_used = False
        raise
    sections = list(raw.get("personalAnalysis") or [])
    actions = list(raw.get("actions") or [])
    if not sections or not actions:
        row.extension_used = False
        return None

    audit_items("extension.alternativeAnalysis", [sections[-1]], row.answer_id)
    audit_items("extension.action", [actions[-1]], row.answer_id)

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


async def compose_solace(
    text: str, decision: RouteDecision, llm: Any, allow_model: bool = True
) -> dict[str, Any]:
    """문은 escalate_to_solace 하나다. acute 는 여기서 막혀 모델에 닿지 않는다.

    `allow_model` 을 끄면 모델을 부르지 않고 고정 문구(SOLACE_FALLBACK)로 낸다. 예산 문이
    닫혔을 때 쓴다. 위기 글을 빈손으로 돌려보내지 않으면서 모델 비용은 내지 않는 자리다.
    """
    allowed = escalate_to_solace(decision)
    if allowed is None:
        return compose_crisis(decision)

    # 여기만 고민 글로 순위를 매기지 않는다. 재 보니 낱말이 겹치는 구절이 위로에 맞지 않았다.
    # 「빚이 많아 다 끝내고 싶다」에는 돈 이야기 구절이, 「너무 외롭다」에는 서원 구절이 걸렸다.
    # 이 자리에 필요한 것은 고민에 가까운 구절이 아니라 흔들리는 마음을 약함으로 보지 않는 구절이다.
    #
    # 안전 규칙은 여기서 가장 세게 건다. 위기 안내를 보고도 이야기를 더 듣고 싶다고 누른
    # 사람이라 글에서 그 말이 안 나와도 세 가지를 판정 없이 세운다.
    #   self_harm            「목숨은 짧다」 「몸을 버려라」가 이 자리에 붙으면 안 된다
    #   self_blame_high      「젊어서 닦지 않았다」로 꾸짖는 구절이 붙으면 안 된다
    #   self_worth_collapse  「나라고 할 것이 없다」를 지금 들이대지 않는다
    # 실제로 이 셋을 안 세우면 위로 답변의 1순위가 dhp.75(홀로 머무는 수행) · dhp.155
    # (늙은 두루미처럼 웅크린다)로 잡혔다. 둘 다 이 자리에서 할 말이 아니다
    contexts = safety.contexts_of(text, abuse=allowed.flags.abuse, minor=allowed.flags.minor) | {
        "self_harm",
        "self_blame_high",
        "self_worth_collapse",
    }
    pool = repo.candidates(SOLACE_THEME, limit=1, contexts=contexts)
    # 비었을 때 아무 구절이나 집던 자리를 없앴다. 안전 규칙을 지나지 않은 구절이
    # 하필 위기 글에 붙는 길이었다. 후보가 없으면 repo.candidates 가 그 자리에서 멈춘다
    scripture = pool[0]

    opening = ""
    closing = ""
    fallback_used = not allow_model
    if allow_model:
        raw = await llm.solace(text, _scripture_for_model(scripture))
        opening = str(raw.get("opening", ""))
        closing = str(raw.get("closing", ""))
        audit_output("solace.opening", opening)
        audit_output("solace.closing", closing)
        # 문장을 고치지 않는다. 통째로 버리고 고정 문구로 바꾼다. 다시 만들지 않는다
        fallback_used = solace_blocked(opening, closing)
    if fallback_used:
        opening, _, closing = SOLACE_FALLBACK.partition("\n")

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
