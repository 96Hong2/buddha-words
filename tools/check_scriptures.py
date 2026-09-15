#!/usr/bin/env python3
"""경전 데이터 빌드 게이트.

서버를 띄우지 않고 `data/scriptures/seed.json` 을 그대로 재 본다. 기동에서 도는 검사와
같은 함수(`app.domains.scripture.gate`)를 부르므로 둘이 갈라질 수 없다.

무엇을 보나
    1. 운영에 나가는 구절(review.status=approved)이 규격을 지켰나
       source_work · canonical_location · speaker_kind · text_type · canonical_translation_ko
    2. 합성글·요약글(text_type=composite·summary)이 직접 인용 자리에 있나
    3. 모델이 신고하는 ContextFlag 가 전부 실제로 구절을 빼는가
    4. 안전 규칙을 다 걸어도 내보낼 구절이 남는가
    5. 원문의 내세 표현이 풀이로만 옮겨지고 본문에서 지워졌나

    **조용히 거르지 않는다.** 하나라도 어기면 종료 코드 1 로 끝난다.

돌리는 법
    backend/.venv/bin/python tools/check_scriptures.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.domains.scripture import gate, repo, safety  # noqa: E402

# 사후·내세를 가리키는 말. 원문이 이 뜻을 말하면 본문에서 지우지 않는다
AFTERLIFE = re.compile(r"죽은\s?뒤|사후|다음\s?생|내생|저승|천상에\s?(나|태어)|지옥에\s?(나|떨어)")
# 풀이가 「원문은 …라고 말한다」며 내세를 언급하는 자리
GLOSS_CLAIMS_AFTERLIFE = re.compile(r"원문(은|이).{0,40}(죽은\s?뒤|사후|다음\s?생|내생)")


def check_afterlife_stays_in_the_text(pool: tuple[repo.Scripture, ...]) -> list[str]:
    """내세 문맥을 쉬운 말로 바꾸느라 본문에서 지우지 않았나(예: dhp.132).

    쉽게 푸는 일은 modern_explanation_ko 가 한다. canonical_translation_ko 는 원문이
    말한 대로 「죽은 뒤」를 남긴다. 풀이가 「원문은 사후를 말한다」고 적어 두었는데 본문에
    그 표현이 없으면, 누군가 본문 쪽을 다듬으며 원래 뜻을 지운 것이다.
    """
    broken = []
    for s in pool:
        if GLOSS_CLAIMS_AFTERLIFE.search(s.modern_gloss) and not AFTERLIFE.search(s.text):
            broken.append(
                f"{s.id}: 풀이는 원문이 사후를 말한다는데 본문에 그 표현이 없어요. "
                "쉽게 푸는 일은 modern_explanation_ko 에서 합니다"
            )
    return broken


def main() -> int:
    seed = repo.load_seed()
    approved = tuple(s for s in seed if s.reviewed)
    problems: list[str] = []

    try:
        gate.check_quotable(approved, "감수를 통과한 구절")
    except gate.GateError as exc:
        problems.append(str(exc))
    for check in (
        lambda: gate.check_context_vocabulary(),
        lambda: gate.check_every_flag_bites(seed),
        lambda: gate.check_safety_leaves_candidates(approved),
    ):
        try:
            check()
        except gate.GateError as exc:
            problems.append(str(exc))
    problems += check_afterlife_stays_in_the_text(seed)

    indirect = [s.id for s in seed if s.text_type in repo.INDIRECT_TEXT_TYPES]
    excluded = {flag: 0 for flag in sorted(safety.CONCERN_CONTEXTS)}
    for s in seed:
        for flag in safety.excluded_for(s):
            excluded[flag] += 1

    print(f"시드 {len(seed)}구절 · 감수 통과 {len(approved)} · 감수 대기 {len(seed) - len(approved)}")
    print(f"합성·요약글 {len(indirect)}구절" + (f" {indirect}" if indirect else ""))
    print(f"출가 수행 문맥 {sum(1 for s in seed if safety.monastic(s))}구절")
    for flag, count in excluded.items():
        print(f"  {flag:24} 제외 {count:3}구절")

    if problems:
        print("\n막혔어요. 아래를 고치고 다시 돌려 주세요.", file=sys.stderr)
        for line in problems:
            print(f"\n{line}", file=sys.stderr)
        return 1
    print("\n통과했어요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
