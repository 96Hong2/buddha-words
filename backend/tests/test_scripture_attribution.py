"""누가 말했나. 감수가 확정한 화자와 본문이 그대로 나가는지 본다.

실제 `data/scriptures/seed.json` 과 실제 `repo` 를 그대로 쓴다. 목을 끼우지 않는다.

왜 구절 하나하나를 못 박나
    감수자가 초안에서 고친 것은 대부분 「누가 말했나」와 「무슨 뜻을 지웠나」 두 가지다.
    이런 수정은 다시 빌드하면 조용히 원래대로 돌아간다. 초안 JSON 은 저장소에 그대로
    남아 있고, 감수본 마크다운 한 줄만 어긋나도 빌드는 초안 값을 집어 들기 때문이다.
    그래서 고친 결과를 구절 단위로 적어 둔다. 되돌아가면 그 줄이 먼저 깨진다.

무엇을 지키나
    · 화자를 부처로 올리지 않는다. 서비스 이름이 「부처의 말」이어도 마찬가지다
    · 복수 화자를 한 문장으로 합치지 않는다
    · 교리 맥락(사후의 과보 · 출가 수행자)을 오늘 읽기 좋게 지우지 않는다
    · 감수에서 내린 구절은 운영 어디에서도 나오지 않는다
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from types import ModuleType

import pytest

from app.core.config import Settings
from app.core.config import _guard as config_guard
from app.domains.scripture import repo

SEED_JSON = Path(__file__).resolve().parents[2] / "data" / "scriptures" / "seed.json"


def seed_file() -> dict:
    import json

    return json.loads(SEED_JSON.read_text(encoding="utf-8"))


ROOT = Path(__file__).resolve().parents[2]
BUILD_SCRIPT = ROOT / "tools" / "build_scripture_seed.py"


def build_module() -> ModuleType:
    """빌드 스크립트를 그대로 읽어 온다. 본문 유형 목록의 정본이 거기에 있다.

    이름을 테스트에 다시 적으면 오타가 나도 검사가 조용히 아무것도 안 거른다.
    """
    spec = importlib.util.spec_from_file_location("build_scripture_seed", BUILD_SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# 검색이 실제로 갈리도록 서로 다른 고민 다섯 개. test_scripture.py 와 같은 글이다
WORRIES = [
    "회사 상사가 사람들 앞에서 저를 깎아내려요. 화가 나서 되갚아 주고 싶어요.",
    "사귀던 사람과 헤어졌어요. 이별한 지 두 달인데 아직도 그 사람 생각만 나요.",
    "친구들은 다 자리를 잡았는데 저만 뒤처진 것 같아 자꾸 비교하게 돼요.",
    "밤마다 잠이 안 와요. 낮에 한 말실수를 계속 곱씹으면서 뒤척여요.",
    "이직을 할지 남을지 몇 달째 못 정하겠어요. 어느 쪽이 맞는 길인지 모르겠어요.",
]

THEMES = (
    "anxiety",
    "anger",
    "loss",
    "comparison",
    "relationship",
    "choice",
    "sleepless",
    "emptiness",
    "attachment",
    "approval",
)

# 「부처가 직접 그렇게 말했다」로 읽히는 문구. 이 말이 붙어도 되는 구절은 speaker_kind 가
# buddha 인 둘뿐이다.
#
# 「— 부처,」 는 쉼표까지 본다. 법화경 신해품은 「— 부처의 제자들, …」 이라고 적는데
# 쉼표를 빼고 재면 그 줄이 부처의 직접 발언으로 잘못 걸린다.
BUDDHA_VOICE = (
    "— 부처,",
    "부처가 말",
    "부처께서",
    "부처님께서",
    "부처님이 말",
    "부처님 말씀",
    "부처의 말씀",
)

# 사람이 쓴 문장이 아니라 여러 곳을 엮거나 줄여 만든 텍스트.
# 화면은 이 칸을 「경전 원문」이라고 적고 그대로 인용하므로 운영에 나갈 수 없다
DERIVED_TEXT_TYPES = ("composite", "summary")


def one(scripture_id: str) -> repo.Scripture:
    """시드에서 구절 하나를 꺼낸다. 감수 문을 지나기 전이라 미감수도 잡힌다."""
    found = next((s for s in repo.load_seed() if s.id == scripture_id), None)
    assert found is not None, f"{scripture_id} 가 시드에 없어요"
    return found


@contextmanager
def production_pool() -> Iterator[tuple[repo.Scripture, ...]]:
    """운영 환경으로 갈아 끼운다. 감수 문과 검색은 실제 코드가 그대로 돈다.

    `get_settings` 를 바꾸는 이유는 운영 설정을 정식으로 만들 수 없기 때문이다.
    `_guard` 가 익명키 검증기가 없는 리비전을 운영으로 띄우지 못하게 막는다(그게 맞다).
    여기서 갈아 끼우는 것은 「환경 이름」 하나뿐이고, 감수 문(`apply_review_gate`)과
    후보 검색은 제품 코드 그대로 돈다.
    """
    # 환경을 갈아 끼우면 환경에 매인 캐시를 비워야 한다. 이름이 늘고 줄어도 견디게 훑는다
    caches = [
        value for value in vars(repo).values() if callable(getattr(value, "cache_clear", None))
    ]
    original = repo.get_settings
    repo.get_settings = lambda: Settings(environment="prod")  # type: ignore[assignment]
    for cache in caches:
        cache.cache_clear()
    try:
        yield repo.all_scriptures()
    finally:
        repo.get_settings = original  # type: ignore[assignment]
        for cache in caches:
            cache.cache_clear()


# ────────────────────────────────────────────────────────────────────────────
# 구절마다. 감수가 고친 자리를 그 자리에서 못 박는다
# ────────────────────────────────────────────────────────────────────────────


def test_punnika_speaks_for_herself() -> None:
    """테리가타 12.1 은 뿐니까 장로니의 말이다. 브라만의 답까지 합치면 화자가 둘이 된다.

    초안은 뿐니까의 논박과 브라만의 마지막 승복을 한 문장으로 이어 붙였다.
    감수가 뿐니까의 말만 남겼다.
    """
    s = one("thig.12.1")
    assert s.speaker_name.startswith("뿐니까")
    assert s.speaker_kind == "nun"
    assert s.attribution.is_direct_buddha_speech is False
    assert s.attribution.display_label.startswith("— 뿐니까")
    # 브라만이 받아 말한 대목이 본문에 섞여 있으면 안 된다
    assert "브라만이 답했다" not in s.text
    assert "참으로 브라만이 되었습니다" not in s.text
    assert "핏줄로만 브라만" not in s.text


def test_srimala_vow_keeps_her_name_and_its_place() -> None:
    """승만경 제8서원은 승만부인이 부처 앞에서 한 말이다. 부처가 한 말이 아니다."""
    s = one("maha.srimala.vows")
    assert "승만부인" in s.speaker_name
    assert s.speaker_kind == "lay_bodhisattva"
    assert "제8서원" in s.canonical_location
    assert s.attribution.is_direct_buddha_speech is False
    assert s.attribution.display_label.startswith("— 승만부인")
    # 서원은 부처를 부르며 하는 말이다. 화자를 부처로 바꾸면 문장 자체가 앞뒤가 안 맞는다
    assert "세존이시여" in s.text


def test_the_fifth_patriarch_is_the_one_speaking() -> None:
    """육조단경 행유품의 이 대목은 오조 홍인이 혜능에게 한 말이다."""
    s = one("maha.platform.3")
    assert s.speaker_name == "오조 홍인"
    assert s.speaker_kind == "zen_master"
    assert s.text_type == "direct_speech"
    assert s.attribution.is_direct_buddha_speech is False
    assert s.attribution.display_label.startswith("— 오조 홍인")


def test_sn_1_34_keeps_only_the_reply_whose_speaker_is_known() -> None:
    """상윳따 1:34 은 천신과 부처가 번갈아 읊는다. 화자가 분명한 응답만 남긴다.

    초안은 화자를 모르는 앞 게송(바라는 마음에서 우울이 난다)과 부처의 응답을 합쳤다.
    그 앞 게송이 다시 들어오면 「부처가 말했다」로 표시된 자리에 화자 불명 문장이 실린다.
    """
    s = one("sn.1.34")
    assert s.speaker_name == "부처"
    assert s.speaker_kind == "buddha"
    assert s.attribution.is_direct_buddha_speech is True
    # 말한 전부가 아니라 그중 일부다. 유형이 이 사실을 적고 있어야 한다
    assert s.text_type == "direct_speech_excerpt"
    # 화자 불명 게송의 낱말. 하나라도 본문에 있으면 다시 합쳐진 것이다
    assert "우울" not in s.text
    assert "바라는 마음에서" not in s.text
    assert "괴로움이 난다" not in s.text
    assert s.attribution.display_label.startswith("— 부처,")


def test_dhp_132_keeps_what_happens_after_death() -> None:
    """법구경 132게는 사후의 과보를 말한다. 「그 뒤에」로 뭉개면 내세 맥락이 사라진다.

    팔리 `pecca` 를 여러 독립 번역이 after death 로 옮긴다. 오늘 읽기 편하라고 지울 수 없다.
    """
    s = one("dhp.132")
    assert "죽은 뒤" in s.text
    assert "그 뒤에" not in s.text
    # 풀이도 사후의 과보를 먼저 밝히고 나서 오늘의 적용을 말한다
    assert "사후" in s.modern_gloss


def test_dhp_75_left_the_pool_because_it_ends_in_a_call_to_ordain() -> None:
    """법구경 75게는 v2 전수 감수에서 빠졌다.

    v1 감수는 초안이 지웠던 비구·부처의 제자·열반을 본문에 되살렸다. 되살리고 나니
    번역문이 「부처의 제자인 비구는 홀로 머무는 수행을 길러야 한다」는 출가 권유로
    끝난다. 결론을 지우면 원전 훼손이고 두면 일반 사용자 카드가 출가를 권한다.
    고쳐서 살릴 수 없다고 보고 제품 데이터에서 내렸다.
    """
    assert repo.by_id("dhp.75") is None
    tomb = {t["id"]: t for t in seed_file()["rejected"]}
    assert "dhp.75" in tomb
    assert "출가" in tomb["dhp.75"]["review"]["evidence_note"]


def test_wonhyo_is_the_author_not_the_buddha() -> None:
    """열반종요는 원효가 쓴 글이다. 「부처의 뜻」을 인용할 뿐 부처의 말이 아니다."""
    s = one("kr.wonhyo.hwajaeng")
    assert s.speaker_name == "원효"
    assert s.speaker_kind == "author"
    assert s.text_type == "author_prose"
    assert s.attribution.is_direct_buddha_speech is False
    assert s.attribution.display_label.startswith("— 원효")


def test_mangong_one_flower_never_reaches_production() -> None:
    """만공 귀속이 철회된 구절. 운영 어느 경로로도 나오면 안 된다.

    「世界一花」는 만공보다 앞선 왕유의 비명에 이미 있다. 만공이 만든 말이라 적을 근거가
    없어 감수가 내렸다. 조회·후보·오늘의 한마디 세 경로를 전부 본다.
    """
    dropped = "kr.mangong.oneflower"

    with production_pool() as pool:
        assert dropped not in {s.id for s in pool}
        assert repo.by_id(dropped) is None

        for theme in THEMES:
            for worry in WORRIES:
                picked = {s.id for s in repo.candidates(theme, query=worry)}
                assert dropped not in picked, (theme, worry)

        # 모델이 그 id 를 골라 와도 화이트리스트가 받지 않는다
        allowed = repo.candidates("relationship", query=WORRIES[1])
        assert repo.whitelist([dropped], allowed) == []

        # 오늘의 한마디로도 나오지 않는다
        daily = {repo.daily(f"2026-{m:02d}-{d:02d}").id for m in range(1, 13) for d in range(1, 29)}
        assert dropped not in daily


# ────────────────────────────────────────────────────────────────────────────
# 빌드 게이트. 한 구절이 아니라 「무엇이 운영에 나갈 수 있나」를 지킨다
# ────────────────────────────────────────────────────────────────────────────


def test_only_reviewed_scriptures_become_retrieval_candidates() -> None:
    """감수를 통과하지 않은 구절이 후보에 들어가면 모델이 그것을 고른다.

    후보 목록이 곧 모델이 고를 수 있는 전부다. 여기서 한 건이라도 새면 감수 문은 없는 것과 같다.
    """
    with production_pool() as pool:
        approved = {s.id for s in pool}
        assert approved, "운영 후보가 비었어요"
        assert all(s.reviewed for s in pool)

        seen: set[str] = set()
        for theme in THEMES:
            for worry in WORRIES:
                picked = repo.candidates(theme, query=worry)
                assert picked, (theme, worry)
                for s in picked:
                    assert s.reviewed, (theme, worry, s.id, s.review.status)
                seen |= {s.id for s in picked}

        # 테마가 비면 repo 가 전체를 대신 내주므로, 감수분이 모두 후보로 나오는 것이 정상이다.
        # 새는 것은 반대쪽(미감수가 섞이는 것)이고 위에서 구절마다 본다
        assert seen <= approved


def test_the_pools_really_differ_and_drafts_are_shut_out_of_production() -> None:
    """초안이 운영에 못 가는 것을 잰다.

    v1 때는 개발 풀에 미감수 383구절이 섞여 있어 두 풀이 실제로 달랐다. v2 전수 감수
    뒤에는 남은 395구절이 전부 감수를 통과해 두 풀이 같아졌다. **막는 장치는 그대로
    살려 둔다.** 앞으로 감수 전 구절이 다시 들어올 때 이 문이 없으면 그대로 운영에 나간다.
    """
    assert not [s for s in repo.retrieval_pool() if not s.reviewed], (
        "개발 후보에 미감수 구절이 생겼어요. 전수 감수 뒤에는 없어야 합니다"
    )

    # 운영은 아무것도 고르지 않아도 감수 통과분으로 간다
    with production_pool():
        assert all(s.reviewed for s in repo.retrieval_pool())

    # 초안을 골라도 운영에서는 기동이 멈춘다. 설정 가드와 저장소가 두 겹으로 막는다
    with pytest.raises(RuntimeError, match="draft"):
        repo._retrieval_pool("draft", "prod")
    with pytest.raises(RuntimeError, match="draft"):
        config_guard(
            Settings(environment="prod", scripture_pool="draft", allow_unverified_anon_key=False)
        )


def test_production_never_quotes_a_composite_or_a_summary() -> None:
    """합성문·요약문은 「경전 원문」이라고 적고 인용할 수 없다.

    화면은 `text` 를 원문 시트에 그대로 펼쳐 놓는다. 여러 곳을 엮은 문장이 그 자리에 오면
    앱이 없는 문장을 경전이라고 적는 셈이 된다.
    """
    # 이름이 살아 있는지 먼저 본다. 오타면 아래 검사가 아무것도 안 걸러도 통과한다
    assert set(DERIVED_TEXT_TYPES) <= set(build_module().TEXT_TYPES)

    for s in repo.load_seed():
        if s.text_type not in DERIVED_TEXT_TYPES:
            continue
        assert not s.reviewed, f"{s.id}: 합성·요약인데 감수를 통과했어요"
        assert not s.attribution.is_direct_buddha_speech, s.id
        assert not s.source_text, f"{s.id}: 합성·요약인데 원문 칸이 차 있어요"

    with production_pool() as pool:
        derived = {s.id for s in pool if s.text_type in DERIVED_TEXT_TYPES}
        assert derived == set(), derived


def test_nothing_but_a_buddha_scripture_is_labelled_as_the_buddhas_words() -> None:
    """화자가 부처가 아닌 구절에 부처의 직접 발언 문구가 붙으면 안 된다.

    화면이 읽는 것은 `to_api()` 가 내주는 칸(`citation` · `source`)이다. 귀속 문구를
    앞으로 화면에 보내게 되더라도 그 자리에 들어갈 문자열을 여기서 함께 본다.
    """
    for s in repo.load_seed():
        # 합성·요약은 애초에 화면으로 못 나간다(`to_api` 가 막는다). 그쪽은 앞 검사가 본다
        if s.text_type in DERIVED_TEXT_TYPES:
            continue
        payload = s.to_api()
        source = payload.get("source", {})
        assert isinstance(source, dict)
        visible = " ".join(
            [
                str(payload["citation"]),
                *(str(v) for v in source.values()),
                s.attribution.display_label,
            ]
        )
        hits = [phrase for phrase in BUDDHA_VOICE if phrase in visible]
        if s.speaker_kind == "buddha":
            assert s.attribution.is_direct_buddha_speech, s.id
            continue
        assert hits == [], (s.id, s.speaker_kind, hits)


def test_seed_json_is_exactly_what_the_gate_built() -> None:
    """seed.json 을 손으로 고쳐 게이트를 지나칠 수 없다.

    빌드는 감수본 마크다운을 정본으로 읽고, 게이트를 하나라도 못 넘기면 파일을 쓰지 않는다.
    `--check` 는 지금 파일이 그 결과와 같은지만 본다.
    """
    done = subprocess.run(
        [sys.executable, str(BUILD_SCRIPT), "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert done.returncode == 0, done.stdout + done.stderr


@pytest.mark.parametrize(
    ("scripture_id", "expected"),
    [
        ("thig.12.1", "nun"),
        ("maha.srimala.vows", "lay_bodhisattva"),
        ("maha.platform.3", "zen_master"),
        ("kr.wonhyo.hwajaeng", "author"),
        ("sn.1.34", "buddha"),
        ("an.2.33", "buddha"),
    ],
)
def test_reviewed_speakers_survive_a_rebuild(scripture_id: str, expected: str) -> None:
    """감수가 확정한 화자 종류. 빌드가 초안 값으로 되돌아가면 여기서 잡힌다."""
    s = one(scripture_id)
    assert s.speaker_kind == expected
    assert s.attribution.is_direct_buddha_speech == (expected == "buddha")


# ────────────────────────────────────────────────────────────────────────────
# 화면이 실제로 받는 payload. 여기까지 나가야 사람이 화자를 본다.
#
# 데이터에는 화자가 처음부터 있었는데 스키마가 닫혀 있어 `to_api()` 가 못 실었다.
# 그래서 스텁 백엔드에서는 화자가 뜨고 실제 서버에서는 한 명도 안 떴다.
# 아래 검사는 그 구멍이 다시 열리면 바로 빨간불이 되게 둔 것이다.
# ────────────────────────────────────────────────────────────────────────────


def test_every_scripture_payload_carries_its_speaker() -> None:
    """화면이 받는 모양에 귀속 줄이 빠짐없이 실린다."""
    for s in repo.load_seed():
        if s.text_type in DERIVED_TEXT_TYPES:
            continue
        payload = s.to_api()
        attribution = payload.get("attribution")
        assert isinstance(attribution, dict), s.id
        assert attribution["displayLabel"] == s.attribution.display_label, s.id
        assert attribution["displayLabel"], s.id


def test_source_note_never_says_english_for_a_chinese_text() -> None:
    """한문 문헌에 「영역본을 옮겼다」가 붙으면 안 된다.

    육조단경·승만경·원효는 한문 원문에서 바로 옮긴 글이다. 영역본을 거치지 않았다.
    출처를 확인하러 온 사람이 보는 바로 그 자리라 여기서 틀리면 앱이 거짓말을 한다.
    """
    for s in repo.load_seed():
        if s.text_type in DERIVED_TEXT_TYPES:
            continue
        note = str(s.to_api()["source"]["note"])  # type: ignore[index]
        if s.source_language == "zh":
            assert "한문" in note, s.id
            assert "영역" not in note, s.id
        elif s.source_language == "pli":
            assert "팔리" in note, s.id


def test_only_reviewed_scriptures_claim_a_review() -> None:
    """감수했다는 말은 감수를 통과한 구절에만 붙는다.

    v1 때는 미감수 383구절이 남아 있어 두 갈래를 다 지날 수 있었다. v2 는 전수 감수라
    미감수가 없다. 그래서 「감수를 통과한 쪽에만 붙는가」를 직접 재고, 반대쪽은
    감수 상태를 지운 사본을 만들어 확인한다.
    """
    from dataclasses import replace

    seen = 0
    for s in repo.load_seed():
        if s.text_type in DERIVED_TEXT_TYPES:
            continue
        assert s.reviewed, s.id
        note = str(s.to_api()["source"]["note"])  # type: ignore[index]
        assert "감수에서 출처와 화자를 확인했어요" in note, s.id
        seen += 1
        if seen == 1:
            # 감수 상태만 지우면 문구가 반대로 바뀌는지 본다
            draft = replace(s, review=replace(s.review, status="needs_review"))
            draft_note = str(draft.to_api()["source"]["note"])  # type: ignore[index]
            assert "아직 받지 않은" in draft_note, s.id
            assert "확인했어요" not in draft_note, s.id
    assert seen > 0


def test_the_original_text_reaches_the_screen_with_its_own_name() -> None:
    """원문이 데이터에 있으면 화면까지 나간다. 이름도 데이터가 붙인다."""
    carried = set()
    for s in repo.load_seed():
        if s.text_type in DERIVED_TEXT_TYPES:
            continue
        source = s.to_api()["source"]
        assert isinstance(source, dict)
        if not s.source_text:
            assert "originalText" not in source, s.id
            continue
        carried.add(s.id)
        assert source["originalText"] == s.source_text, s.id
        assert source["originalLabel"] == "한문 원문", s.id
    # 지금 원문이 실린 구절은 셋이다. 늘어나면 SOURCES.md 와 함께 세어 본다
    assert carried == {"maha.platform.3", "zen.zhaozhou.fangxia", "kr.wonhyo.hwajaeng"}, carried


def test_the_share_card_carries_the_speaker_not_just_the_source() -> None:
    """공유 카드는 앱 밖으로 나간다. 거기서 화자가 빠지면 되돌릴 수 없다."""
    from app.domains.share import store

    class _Row:
        emotion_tags = ["comparison"]
        modern_message = "남의 속도를 좇지 마세요."
        scripture_ids = ["maha.platform.3"]
        pass2 = None

    s = one("maha.platform.3")
    card = store.card_from_row(_Row(), s)  # type: ignore[arg-type]
    assert card.scripture_attribution == "— 오조 홍인, 육조단경 행유품"
    assert card.scripture_attribution != s.citation
    # 한자는 카드 글꼴에 없다. 원문은 카드로 나가지 않는다
    assert "不識本心" not in card.scripture_text + card.scripture_attribution
