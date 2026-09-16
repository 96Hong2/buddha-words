"""검색 안전 규칙. 실제 고민 글을 넣어 빠져야 할 구절이 빠지는지 본다.

목을 끼우지 않는다. 실제 `seed.json` · 실제 `repo.candidates` · 실제 `/concern` 이 돈다.
LLM 만 stub 이고, stub 은 **후보 1순위를 그대로 고른다.** 그래서 후보에서 빠진 구절은
어떤 경로로도 화면에 나갈 수 없다.

말뭉치를 왜 395구절로 재나
    「참아라」 · 「효도」 구절은 전수 감수를 통과한 395구절 안에 그대로 있다. 통과했다는
    말은 출처와 화자가 맞다는 뜻이지 어느 고민에나 붙여도 된다는 뜻이 아니다. 그래서
    안전 규칙이 따로 걷어 내야 하고, local·dev 후보 풀이 바로 그 395구절이다. 규칙이
    실제로 무엇을 걷어 내는지는 거기서
    재야 한다. 운영과 같은 16구절 판은 `approved_pool` 픽스처로 따로 본다.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.domains.answer import compose
from app.domains.quota import usage
from app.domains.scripture import repo, safety
from app.integrations.llm import budget
from app.main import app

# 실제로 들어올 법한 고민 글. 길이·말투를 바꾸지 않고 그대로 쓴다
ABUSE_WORRIES = (
    "회사 상사가 매일 제 앞에서 소리를 질러요. 사람들 앞에서 깎아내리기도 하고요. "
    "어떻게 견뎌야 할까요.",
    "남편이 술만 마시면 물건을 던져요. 아이들 앞에서도 그래요. 참고 사는 게 맞을까요.",
    "아버지가 어릴 때부터 저를 때렸어요. 지금도 연락이 오면 손이 떨려요.",
    # 「착취」가 학대 어휘에 없어서 깃발이 안 섰다. 그래서 감수가 이름을 대어 막아 둔
    # `an.2.33`(부모 은혜)이 바로 이 글에 1순위로 올라왔다
    "부모님이 저를 계속 착취하는 것 같아요. 돈도 시간도 다 가져가요.",
    "어릴 때부터 부모님한테 이용만 당하며 자랐어요.",
)
SELF_BLAME_WORRIES = (
    "다 제 탓인 것 같아요. 제가 준비를 못 해서 이렇게 됐어요. 후회만 남아요.",
    "제가 한심해요. 이 나이 먹도록 모아 둔 것도 없고 자책만 하고 있어요.",
)
SELF_WORTH_WORRIES = (
    "요즘 제가 나 같지 않아요. 감정이 안 느껴지고 남 일처럼 멍하니 지내요.",
    "자존감이 바닥이에요. 저는 쓸모없는 사람 같아요.",
)
ORDINARY_WORRIES = (
    "이직을 할지 남을지 몇 달째 못 정하겠어요. 어느 쪽이 맞는 길인지 모르겠어요.",
    "친구가 약속을 자꾸 어겨서 서운해요.",
    # 「사귀던 사람과 헤어졌어요」가 여기 있었다. 2026-09-16 에 이별 상태를 세우면서
    # 아래 BREAKUP_WORRIES 로 옮겼다. 이별은 깃발이 서지 않는 평범한 고민이 아니다
)
# 돈·진로 고민이다. 출가 수행 구절의 검색 문단과 낱말이 겹쳐서 규칙이 없으면 위로 올라온다.
# v1 때 이 자리의 1순위는 dhp.75 였는데, v2 전수 감수에서 출가 권유 결론부 때문에 빠졌다
MONEY_WORRY = "연봉은 오르는데 삶이 계속 헛헛해요. 돈만 보고 달려온 것 같아요."
PRACTICE_WORRY = (
    "명상을 배우고 있는데, 연봉은 오르는데 삶이 계속 헛헛해요. 돈만 보고 달려온 것 같아요."
)
# 규칙을 안 태우면 출가 문맥 구절(`ud.3.6`)이 1순위로 올라오는 고민. 파이프라인이 그걸
# 한 칸 내리는지 여기서 잰다. v2 풀에서 MONEY_WORRY 는 자연 1위가 이미 출가가 아니라
# 배선을 끊어도 통과해 버린다(main 에서는 dhp.75 가 그 자리를 지키고 있었다).
MONASTIC_TOP_WORRY = "직장에서 인정받지 못하는 것 같아 괴로워요"


# 학대 고민에 붙으면 가해자의 말이 되는 구절들.
# dhp.223 은 계획 02 가 학대 고민의 must_not 으로 이름을 박아 둔 구절이다
ABUSE_MUST_NOT = ("dhp.223", "dhp.5", "dhp.1", "an.2.33", "zen.zhaozhou.fangxia", "dhp.98")


@pytest.fixture(autouse=True)
def _isolate() -> None:
    usage.reset_all()
    compose.reset_store()
    budget.reset_all()


@pytest.fixture
def draft_corpus() -> tuple[repo.Scripture, ...]:
    """local·dev 의 실제 후보 풀. 「참아라」 계열 구절이 실제로 있는 말뭉치다."""
    pool = repo.retrieval_pool()
    assert len(pool) == 395
    return pool


def ids(worry: str, limit: int = repo.MAX_CANDIDATES) -> list[str]:
    """실제 파이프라인이 쓰는 후보. 상태 판정도 파이프라인과 같은 함수로 한다."""
    contexts = safety.contexts_of(worry)
    return [s.id for s in repo.candidates("", limit=limit, query=worry, contexts=contexts)]


# ────────────────────────────────────────────────────────────────────────────
# 상태 판정
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("worry", ABUSE_WORRIES)
def test_abuse_worries_are_seen_as_abuse(worry: str) -> None:
    assert "abuse_victim" in safety.contexts_of(worry)


@pytest.mark.parametrize("worry", SELF_BLAME_WORRIES)
def test_self_blame_worries_are_seen(worry: str) -> None:
    assert "self_blame_high" in safety.contexts_of(worry)


@pytest.mark.parametrize("worry", SELF_WORTH_WORRIES)
def test_self_worth_worries_are_seen(worry: str) -> None:
    assert "self_worth_collapse" in safety.contexts_of(worry)


@pytest.mark.parametrize("worry", ORDINARY_WORRIES)
def test_ordinary_worries_do_not_raise_a_flag(worry: str) -> None:
    """모든 글에 깃발이 서면 규칙이 아니라 차단기다. 반대쪽도 함께 잰다."""
    assert safety.contexts_of(worry) == frozenset()


BEREAVEMENT_WORRIES = (
    "엄마가 돌아가셨는데 장례식에서 한 번도 울지 못했어요. 제가 엄마를 사랑하지 않았던 걸까요.",
    "아버지가 돌아가신 지 반년이 지났는데 아직도 실감이 안 나요.",
    "할머니를 하늘로 보내드리고 나서 아무것도 손에 안 잡혀요.",
)


@pytest.mark.parametrize("worry", BEREAVEMENT_WORRIES)
def test_the_server_sees_bereavement_without_waiting_for_the_model(worry: str) -> None:
    """모델이 신고하지 않아도 사별 규칙이 선다.

    검수에서 실제로 그렇게 새어 나갔다. 「엄마가 돌아가셨는데 장례식에서 울지 못했어요」에
    모델이 bereavement 를 신고하지 않았고, 서버는 스스로 볼 눈이 없어서 사별 규칙 전체가
    한 번도 안 돌았다. 사별한 사람에게 「슬픔이 떨어져 나간다」가 그대로 나갔다.
    """
    assert "bereavement" in safety.contexts_of(worry)


# 2026-09-15 사용자 확인에서 사별을 말하는데 깃발이 하나도 안 서던 글들.
# 어미를 손으로 적어 둔 사전이 「돌아가시기」 · 「세상을 떠난」 · 「먼저 보냈」을 다 놓쳤다.
# 그래서 할머니를 떠나보낸 사람이 dhp.165(「더러워지는 것도 스스로다」)를 세 번 중 세 번,
# 아내를 떠나보낸 사람이 dhp.285(「제 애착을 잘라라」)를 받았다
BEREAVEMENT_MISSED_ENDINGS = (
    "할머니가 돌아가시기 전에 병원에 못 갔어요. 그날 회사 일이 바쁘다고 미뤘던 게 "
    "계속 마음에 걸립니다.",
    "아내가 세상을 떠난 지 여덟 달이 됐어요. 밥을 차려도 두 그릇을 놓고 있습니다.",
    "아이를 먼저 보냈어요. 일 년이 지났는데 아직도 그 방에 못 들어갑니다.",
)


@pytest.mark.parametrize("worry", BEREAVEMENT_MISSED_ENDINGS)
def test_bereavement_is_seen_whatever_ending_the_person_used(worry: str) -> None:
    """한국어는 어간 뒤에 어미가 끝없이 붙는다. 어미를 세면 반드시 새는 자리다."""
    assert "bereavement" in safety.contexts_of(worry)


# 2026-09-16 확인. 사람들은 죽음을 「돌아가셨다」로만 적지 않는다. 아래 글에 깃발이 하나도
# 서지 않아서, 사별에서 빼기로 한 구절이 그대로 후보에 남았다. 「고양이가 무지개다리를
# 건넜습니다」에는 사별 규칙이 통째로 죽어서 snp.4.10.851 · dhp.90 · dhp.71 이 후보에 들어왔다
BEREAVEMENT_PLAIN_WORDS = (
    "엄마가 죽었어요. 아직 실감이 안 납니다.",
    "친구가 사고로 죽은 지 한 달 됐어요. 단톡방에 이름이 그대로 있습니다.",
    "할아버지 임종을 못 지켰어요. 회사에 있다가 전화를 받았습니다.",
    "아내를 떠나보내고 혼자 삽니다. 밥을 차리는 일이 제일 어렵습니다.",
    "형이 먼저 갔어요. 스물아홉이었습니다.",
    "키우던 고양이가 무지개다리를 건넜습니다. 밥그릇을 아직 못 치웠어요.",
    "강아지를 안락사시켰어요. 제 손으로 보낸 것 같아 괴롭습니다.",
    "유산했어요. 이름까지 지어 두고 기다리던 아이였습니다.",
)


@pytest.mark.parametrize("worry", BEREAVEMENT_PLAIN_WORDS)
def test_bereavement_is_seen_when_the_person_just_says_died(worry: str) -> None:
    """「돌아가셨다」가 아니어도 선다. 사람을 가리키는 말 뒤의 죽음을 본다."""
    assert "bereavement" in safety.contexts_of(worry), worry


@pytest.mark.parametrize(
    "worry",
    (
        # 자해 쪽 말이다. 여기에 사별을 세우면 상태 판정이 뜻을 잃는다
        "차라리 제가 죽었으면 좋겠어요. 다 그만두고 싶습니다.",
        "프로젝트가 죽었어요. 반년을 매달렸는데 다 엎어졌습니다.",
        "회사 분위기가 죽은 지 오래예요. 출근하면 숨이 막힙니다.",
    ),
)
def test_a_worry_that_is_not_a_death_does_not_raise_bereavement(worry: str) -> None:
    """「죽었」만 보면 사별이 아닌 글까지 선다. 사람을 가리키는 말이 앞에 있을 때만 본다."""
    assert "bereavement" not in safety.contexts_of(worry), worry


def test_a_breakup_is_not_read_as_a_death() -> None:
    """이별과 사별은 다르다. 헤어진 사람에게 사별 규칙을 걸면 맞는 구절까지 빠진다."""
    contexts = safety.contexts_of("사귀던 사람과 헤어졌어요. 아직도 그 사람 생각만 나요.")
    assert "bereavement" not in contexts
    assert "breakup" in contexts


# 2026-09-16 사용자 확인. 이별 고민마다 같은 결이 반복해서 왔다.
# 말투를 바꿔 가며 넣은 글이라 어미가 다 다르다. 어간에서 끊지 않으면 여기서 샌다
BREAKUP_WORRIES = (
    "오래 만난 사람과 헤어진 지 두 달이 됐어요. 아직도 그 사람 물건을 못 버리고 있습니다.",
    "어제 차였어요. 이유도 제대로 못 들었는데 자꾸 연락하고 싶어집니다.",
    "삼 년 사귄 사람이랑 끝났어요. 매일 그 사람 인스타를 들어가 보게 됩니다.",
    "연락이 끊긴 지 한 달인데 아직도 휴대폰만 보고 있어요. 제가 뭘 잘못한 걸까요.",
    "정리했어요. 서로 지쳐서 그만하기로 했는데 막상 혼자가 되니 아무것도 손에 안 잡힙니다.",
    "이별한 지 반년인데 아직도 그 사람 꿈을 꿉니다. 언제쯤 괜찮아질까요.",
    "결별하자는 말을 제가 먼저 꺼냈는데 후회가 밀려옵니다. 다시 붙잡고 싶어요.",
    "남자친구가 저를 떠났어요. 아무 말도 없이 연락처를 다 지웠습니다.",
    "파혼했습니다. 청첩장까지 돌렸는데 어떻게 얼굴을 들어야 할지 모르겠어요.",
    "썸 타던 사람이랑 흐지부지 끝나 버렸어요. 그 사람 카톡을 아직 못 지웠습니다.",
)


@pytest.mark.parametrize("worry", BREAKUP_WORRIES)
def test_breakup_worries_are_seen(worry: str) -> None:
    """말투가 달라도 이별이 선다.

    사별에서 어미를 손으로 적어 두었다가 판정이 통째로 죽은 일이 있었다. 이별도 같은
    자리라, 실제로 들어올 말투를 하나씩 넣어 본다. 「헤어지」는 「헤어진」을 품지 않는다.
    """
    assert "breakup" in safety.contexts_of(worry), worry


@pytest.mark.parametrize("worry", BEREAVEMENT_MISSED_ENDINGS + BEREAVEMENT_WORRIES)
def test_a_death_is_not_read_as_a_breakup(worry: str) -> None:
    """반대쪽도 잰다. 사별 규칙을 그대로 이별에 돌려 쓰면 막을 것이 어긋난다.

    사별에서는 그냥 통과하는 「살아 있는 모든 것은 죽는다」가 이별한 사람에게 가면
    무게가 맞지 않는다. 두 상태를 따로 세운 이유가 이것이라 서로 번지지 않아야 한다.
    """
    assert "breakup" not in safety.contexts_of(worry), worry


@pytest.mark.parametrize(
    "worry",
    (
        "짝사랑하는 사람이 있는데 고백을 못 하겠어요. 지금 이 사이라도 지키고 싶습니다.",
        "맡은 프로젝트가 끝났는데 허탈합니다. 다음 일을 시작할 힘이 안 납니다.",
        "이직을 할지 남을지 몇 달째 못 정하겠어요. 어느 쪽이 맞는 길인지 모르겠어요.",
    ),
)
def test_a_worry_that_is_not_a_breakup_does_not_raise_it(worry: str) -> None:
    """모든 글에 깃발이 서면 규칙이 아니라 차단기다. 「끝났어요」 하나로 세우지 않는다."""
    assert "breakup" not in safety.contexts_of(worry), worry


def test_asking_what_i_did_wrong_is_self_blame() -> None:
    """자책은 「제 탓이에요」로만 오지 않는다. 잘못을 스스로 찾는 물음으로도 온다.

    이 글이 어디에도 안 걸려서, 물어볼 용기가 없다는 사람이 dhp.252
    (「제 허물은 노름꾼이 진 패 감추듯 덮는다」)를 받았다.
    """
    worry = (
        "십 년 넘게 본 친구가 어느 날부터 연락을 안 받아요. "
        "뭘 잘못했는지 물어보고 싶은데 물어볼 용기가 안 납니다."
    )
    assert "self_blame_high" in safety.contexts_of(worry)


def test_the_reviewers_bereavement_case_loses_the_verse_it_used_to_get(
    draft_corpus: tuple[repo.Scripture, ...],
) -> None:
    """검수에서 사별한 사람이 받은 구절 둘. 실제 후보 검색에서 빠져야 한다.

    dhp.156 은 「젊어서 닦지 않은 사람은 탄식한다」이고 dhp.336 은 「슬픔이 떨어져
    나간다」다. 앞의 것은 자책을, 뒤의 것은 슬픔 자체를 못 미친 상태로 만든다.
    """
    worry = BEREAVEMENT_WORRIES[0]
    contexts = safety.contexts_of(worry)
    assert {"bereavement", "self_blame_high"} <= contexts
    found = repo.candidates("", limit=len(draft_corpus), query=worry, contexts=contexts)
    picked = {s.id for s in found}
    assert picked
    assert "dhp.156" not in picked
    assert "dhp.336" not in picked


def test_rules_flag_is_taken_as_is() -> None:
    """1층 rules 가 세운 학대 깃발을 여기서 다시 판정하지 않는다."""
    assert "abuse_victim" in safety.contexts_of("무슨 말을 해야 할지 모르겠어요", abuse=True)
    assert "minor" in safety.contexts_of("무슨 말을 해야 할지 모르겠어요", minor=True)


def test_a_flag_reported_by_the_model_also_counts() -> None:
    """서버가 못 본 것을 모델이 볼 수 있다. 어느 한쪽이 세우면 선다."""
    worry = ORDINARY_WORRIES[0]
    assert safety.contexts_of(worry) == frozenset()
    assert "bereavement" in safety.contexts_of(worry, reported=["bereavement"])


# ────────────────────────────────────────────────────────────────────────────
# 걸린 구절이 후보에서 빠지나
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("worry", ABUSE_WORRIES)
def test_abuse_worries_never_see_endurance_or_filial_verses(
    worry: str, draft_corpus: tuple[repo.Scripture, ...]
) -> None:
    """참음 · 용서 · 효도 · 내려놓음을 요구하는 구절이 후보에 없어야 한다."""
    pool = set(ids(worry, limit=len(draft_corpus)))
    assert pool
    for scripture_id in ABUSE_MUST_NOT:
        assert scripture_id not in pool, (worry, scripture_id)


@pytest.mark.parametrize("worry", SELF_BLAME_WORRIES)
def test_self_blame_worries_never_see_dhp_155_or_156(worry: str) -> None:
    """사용자 지시로 이름이 박힌 두 구절. 기본 후보 풀에 들어 있어 실제로 걸러져야 한다."""
    assert {"dhp.155", "dhp.156"} <= {s.id for s in repo.retrieval_pool()}
    pool = set(ids(worry, limit=len(repo.retrieval_pool())))
    assert "dhp.155" not in pool
    assert "dhp.156" not in pool


@pytest.mark.parametrize("worry", SELF_WORTH_WORRIES)
def test_self_worth_worries_never_see_dhp_279(worry: str) -> None:
    assert "dhp.279" in {s.id for s in repo.retrieval_pool()}
    assert "dhp.279" not in set(ids(worry, limit=len(repo.retrieval_pool())))


def test_the_same_verses_are_still_reachable_for_an_ordinary_worry() -> None:
    """규칙이 구절을 영영 지우는 것이 아니다. 상태가 안 서면 그대로 후보에 있다."""
    everything = len(repo.retrieval_pool())
    pool = set(ids("지나간 일을 자꾸 곱씹어요. 이제 그만 떠올리고 싶어요.", limit=everything))
    assert {"dhp.155", "dhp.156", "dhp.279"} <= pool


# 위 구절들을 실제로 데려오는 고민 글. 상태는 1층 rules 나 모델이 세워 파이프라인에 들어온다
WORRY_FOR = {
    "abuse_victim": ABUSE_WORRIES[1],
    "bereavement": "엄마가 돌아가셨어요. 장례식에서 울지도 못했어요.",
    "self_blame_high": SELF_BLAME_WORRIES[0],
    "self_worth_collapse": SELF_WORTH_WORRIES[0],
    "breakup": "오래 만난 사람과 헤어진 지 두 달이 됐어요. 아직도 그 사람 생각만 납니다.",
    "self_harm": "다 그만두고 싶다는 생각이 자꾸 들어요.",
    "discrimination_victim": "같은 일을 하는데 저만 자리에서 밀려요.",
    "minor": "고등학생인데 집에 있기가 너무 힘들어요.",
}

# 후보 풀이 395구절로 넓어지면서 드러난 자리. 규칙이 감수본 16구절만 보고 만들어져서
# 초안 쪽 표현을 못 보고 있었다. 왼쪽이 구절, 오른쪽이 그 구절이 빠져야 하는 상태다
LEAKED_FROM_DRAFTS = (
    # 「나는 거친 말을 견디겠다」. 검색 문단이 「상사나 동료에게 심한 말을 듣고」다
    ("dhp.320", "abuse_victim"),
    # 「받아치지 않는 것과 참는 것은 달라요」. 맞고 사는 사람에게는 입을 다물라는 말이다
    ("dhp.134", "abuse_victim"),
    # 「부모를 섬긴다」 · 「자식은 다섯 가지로 부모를 받든다」
    ("an.3.31", "abuse_victim"),
    ("dn.31.parents", "abuse_victim"),
    # 「닥쳐오는 어려움을 견디고 떨지 않는다」
    ("snp.1.3.42", "abuse_victim"),
    # 「울고 슬퍼한다고 마음이 고요해지지 않는다」. 검수에서 사별한 사람이 받은 결의 구절이다
    ("an.5.49", "bereavement"),
    # 「모양 있는 것은 그대로 비어 있고」
    ("maha.heart.form", "self_worth_collapse"),
    # 「세상을 물거품처럼 보라. 죽음의 왕은 찾지 못한다」
    ("dhp.170", "self_harm"),
    # 「자기가 한 일과 하지 않은 일만 보라」 · 「내 허물을 보고 일러 주는 사람은 보물」
    ("dhp.50", "self_blame_high"),
    ("dhp.76", "self_blame_high"),
    # 「남이 받는 존경을 시기하는 사람은 가는 자리마다 제 자리가 좁다」
    ("mn.135", "discrimination_victim"),
    # 「자, 나는 홀로 가겠다」
    ("thag.10.2", "minor"),
    # ── 2026-09-15 사용자 확인에서 실제 모델이 내놓은 것들 ──
    # 「나쁜 일은 스스로 한 것이고 더러워지는 것도 스스로다. 누구도 남을 대신해
    # 깨끗하게 해 줄 수 없다」. 곁에 못 가 본 사람의 후회를 도덕의 때로 바꾼다
    ("dhp.165", "bereavement"),
    ("dhp.165", "self_blame_high"),
    # 「제 애착을 잘라라, 가을 연꽃을 손으로 꺾듯이」. 아내를 떠나보낸 사람에게
    # 떠난 사람을 향한 마음을 잘라 내라는 말이 된다
    ("dhp.285", "bereavement"),
    # 「저지른 나쁜 일은 재에 덮인 불씨처럼 속으로 타면서 뒤를 따라온다」.
    # dhp.165 를 막으니 이것이 그 자리로 왔다. 결로 막지 않으면 끝나지 않는다
    ("dhp.71", "bereavement"),
    ("dhp.71", "self_blame_high"),
    # 「나쁜 일을 가볍게 여기지 말라… 어리석은 사람은 조금씩 쌓아 나쁜 것으로 가득 찬다」
    ("dhp.121", "self_blame_high"),
    # 「나쁜 일은 하지 않는 편이 낫다. 하고 나면 뒤에 태운다」
    ("dhp.314", "self_blame_high"),
    # 「나쁜 짓을 하지 않았다는 것은 사람을 태우지 않는다」. 뒤집으면 했으면 탄다
    ("iti.31", "self_blame_high"),
    # 「해야 할 일은 하지 않고 하지 말아야 할 일을 해 온 사람은 죽음 앞에서 떤다」
    ("an.4.184", "bereavement"),
    ("an.4.184", "self_blame_high"),
    # 「지난 일을 슬퍼하기에 어리석은 이는 베어 낸 갈대처럼 시들어 간다」 ·
    # 「지나간 일을 두고 슬퍼하지 않는다」. 명령형만 보다가 평서형을 놓치고 있었다
    ("sn.1.10", "bereavement"),
    ("snp.4.10.851", "bereavement"),
    # 「부모는 마땅히 섬길 분이다. 먹을 것과 입을 것으로 부모를 섬긴다」.
    # 부모가 이미 떠난 사람에게 이제는 할 수 없는 일을 목록으로 내민다
    ("an.3.31", "bereavement"),
    ("dn.31.parents", "bereavement"),
    # 「늙었다고 나를 내던지는 저들은 아들의 모습을 한 것일 뿐이다」.
    # 아버지에게 맞고 자란 사람이 거리를 두려 할 때 그 거리를 잘못이라고 말한다
    ("sn.7.14", "abuse_victim"),
    # ── 2026-09-16 사용자 확인. 이별 고민에 실제 모델이 내놓은 것들 ──
    # 결 하나. 글쓴이를 구경거리로 만든다.
    # 「풀려난 사람이 제 발로 묶이러 간다. 저 사람을 좀 보라」. 칩 「#아직 남은 마음」
    # 바로 밑에 붙어서, 이별을 적은 사람을 3인칭으로 세워 놓고 보라고 한다
    ("dhp.344", "breakup"),
    # 결 둘. 다른 사람의 죽음 이야기. 이별한 사람에게는 무게가 다르다
    ("thig.6.2", "breakup"),  # 아들을 잃고 삼 년을 떠돈 와셋티 장로니의 게송
    ("thig.6.1", "breakup"),  # 아들을 잃은 이에게 한 말
    ("thig.3.5", "breakup"),  # 화장터에서 불태워진 딸이 팔만사천이다
    ("ud.8.8", "breakup"),  # 손녀를 잃은 위사카에게 한 게송. 본문에는 죽음이 없고 출처에만 있다
    ("an.5.49", "breakup"),  # 왕비를 잃은 왕에게 한 대목
    # 「살아 있는 모든 것은 죽는다. 죽음이 그 끝이며 거기서 벗어난 이는 없다」.
    # 사별에서는 통과시키는 말인데, 헤어진 사람은 그 사람이 아직 살아 있다
    ("sn.3.22", "breakup"),
    # dhp.344 를 막고 다시 재 보니 이 결이 그 자리로 왔다. 이름이 아니라 결로 막아야 하는
    # 이유가 여기 있다. 「나는 늙기 마련이고… 나는 죽기 마련이다」가 「헤어진 지 두 달」에 붙었다
    ("an.5.57", "breakup"),
    ("an.6.19", "breakup"),  # 「숨 한 번 쉬는 동안만이라도 죽음을 생각하라」
    # 「돌아가셨」만 막아 두어 같은 말의 다른 낱말이 그대로 샜다. 2026-09-16 확인에서
    # 「아끼던 사람도 세상을 떠나고 나면 다시 볼 수 없다」가 「남자친구가 연락처를 다
    # 지우고 떠났어요」의 1순위로 네 번 중 네 번 나갔다. 헤어진 사람은 그 사람이 살아 있다
    ("snp.4.6.807", "breakup"),
    ("an.6.16", "breakup"),  # 병이 깊어진 남편에게 아내가 하는 말
    # 결 셋. 아직 아픈 사람에게 마음을 잘라 내라거나 그만 울라고 한다
    ("dhp.285", "breakup"),  # 「제 애착을 잘라라, 가을 연꽃을 손으로 꺾듯이」
    ("dn.16.ananda", "breakup"),  # 「아난다야, 슬퍼하지 말고 울지 말아라」
    ("snp.3.8.584", "breakup"),  # 「울음과 통곡만으로는 마음의 고요를 얻지 못한다」
    ("an.5.48", "breakup"),  # 「슬퍼하고 울어도 여기서 얻는 것은 티끌만큼도 없다」
    # ── 2026-09-16 확인. 이별에서는 막히는데 사별에서는 통과하던 자리 ──
    # 「숨 한 번 들이쉬고 내쉬는 동안만이라도 살아 있다면」. 「딸아이를 잃고 하루를
    # 흘려보내고 있습니다」의 후보 1순위였다. 가족을 잃은 사람에게 네 죽음을 헤아려 보라고 한다
    ("an.6.19", "bereavement"),
    # 「나는 죽기 마련이다. 사랑하는 모든 것과 언젠가 헤어진다」
    ("an.5.57", "bereavement"),
    # 같은 경의 뒷대목 「살아 있음에 취해 있던 마음이 옅어진다」. 이름 하나를 막으면
    # 옆 구절이 그 자리로 온다. 사별 고민 셋과 이별 고민의 후보에 그대로 남아 있었다
    ("an.5.57.mada", "bereavement"),
    ("an.5.57.mada", "breakup"),
    # 「늙음과 죽음이 그대에게 그렇게 다가오고 있다」. 사별 고민 다섯 자리의 후보에 있었다
    ("sn.3.25", "bereavement"),
    ("sn.3.25", "breakup"),
    # 「지금 죽으면 나는 어디로 가는가」
    ("sn.55.21", "bereavement"),
    # 「불태워진 딸이 팔만사천이다. 그 가운데 누구를 두고 우느냐」 ·
    # 「내 아들아 하며 우는구나… 무엇을 두고 우는가」. 아이를 먼저 보낸 사람에게
    # thig.6.1 이 실제 모델로 여섯 번 중 여섯 번 나갔다
    ("thig.3.5", "bereavement"),
    ("thig.6.1", "bereavement"),
    # 「풀려난 사람이 제 발로 묶이러 간다. 저 사람을 좀 보라」. 글쓴이를 구경거리로 세운다
    ("dhp.344", "bereavement"),
    # 「자식도 내 것이고 재산도 내 것이라 하며 어리석은 사람은 애를 태운다」
    ("dhp.62", "bereavement"),
    # ── 2026-09-16 확인. 반대 방향. 사별에서는 막히는데 이별에서는 통과하던 자리 ──
    # 「지난 일을 슬퍼하기에 어리석은 이는 베어 낸 갈대처럼 시들어 간다」. 실제 모델로
    # 「어제 차였어요」에 이 구절이 화면까지 나갔다. 어제 헤어진 사람을 어리석은 이라고 부른다
    ("sn.1.10", "breakup"),
    # 「지나간 일을 두고 슬퍼하지 않는다」. 같은 결이고 「이별한 지 반년」 후보 16위였다
    ("snp.4.10.851", "breakup"),
    # 「죽음 앞에서 떠는 사람이 있고… 해야 할 일은 하지 않고 하지 말아야 할 일을 해 온
    # 사람은 떤다」. 죽음을 읽는 사람 쪽으로 돌려 세우면서 네가 잘못 살았다고 덧붙인다.
    # 「이별한 지 반년」 6위 · 「이혼 서류」 12위 · 「연락처를 다 지우고 떠났어요」 16위
    ("an.4.184", "breakup"),
)

# 사별에서 **남겨야 하는** 구절. 죽음을 말하는 글이라고 다 막으면 사별한 사람에게
# 내보낼 말이 사라진다. 여기 있는 것은 실제 모델 확인에서 화면이 괜찮았던 구절이다
KEPT_FOR_BEREAVEMENT = (
    # 「목숨은 미리 알 수 없고 정해진 표시도 없다」. 풀이가 「내일을 모르는 것은 내가
    # 준비를 덜 해서가 아니다」로 받는다. 「병원에 못 갔어요」에 세 번 중 세 번 나갔다
    "snp.3.8.574",
    # 「할머니께서 돌아가셨습니다… 왕이여, 살아 있는 모든 것은 죽는다」. 사별한 왕에게
    # 한 말이고 풀이가 「그 마음은 왕도 똑같았다」로 받는다. 이별에서는 막고 여기서는 남긴다
    "sn.3.22",
    # 「헤매며 흘린 눈물이 네 바다의 물보다 많다」. 우는 것을 꾸짖지 않고 혼자가 아니라고 한다
    "sn.15.3",
    # 「아끼던 사람도 세상을 떠나고 나면 다시 볼 수 없다」. 검색 문단이 사별을 보고 쓰였다.
    # 헤어진 사람에게는 못을 박는 말이라 이별에서만 막는다
    "snp.4.6.807",
    # 「삼 년을 떠돌았다」. 오래 걸린다고 잘못된 것이 아니라고 말해 주는 글이다
    "thig.6.2",
    # 「화살을 뽑아 내고… 모든 슬픔을 건너 슬픔 없이 잦아든다」
    "snp.3.8.593",
)


@pytest.mark.parametrize("scripture_id", KEPT_FOR_BEREAVEMENT)
def test_a_verse_that_comforts_a_bereaved_person_is_not_swept_away(scripture_id: str) -> None:
    """죽음을 말하는 글을 결로 막으면서 함께 받아 주는 글까지 쓸어 내지 않는다."""
    found = repo.by_id(scripture_id)
    assert found is not None, scripture_id
    assert safety.allowed(found, {"bereavement"}), scripture_id


def test_the_death_reminder_rule_runs_in_both_states() -> None:
    """이별에만 걸려 있다가 사별에서 통째로 새던 자리. 두 상태가 같은 묶음을 쓴다.

    an.6.19(「숨 한 번 쉬는 동안만이라도」)가 이별에서는 막히고 사별에서는 통과했다.
    묶음을 한쪽에만 끼우면 같은 일이 또 난다.
    """
    by_context = dict(safety.BY_CONTENT)
    for context in ("bereavement", "breakup"):
        assert set(safety.DEATH_REMINDER) <= set(by_context[context]), context


def test_the_grief_is_foolish_rule_runs_in_both_states() -> None:
    """반대 방향. 사별에서만 막히다가 이별에서 새던 자리다.

    sn.1.10(「지난 일을 슬퍼하기에 어리석은 이는 베어 낸 갈대처럼 시들어 간다」)이
    「어제 차였어요」에 실제로 나갔다. 명령형만 보는 CUT_YOUR_HEART 로는 못 잡는다.
    """
    by_context = dict(safety.BY_CONTENT)
    for context in ("bereavement", "breakup"):
        assert set(safety.GRIEF_CALLED_FOOLISH) <= set(by_context[context]), context


# 이별에서 **남겨야 하는** 구절. 규칙을 넓히다 이것까지 걷어 내면 헤어진 사람에게
# 내보낼 말이 사라진다. 결로 막되 되돌릴 길과 위로는 남긴다
KEPT_FOR_BREAKUP = (
    # 「사랑하는 것에도 미운 것에도 얽매이지 마라」 · 「무엇도 꼭 붙들지 마라」.
    # 같은 16장이고 표현도 세지만, 검색 문단이 바로 이 자리를 보고 쓰였고 풀이가
    # 「사람을 사랑하지 말라는 말이 아니라」라고 못을 박는다
    "dhp.210",
    "dhp.211",
    # 「스스로를 섬으로 삼아라」. 같은 대반열반경이지만 혼자 남은 사람에게 필요한 글이다.
    # 출처로 뭉뚱그려 막으면 이것까지 함께 사라진다
    "dn.16.island",
    # 「길 위에서는 함께 가는 무리가 벗이다」 · 「평상의 마음이 길이다」
    "sn.1.53",
    "zen.wumen.19",
    # 「화살을 뽑아 내고… 모든 슬픔을 건너 슬픔 없이 잦아든다」. 같은 화살경이어도 584게는
    # 울어도 소용없다고 하고 593게는 뽑을 수 있다고 한다. 뒤의 것은 남긴다
    "snp.3.8.593",
    # 「지어진 모든 것은 한자리에 머물지 않는다」. 무상을 말하지만 남의 죽음 이야기가 아니고
    # 풀이가 「그 사실을 붙들고 밀어내는 일이 잦아들면 그때 숨이 돌아온다」로 받는다
    "maha.nirvana.snow",
)


@pytest.mark.parametrize("scripture_id", KEPT_FOR_BREAKUP)
def test_a_verse_that_comforts_a_breakup_is_not_swept_away(scripture_id: str) -> None:
    """세 결로 넓게 막으면서 위로가 되는 글까지 쓸어 내지 않는다."""
    found = repo.by_id(scripture_id)
    assert found is not None, scripture_id
    assert safety.allowed(found, {"breakup"}), scripture_id


# 반대쪽. **넓게 잡되 이 둘은 남긴다.** 같은 업 이야기여도 되돌릴 길을 말하는 글은
# 자책이 심한 사람에게 오히려 필요하다. 규칙을 넓히다 이것까지 걷어 내면 자책 고민에
# 남는 것이 「네 탓이 아니다」를 말할 수 없는 구절뿐이 된다
KEPT_FOR_SELF_BLAME = (
    # 「지은 나쁜 일을 좋은 일로 덮어 가는 사람은 구름을 벗어난 달처럼 비춘다」
    "dhp.173",
    # 「자기를 원수 대하듯 하는 것이 자기를 사랑하지 않는 것이다」
    "sn.3.4",
)


@pytest.mark.parametrize("scripture_id", KEPT_FOR_SELF_BLAME)
def test_a_verse_that_offers_a_way_back_is_not_swept_away(scripture_id: str) -> None:
    """업 이야기를 결로 막으면서 되돌릴 길을 말하는 글까지 쓸어 내지 않는다."""
    found = repo.by_id(scripture_id)
    assert found is not None, scripture_id
    assert safety.allowed(found, {"self_blame_high"}), scripture_id


@pytest.mark.parametrize(("scripture_id", "context"), LEAKED_FROM_DRAFTS)
def test_a_draft_verse_that_used_to_leak_is_excluded_now(
    scripture_id: str, context: str, draft_corpus: tuple[repo.Scripture, ...]
) -> None:
    """감수를 통과한 구절도 안전 규칙을 지난다.

    v1 때 이 표는 「미감수 구절도 검사를 건너뛰지 않는다」를 재는 자리였다. v2 전수 감수
    뒤에는 여기 적힌 구절이 전부 감수를 통과했다. 그래도 표는 그대로 산다. **감수 통과는
    출처와 화자가 맞다는 뜻이지 어느 고민에나 붙여도 된다는 뜻이 아니기 때문이다.**
    사별한 사람에게 죽음을 세는 구절이 가면 안 되는 것은 감수와 상관없는 일이다.
    """
    found = repo.by_id(scripture_id)
    assert found is not None, scripture_id
    assert found in draft_corpus, f"{scripture_id} 가 후보 풀에 없어요"
    assert context in safety.excluded_for(found), scripture_id
    # 실제 후보 검색으로도 확인한다. 규칙만 맞고 파이프라인에서 안 빠지면 소용이 없다
    picked = repo.candidates(
        "", limit=len(draft_corpus), query=WORRY_FOR[context], contexts={context}
    )
    assert scripture_id not in {s.id for s in picked}


@pytest.mark.parametrize("context", sorted(WORRY_FOR))
def test_every_state_still_leaves_candidates_in_the_draft_pool(
    context: str, draft_corpus: tuple[repo.Scripture, ...]
) -> None:
    """규칙을 넓혀도 내보낼 구절이 남아야 한다. 답변 스키마가 경전을 하나 요구한다."""
    left = safety.filter_pool(draft_corpus, {context})
    assert len(left) < len(draft_corpus), f"{context} 가 아무 구절도 안 빼요"
    assert len(left) > len(draft_corpus) // 2, f"{context} 가 풀 절반을 걷어 냈어요"


def test_an_excluded_verse_is_dropped_even_when_the_model_picks_it() -> None:
    """모델이 고른 것이라도 뺀다. 후보 필터가 뚫려도 조립 자리에서 한 번 더 본다."""
    blocked = repo.by_id("dhp.155")
    assert blocked is not None
    assert not safety.allowed(blocked, {"self_blame_high"})
    assert safety.allowed(blocked, {"bereavement"})


# ────────────────────────────────────────────────────────────────────────────
# 출가 수행 문맥. 빼지 않고 1순위에서만 내린다
# ────────────────────────────────────────────────────────────────────────────


def test_a_monastic_verse_is_not_the_first_pick_for_a_work_worry() -> None:
    picked = ids(MONEY_WORRY)
    first = repo.by_id(picked[0])
    assert first is not None
    assert not safety.monastic(first), picked[:3]
    # 빼지는 않는다. 목록에는 그대로 있다.
    # 어느 구절이 뽑히는지는 풀이 바뀌면 달라지므로 id 를 박지 않고 성질로 잰다
    assert any(safety.monastic(repo.by_id(sid)) for sid in picked), picked


def test_the_pipeline_really_demotes_a_monastic_verse_that_would_be_first() -> None:
    """규칙이 **파이프라인 안에서** 도는지 잰다. 함수만 따로 부르면 배선이 끊겨도 초록이다.

    실제로 그랬다. `repo.candidates` 안의 `demote_monastic` 호출 두 곳을 통째로 끊어도
    434건이 전부 통과했다. 그걸 지키던 것은 MONEY_WORRY 쪽이었는데, 그 자연 1위였던
    `dhp.75` 가 전수 감수에서 빠지면서 문이 같이 사라졌다.

    그래서 지금 풀에서 실제로 출가 구절이 1위로 올라오는 고민문을 골라 둔다. 풀이 바뀌어
    전제가 깨지면 두 번째 단언이 먼저 실패해 「이 글은 더 이상 이 규칙을 안 지난다」고 알린다.
    """
    picked = ids(MONASTIC_TOP_WORRY)
    first = repo.by_id(picked[0])
    assert first is not None
    assert not safety.monastic(first), picked[:3]
    # 전제: 이 글에는 출가 구절이 후보 앞쪽에 있다. 없으면 이 검사가 아무것도 안 잰다
    assert any(safety.monastic(repo.by_id(sid)) for sid in picked[:3]), picked[:5]


def test_a_practice_worry_keeps_the_monastic_verse_at_the_top() -> None:
    """수행 이야기에는 출가 문맥이 맞는 말이다. 그 자리에서는 내리지 않는다.

    v1 때는 검색 결과 1순위(dhp.75)로 쟀는데, 그 구절이 v2 에서 빠지고 풀도 395구절로
    넓어져 어느 구절이 올라올지가 고정되지 않는다. 그래서 규칙 자체를 직접 잰다.
    """
    order = ["dhp.98", "dhp.58"]
    assert safety.monastic(repo.by_id("dhp.98"))
    assert not safety.monastic(repo.by_id("dhp.58"))
    # 수행 이야기에서는 내리지 않는다
    assert safety.demote_monastic(order, PRACTICE_WORRY, repo.by_id) == order


def test_demotion_moves_one_slot_and_keeps_the_rest_in_order() -> None:
    order = ["dhp.98", "dhp.58", "dhp.19", "dhp.132"]
    moved = safety.demote_monastic(order, MONEY_WORRY, repo.by_id)
    assert moved == ["dhp.58", "dhp.98", "dhp.19", "dhp.132"]
    # 전부 출가 문맥이면 내릴 자리가 없다. 순서를 그대로 둔다
    monastic_only = ["dhp.98", "dhp.19"]
    assert safety.demote_monastic(monastic_only, MONEY_WORRY, repo.by_id) == monastic_only


# ────────────────────────────────────────────────────────────────────────────
# 내세 문맥. 원문의 뜻을 본문에 남긴다
# ────────────────────────────────────────────────────────────────────────────


def test_dhp_132_keeps_the_afterlife_meaning_in_the_canonical_text() -> None:
    """쉬운 말로 바꾸는 일은 풀이가 한다. 본문에서 「죽은 뒤」를 지우지 않는다."""
    s = repo.by_id("dhp.132")
    assert s is not None
    assert "죽은 뒤" in s.text
    # 오늘 말로 옮긴 문장은 풀이 쪽에 있다
    assert s.modern_gloss.strip()
    assert "죽은 뒤" not in s.daily_line


# ────────────────────────────────────────────────────────────────────────────
# 실제 요청. 화면까지 나가는 길에서 막히는지
# ────────────────────────────────────────────────────────────────────────────


def test_the_solace_verse_is_never_a_rebuke_or_monastic_advice() -> None:
    """위기 안내를 보고 「그래도 들어주세요」를 누른 자리. 여기서 고르는 한 구절을 잰다.

    규칙을 걸기 전에는 출가 수행 구절(홀로 머무는 수행을 길러라)이 1순위였다. 혼자 있는
    사람에게 혼자 있으라고 말하는 답이 나가고 있었다.
    """
    client = TestClient(app)
    headers = {"X-Anon-Key": f"anon-{uuid.uuid4().hex}", "X-Timezone": "Asia/Seoul"}
    res = client.post(
        "/concern/continue",
        json={"text": "요즘 그냥 사라지고 싶다는 생각만 들어요. 아무것도 하기 싫어요."},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["responseType"] == "solace"
    scripture = repo.by_id(body["scripture"]["id"])
    assert scripture is not None
    assert safety.allowed(scripture, {"self_harm", "self_blame_high", "self_worth_collapse"}), (
        scripture.id
    )
    assert not safety.monastic(scripture), scripture.id


@pytest.mark.parametrize("worry", BREAKUP_WORRIES)
def test_a_breakup_worry_never_sees_the_verses_that_used_to_come(
    worry: str, draft_corpus: tuple[repo.Scripture, ...]
) -> None:
    """이별 고민의 후보에서 세 결이 전부 빠진다. 말투가 달라도 같아야 한다."""
    pool = set(ids(worry, limit=len(draft_corpus)))
    assert pool
    for scripture_id in (
        "dhp.344",
        "thig.6.2",
        "dn.16.ananda",
        "dhp.285",
        "ud.8.8",
        # 위 다섯만 재다가 같은 결의 여섯째를 놓쳤다. 이름으로 재는 목록은 이렇게 낡는다
        "snp.4.6.807",
    ):
        assert scripture_id not in pool, (worry, scripture_id)


# 2026-09-16 실제 모델 확인에 쓴 글. 관계를 바꿔 가며 넣었다. 관계마다 후보가 크게 달라져서
# 하나만 재면 새는 자리를 못 본다(an.6.19 는 자식 쪽에서만 1순위로 올라왔다)
BEREAVEMENT_BY_RELATION = (
    "아버지가 지난달에 돌아가셨어요. 장례를 치르고 집에 돌아왔는데 아직도 현관에서 "
    "신발을 찾게 됩니다.",
    "아내가 세상을 떠난 지 여덟 달이 됐어요. 밥을 차려도 두 그릇을 놓고 있습니다.",
    "딸아이를 잃고 나서 시간이 어떻게 가는지 모르겠어요. 하루를 그냥 흘려보내고 있습니다.",
    "제일 친한 친구가 사고로 세상을 떠났어요. 단톡방에 그 애 이름이 그대로 있는 걸 볼 "
    "때마다 숨이 막힙니다.",
    "십오 년 같이 산 강아지를 하늘로 보냈어요. 산책 시간만 되면 아직도 목줄을 찾습니다.",
)


@pytest.mark.parametrize("worry", BEREAVEMENT_BY_RELATION)
def test_a_bereaved_person_never_sees_a_verse_that_counts_death(
    worry: str, draft_corpus: tuple[repo.Scripture, ...]
) -> None:
    """가족을 잃은 사람의 후보에서 죽음을 헤아려 보라는 글이 빠진다.

    고치기 전에는 an.6.19 가 「딸아이를 잃고」의 후보 1순위였고, sn.3.25 는 다섯 자리 중
    셋의 후보에 있었다. 모델이 무엇을 고르든 후보에 없으면 화면에 나갈 수 없다.
    """
    pool = set(ids(worry, limit=len(draft_corpus)))
    assert pool
    for scripture_id in ("an.6.19", "an.5.57", "an.5.57.mada", "sn.3.25", "sn.55.21", "thig.6.1"):
        assert scripture_id not in pool, (worry, scripture_id)


def test_a_breakup_answer_never_quotes_a_verse_that_puts_the_writer_on_display() -> None:
    """/concern 을 실제로 부른다. stub 은 후보 1순위를 고르므로 후보가 곧 답이다.

    규칙을 걸기 전에 「어제 차였어요」에 dhp.344(「저 사람을 좀 보라」)가 실제 모델로
    세 번 중 세 번 나갔다. 마음 태그 칩이 부드러워진 바로 밑자리다.
    """
    worry = BREAKUP_WORRIES[1]
    client = TestClient(app)
    headers = {"X-Anon-Key": f"anon-{uuid.uuid4().hex}", "X-Timezone": "Asia/Seoul"}
    res = client.post(
        "/concern",
        json={"text": worry, "idempotencyKey": uuid.uuid4().hex},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["responseType"] == "answer"
    assert body["scriptures"]
    for card in body["scriptures"]:
        scripture = repo.by_id(card["id"])
        assert scripture is not None
        assert safety.allowed(scripture, {"breakup"}), card["id"]


def test_an_abuse_worry_answer_never_quotes_an_excluded_verse() -> None:
    """/concern 을 실제로 부른다. stub 은 후보 1순위를 고르므로 후보가 곧 답이다.

    이 글을 고른 이유가 있다. 안전 규칙을 끄고 순위만 매기면 1순위가 `an.2.33`
    (「어머니와 아버지에게는 갚기가 쉽지 않다」)이다. 아버지에게 맞고 자란 사람에게 그 문장을
    경전으로 내미는 답이 규칙 없이는 실제로 나간다.
    """
    worry = ABUSE_WORRIES[2]
    client = TestClient(app)
    headers = {"X-Anon-Key": f"anon-{uuid.uuid4().hex}", "X-Timezone": "Asia/Seoul"}
    res = client.post(
        "/concern",
        json={"text": worry, "idempotencyKey": uuid.uuid4().hex},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["responseType"] == "answer"
    assert body["scriptures"]
    quoted = {card["id"] for card in body["scriptures"]}
    assert "an.2.33" not in quoted
    for scripture_id in quoted:
        scripture = repo.by_id(scripture_id)
        assert scripture is not None
        assert safety.allowed(scripture, {"abuse_victim"}), scripture_id
