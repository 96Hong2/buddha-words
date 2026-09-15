"""빌드·기동 게이트. 규격을 어긴 구절이 실제로 문을 못 지나는지 본다.

실제 `data/scriptures/seed.json` 과 실제 게이트 함수를 쓴다. 목을 끼우지 않는다.
게이트를 어기는 구절은 시드에 없으므로 **진짜 구절 하나를 그 자리에서 망가뜨려** 넣는다
(`dataclasses.replace`). 필드 이름을 테스트에 다시 적는 대신 게이트가 쓰는 목록을 그대로 읽는다.
"""

from __future__ import annotations

import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import pytest

from app.domains.scripture import gate, repo, safety

ROOT = Path(__file__).resolve().parents[2]
CHECK_SCRIPT = ROOT / "tools" / "check_scriptures.py"


def approved() -> tuple[repo.Scripture, ...]:
    return tuple(s for s in repo.load_seed() if s.reviewed)


def sample() -> repo.Scripture:
    """규격을 지킨 구절 하나. 여기서 한 칸씩 망가뜨린다."""
    found = approved()[0]
    assert gate.violations(found) == [], found.id
    return found


# ────────────────────────────────────────────────────────────────────────────
# 지금 내보내는 데이터
# ────────────────────────────────────────────────────────────────────────────


def test_the_gate_passes_what_we_actually_ship(
    approved_pool: tuple[repo.Scripture, ...],
) -> None:
    """운영에 나가는 것과 개발에서 도는 것을 각각 잰다.

    개발 후보에는 초안이 섞여 있어 감수 상태만 눈감아 준다. 출처·화자·합성글 검사는
    그쪽에서도 그대로 돈다. 미감수라고 검사를 통째로 건너뛰지 않는다.
    """
    gate.check_quotable(approved(), "감수를 통과한 구절")
    gate.check_quotable(approved_pool, "운영 후보 풀")


def test_startup_check_runs_clean() -> None:
    """기동에서 도는 검사 전부. 실패하면 앱이 뜨지 않는다."""
    gate.startup_check()


def test_the_development_pool_is_checked_for_everything_but_the_review_stamp() -> None:
    """초안 383구절도 출처·화자·합성글 검사를 지난다."""
    pool = repo.retrieval_pool()
    assert any(not s.reviewed for s in pool), "개발 후보에 초안이 없어요"
    gate.check_quotable(pool, "개발 후보 풀", require_review=False)
    # 감수 도장까지 요구하면 같은 풀이 막힌다. 눈감아 준 것이 그 한 칸뿐임을 못 박는다
    with pytest.raises(gate.GateError, match="감수"):
        gate.check_quotable(pool, "개발 후보 풀")


def test_the_startup_line_says_which_pool_is_running() -> None:
    """개발 판에 미감수 구절이 섞였다는 것을 사람이 읽을 수 있어야 한다."""
    status = gate.pool_status()
    assert status["mode"] == "draft"
    assert status["candidates"] == 399
    assert status["drafts"] == 383
    assert status["reviewed"] == 16


def test_build_check_script_exits_zero() -> None:
    done = subprocess.run(
        [sys.executable, str(CHECK_SCRIPT)], cwd=ROOT, capture_output=True, text=True
    )
    assert done.returncode == 0, done.stdout + done.stderr
    # 구절 수는 test_scripture.py 가 한 곳에서 못 박는다. 여기서는 요약이 나오는지만 본다
    assert "감수 통과" in done.stdout


# ────────────────────────────────────────────────────────────────────────────
# 일부러 어겨 본다
# ────────────────────────────────────────────────────────────────────────────


def test_an_unreviewed_scripture_is_refused() -> None:
    bent = replace(sample(), review=repo.Review(status="needs_review"))
    assert any("review.status" in v for v in gate.violations(bent))
    with pytest.raises(gate.GateError, match="감수"):
        gate.check_quotable([bent], "시험")


@pytest.mark.parametrize("field", [f for f, _ in gate.REQUIRED_FIELDS])
def test_an_empty_required_field_is_refused(field: str) -> None:
    """다섯 칸을 하나씩 비워 본다. 게이트가 쓰는 목록을 그대로 돌려서 칸이 늘면 같이 는다."""
    bent = replace(sample(), **{field: ""})
    assert gate.violations(bent), field
    with pytest.raises(gate.GateError):
        gate.check_quotable([bent], "시험")


@pytest.mark.parametrize("text_type", sorted(repo.INDIRECT_TEXT_TYPES))
def test_a_composite_or_summary_cannot_stand_in_a_quote_slot(text_type: str) -> None:
    """합성글·요약글은 후보 풀에도 못 들어가고 화면으로도 못 나간다."""
    bent = replace(sample(), text_type=text_type)
    with pytest.raises(gate.GateError, match="직접 인용"):
        gate.check_quotable([bent], "시험")
    # 풀을 지나지 않고 들어와도 to_api 가 한 겹 더 막는다
    with pytest.raises(RuntimeError, match=text_type):
        bent.to_api()


def test_the_gate_names_every_broken_scripture_not_just_the_first() -> None:
    """한 건씩 알려 주면 고치고 다시 돌리기를 반복하게 된다."""
    bent = [replace(s, source_work="") for s in approved()[:3]]
    with pytest.raises(gate.GateError) as caught:
        gate.check_quotable(bent, "시험")
    message = str(caught.value)
    assert "3건" in message
    for s in bent:
        assert s.id in message


def test_daily_never_quotes_a_composite() -> None:
    """오늘의 부처의 말도 직접 인용 자리다."""
    for day in range(1, 32):
        picked = repo.daily(f"2026-11-{day:02d}")
        assert picked.text_type not in repo.INDIRECT_TEXT_TYPES, picked.id


# ────────────────────────────────────────────────────────────────────────────
# 깃발이 장식이 아닌지
# ────────────────────────────────────────────────────────────────────────────


def test_every_spec_context_flag_means_something_here() -> None:
    """모델이 신고하는 값이 검색 안전 규칙에 없으면 신고해도 아무것도 안 빠진다."""
    from app.integrations.llm.schemas import CONTEXT_FLAGS

    gate.check_context_vocabulary()
    assert set(CONTEXT_FLAGS) <= safety.CONCERN_CONTEXTS


def test_every_flag_actually_removes_a_scripture() -> None:
    gate.check_every_flag_bites(repo.load_seed())


def test_safety_rules_never_empty_the_candidate_pool() -> None:
    """상태가 전부 겹쳐도 내보낼 구절이 남아야 한다. 답변 스키마가 경전을 하나 요구한다."""
    gate.check_safety_leaves_candidates(repo.retrieval_pool())
    assert safety.filter_pool(repo.retrieval_pool(), safety.CONCERN_CONTEXTS)


def test_an_empty_pool_says_so_instead_of_blaming_the_safety_rules() -> None:
    """감수 통과분이 0이면 원인을 그대로 말한다. 안전 규칙 탓으로 읽히면 엉뚱한 곳을 고친다."""
    with pytest.raises(gate.GateError, match="감수를 통과한 구절이 하나도 없"):
        gate.check_safety_leaves_candidates([])


def test_a_dead_flag_is_caught() -> None:
    """일부러 아무것도 안 빼는 상태를 재 본다. 검사가 실제로 잡는지 확인한다."""
    with pytest.raises(gate.GateError):
        gate.check_every_flag_bites([])
