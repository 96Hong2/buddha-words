"""경전 시드와 검색. 실제 seed.json 을 그대로 읽는다. 목을 끼우지 않는다."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from app.core.config import Settings
from app.core.config import _guard as config_guard
from app.domains.scripture import repo

ROOT = Path(__file__).resolve().parents[2]
VISUAL_THEME_TS = ROOT / "spec" / "visual-theme.ts"
SEED_JSON = ROOT / "data" / "scriptures" / "seed.json"
ANSWER_SCHEMA = ROOT / "spec" / "answer.schema.json"

# 2026-09-16 외부 문헌 감수 v2 는 400구절을 전수로 봤다. 통과 331 · 고침 반영 64 · 제외 5.
# v1 때는 통과한 16구절을 손으로 적었지만 이제는 통과가 395개라 적을 수 없다.
# 그래서 **빠진 것**을 적고 나머지가 전부 통과라고 잰다. 여기 없는 id 가 하나라도
# needs_review 로 남으면 아래 카운트 테스트가 잡는다.
REJECTED = {
    "dhp.75",
    "dhp.219",
    "snp.3.1.424",
    "kr.naong.cheongsan",
    "kr.mangong.oneflower",
}

TOTAL_BLOCKS = 400
SHIPPING = TOTAL_BLOCKS - len(REJECTED)

# 감수가 화자를 부처로 확정한 구절. 법구경은 전승이라 여기 들어오지 않는다.
# thig.3.5 는 v2 가 뒤집었다. 테리가타 웁비리 장에 있지만 웁비리의 말이 아니라
# 딸을 잃고 우는 웁비리에게 부처가 건넨 말이다
DIRECT_BUDDHA = {"sn.1.34", "an.2.33", "thig.3.5"}

# 실제로 서로 다른 고민 다섯 개. 같은 구절만 나오면 검색이 죽은 것이다
WORRIES = [
    "회사 상사가 사람들 앞에서 저를 깎아내려요. 화가 나서 되갚아 주고 싶어요.",
    "사귀던 사람과 헤어졌어요. 이별한 지 두 달인데 아직도 그 사람 생각만 나요.",
    "친구들은 다 자리를 잡았는데 저만 뒤처진 것 같아 자꾸 비교하게 돼요.",
    "밤마다 잠이 안 와요. 낮에 한 말실수를 계속 곱씹으면서 뒤척여요.",
    "이직을 할지 남을지 몇 달째 못 정하겠어요. 어느 쪽이 맞는 길인지 모르겠어요.",
]


def spec_visual_themes() -> set[str]:
    src = VISUAL_THEME_TS.read_text(encoding="utf-8")
    line = re.search(r"export type VisualTheme\s*=\s*([^;]+);", src)
    assert line is not None
    return set(re.findall(r"'([a-z_]+)'", line.group(1)))


def seed_file() -> dict:
    return json.loads(SEED_JSON.read_text(encoding="utf-8"))


def test_seed_has_the_whole_reviewed_file() -> None:
    """감수본 구절 블록 400개가 하나도 빠지지 않았다. 빠진 1구절은 items 밖 비석으로 남는다."""
    seed = seed_file()
    assert len(seed["items"]) == SHIPPING
    assert len(seed["rejected"]) == len(REJECTED)
    assert len(seed["items"]) + len(seed["rejected"]) == TOTAL_BLOCKS
    assert len(repo.load_seed()) == SHIPPING


def test_every_theme_is_a_spec_visual_theme() -> None:
    allowed = spec_visual_themes()
    assert len(allowed) == 10
    used = {t for s in repo.load_seed() for t in s.themes}
    assert used <= allowed
    # 열 종 전부에 구절이 붙어 있어야 화면 어느 테마로 들어와도 후보가 있다
    assert used == allowed


def test_no_scripture_is_left_without_a_theme() -> None:
    assert [s.id for s in repo.load_seed() if not s.themes] == []


def test_ids_and_bodies_do_not_repeat() -> None:
    pool = repo.load_seed()
    assert len(pool) == len({s.id for s in pool})
    bodies = [re.sub(r"[\s\W_]+", "", s.text)[:60] for s in pool]
    assert len(bodies) == len(set(bodies))


def test_no_scripture_ships_with_an_empty_field() -> None:
    """화면에 나가는 칸이 비어 있으면 그 구절은 뽑히는 순간 빈 카드가 된다."""
    for s in repo.load_seed():
        assert s.citation.strip(), s.id
        assert s.text.strip(), s.id
        assert s.modern_gloss.strip(), s.id
        # daily_line 은 「오늘의 한마디」 재료라 daily_ok 인 구절에만 있으면 된다
        if s.daily_ok:
            assert s.daily_line.strip(), s.id


def test_word_keys_are_cut_from_the_front_only() -> None:
    """꼬리 토막을 만들면 엉뚱한 구절이 걸린다.

    「구조조정이」가 「정이」를 만들던 때, 직장 불안 고민에 돈 이야기 구절이 상위로 올라왔다.
    """
    keys = repo._chips("구조조정이")
    assert "구조" in keys and "구조조정이" in keys
    assert "정이" not in keys
    assert "조정" not in keys
    # 앞에서 자르므로 조사만 다른 낱말끼리는 만난다
    assert repo._chips("대출이") & repo._chips("대출과")


def test_review_status_counts_match_the_reviewed_file() -> None:
    pool = repo.load_seed()
    approved = {s.id for s in pool if s.review.status == "approved"}
    assert approved == {s.id for s in pool}
    assert len(approved) == SHIPPING
    # v2 는 전수 감수라 미감수가 하나도 남지 않는다
    assert sum(1 for s in pool if s.review.status == "needs_review") == 0
    assert approved & REJECTED == set()
    # 고침을 반영해 통과시킨 구절. 감수본 머리말 표와 같은 수다
    assert sum(1 for s in pool if s.review.fix_applied) == 64


def test_approved_scriptures_carry_who_reviewed_them_and_why() -> None:
    for s in repo.load_seed():
        if not s.reviewed:
            continue
        assert s.review.reviewed_by, s.id
        assert s.review.reviewed_at == "2026-09-16", s.id
        assert s.review.evidence_note.strip(), s.id


def test_rejected_scripture_left_the_pool_but_kept_its_tombstone() -> None:
    """만공 귀속이 철회된 구절. 어느 환경에서도 뽑히면 안 된다.

    프론트 스텁도 같은 seed.json 의 items 를 그대로 읽어 아무 구절이나 고르므로,
    items 안에 두면 개발 화면에 빈 카드가 뜬다. 그래서 items 밖 rejected 로 옮겨 둔다.
    """
    for sid in REJECTED:
        assert repo.by_id(sid) is None, sid
    assert REJECTED & {s.id for s in repo.load_seed()} == set()
    tomb = {t["id"]: t for t in seed_file()["rejected"]}
    assert set(tomb) == REJECTED
    assert "왕유" in tomb["kr.mangong.oneflower"]["review"]["evidence_note"]
    # 빼는 이유가 비석에 남아 있어야 같은 id 가 되돌아오지 않는다
    for sid in REJECTED:
        assert tomb[sid]["review"]["evidence_note"].strip(), sid


def test_review_gate_blocks_prod_when_nothing_is_reviewed() -> None:
    pool = repo.load_seed()
    draft_only = tuple(s for s in pool if s.review.status == "needs_review")
    with pytest.raises(RuntimeError):
        repo.apply_review_gate(draft_only, "prod")
    # local·dev 는 미감수까지 본다
    assert repo.apply_review_gate(pool, "local") == pool
    assert repo.apply_review_gate(pool, "dev") == pool


def test_review_gate_keeps_only_approved_in_prod() -> None:
    pool = repo.load_seed()
    kept = {s.id for s in repo.apply_review_gate(pool, "prod")}
    assert kept == {s.id for s in pool}
    assert len(kept) == SHIPPING


def test_candidates_stay_inside_the_theme_and_the_cap() -> None:
    picked = repo.candidates("comparison", query=WORRIES[2])
    assert 0 < len(picked) <= repo.MAX_CANDIDATES
    assert all("comparison" in s.themes for s in picked)


def test_a_theme_with_no_approved_scripture_still_gives_candidates(
    approved_pool: tuple[repo.Scripture, ...],
) -> None:
    """v1 때 비어 있던 자리가 v2 전수 감수로 채워졌다.

    통과 16구절만 쓰던 동안에는 anger·approval 테마에 구절이 하나도 없어서, 화가 난
    고민에 화를 말하는 구절이 못 붙었다. 전수 감수 뒤에는 spec 의 테마 열 종이 전부
    후보를 갖는다. 이 테스트가 그 회복을 지킨다.

    빈 목록을 돌려주면 그 고민은 경전 없는 답변이 되고 응답 스키마도 깨진다.
    """
    themes_in_pool = {t for s in approved_pool for t in s.themes}
    for theme in spec_visual_themes():
        assert theme in themes_in_pool, theme
    picked = repo.candidates("anger", query=WORRIES[0])
    assert picked
    assert all(s.reviewed for s in picked)
    assert any("anger" in s.themes for s in picked)


def test_the_default_pool_in_development_is_the_whole_seed() -> None:
    """local·dev 는 초안까지 후보로 쓴다. 고민이 다르면 다른 구절이 나온다.

    감수 16구절로 묶여 있던 동안은 서로 다른 고민에 같은 구절이 붙었다. 검색이 죽어서가
    아니라 닿는 구절이 풀에 없어서였다. 무엇이 달라졌는지는 `repo.retrieval_pool` 머리말에
    실측표로 적어 두었다.
    """
    assert len(repo.retrieval_pool()) == SHIPPING
    tops = [repo.candidates("anxiety", query=w)[0].id for w in WORRIES]
    assert len(set(tops)) >= 4, tops


def test_the_approved_switch_puts_development_back_on_the_production_pool(
    approved_pool: tuple[repo.Scripture, ...],
) -> None:
    """개발에서도 운영과 같은 화면을 볼 길이 있어야 한다. 그 길이 이 스위치 하나다.

    16구절만 남으면 서로 다른 고민에 같은 구절이 겹친다. 그 겹침이 운영에서 실제로
    벌어지는 일이고, 배포 날이 아니라 지금 볼 수 있어야 한다.
    """
    assert {s.id for s in approved_pool} == {s.id for s in repo.load_seed()}
    tops = {repo.candidates("anxiety", query=w)[0].id for w in WORRIES}
    assert 1 < len(tops) <= len(WORRIES), tops


def test_draft_pool_is_refused_in_production() -> None:
    """미감수 초안을 운영 후보에 넣는 길은 없다. 골라도 기동이 멈춘다."""
    with pytest.raises(RuntimeError):
        repo._retrieval_pool("draft", "prod")


def test_production_resolves_to_the_approved_pool_on_its_own() -> None:
    """운영은 아무것도 안 골라도 감수 통과분으로 간다. 사람이 설정을 기억할 필요가 없다."""
    assert Settings(environment="prod").scripture_pool_mode == "approved"
    assert Settings(environment="dev").scripture_pool_mode == "draft"
    assert Settings(environment="local").scripture_pool_mode == "draft"
    # 골라서 좁히는 것은 어느 환경에서나 된다. 넓히는 것만 운영에서 막힌다
    assert Settings(environment="local", scripture_pool="approved").scripture_pool_mode == (
        "approved"
    )


def test_the_guard_stops_a_production_boot_that_asks_for_drafts() -> None:
    """설정이 틀린 리비전은 첫 요청 500 이 아니라 기동에서 드러난다."""
    with pytest.raises(RuntimeError, match="draft"):
        config_guard(
            Settings(
                environment="prod",
                scripture_pool="draft",
                allow_unverified_anon_key=False,
            )
        )


def test_candidates_are_deterministic() -> None:
    first = [s.id for s in repo.candidates("comparison", query=WORRIES[2])]
    second = [s.id for s in repo.candidates("comparison", query=WORRIES[2])]
    assert first == second


def test_daily_is_same_day_same_scripture_and_only_daily_ok() -> None:
    assert repo.daily("2026-10-01").id == repo.daily("2026-10-01").id
    picked = [repo.daily(f"2026-10-{d:02d}") for d in range(1, 32)]
    assert len({s.id for s in picked}) > 20
    assert all(s.daily_ok and s.daily_line for s in picked)


def test_needs_check_license_is_carried_over() -> None:
    """대승·선·한국 문헌 45구절이 아직 판본 라이선스를 확인받지 못했다.

    초안에서는 50구절이었다. v1 감수에서 넷이 「고전 한문 원문을 기준으로 새 번역」으로
    확인이 끝났고, v2 전수 감수에서 kr.mangong.oneflower 와 kr.naong.cheongsan 둘이
    아예 빠져 44구절이 남았다. 조주 문답은 감수본에서 표시가 빠졌지만 메모가 디지털 판본
    고정을 요구하므로 빌드가 needs_check 를 되살린다.
    """
    marked = {s.id for s in repo.load_seed() if s.license_status == "needs_check"}
    assert len(marked) == 44
    assert "zen.zhaozhou.fangxia" in marked
    assert "maha.platform.3" not in marked


def test_only_a_buddha_speaker_is_marked_as_direct_buddha_speech() -> None:
    """서비스 이름이 「부처의 말」이어도 화자를 부처로 바꾸지 않는다.

    법구경은 전승상 부처의 가르침이지만 화자가 특정되지 않아 canonical_tradition 이고,
    여기에 직접 발언 표시가 붙으면 앱이 없는 말을 부처가 했다고 적는 셈이 된다.
    """
    pool = repo.load_seed()
    for s in pool:
        assert s.attribution.is_direct_buddha_speech == (s.speaker_kind == "buddha"), s.id
    marked = {s.id for s in pool if s.attribution.is_direct_buddha_speech}
    assert marked == DIRECT_BUDDHA
    # 감수를 통과했다고 자동으로 붙지 않는다. 395구절이 통과했는데 셋뿐이다.
    # 그리고 이 셋은 전부 손으로 적은 귀속 표(REVIEWED)에서 나온다. 인용표기나
    # 문헌 기본값이 화자를 부처로 올리는 길은 없다
    assert len(marked) == 3
    for s in pool:
        if s.attribution.is_direct_buddha_speech:
            assert s.attribution.speaker_source == "reviewed_table", s.id


def test_unreviewed_scriptures_claim_no_speaker() -> None:
    """미감수 구절은 화자를 모른다. 모르는 채로 두고 출처만 적는다."""
    for s in repo.load_seed():
        if s.reviewed:
            continue
        assert s.speaker_kind == "unknown", s.id
        assert s.speaker_name == "", s.id
        assert not s.attribution.display_label.startswith("—"), s.id
        assert s.review.evidence_note.startswith("미감수·추정"), s.id


def test_display_label_never_puts_someone_elses_words_in_the_buddhas_mouth() -> None:
    for s in repo.load_seed():
        label = s.attribution.display_label
        assert label, s.id
        if s.attribution.is_direct_buddha_speech:
            assert label.startswith("— 부처,"), s.id
        else:
            assert not label.startswith("— 부처,"), s.id


def test_speaker_kind_and_text_type_are_known_values() -> None:
    allowed_types = {
        "direct_speech",
        "direct_speech_excerpt",
        "direct_verse",
        "direct_vow",
        "dialogue",
        "excerpt",
        "selected_verses_same_speaker",
        "parable_narration",
        "author_prose",
        "poetic_line",
        "summary",
        "composite",
    }
    for s in repo.load_seed():
        assert s.speaker_kind in repo.SPEAKER_KINDS, (s.id, s.speaker_kind)
        assert s.text_type in allowed_types, (s.id, s.text_type)


def test_every_scripture_says_which_work_and_language_it_came_from() -> None:
    for s in repo.load_seed():
        assert s.source_work.strip(), s.id
        assert s.canonical_location.strip(), s.id
        assert s.source_language in ("pli", "zh", "sa", "ko"), (s.id, s.source_language)


def test_original_text_is_only_stored_when_it_covers_the_whole_translation() -> None:
    """원문 칸에는 번역문 전체를 덮는 원문만 둔다. 조각을 두면 그 조각이 전체로 읽힌다."""
    with_source = {s.id for s in repo.load_seed() if s.source_text.strip()}
    assert with_source == {
        "maha.platform.3",
        "zen.zhaozhou.fangxia",
        "kr.wonhyo.hwajaeng",
    }
    # 한문 원문이라 한글이 섞여 있으면 안 된다
    for s in repo.load_seed():
        if s.source_text:
            assert not re.search(r"[가-힣]", s.source_text), s.id


def test_to_api_stays_inside_the_answer_schema() -> None:
    """화면이 받는 모양이 정본 스키마를 벗어나지 않는다.

    `spec/answer.schema.json` 의 Scripture 는 additionalProperties 를 닫아 두었다.
    그래서 새 칸을 내보내려면 스키마를 먼저 넓혀야 한다. 귀속(`attribution`)과 저본 문구가
    그 길을 지나 열렸고, 이 검사가 둘이 스키마 안에 있는지 계속 본다.
    """
    schema = json.loads(ANSWER_SCHEMA.read_text(encoding="utf-8"))
    validator = Draft202012Validator({**schema["$defs"]["Scripture"], "$defs": schema["$defs"]})
    allowed = set(schema["$defs"]["Scripture"]["properties"])

    for s in repo.load_seed():
        assert set(s.to_api()) <= allowed, s.id

    # 한 구절도 스키마를 벗어나지 않는다. 전에는 dhp.54 가 용어 풀이 셋(전단·따가라·말리)으로
    # 걸려 있었고 그 사실을 이 줄이 붙들고 있었다. 감수본이 셋을 적은 것이 맞다고 보고
    # Scripture.terms 를 3 으로 넓혔다. 모델이 만드는 LlmPass2.terms 는 2 그대로다
    broken = {s.id for s in repo.load_seed() if list(validator.iter_errors(s.to_api()))}
    assert broken == set()
