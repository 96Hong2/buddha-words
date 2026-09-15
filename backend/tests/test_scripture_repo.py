"""경전 저장소. 순수 함수라 목이 필요 없다."""

from app.domains.scripture import repo


def test_daily_is_deterministic() -> None:
    assert repo.daily("2026-10-01").id == repo.daily("2026-10-01").id


def test_daily_changes_with_date() -> None:
    ids = {repo.daily(f"2026-10-{d:02d}").id for d in range(1, 13)}
    assert len(ids) > 1


def test_whitelist_rejects_ids_outside_candidates() -> None:
    allowed = repo.candidates("anger")
    picked = repo.whitelist(["dhp.999", allowed[0].id], allowed)
    assert [s.id for s in picked] == [allowed[0].id]
