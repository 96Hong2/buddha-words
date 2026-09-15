"""경전 저장소.

문장은 사람이 감수한 것만 나간다. **모델이 경전 문장을 만들지 않는다.**
모델은 id 만 고르고 여기서 본문을 채운다.

시드는 `tools/build_scripture_seed.py` 가 감수본 마크다운에서 만든다. 손으로 고치지 않는다.
운영에서는 감수를 통과한 구절만 내보내고, 그런 구절이 하나도 없으면 기동에서 터진다.

귀속을 왜 따로 들고 있나
    「불교 문헌의 문장」과 「부처님의 직접 발언」은 다르다. 법구경은 전승상 부처의 가르침이지만
    어느 자리에서 한 말인지 화자가 특정되지 않고, 테리가타·승만경·선어록은 아예 다른 사람이
    말한다. 서비스 이름이 「부처의 말」이어도 화자를 부처로 바꾸지 않는다.
      speaker_kind  누가 말했나. buddha 일 때만 부처의 직접 발언이다
      text_type     직접 발언인가 발췌인가 합성인가. 합성·요약이 직접인용으로 보이면 안 된다
      attribution   화면에 그대로 나갈 귀속 문구
      review        감수 상태. 이것이 운영 문의 열쇠다
"""

from __future__ import annotations

import json
import math
import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.core.config import SCRIPTURE_POOL_ENV, get_settings

SEED = Path(__file__).resolve().parents[4] / "data" / "scriptures" / "seed.json"

# 모델에게 넘기는 후보 상한.
#
# 계획 02 원안은 규칙 점수로 5개까지 깎았고, 계획 00 이 그것을 뒤집었다.
# 「관련성을 못 보는 규칙이 관련성 판단자보다 먼저 후보를 깎는다」가 이유이고,
# 이 시드로 실제로 그렇게 된다. 불안 테마 110구절에 직장·생계 고민을 넣어 재 보니
# 손으로 고른 정답 13개 중 상한 5 로는 3개, 20 으로는 7개가 들어왔다.
# 나머지 6개는 어휘가 아예 안 겹쳐 0점이라 어떤 점수식으로도 못 올린다.
# 고민 글은 사건을 쓰고 retrieval_text 는 마음 상태를 써서 낱말이 만나지 않는다.
#
# 그래서 여기서 매기는 순위는 **관련성 판정이 아니라 자르는 순서**로만 쓴다.
# 20 은 계획 00 이 말한 12~20 의 위쪽이고, 프롬프트로 약 1,200토큰이다.
MAX_CANDIDATES = 20

# 한글은 두 글자부터, 영문은 세 글자부터 센다
_WORD = re.compile(r"[가-힣]{2,}|[A-Za-z]{3,}|\d+")


# 감수본에 나온 화자 종류. 부처의 직접 발언은 buddha 하나뿐이고,
# canonical_tradition 은 「전승상 부처의 가르침」이라 화자가 특정되지 않은 문헌이다
# 직접 인용 자리에 설 수 없는 글. 여러 곳을 이어 붙였거나(composite) 줄인 것(summary)이라
# 인용 부호 안에 넣으면 경전에 없는 문장을 경전이라고 적는 셈이 된다.
# 어디가 「직접 인용 자리」인지는 gate.py 머리말에 적어 두었다
INDIRECT_TEXT_TYPES = frozenset({"composite", "summary"})


SPEAKER_KINDS = (
    "buddha",
    "disciple",
    "nun",
    "monk",
    "lay_bodhisattva",
    "zen_master",
    "author",
    "deity",
    "unknown",
    "canonical_tradition",
)


@dataclass(frozen=True)
class Attribution:
    """화면에 그대로 나갈 귀속. 값을 조립하는 곳은 빌드 스크립트 하나다."""

    # speaker_kind 가 buddha 일 때만 참이다. 감수 통과가 이것을 참으로 만들지 않는다
    is_direct_buddha_speech: bool = False
    # 「— 부처, 상윳따 니까야 1:34」 · 「부처의 가르침 · 법구경 20장 282게」 같은 완성된 문자열
    display_label: str = ""


@dataclass(frozen=True)
class Review:
    """감수 상태와 근거. status 가 approved 인 것만 운영에 나간다."""

    status: str = "needs_review"
    reviewed_by: str = ""
    reviewed_at: str = ""
    evidence_note: str = ""


# 저본 문구. 원문 언어 두 갈래 × 감수 통과 여부 두 갈래다.
#
# 스텁 백엔드도 같은 규칙으로 같은 문장을 만든다(`frontend/src/shared/api/stubData.ts` 의
# `SOURCE_NOTES`). 두 곳이 갈라지면 e2e 가 두 파일을 나란히 읽어 잡는다.
_SOURCE_BASE = {
    # SuttaCentral 팔리 정본(Mahāsaṅgīti)을 읽고 Sujato 영역본(CC0)으로 뜻을 대조했다
    "pli": "팔리 원문을 저본으로 삼고 영역본으로 뜻을 대조해 한국어로 새로 옮긴 문장이에요.",
    # 육조단경·승만경·원효 같은 한문 문헌. 영역본을 거치지 않는다
    "zh": "고전 한문 원문을 저본으로 삼아 한국어로 새로 옮긴 문장이에요.",
}
_SOURCE_BASE_UNKNOWN = "원문을 저본으로 삼아 한국어로 새로 옮긴 문장이에요."
# 실제로 확인한 것만 적는다. 감수자가 본 것은 출처·화자·본문 유형·핵심 번역이다
_REVIEW_DONE = "외부 문헌 감수에서 출처와 화자를 확인했어요."
_REVIEW_PENDING = "문헌 감수는 아직 받지 않은 구절이에요."

# 원문 언어 → 화면에 붙일 이름
_ORIGINAL_LABEL = {"pli": "팔리 원문", "zh": "한문 원문"}


@dataclass(frozen=True)
class Scripture:
    id: str
    citation: str
    text: str
    modern_gloss: str
    themes: tuple[str, ...]
    daily_ok: bool
    daily_line: str
    terms: tuple[dict[str, str], ...] = ()
    # 「이 구절이 어울리는 상황」을 평서문으로 적어 둔 검색 전용 문단. 화면에 나가지 않는다
    retrieval_text: str = ""
    # 판본 라이선스를 아직 확인 못 한 구절(대승·선 문헌)에 needs_check 가 붙는다
    license_status: str | None = None
    # 출처. 어느 문헌의 어디를 어느 판본에서 무슨 언어로 옮겼나
    source_work: str = ""
    canonical_location: str = ""
    base_edition: str = ""
    source_language: str = ""
    # 팔리·한문 원문. 번역문 전체를 덮는 원문이 있을 때만 채워진다
    source_text: str = ""
    speaker_kind: str = "unknown"
    speaker_name: str = ""
    text_type: str = "excerpt"
    attribution: Attribution = Attribution()
    review: Review = Review()

    @property
    def reviewed(self) -> bool:
        """감수를 통과했나. 판정의 정본은 review.status 하나다."""
        return self.review.status == "approved"

    @property
    def display_attribution(self) -> str:
        """화면과 공유 카드가 그대로 그리는 귀속 한 줄.

        값을 만드는 곳은 시드 빌드(`tools/build_scripture_seed.py`) 하나다. 여기서 화자
        이름을 이어 붙이지 않는다. 조립을 시작하면 「부처의 말」이라는 제품 이름에 끌려
        남의 말이 부처의 말이 된다. 귀속이 비어 있으면 출처 한 줄로 물러선다.
        """
        return self.attribution.display_label or self.citation

    def source_note(self) -> str:
        """저본을 어떻게 옮겼고 감수를 받았는지 적는 한 문장.

        **화면이 이 문장을 짓지 않는다.** 화면이 지으면 한문 문헌 아래에 「영역본을 옮겼다」가
        붙는다. 실제로 그렇게 나가고 있었다. 육조단경·승만경·원효는 한문 원문에서 옮긴 글이라
        영역본을 거치지 않았다.

        가르는 것은 두 칸이다.
          source_language  팔리(pli)냐 한문(zh)이냐. 저본과 대조 과정이 다르다
          review.status    감수를 통과했나. 통과하지 못한 383구절에 감수 문구를 붙이지 않는다
        """
        base = _SOURCE_BASE.get(self.source_language, _SOURCE_BASE_UNKNOWN)
        return f"{base} {_REVIEW_DONE if self.reviewed else _REVIEW_PENDING}"

    def to_api(self) -> dict[str, object]:
        """화면이 받는 모양. `spec/answer.schema.json` 의 Scripture 를 벗어나지 않는다.

        여기가 **직접 경전 인용 자리**다. 답변 카드 · Extension · 위로 답변 · 원문 시트 ·
        공유카드가 전부 이 값을 받아 그린다. 합성글·요약글은 여기서 막는다. 후보 풀이
        기동에서 이미 걸러 내므로 평소에는 이 줄이 돌지 않지만, 풀을 지나지 않고 들어온
        구절이 있어도 화면으로는 못 나가게 한 겹 더 둔다.

        `attribution` 은 스키마가 닫혀 있어(`additionalProperties: false`) 오래 나가지
        못했다. 그래서 스텁에서는 화자가 뜨고 실제 서버에서는 안 뜨는 채로 있었다.
        스키마를 넓혀 두 화면이 같은 것을 내도록 했다.
        """
        if self.text_type in INDIRECT_TEXT_TYPES:
            raise RuntimeError(
                f"{self.id} 는 text_type={self.text_type} 이라 경전 인용으로 내보낼 수 없어요. "
                "합성·요약한 글은 경전 문장이 아닙니다."
            )
        out: dict[str, object] = {"id": self.id, "citation": self.citation, "text": self.text}
        if self.terms:
            out["terms"] = [dict(t) for t in self.terms]
        out["attribution"] = {"displayLabel": self.display_attribution}
        source = {
            "base": self.base_edition,
            # 우리가 원문을 보고 새로 옮긴 문장이다. 시판 번역서를 옮겨 오지 않았다
            "translator": "부처의 말 자체 번역",
            "note": self.source_note(),
        }
        if self.license_status == "needs_check":
            # 문장째로 보낸다. 화면이 「판본 확인 중」 같은 토막을 받아 말을 만들지 않게 한다
            source["license"] = "이 구절이 실린 판본의 이용 조건은 아직 확인하고 있어요."
        if self.source_text:
            # 원문이 실린 구절은 번역만 보여 주지 않는다. 라벨도 화면이 짓지 않게 같이 보낸다.
            # 공유 카드에는 싣지 않는다. 카드 글꼴에 한자가 없어 두부로 그려진다
            source["originalLabel"] = _ORIGINAL_LABEL.get(self.source_language, "원문")
            source["originalText"] = self.source_text
        out["source"] = {k: v for k, v in source.items() if v}
        return out


@lru_cache
def load_seed() -> tuple[Scripture, ...]:
    """감수 문을 지나기 전의 시드 전체."""
    raw = json.loads(SEED.read_text(encoding="utf-8"))
    return tuple(
        Scripture(
            id=item["id"],
            citation=item["citation"],
            text=item["text"],
            modern_gloss=item["modern_gloss"],
            themes=tuple(item["themes"]),
            daily_ok=bool(item["daily_ok"]),
            daily_line=item["daily_line"],
            terms=tuple(item.get("terms", ())),
            retrieval_text=item.get("retrieval_text", ""),
            license_status=item.get("license_status"),
            source_work=item.get("source_work", ""),
            canonical_location=item.get("canonical_location", ""),
            base_edition=item.get("base_edition", ""),
            source_language=item.get("source_language", ""),
            source_text=item.get("source_text", ""),
            speaker_kind=item.get("speaker_kind", "unknown"),
            speaker_name=item.get("speaker_name", ""),
            text_type=item.get("text_type", "excerpt"),
            attribution=Attribution(**item.get("attribution", {})),
            review=Review(**item.get("review", {})),
        )
        for item in raw["items"]
    )


def apply_review_gate(pool: tuple[Scripture, ...], environment: str) -> tuple[Scripture, ...]:
    """감수 통과분만 내보내는 문.

    운영은 감수분만 쓴다. 감수분이 하나도 없으면 빈 목록을 조용히 내보내지 않고 터뜨린다.
    local·dev 는 초안까지 전부 쓴다. 화면을 만들고 보는 데 감수를 기다리지 않는다.

    감수에서 빠진 구절(rejected)은 여기까지 오지 않는다. 시드의 items 밖으로 나가 있다.
    """
    if environment != "prod":
        return pool
    reviewed = tuple(s for s in pool if s.reviewed)
    if not reviewed:
        raise RuntimeError(
            "감수를 통과한 구절이 하나도 없어요. 운영에서는 초안을 내보내지 않습니다. "
            "data/scriptures/seed.json 의 reviewed 를 올린 뒤 배포해 주세요."
        )
    return reviewed


@lru_cache
def all_scriptures() -> tuple[Scripture, ...]:
    """존재하는 구절 전체. 운영에서는 감수 문을 지난 것만 남는다.

    `by_id` 와 「오늘의 부처의 말」이 여기를 읽는다. 검색 후보는 `retrieval_pool()` 이 따로 낸다.
    """
    return apply_review_gate(load_seed(), get_settings().environment)


def pool_mode() -> str:
    """지금 어느 풀로 도나. "approved" 또는 "draft" 다.

    정본은 `Settings.scripture_pool`(환경변수 `SCRIPTURE_POOL`) 하나다.
    기본값 auto 를 환경으로 푸는 자리는 그 설정의 `scripture_pool_mode` 다.
    """
    return get_settings().scripture_pool_mode


@lru_cache
def _retrieval_pool(mode: str, environment: str) -> tuple[Scripture, ...]:
    if mode == "draft":
        if environment == "prod":
            raise RuntimeError(
                f"{SCRIPTURE_POOL_ENV}=draft 는 운영에서 쓸 수 없어요. "
                "감수를 통과하지 않은 문장이 답변에 실립니다."
            )
        return load_seed()
    return tuple(s for s in load_seed() if s.reviewed)


def retrieval_pool() -> tuple[Scripture, ...]:
    """검색 후보가 되는 구절. **운영은 감수 통과분만, local·dev 는 초안까지 전부다.**

    한동안 어느 환경에서나 감수 통과 16구절만 썼다. 2026-09-15 검수에서 그 판이 무너졌다.
    화면은 경전 자리에 「이 고민과 닿아 있는 실제 가르침」이라고 **먼저 약속한다.** 16구절로는
    그 약속을 지킬 수 없다. 골든셋 26개 고민 중 **20개는 정답 구절이 16구절 안에 아예 없다.**
    닿는 구절이 없으니 늘 남는 것이 나가고, 실제로 이런 일이 벌어졌다.

      · 팀에서 겉도는 고민에 「개구리와 거북이도 하늘에 가야 할 것」이 세 번 중 두 번
      · 엄마를 잃고 자책하는 사람에게 「젊어서 닦지 않은 사람은 탄식한다」가 다섯 번 전부
      · 이별과 카드값에 똑같이 「모든 법은 자아가 아니다」

    실측(tools/eval 골든셋, 고민 26 · 정답 135쌍, 실제 `candidates()` 경로):

        후보 풀        Recall@5   Recall@20     MRR   상위20에 정답이 있는 고민
        399구절          0.380       0.658    0.827          26 / 26
        16구절           0.029       0.037    0.119           5 / 26

    안전 규칙을 넓히기 전에는 399구절이 0.390 · 0.684 였다. 내려간 만큼은 전부
    **골든셋이 정답이라 표시한 구절을 안전 규칙이 뺀 것**이고, 세 고민뿐이며 셋 다 빼는
    쪽이 맞다(아버지를 떠나보낸 사람에게 an.2.33 「어머니와 아버지에게는 갚기가 쉽지
    않다」 등). 골든셋은 주제가 맞는가만 재는 자라, 그 사람의 상태에 붙여도 되는가는
    보지 않는다. 두 자가 어긋날 때는 안전 규칙이 이긴다. 자세한 것은 계획 02 의 5-2-4.

    앞 회차가 16구절로 묶어 두며 적어 둔 우려 셋을 이렇게 다룬다.

    1. 미감수가 화면에 나간다
       → 운영에는 못 나간다. prod 는 `auto` 가 approved 로 풀리고, `draft` 를 골라도
         `_guard`(core/config.py)와 이 함수가 두 겹으로 기동을 멈춘다. 나가는 곳은
         local·dev 뿐이고, 거기서도 기동 로그와 `/health` 가 초안이 섞였다고 말한다.
    2. 개발과 운영이 다른 구절로 돈다
       → `SCRIPTURE_POOL=approved` 한 줄로 개발에서도 운영과 같은 16구절 판을 본다.
         기동 로그가 지금 어느 판인지 늘 적으므로 무엇을 보고 있는지 헷갈릴 자리가 없다.
    3. 안전 규칙이 미감수 383구절에 검증된 적 없다
       → 이것만은 스위치로 못 덮어서 규칙 쪽을 고쳤다. 안전 규칙은 감수 여부와 무관하게
         **399구절 전체에 걸린다.** 실제로 초안에서 새던 구절이 있었다(학대 고민에 「거친
         말을 견디겠다」 dhp.320, 사별 고민에 「울고 슬퍼한다고 마음이 고요해지지 않는다」
         an.5.49). safety.BY_CONTENT 에 근거와 함께 막아 두었고, 기동 게이트
         `check_every_flag_bites` 는 풀 모드와 상관없이 시드 399구절로 잰다.
    """
    return _retrieval_pool(pool_mode(), get_settings().environment)


def by_id(scripture_id: str) -> Scripture | None:
    return _index().get(scripture_id)


@lru_cache
def _index() -> dict[str, Scripture]:
    return {s.id: s for s in all_scriptures()}


# ────────────────────────────────────────────────────────────────────────────
# 후보 검색. 어휘 + 벡터 하이브리드다.
# 계획 02 D5 의 「임베딩을 쓰지 않는다」는 2026-09-15 에 뒤집혔다.
# 뒤집은 근거인 실측표는 아래 _W_LEXICAL 주석에 있다.
# ────────────────────────────────────────────────────────────────────────────


def _words(text: str) -> tuple[str, ...]:
    """글에서 낱말만 뽑는다. 점수를 세는 단위다."""
    return tuple(_WORD.findall(text.lower()))


def _chips(word: str) -> frozenset[str]:
    """낱말이 만드는 열쇠. **앞에서 자른 토막만** 쓴다.

    한국어는 어간이 앞에 오고 조사·어미가 뒤에 붙는다. 그래서 앞에서 자르면
    「대출이」와 「대출과」가 「대출」로 만나고, 「힘들어요」와 「힘들고」가 「힘들」로 만난다.

    가운데·뒤 토막까지 만들면 안 된다. 「구조조정이」가 「정이」를 만들어 돈 이야기 구절에
    가짜로 걸리는 일이 실제로 있었다. 꼬리 토막은 뜻을 담지 않는데 점수만 만든다.
    """
    if len(word) < 2:
        return frozenset({word})
    return frozenset(word[:i] for i in range(2, len(word) + 1))


def _tokens(text: str) -> frozenset[str]:
    """문서 색인. 그 글이 가진 모든 열쇠를 한 자루에 담는다."""
    out: set[str] = set()
    for word in _words(text):
        out |= _chips(word)
    return frozenset(out)


def _corpus() -> tuple[str, ...]:
    """점수를 매기는 바탕. 후보 풀 전체다.

    테마나 안전 규칙으로 걸러 낸 부분집합이 아니라 풀 전체로 idf 를 낸다. 흔한 낱말인지는
    말뭉치가 정하는 것이지, 이번 요청에서 몇 개가 남았는지가 정할 일이 아니다.
    """
    return tuple(s.id for s in retrieval_pool())


@lru_cache
def _doc_tokens(corpus: tuple[str, ...]) -> dict[str, frozenset[str]]:
    index = _index()
    return {i: _tokens(index[i].retrieval_text) for i in corpus if i in index}


@lru_cache
def _idf(corpus: tuple[str, ...]) -> dict[str, float]:
    """흔한 조각이 순위를 먹지 않게 희소한 낱말에 무게를 준다.

    BM25 식이라 「상황」처럼 문서 절반에 나오는 조각은 0 에 수렴한다.
    앞서 쓰던 `log(N/(1+df)) + 1.0` 은 하한 1.0 탓에 df 211 인 「상황」도 1.63 을 받아,
    조각 네 개만 겹치면 진짜 내용어 하나를 이겼다.
    """
    docs = _doc_tokens(corpus)
    total = len(docs) or 1
    freq = Counter(tok for toks in docs.values() for tok in toks)
    return {tok: math.log(1 + (total - n + 0.5) / (n + 0.5)) for tok, n in freq.items()}


# 낱말이 통째로 같지 않고 앞 토막만 걸렸을 때 곱하는 값.
# 「대출이 ~ 대출과」는 뜻이 같지만 「밤마다 ~ 밤샘」처럼 어긋나는 것도 같은 자리로 들어온다
_PARTIAL = 0.6


def _score(query_words: tuple[str, ...], scripture_id: str, corpus: tuple[str, ...]) -> float:
    """겹친 **낱말마다 한 번씩만** 점수를 준다.

    한 낱말이 만든 토막 수로 가산하면 그 낱말 하나가 여러 몫을 벌어 순위를 혼자 뒤집는다.
    재 보니 「가라앉지」 한 낱말이 토막 넷으로 17.9점을 만들어, 같은 낱말이 한 번만 걸린
    다른 구절을 눌렀다. 몇 조각으로 쪼개지느냐가 순위를 정하면 그건 검색이 아니다.
    그래서 낱말 단위로 가장 희소한 열쇠 하나만 센다.

    길이 보정은 넣지 않는다. 재 보니 이 데이터에서 긴 `retrieval_text` 는 군더더기가 아니라
    들어맞는 상황을 더 많이 적어 둔 것이라, 길다고 깎으면 맞는 구절이 밀려났다.
    """
    idf = _idf(corpus)
    doc = _doc_tokens(corpus).get(scripture_id, frozenset())
    if not doc:
        return 0.0
    total = 0.0
    for word in dict.fromkeys(query_words):
        hit = _chips(word) & doc
        if not hit:
            continue
        best = max(idf.get(tok, 0.0) for tok in hit)
        total += best if word in doc else best * _PARTIAL
    return total


# 두 순위를 합치는 자리. 점수를 더하지 않고 **순위**를 더한다(RRF).
# 어휘 점수와 코사인 유사도는 단위가 달라 그대로 더하면 한쪽이 다른 쪽을 삼킨다.
_RRF_K = 60

# 어휘에 무게를 더 준다. 26개 고민으로 실측한 값이다(tools/eval).
#   어휘만          R@5 0.390 · R@20 0.623 · MRR 0.688
#   벡터만          R@5 0.287 · R@20 0.578 · MRR 0.618   어휘보다 나쁘다
#   어휘1 벡터1     R@5 0.374 · R@20 0.695 · MRR 0.804
#   어휘2 벡터1     R@5 0.410 · R@20 0.691 · MRR 0.860   ← 이것
# 벡터 혼자로는 어휘를 못 이기는데 합치면 둘 다 넘는다. 서로 다른 것을 놓치기 때문이다.
_W_LEXICAL = 2.0
_W_VECTOR = 1.0


def _rrf(rankings: list[tuple[list[str], float]]) -> list[str]:
    """순위가 높을수록 큰 몫을 받는다. 두 목록에 다 든 구절이 위로 올라온다."""
    score: dict[str, float] = {}
    for ranked, weight in rankings:
        for position, scripture_id in enumerate(ranked):
            score[scripture_id] = score.get(scripture_id, 0.0) + weight / (_RRF_K + position + 1)
    return sorted(score, key=lambda i: (-score[i], i))


def candidates(
    theme: str,
    limit: int = MAX_CANDIDATES,
    query: str = "",
    query_vector: list[float] | None = None,
    contexts: Iterable[str] = (),
) -> tuple[Scripture, ...]:
    """모델에게 넘길 후보. 모델은 이 목록 밖의 id 를 고를 수 없다.

    감수 문 → 안전 규칙 → 테마 → 순위 차례로 좁힌다. `contexts` 는 고민 글에서 판정한
    상태(학대 · 자책 · 자기 가치 훼손 …)이고, 거기 걸린 구절은 **모델이 보기 전에** 빠진다.
    프롬프트로 「이럴 때는 쓰지 마세요」라고 적는 것과 다른 층이다. 프롬프트만 믿으면 뚫린다.

    테마로 거른 뒤 두 가지로 순위를 매겨 합친다.

    · 어휘: 고민 글과 `retrieval_text` 가 겹치는 낱말. 고유명사와 정확한 말에 강하다.
    · 벡터: 미리 계산해 둔 구절 임베딩과의 거리. 낱말이 안 겹쳐도 뜻이 닿으면 잡는다.

    벡터가 필요한 이유는 실측으로 나왔다. 고민 글은 사건을 쓰고(구조조정 · 월세 · 대출)
    `retrieval_text` 는 마음 상태를 써서(불안 · 최악을 상상) 낱말이 만나지 않는 짝이 많다.
    `query_vector` 가 없으면 어휘만으로 간다. 답이 덜 맞을 뿐 화면은 그대로 돈다.

    여기서 매기는 순위는 **자르는 기준이지 답이 아니다.** 계획 00 이 「관련성을 못 보는
    규칙이 관련성 판단자보다 먼저 후보를 깎는다」를 경계했으므로, 자를 개수를 넉넉히 두고
    고르는 일은 2차 패스 모델에 맡긴다.
    """
    from app.domains.scripture import safety

    keys = frozenset(contexts)
    base = safety.filter_pool(retrieval_pool(), keys)
    if not base:
        # 상태가 겹쳐 후보가 다 빠졌다. 맞지도 않는 구절을 대신 내보내지 않고 멈춘다.
        # 기동 검사(gate.check_safety_leaves_candidates)가 먼저 막으므로 평소에는 안 온다
        raise RuntimeError(f"안전 규칙 {sorted(keys)} 에 걸려 후보가 하나도 남지 않았어요.")
    matched = tuple(s for s in base if theme in s.themes)
    pool = matched or base
    ids = [s.id for s in pool]
    index = _index()
    if not query and not query_vector:
        # 고민 글 없이 테마만으로 부르는 자리(위로 답변)다. 순위는 없지만 1순위 규칙은 있다.
        # 여기서 나온 한 구절이 그대로 화면에 실리므로 출가 문맥 구절을 맨 앞에 두지 않는다
        order = safety.demote_monastic(ids, query, by_id)
        return tuple(index[i] for i in order[:limit] if i in index)

    corpus = _corpus()
    rankings: list[tuple[list[str], float]] = []
    if query:
        query_words = _words(query)
        rankings.append(
            (sorted(ids, key=lambda i: (-_score(query_words, i, corpus), i)), _W_LEXICAL),
        )
    if query_vector:
        from app.domains.scripture import vectors

        if vectors.available():
            rankings.append((vectors.ranked(query_vector, ids), _W_VECTOR))

    if len(rankings) == 1:
        order = rankings[0][0]
    else:
        order = _rrf(rankings)
    # 출가 수행 문맥 구절을 맨 앞자리에서만 내린다. 목록에서 빼지는 않는다
    order = safety.demote_monastic(order, query, by_id)
    return tuple(index[i] for i in order[:limit] if i in index)


def whitelist(ids: list[str], allowed: tuple[Scripture, ...]) -> list[Scripture]:
    """모델이 고른 id 를 후보 안에서만 받는다. 밖의 id 는 버린다."""
    allowed_ids = {s.id for s in allowed}
    return [s for s in (by_id(i) for i in ids if i in allowed_ids) if s is not None]


def daily(date_iso: str) -> Scripture:
    """같은 날에는 같은 구절. 사용자와 무관하다.

    여기도 직접 경전 인용 자리라 합성글·요약글은 뽑지 않는다(`INDIRECT_TEXT_TYPES`).

    검색 후보와 달리 감수 문(`all_scriptures`)을 그대로 쓴다. 운영에서는 감수 통과분만
    남고, local·dev 에서는 초안까지 돈다. 「오늘의 부처의 말」은 모델에 들어가지 않고 하루에
    한 줄 나가는 자리라, 개발 화면이 날마다 같은 카드를 보여 주지 않게 두었다.
    """
    pool = tuple(
        s for s in all_scriptures() if s.daily_ok and s.text_type not in INDIRECT_TEXT_TYPES
    )
    if not pool:
        raise RuntimeError("daily_ok 인 구절이 없어요. 시드를 확인해 주세요.")
    digest = 2166136261
    for ch in date_iso:
        digest ^= ord(ch)
        digest = (digest * 16777619) & 0xFFFFFFFF
    return pool[digest % len(pool)]


# 기동에서 한 번 읽는다. 시드가 없거나 감수 문에 막히면 첫 요청 500 이 아니라 기동 실패로 드러난다
all_scriptures()
