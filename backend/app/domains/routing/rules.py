r"""입력 라우터 1층(rules). spec/router.ts 를 한 줄씩 그대로 옮긴 것이다.

고민 입력을 다섯 갈래로 나눈다. light · normal · deep · invalid · crisis.
길이 하나로 판정하지 않는다. 「ㅋㅋㅋㅋ」를 열 줄 써도 light 이고,
「남편이 다른 사람을 만나는 것 같아요. 이혼해야 할까요?」는 짧아도 normal 이상이다.

1층 rules 는 결정론이다. invalid · crisis 후보 · light 후보 · 승격 바닥(floor)을 정한다.
2층 classifier 는 값싼 모델 한 번으로 light/normal/deep 을 가르고 crisis 후보를 확정한다.

표준 re 로는 안 되는 것이 둘이라 regex 패키지를 쓴다.
  · \p{Extended_Pictographic} 같은 유니코드 속성
  · segments 의 가변 길이 lookbehind
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass, replace
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

import regex

InputRoute = Literal["light", "normal", "deep", "invalid", "crisis", "solace"]
"""crisis 의 결. acute 는 모델을 부르지 않는다"""
CrisisLevel = Literal["acute", "distress"]
ModelTier = Literal["none", "cheap", "standard", "premium"]
Stage = Literal["rules", "classifier", "fallback"]


@dataclass
class RouteFlags:
    minor: bool  # 글쓴이가 미성년자로 보인다 → 위기 창구에 1388 을 올린다
    abuse: bool  # 폭력·학대 정황 → 1366·112, excluded_for: abuse_victim
    low_entropy: bool  # 같은 글자 반복으로 길이를 채웠다
    injection: bool  # 시스템 프롬프트 요청·지시 우회 시도


@dataclass
class RouteCounts:
    chars: int
    lines: int
    segments: int
    unique_ratio: float


@dataclass
class RouteDecision:
    route: InputRoute
    confidence: float  # 0~1
    reasons: list[str]  # 판정 근거 코드. 로그에 그대로 싣는다(원문은 싣지 않는다)
    use_rag: bool  # 경전 검색을 돌리나
    model_tier: ModelTier  # 실제 모델 id 는 배포 산출물이 정한다. 여기서는 등급만
    stage: Stage
    flags: RouteFlags
    counts: RouteCounts
    floor: InputRoute | None  # rules 가 정한 바닥. classifier 는 이 아래로 내리지 못한다
    hints: list[str]  # classifier 에게 넘길 힌트. 사용자에게 보이지 않는다
    crisis_level: CrisisLevel | None  # crisis 일 때만 채운다. acute 는 승격이 거부된다


@dataclass
class ClassifierVerdict:
    """classifier(2층)가 돌려주는 값. 스키마 strict. 본문을 쓰지 않는다"""

    route: Literal["light", "normal", "deep", "crisis", "invalid"]
    confidence: float
    reasons: list[str]
    minor: bool
    abuse: bool


# ────────────────────────────────────────────────────────────────────────────
# 정규화와 세기
# ────────────────────────────────────────────────────────────────────────────

COUNTABLE = regex.compile(r"[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9]")

_CRLF = regex.compile(r"\r\n?")
_INVISIBLE = regex.compile("[\u00a0\u200b-\u200d\ufeff]")
_INLINE_SPACE = regex.compile(r"[ \t]+")
_BLANK_LINES = regex.compile(r"\n{2,}")
_WHITESPACE = regex.compile(r"\s")


def normalize(raw: str) -> str:
    text = unicodedata.normalize("NFC", raw)
    text = _CRLF.sub("\n", text)
    text = _INVISIBLE.sub(" ", text)
    text = _INLINE_SPACE.sub(" ", text)
    text = _BLANK_LINES.sub("\n", text)
    return text.strip()


def count_chars(text: str) -> int:
    return len(COUNTABLE.findall(text))


_DECIMAL_POINT = regex.compile(r"(\d)\.(\d)")
# 가변 길이 lookbehind({1,2})라 표준 re 로는 컴파일되지 않는다
_SENTENCE_BREAK = regex.compile(r"(?<=[.!?。？！])(?![’”'\"」』)\]])\s*|(?<=[…‥]{1,2})\s+")


def segments(text: str) -> list[str]:
    """줄바꿈 1차, 종결 기호 2차.

    닫는 따옴표 앞과 소수점은 끊지 않는다. 6자 미만 조각은 세지 않는다.
    """
    guarded = _DECIMAL_POINT.sub("\\1\u2024\\2", text)
    out: list[str] = []
    for line in guarded.split("\n"):
        for piece in _SENTENCE_BREAK.split(line):
            cleaned = piece.replace("\u2024", ".").strip()
            if count_chars(cleaned) >= 6:
                out.append(cleaned)
    return out


def _utf16_length(text: str) -> int:
    """JS 의 String.length 와 같게 UTF-16 코드 단위로 센다"""
    return len(text.encode("utf-16-le")) // 2


def _unique_ratio(text: str) -> float:
    body = _WHITESPACE.sub("", text)
    if not body:
        return 0
    return len(set(body)) / _utf16_length(body)


def _to_fixed2(value: float) -> float:
    """JS 의 Number(x.toFixed(2)) 와 같게 반올림한다"""
    return float(Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


# ────────────────────────────────────────────────────────────────────────────
# 사전. 전부 어간 기준. 제외 패턴을 먼저 본다.
# ────────────────────────────────────────────────────────────────────────────

# 위기: 하나라도 맞으면 crisis 후보. 강한 패턴(STRONG)은 classifier 없이 확정
CRISIS_STRONG = [
    regex.compile(r"자살(하|할|하고|생각|계획|시도)"),
    regex.compile(r"목숨을?\s?끊"),
    regex.compile(r"죽어버리(고|겠|려)"),
    regex.compile(r"죽을(래|거야|게요|거예요)"),
    regex.compile(r"뛰어내리(고|려|겠)"),
    regex.compile(r"목을?\s?매"),
    regex.compile(r"번개탄"),
    regex.compile(r"수면제.{0,6}(모으|모아|털)"),
    regex.compile(r"유서"),
    regex.compile(r"손목.{0,4}(긋|그어)"),
    regex.compile(r"자해(하|했|를|를 했)"),
    regex.compile(r"죽여버리(고|겠)"),
    regex.compile(r"다\s?죽이"),
]
CRISIS_SOFT = [
    regex.compile(r"죽고\s?싶"),
    regex.compile(r"살아있기\s?싫"),
    regex.compile(r"사라지고\s?싶"),
    regex.compile(r"살기\s?싫"),
    regex.compile(r"없어지고\s?싶"),
    regex.compile(r"세상.{0,4}떠나고\s?싶"),
]
# 방법·수단을 찾는 물음. 걸리면 무조건 acute 라서 어떤 경로로도 모델에 닿지 않는다.
# 「소설이다 · 참고용이다」 같은 우회 전제를 붙여도 같은 자리에서 걸린다.
CRISIS_METHOD = [
    regex.compile(r"(어떻게|어떤|무슨|무엇|뭘|뭐로|방법|수단).{0,10}(죽|자살|자해)"),
    regex.compile(r"(죽는|자살|자해|목매|목\s?매).{0,4}(방법|법|수단|요령)"),
    regex.compile(r"(먹으면|마시면|하면).{0,6}(죽|안\s?깨)"),
    regex.compile(r"몇\s?(알|정|개).{0,8}(죽|위험|치사)"),
    regex.compile(r"치사(량|율)"),
    regex.compile(r"(안\s?아프게|고통\s?없이|편하게).{0,8}(죽|가는)"),
]
# 관용 표현. 위기 사전보다 먼저 본다
CRISIS_EXCLUDE = [
    regex.compile(r"때려치우|때려치고"),
    regex.compile(r"죽겠(다|어|네|어요)"),
    regex.compile(r"죽을\s?만큼"),
    regex.compile(r"죽는\s?줄"),
    regex.compile(r"죽을\s?것\s?같"),
    regex.compile(r"죽도록"),
    regex.compile(r"(배고파|더워|추워|웃겨|귀찮아|힘들어|피곤해|졸려|심심해).{0,3}죽"),
]

# 학대·폭력 정황. abuse 플래그 → excluded_for 에 걸린 구절을 후보에서 뺀다
ABUSE = [
    regex.compile(r"맞았|때린|때려요|때렸"),
    regex.compile(r"폭행|폭력"),
    regex.compile(r"성폭행|성추행|성희롱"),
    regex.compile(r"몰카|스토킹|감금"),
    regex.compile(r"굶기|학대"),
]
MINOR = [regex.compile(r"담임|야자|수능|내신|중학교|고등학교|학원|교복|급식|학교에서")]

# 짧아도 가볍게 답할 수 없는 주제. floor = normal. classifier 가 deep 으로 올릴 수 있다
TOPIC_FLOOR = [
    regex.compile(r"바람(피|났|난)|외도|불륜|다른\s?사람을\s?만나"),
    regex.compile(r"이혼|별거|파혼"),
    regex.compile(r"헤어지|이별|차였|결별"),
    regex.compile(r"배신|속였"),
    regex.compile(r"돌아가셨|사망|장례|세상을\s?떠|유산(했|됐)"),
    regex.compile(r"해고|잘렸|권고사직|폐업|파산|부도"),
    regex.compile(r"시한부|암\s?진단|진단받았"),
    regex.compile(r"사산|난임"),
    regex.compile(r"괴롭힘|왕따|따돌림|갑질"),
]

# 프롬프트 인젝션·시스템 요청. invalid 로 보낸다
INJECTION = [
    regex.compile(r"(시스템|system)\s?(프롬프트|prompt)", regex.I),
    regex.compile(r"ignore\s+(all\s+)?(previous|above)", regex.I),
    regex.compile(r"(지시|명령).{0,6}(무시|잊)"),
    regex.compile(r"너의?\s?(설정|규칙|지침).{0,6}(알려|출력|보여)"),
    regex.compile(r"developer\s?mode", regex.I),
    regex.compile(r"jailbreak", regex.I),
    regex.compile(r"역할.{0,4}(바꿔|변경).{0,8}(답|출력)"),
]

# 가벼운 입력. light 후보. 진지한 고민이 섞이면 classifier 가 normal 로 올린다
LIGHT_TOPICS = [
    regex.compile(r"(점심|저녁|아침|야식).{0,6}(뭐|무엇).{0,4}먹"),
    regex.compile(r"뭐\s?먹(지|을까)"),
    regex.compile(r"(오늘|주말|이번\s?주).{0,4}뭐\s?하지"),
    regex.compile(r"심심(해|하다|함)"),
    regex.compile(r"로또|복권.{0,6}번호"),
    regex.compile(r"(부처|부처님|너).{0,6}(잘생|예쁘|진짜|누구|몇\s?살|사람이야|AI야)"),
    regex.compile(r"(여자|남자)\s?친구.{0,6}(만들|생기|사귀)고\s?싶"),
    regex.compile(r"돈.{0,4}(많이)?\s?벌고\s?싶"),
    regex.compile(r"출근(하기)?\s?싫"),
    regex.compile(r"회사\s?때려\s?(칠|치)"),
]
LAUGH_ONLY = regex.compile(r"^[ㅋㅎㅠㅜㅡ!?.~\s]+$")
EMOJI_ONLY = regex.compile(r"^[\p{Extended_Pictographic}\p{Emoji_Component}\s]+$")

_JAMO_ONLY = regex.compile(r"^[ㄱ-ㅎㅏ-ㅣ\s]+$")
_LATIN_ONLY = regex.compile(r"^[a-zA-Z0-9\s]+$")
_FEELING = regex.compile(
    r"(힘들|우울|불안|외로|화가|짜증|스트레스|무서|눈물|슬프|미치겠|답답|서럽|억울|자존감|고민)"
)

_LATIN_WORD = regex.compile(r"[a-z]{3,}")
_HAS_VOWEL = regex.compile(r"[aeiou]")
_CONSONANT_RUN = regex.compile(r"[bcdfghjklmnpqrstvwxz]{4,}")
_VOWEL_RUN = regex.compile(r"[aeiou]{3,}")


def _matches_any(patterns: list[regex.Pattern[str]], text: str) -> bool:
    return any(p.search(text) for p in patterns)


def _latin_looks_random(text: str) -> bool:
    """영문 토큰이 단어 꼴인지. 모음이 없거나 자음 4연속·모음 3연속이면 자판 두드림으로 본다"""
    tokens = [t for t in _WHITESPACE.split(text.lower()) if _LATIN_WORD.search(t)]
    if not tokens:
        return True
    noisy = len(
        [
            t
            for t in tokens
            if not _HAS_VOWEL.search(t) or _CONSONANT_RUN.search(t) or _VOWEL_RUN.search(t)
        ]
    )
    return noisy / len(tokens) >= 0.5


# ────────────────────────────────────────────────────────────────────────────
# 1층 · rules
# ────────────────────────────────────────────────────────────────────────────

TIER: dict[str, ModelTier] = {
    "invalid": "none",
    "crisis": "none",
    "light": "cheap",
    "normal": "cheap",
    "deep": "premium",
    # 위로 답변은 분석이 아니라 문장의 결이 전부라 값싼 등급으로 내리지 않는다
    "solace": "standard",
}
RAG: dict[str, bool] = {
    "invalid": False,
    "crisis": False,
    "light": False,
    "normal": True,
    "deep": True,
    "solace": True,
}


def _decide(route: InputRoute, stage: Stage, confidence: float, base: dict) -> RouteDecision:
    return RouteDecision(
        route=route,
        confidence=confidence,
        reasons=base["reasons"],
        use_rag=RAG[route],
        model_tier=TIER[route],
        stage=stage,
        flags=base["flags"],
        counts=base["counts"],
        floor=base["floor"],
        hints=base["hints"],
        crisis_level=base["crisis_level"],
    )


def _base_of(d: RouteDecision, **overrides) -> dict:
    """TS 의 `{ ...rules, ... }` 자리. route·stage·confidence 는 _decide 가 다시 정한다"""
    base = {
        "reasons": d.reasons,
        "flags": d.flags,
        "counts": d.counts,
        "floor": d.floor,
        "hints": d.hints,
        "crisis_level": d.crisis_level,
    }
    base.update(overrides)
    return base


def route_by_rules(raw: str) -> RouteDecision:
    text = normalize(raw)
    chars = count_chars(text)
    lines = len([line for line in text.split("\n") if line.strip()]) if text else 0
    segs = len(segments(text))
    uniq = _unique_ratio(text)
    counts = RouteCounts(chars=chars, lines=lines, segments=segs, unique_ratio=_to_fixed2(uniq))
    compact = _WHITESPACE.sub("", text)

    reasons: list[str] = []
    hints: list[str] = []
    flags = RouteFlags(
        minor=_matches_any(MINOR, text),
        abuse=_matches_any(ABUSE, text),
        low_entropy=chars >= 40 and uniq < 0.18,
        injection=_matches_any(INJECTION, text),
    )
    base: dict = {
        "reasons": reasons,
        "flags": flags,
        "counts": counts,
        "floor": None,
        "hints": hints,
        "crisis_level": None,
    }

    # 1. 웃음·이모지만 → 가벼운 답. 빈 입력·기호만 → invalid
    if text and (LAUGH_ONLY.fullmatch(text) or EMOJI_ONLY.fullmatch(text)):
        reasons.append("laugh_or_emoji_only")
        return _decide("light", "rules", 0.95, base)
    if chars == 0:
        reasons.append("empty_or_symbols")
        return _decide("invalid", "rules", 0.99, base)
    # 2. 인젝션
    if flags.injection:
        reasons.append("injection_pattern")
        return _decide("invalid", "rules", 0.95, base)
    # 3. 위기. 제외 패턴을 먼저 본다. 제외에 걸려도 힌트는 남긴다
    excluded = any(p.search(compact) or p.search(text) for p in CRISIS_EXCLUDE)
    method = _matches_any(CRISIS_METHOD, compact)
    strong = _matches_any(CRISIS_STRONG, compact)
    soft = _matches_any(CRISIS_SOFT, compact)
    # 방법을 묻는 글은 관용 표현 제외를 적용하지 않는다
    if method:
        reasons.append("crisis_method")
        base["crisis_level"] = "acute"
        return _decide("crisis", "rules", 0.97, base)
    if not excluded and strong:
        reasons.append("crisis_strong")
        base["crisis_level"] = "acute"
        return _decide("crisis", "rules", 0.9, base)
    if (strong or soft) and excluded:
        hints.append("crisis_pattern_but_idiom")
    if not excluded and soft:
        reasons.append("crisis_soft")
        hints.append("crisis_candidate")
        base["floor"] = "normal"
        base["crisis_level"] = "distress"
        # 확정은 classifier. rules 임시 판정은 crisis 로 두어 분류 실패 시 안전한 쪽으로 간다
        return _decide("crisis", "rules", 0.6, base)
    # 5. 무의미한 반복·랜덤 문자열
    if flags.low_entropy:
        reasons.append("low_entropy")
        return _decide("invalid", "rules", 0.85, base)
    jamo_only = bool(_JAMO_ONLY.fullmatch(text))
    latin_noise = bool(_LATIN_ONLY.fullmatch(text)) and chars >= 8 and _latin_looks_random(text)
    if jamo_only or latin_noise:
        reasons.append("random_string")
        return _decide("invalid", "rules", 0.85, base)
    # 6. 주제 승격 바닥. 짧아도 가볍게 답하지 않는다
    if _matches_any(TOPIC_FLOOR, text):
        reasons.append("topic_floor")
        base["floor"] = "normal"
        hints.append("serious_topic")
        # deep 여부는 맥락(이해관계·의사결정·구체성)을 classifier 가 본다. 길이가 아니다
        long_enough = chars >= 120 or (lines >= 3 and chars >= 40)
        provisional: InputRoute = "deep" if long_enough else "normal"
        return _decide(provisional, "rules", 0.55, base)
    if flags.abuse:
        base["floor"] = "normal"
        hints.append("abuse_context")
    # 7. 가벼운 주제
    if _matches_any(LIGHT_TOPICS, text) and chars < 60:
        reasons.append("light_topic")
        return _decide("light", "rules", 0.8, base)
    # 8. 아주 짧고 문장이 하나면 light 후보. 단 감정어가 있으면 normal 후보
    feeling = bool(_FEELING.search(text))
    if chars < 15 and not feeling:
        reasons.append("very_short_no_feeling")
        return _decide("light", "rules", 0.6, base)
    # 9. 나머지는 classifier 몫. rules 임시 판정은 길이·줄 수로 normal/deep 후보만 낸다
    reasons.append("needs_classifier")
    long_enough = chars >= 120 or (lines >= 3 and chars >= 40)
    provisional = "deep" if long_enough else "normal"
    hints.append("length_suggests_deep" if provisional == "deep" else "length_suggests_normal")
    return _decide(provisional, "rules", 0.5, base)


# ────────────────────────────────────────────────────────────────────────────
# 합치기 · rules + classifier
# ────────────────────────────────────────────────────────────────────────────

ORDER: list[str] = ["light", "normal", "deep"]


def _index_of(route: str | None) -> int:
    """TS 의 Array.indexOf. 목록에 없으면 -1"""
    return ORDER.index(route) if route in ORDER else -1


def needs_classifier(d: RouteDecision) -> bool:
    """rules 가 확정한 것은 classifier 를 부르지 않는다"""
    return d.stage == "rules" and d.confidence < 0.8


def merge(rules: RouteDecision, verdict: ClassifierVerdict | None) -> RouteDecision:
    if not needs_classifier(rules):
        return rules
    flags = RouteFlags(
        minor=rules.flags.minor or (verdict.minor if verdict else False),
        abuse=rules.flags.abuse or (verdict.abuse if verdict else False),
        low_entropy=rules.flags.low_entropy,
        injection=rules.flags.injection,
    )
    if verdict is None:
        # 분류 실패. 위기 후보는 위기로, 나머지는 normal 로 내려 답변은 나가게 한다
        route: InputRoute = "crisis" if rules.route == "crisis" else "normal"
        return _decide(
            route,
            "fallback",
            0.4,
            _base_of(rules, flags=flags, reasons=[*rules.reasons, "classifier_failed"]),
        )
    reasons = [*rules.reasons, *(f"clf:{r}" for r in verdict.reasons)]
    # crisis 는 어느 층이든 올리면 올라간다.
    # 내리는 것은 rules 가 crisis_soft 였고 classifier 가 none 일 때만
    if verdict.route == "crisis":
        # rules 가 acute 로 못박았으면 그대로 둔다. classifier 가 새로 올린 것은 distress 로 받는다
        level: CrisisLevel = "acute" if rules.crisis_level == "acute" else "distress"
        return _decide(
            "crisis",
            "classifier",
            max(verdict.confidence, 0.7),
            _base_of(rules, flags=flags, reasons=reasons, crisis_level=level),
        )
    if rules.route == "crisis" and rules.floor == "normal" and verdict.confidence < 0.6:
        # 확신 없는 「관용 표현」 판정은 믿지 않는다. 안전한 쪽으로 남긴다
        return _decide(
            "crisis",
            "classifier",
            0.6,
            _base_of(rules, flags=flags, reasons=[*reasons, "crisis_kept_low_confidence"]),
        )
    # invalid 는 rules 만 정한다. classifier 가 invalid 라고 해도 light 로 받아 캐릭터 답변을 준다
    route = "light" if verdict.route == "invalid" else verdict.route
    # deep 은 확신이 있어야 한다. 길이 때문에 올라간 deep 은 classifier 가 낮게 보면 normal
    if route == "deep" and verdict.confidence < 0.6:
        route = "normal"
        reasons.append("deep_low_confidence")
    # 승격 바닥
    if rules.floor and _index_of(route) < _index_of(rules.floor):
        route = rules.floor
        reasons.append("floor_applied")
    return _decide(
        route, "classifier", verdict.confidence, _base_of(rules, flags=flags, reasons=reasons)
    )


def escalate_to_solace(d: RouteDecision) -> RouteDecision | None:
    """위기 안내를 본 사람이 「그래도 이야기를 들어주세요」를 눌렀을 때만 부른다.

    distress 만 통과한다. acute 는 여기서 막히므로 방법·수단을 물은 글은 모델에 닿지 않는다.
    통과해도 답변 규격이 다르다. 분석·행동 지침 없이 위로 한 겹과 창구 카드만 나간다.
    프론트가 혼자 부르지 않는다. 서버가 같은 원문으로 다시 판정해 같은 답을 얻어야 연다.
    """
    if d.route != "crisis":
        return None
    if d.crisis_level != "distress":
        return None
    return replace(
        d,
        route="solace",
        model_tier=TIER["solace"],
        use_rag=RAG["solace"],
        reasons=[*d.reasons, "user_asked_to_continue"],
    )


# ────────────────────────────────────────────────────────────────────────────
# 화면 인디케이터. 라우팅 규칙이 아니라 「더 쓰게 만드는」 장치다. 서버 판정과 독립
# ────────────────────────────────────────────────────────────────────────────

Depth = Literal[1, 2, 3]


@dataclass
class DepthHint:
    dots: Depth
    label: str


def depth_indicator(raw: str) -> DepthHint:
    text = normalize(raw)
    chars = count_chars(text)
    lines = len([line for line in text.split("\n") if line.strip()]) if text else 0
    # 라우팅 규칙이 아니다. 「응」 세 줄만 막는다
    rich = chars >= 100 or (lines >= 3 and chars >= 24)
    if chars == 0:
        return DepthHint(dots=1, label="자세히 들려줄수록 더 깊게 이해할 수 있어요")
    if rich:
        return DepthHint(dots=3, label="✨ 이제 꽤 깊게 이야기해볼 수 있겠어요")
    return DepthHint(dots=2, label="조금만 더 이야기해주시면 상황을 더 잘 볼 수 있어요")


# 분량 규약. 글자 수는 상한이 아니라 밀도 기준이다. 문장 반복으로 채우지 않는다
LENGTH_POLICY = {
    "light": {"total": [250, 600], "scriptures": 0, "analysis_sections": 0, "actions": [0, 1]},
    "normal": {"total": [700, 1100], "scriptures": 1, "analysis_sections": 1, "actions": [1, 2]},
    "deep": {
        "total": [1300, 2000],
        "scriptures": [1, 2],
        "analysis_sections": [2, 3],
        "actions": [1, 3],
    },
    # 위로 답변. 짧게 쓴다. 상황을 해석하지 않고 지금 무엇을 하라고도 말하지 않는다.
    # action 하나는 「물 한 잔」 「창문 열기」 수준의 몸으로 하는 것만 허용한다.
    "solace": {"total": [300, 650], "scriptures": 1, "analysis_sections": 0, "actions": [0, 1]},
}

# 위로 답변이 절대 담으면 안 되는 것. 생성 뒤 이 검사를 통과해야 화면에 나간다.
# 걸리면 문장을 고치지 않고 통째로 버린 뒤 고정 문구로 대체하고 사건을 남긴다.
SOLACE_FORBIDDEN = [
    regex.compile(r"방법|수단|요령|치사|약을?\s?(모으|먹)|번개탄|목을?\s?매|손목|뛰어내리"),
    regex.compile(r"어떻게\s?(죽|하면\s?죽)"),
    regex.compile(r"고통\s?없이|안\s?아프게"),
    regex.compile(r"(죽는|떠나는)\s?것도\s?(하나의|한)\s?(선택|방법)"),
    regex.compile(r"이해(해요|합니다|가\s?가)"),
]

# 위로 답변이 검사에 걸렸을 때 대신 내보내는 고정 문장. 모델을 다시 부르지 않는다
SOLACE_FALLBACK = (
    "지금 여기까지 이야기해 주신 것만으로도 충분히 애쓰셨어요.\n"
    "이 마음은 혼자 들기에 너무 무거워요. 아래 번호로 지금 연락해 보셔요."
)
