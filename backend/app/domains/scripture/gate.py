"""경전 데이터의 문. 빌드와 기동에서 같은 검사를 돌린다.

**조용히 거르지 않는다.** 규격을 못 맞춘 구절을 후보에서 살짝 빼는 대신 빌드나 기동을
멈춘다. 걸러 두면 아무도 모르는 채로 구절 수만 줄고, 줄어든 것을 알아차리는 자리가 없다.

직접 경전 인용 자리가 어디인가
    감수된 경전 문장(`Scripture.text`, 감수본의 canonical_translation_ko)이 **사용자에게
    경전으로 인용되어 나가는** 자리다. 코드에서는 셋이고 셋 다 같은 시드 행을 읽는다.

      1. `repo.Scripture.to_api()`   답변 카드 · Extension · 위로 답변 · 원문 시트 · 공유카드
      2. `repo.daily()`              오늘의 부처의 말
      3. 위 둘의 재료가 되는 후보 풀 `repo.retrieval_pool()`

    text_type 이 composite(여러 곳을 이어 붙인 글)이거나 summary(줄인 글)이면 그것은
    누군가 쓴 요약이지 경전 문장이 아니다. 인용 부호 안에 들어가는 순간 앱이 없는 문장을
    부처의 말이라고 적는 셈이 된다. 그래서 세 자리 모두에서 막는다.
      · 후보 풀은 여기 `check_quotable` 이 기동·빌드에서 본다
      · `to_api` 와 `daily` 는 그 자리에서 한 번 더 본다(repo.py). 풀을 지나지 않고 들어온
        구절이 있어도 화면으로는 못 나간다

무엇이 production 규격인가 (사용자 지시)
    review.status 가 approved 이고, source_work · canonical_location · speaker_kind ·
    text_type · canonical_translation_ko 가 비어 있지 않아야 한다. 하나라도 어기면 실패다.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable

from app.domains.scripture import repo, safety
from app.domains.scripture.repo import INDIRECT_TEXT_TYPES, Scripture

log = logging.getLogger(__name__)


class GateError(RuntimeError):
    """문이 막았다. 메시지에 걸린 구절을 전부 적는다."""


# 비어 있으면 안 되는 칸. 왼쪽이 코드 이름, 오른쪽이 감수본에서 부르는 이름이다.
# `text` 가 감수본의 canonical_translation_ko 자리다(repo.Scripture 주석)
REQUIRED_FIELDS: tuple[tuple[str, str], ...] = (
    ("source_work", "source_work"),
    ("canonical_location", "canonical_location"),
    ("speaker_kind", "speaker_kind"),
    ("text_type", "text_type"),
    ("text", "canonical_translation_ko"),
)


def violations(scripture: Scripture, require_review: bool = True) -> list[str]:
    """이 구절이 어긴 것들. 빈 목록이면 규격을 지켰다.

    `require_review` 를 끄면 감수 상태만 빼고 잰다. 개발에서 초안까지 후보에 넣은 판을
    볼 때 쓴다. 감수는 아직이어도 출처·화자가 비었거나 합성글인 것은 그때도 막는다.
    """
    out: list[str] = []
    if require_review and scripture.review.status != "approved":
        out.append(f"review.status={scripture.review.status or '(빈칸)'}")
    for field, name in REQUIRED_FIELDS:
        if not str(getattr(scripture, field, "")).strip():
            out.append(f"{name} 이 비었다")
    if scripture.text_type in INDIRECT_TEXT_TYPES:
        out.append(f"text_type={scripture.text_type} 은 직접 인용 자리에 설 수 없다")
    return out


def check_quotable(pool: Iterable[Scripture], where: str, require_review: bool = True) -> None:
    """직접 인용 자리에 서는 구절들을 전부 잰다. 하나라도 어기면 멈춘다.

    걸린 것을 모아서 한 번에 알린다. 첫 구절에서 멈추면 고치고 다시 돌리고를 반복하게 된다.
    """
    broken = [(s.id, violations(s, require_review)) for s in pool]
    broken = [(i, v) for i, v in broken if v]
    if not broken:
        return
    lines = "\n".join(f"  · {i}: {', '.join(v)}" for i, v in broken[:20])
    more = f"\n  … 외 {len(broken) - 20}건" if len(broken) > 20 else ""
    raise GateError(
        f"{where} 에 규격을 어긴 구절이 {len(broken)}건 있어요. "
        f"운영에 나가는 경전은 감수를 통과하고 출처·화자·본문이 채워져 있어야 합니다.\n"
        f"{lines}{more}"
    )


def check_context_vocabulary() -> None:
    """모델이 신고하는 ContextFlag 가 전부 뜻을 갖는지.

    계획 02 가 경계한 자리다. 「필드는 차고 테스트는 초록인데 아무것도 안 막는다.」
    신고 값 하나가 여기서 아무 구절도 안 빼면 그 깃발은 장식이다.
    """
    from app.integrations.llm.schemas import CONTEXT_FLAGS

    spec_flags = set(CONTEXT_FLAGS)
    unknown = spec_flags - safety.CONCERN_CONTEXTS
    if unknown:
        raise GateError(
            f"spec 의 ContextFlag {sorted(unknown)} 를 검색 안전 규칙이 모릅니다. "
            "모델이 신고해도 아무 구절도 빠지지 않아요."
        )


def check_every_flag_bites(pool: Iterable[Scripture]) -> None:
    """깃발마다 실제로 빠지는 구절이 있는지. 시드 전체를 놓고 잰다.

    **후보 풀이 아니라 시드 395구절 전체로 잰다.** 운영 후보가 16구절이던 때는 bereavement · minor ·
    self_harm 이 아무 구절도 빼지 않는데, 그건 규칙이 죽어서가 아니라 그 결의 구절이 아직
    감수를 통과하지 않아서다. 풀로 재면 규칙을 고쳐야 할 자리와 감수가 덜 된 자리가 섞인다.
    """
    items = tuple(pool)
    dead = sorted(
        flag
        for flag in safety.CONCERN_CONTEXTS
        if not any(flag in safety.excluded_for(s) for s in items)
    )
    if dead:
        raise GateError(
            f"{dead} 는 어떤 구절도 빼지 않아요. 상태를 판정해도 막는 것이 없다는 뜻이라 "
            "safety.BY_ID · BY_CONTENT 를 확인해 주세요."
        )


def check_safety_leaves_candidates(pool: Iterable[Scripture]) -> None:
    """안전 규칙을 다 걸어도 내보낼 구절이 남는지.

    답변 스키마는 경전을 최소 하나 요구한다(`spec/answer.schema.json` scriptures minItems 1).
    후보가 0이 되는 조합이 있으면 그 고민은 요청 시점에 터진다. 기동에서 먼저 잡는다.
    """
    items = tuple(pool)
    if not items:
        # 안전 규칙 탓으로 읽히면 엉뚱한 자리를 고치게 된다. 먼저 사실대로 말한다
        raise GateError(
            "후보 풀이 비었어요. 감수를 통과한 구절이 하나도 없습니다. "
            "data/scriptures/seed.json 의 review.status 를 확인해 주세요."
        )
    empty = sorted(
        flag for flag in safety.CONCERN_CONTEXTS if not safety.filter_pool(items, {flag})
    )
    if empty:
        raise GateError(f"{empty} 상태에서 후보가 하나도 남지 않아요. 감수 구절을 늘려 주세요.")
    if not safety.filter_pool(items, safety.CONCERN_CONTEXTS):
        raise GateError(
            "상태가 전부 겹치면 후보가 하나도 남지 않아요. "
            "여러 상태가 같이 서는 고민에서 답변이 터집니다."
        )


def pool_status() -> dict[str, object]:
    """지금 어느 풀로 도는지. 기동 로그와 `/health` 가 같은 값을 읽는다.

    두 자리가 각자 세면 언젠가 서로 다른 말을 한다. 세는 곳을 하나로 둔다.
    """
    from app.core.config import SCRIPTURE_POOL_ENV, get_settings

    settings = get_settings()
    seed = repo.load_seed()
    pool = repo.retrieval_pool()
    drafts = sum(1 for s in pool if not s.reviewed)
    return {
        "mode": repo.pool_mode(),
        "setting": settings.scripture_pool,
        "env": SCRIPTURE_POOL_ENV,
        "environment": settings.environment,
        "candidates": len(pool),
        "reviewed": len(pool) - drafts,
        "drafts": drafts,
        "seed_total": len(seed),
    }


def startup_check() -> None:
    """기동에서 한 번. 실패하면 뜨지 않는다.

    첫 요청 500 보다 기동 실패가 낫다(`core/config.py` 와 같은 결).
    후보 풀이 몇 구절이고 그중 몇이 미감수인지 로그에 찍는다. 개발 화면에 미감수 구절이
    섞여 있다는 것을 사람이 로그 첫 줄에서 알아야 한다.
    """
    status = pool_status()
    mode = str(status["mode"])
    seed = repo.load_seed()
    pool = repo.retrieval_pool()

    log.info("scripture_pool_ready", extra={"event": "scripture_pool_ready", **status})
    if status["drafts"]:
        # 미감수 구절이 후보에 들어와 있다. 운영에서는 막히지만 개발에서도 눈에 띄어야 한다.
        # 이 줄이 뜬 판에서 본 경전은 사람이 확인하지 않은 문장일 수 있다
        log.warning(
            "scripture_pool_includes_drafts",
            extra={
                "event": "scripture_pool_includes_drafts",
                "candidates": status["candidates"],
                "drafts": status["drafts"],
                "hint": f"{status['env']}=approved 로 두면 감수 통과분만 후보가 됩니다",
            },
        )
    # 감수 상태는 draft 판에서만 눈감아 준다. 출처·화자·합성글 검사는 어느 판에서도 돈다
    check_quotable(pool, "경전 후보 풀", require_review=mode != "draft")
    check_context_vocabulary()
    # 안전 규칙은 풀 모드와 상관없이 시드 395구절로 잰다. 감수 통과가 검사를 면제하지 않는다
    check_every_flag_bites(seed)
    check_safety_leaves_candidates(pool)
