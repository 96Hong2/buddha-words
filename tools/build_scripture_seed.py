#!/usr/bin/env python3
"""감수본 400구절을 제품이 쓰는 시드로 만든다.

입력
    data/scriptures/경전 감수본 (감수후 v1).md   외부 감수를 반영한 **정본**
    data/scriptures/_draft/batch-*.json          초안 JSON. 한국어 주제 낱말만 가져온다

출력
    data/scriptures/seed.json                    백엔드 repo.py 와 프론트 스텁이 읽는 파일

돌리는 법
    python3 tools/build_scripture_seed.py          만들어 덮어쓴다
    python3 tools/build_scripture_seed.py --check  현재 파일이 감수본과 맞는지만 본다

게이트를 하나라도 못 넘기면 파일을 쓰지 않고 1 로 끝난다. 조용히 넘어가지 않는다.

정본이 왜 마크다운인가
    감수자는 마크다운 한 장에 표시하고 고친 문장을 그 자리에 적어 돌려준다. 그래서
    본문·출처·화자·감수 표시의 정본은 그 파일이고, 초안 JSON 은 기계가 쓰려고 만든 사본이다.
    둘이 어긋나면 **감수본이 이긴다.** 아래 parse_block 이 감수본에서 읽는 값은 전부
    초안 JSON 을 덮어쓴다.

무엇을 분리하는가
    「불교 문헌의 문장」과 「부처님의 직접 발언」과 「현대적 해석」을 데이터에서 갈라 둔다.
    합성·요약·복수 화자 텍스트가 직접인용처럼 보이면 안 되기 때문이다.
      speaker_kind  누가 말했나. 감수 전에는 unknown 이고 자동으로 채우지 않는다
      text_type     그 문장이 직접 발언인가 발췌인가 합성인가
      attribution   화면에 그대로 나갈 귀속 문구. 부처 직접 발언 표시가 따로 있다
      review        감수 상태와 근거
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "scriptures"
REVIEWED_MD = DATA / "경전 감수본 (감수후 v1).md"
DRAFT_DIR = DATA / "_draft"
OUT = DATA / "seed.json"
VISUAL_THEME_TS = ROOT / "spec" / "visual-theme.ts"

# ────────────────────────────────────────────────────────────────────────────
# id 표기
#
# 감수본은 dhp.1 · an.8.80 · snp.4.15.936 처럼 SuttaCentral uid 를 그대로 쓴다.
# 자리를 채우려면 번호가 한 칸인 법구경에만 되고 an.8.80 같은 여러 칸 id 에는
# 어디를 채울지 정할 수가 없다. 출처를 되짚을 때도 uid 와 글자가 같은 편이 낫다.
# ────────────────────────────────────────────────────────────────────────────

# 감수본 태그(한국어) → 초안 tags_primary 코드. build_review_md.py 의 TAG_KO 를 뒤집은 것
TAG_FROM_KO = {
    "불안": "anxiety",
    "분노": "anger",
    "이별·상실": "loss",
    "비교·열등감": "comparison",
    "관계 갈등": "relationship",
    "미래·진로": "uncertainty",
    "돈·생계": "money",
    "무기력·번아웃": "apathy",
    "선택·결정": "indecision",
    "자책·후회": "regret",
}

# tags_primary → 화면이 쓰는 visualTheme.
# 둘은 같은 10종이 아니다. 다섯(anxiety·anger·loss·comparison·relationship)만 이름이 겹치고
# 나머지 다섯은 태그 쪽에만 있다. 갈 곳은 계획 02 의 2절 표가 정해 둔 대로 따른다.
TAG_TO_THEME = {
    "anxiety": "anxiety",
    "anger": "anger",
    "loss": "loss",
    "comparison": "comparison",
    "relationship": "relationship",
    "money": "anxiety",  # 돈·생계 걱정은 불안으로 본다
    "uncertainty": "choice",  # 이 길이 맞나. 돌길 장면의 자리다
    "indecision": "choice",
    "apathy": "emptiness",  # 무기력·번아웃
    "regret": "sleepless",  # 자책·후회는 잠 못 드는 걱정으로 본다
}

# 태그만으로는 attachment·approval 에 아무도 가지 않고 sleepless 가 후회에만 쏠린다.
# 초안이 손으로 적어 둔 한국어 themes 낱말을 보고 테마를 하나 더 붙인다.
THEME_KEYWORDS = {
    "attachment": (
        "집착", "미련", "갈애", "소유", "놓아줌", "놓아주기", "내려놓기", "욕망", "욕심", "애착",
    ),
    "approval": ("인정", "칭찬", "평판", "명예", "비난", "칭송", "시선", "자만"),
    "sleepless": ("잠", "걱정", "근심", "곱씹기", "곱씹음", "불면"),
}

# ────────────────────────────────────────────────────────────────────────────
# 화자와 본문 유형
# ────────────────────────────────────────────────────────────────────────────

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

# 감수본이 쓴 본문 유형 값 가운데 아래 세 개는 처음 정한 목록에 없었다. 지어내서 뭉개지 않고
# 하나는 목록에 더하고 둘은 가장 가까운 값으로 접는다.
#
#   direct_verse_pair → direct_verse 로 접는다.
#       58~59게처럼 붙어 있는 두 게송을 한 장에 실었다는 뜻이고, 몇 게송인지는 이미
#       canonical_location 이 「4장 꽃의 장 58~59게」로 말한다. 같은 뜻을 두 이름으로
#       나누면 「직접 게송인가」를 묻는 자리가 둘이 된다.
#
#   continuous_excerpt_with_ellipsis → excerpt 로 접는다.
#       감수자가 메모에 직접 `textType=excerpt` 라고 적어 두었다. 중간을 줄인 발췌라는
#       사실은 evidence_note 에 남는다.
#
#   direct_speech_excerpt → **목록에 더한다.**
#       접을 자리가 없다. direct_speech 로 접으면 말한 전부를 실은 것처럼 되고,
#       excerpt 로 접으면 누가 말했는지가 지워진다. 「그 사람이 실제로 한 말인데
#       그중 일부만 실었다」는 이 데이터에서 가장 자주 나올 상태라 이름을 준다.
TEXT_TYPES = (
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
)

TEXT_TYPE_FOLD = {
    "direct_verse_pair": "direct_verse",
    "continuous_excerpt_with_ellipsis": "excerpt",
}

# 문헌별 기본값. (문헌 이름, 기준 판본, 원문 언어, 미감수일 때 추정할 본문 유형)
#
# base_edition 은 **근거가 있을 때만** 채운다. 팔리 문헌은 SuttaCentral 팔리 정본과
# CC0 인 Bhikkhu Sujato 영역을 대조해 옮겼다고 초안 머리말이 적어 두었다. 대승·선·한국
# 문헌은 그런 기준본이 없어 비워 두고 license_status 로 확인이 필요하다고 표시한다.
#
# 미감수 text_type 은 **추정이다.** 게송으로 된 문헌은 direct_verse, 산문 경은 excerpt,
# 개인 저술은 author_prose 로 둔다. 추정했다는 사실은 evidence_note 에 남는다.
PALI_BASE = "SuttaCentral 팔리 정본 · Bhikkhu Sujato 영역(CC0) 대조"

WORKS: dict[str, tuple[str, str, str, str]] = {
    "dhp": ("법구경", PALI_BASE, "pli", "direct_verse"),
    "snp": ("숫타니파타", PALI_BASE, "pli", "direct_verse"),
    "thag": ("테라가타", PALI_BASE, "pli", "direct_verse"),
    "thig": ("테리가타", PALI_BASE, "pli", "direct_verse"),
    "sn": ("상윳따 니까야", PALI_BASE, "pli", "excerpt"),
    "an": ("앙굿따라 니까야", PALI_BASE, "pli", "excerpt"),
    "mn": ("맛지마 니까야", PALI_BASE, "pli", "excerpt"),
    "dn": ("디가 니까야", PALI_BASE, "pli", "excerpt"),
    "ud": ("우다나", PALI_BASE, "pli", "excerpt"),
    "iti": ("이띠웃따까", PALI_BASE, "pli", "excerpt"),
    "maha.diamond": ("금강경", "", "zh", "excerpt"),
    "maha.heart": ("반야심경", "", "zh", "excerpt"),
    "maha.lotus": ("법화경", "", "zh", "excerpt"),
    "maha.vimala": ("유마경", "", "zh", "excerpt"),
    "maha.huayan": ("화엄경", "", "zh", "excerpt"),
    "maha.platform": ("육조단경", "", "zh", "excerpt"),
    "maha.surangama": ("능엄경", "", "zh", "excerpt"),
    "maha.yuanjue": ("원각경", "", "zh", "excerpt"),
    "maha.awakeningfaith": ("대승기신론", "", "zh", "author_prose"),
    "maha.srimala": ("승만경", "", "zh", "excerpt"),
    "maha.nirvana": ("열반경", "", "zh", "excerpt"),
    "maha.samantabhadra": ("보현행원품", "", "zh", "excerpt"),
    "zen.wumen": ("무문관", "", "zh", "excerpt"),
    "zen.linji": ("임제록", "", "zh", "excerpt"),
    "zen.zhaozhou": ("조주 선사 문답", "", "zh", "dialogue"),
    "zen.daizhu": ("경덕전등록", "", "zh", "excerpt"),
    "zen.oxherding": ("십우도", "", "zh", "excerpt"),
    "kr.wonhyo": ("원효 저술", "", "zh", "author_prose"),
    "kr.jinul": ("지눌 저술", "", "zh", "author_prose"),
    "kr.seosan": ("선가귀감", "", "zh", "author_prose"),
    "kr.naong": ("나옹 작으로 전하는 시", "", "zh", "poetic_line"),
    "kr.mangong": ("만공 귀속 문구", "", "zh", "poetic_line"),
}

# ────────────────────────────────────────────────────────────────────────────
# 감수를 통과한 구절의 귀속
#
# 화자 이름과 본문 유형은 감수본에서 읽는다. 여기 적는 것은 감수본이 글로만 적어 둔 것,
# 곧 **화자의 종류**와 **화면에 그대로 나갈 문구**와 **기준 판본·원문**이다.
#
# is_direct_buddha_speech 는 이 표에 없다. speaker_kind 가 buddha 일 때만 참이고
# 그 밖에는 언제나 거짓이다. 감수를 통과했다고 참이 되지 않는다. 「부처의 말」이 서비스
# 이름이어도 실제 화자를 부처로 바꾸지 않는다.
#
# source_text 는 **번역문 전체를 덮는 원문일 때만** 싣는다. 감수 근거에 낱말 하나나
# 앞 구절만 인용된 것은 비워 둔다. 조각을 원문 자리에 넣으면 그 조각이 본문 전체의
# 원문인 것처럼 읽힌다.
# ────────────────────────────────────────────────────────────────────────────

REVIEWED: dict[str, dict[str, str]] = {
    "dhp.58": {
        "speaker_kind": "canonical_tradition",
        "display_label": "부처의 가르침 · 법구경 4장 꽃의 장 58~59게",
    },
    "dhp.75": {
        "speaker_kind": "canonical_tradition",
        "display_label": "부처의 가르침 · 법구경 5장 어리석은 이의 장 75게",
    },
    "dhp.98": {
        "speaker_kind": "canonical_tradition",
        "display_label": "부처의 가르침 · 법구경 7장 아라한의 장 98게",
    },
    "dhp.132": {
        "speaker_kind": "canonical_tradition",
        "display_label": "부처의 가르침 · 법구경 10장 폭력의 장 132게",
    },
    "dhp.155": {
        "speaker_kind": "canonical_tradition",
        "display_label": "부처의 가르침 · 법구경 11장 늙음의 장 155게",
    },
    "dhp.156": {
        "speaker_kind": "canonical_tradition",
        "display_label": "부처의 가르침 · 법구경 11장 늙음의 장 156게",
    },
    "dhp.279": {
        "speaker_kind": "canonical_tradition",
        "display_label": "부처의 가르침 · 법구경 20장 길의 장 279게",
    },
    "dhp.282": {
        "speaker_kind": "canonical_tradition",
        "display_label": "부처의 가르침 · 법구경 20장 길의 장 282게",
    },
    "sn.1.34": {
        "speaker_kind": "buddha",
        "display_label": "— 부처, 상윳따 니까야 1:34",
    },
    "an.2.33": {
        "speaker_kind": "buddha",
        "display_label": "— 부처, 앙굿따라 니까야 2.33",
        # 번호 체계가 갈리는 자리라 어느 판을 따랐는지 판본에 적는다
        "base_edition": "SuttaCentral Sujato 판 AN 2.33 (Thanissaro 계열은 AN 2.32)",
    },
    "thig.12.1": {
        "speaker_kind": "nun",
        "display_label": "— 뿐니까 장로니, 테리가타 12.1",
    },
    "maha.lotus.4": {
        "speaker_kind": "disciple",
        "display_label": "— 부처의 제자들, 법화경 신해품 제4",
        "base_edition": "구마라집 한역 《묘법연화경》 신해품 제4",
    },
    "maha.platform.3": {
        "speaker_kind": "zen_master",
        "display_label": "— 오조 홍인, 육조단경 행유품",
        "base_edition": "《육조단경》 행유품 한문 원문",
        "source_text": "不識本心 學法無益 若識自本心 見自本性 即名丈夫 天人師 佛",
    },
    "zen.zhaozhou.fangxia": {
        "speaker_kind": "zen_master",
        "display_label": "— 조주 선사, 오등회원",
        "base_edition": "《오등회원》 홍주신흥엄양존자 대목",
        # 감수 메모가 「production 전에 디지털 판본 URI·권차를 고정」을 남겼다.
        # 감수본 머리글에서 라이선스 표시는 빠졌지만 확인이 끝난 것이 아니라 여기서 되살린다
        "license_status": "needs_check",
        "source_text": "一物不將來時如何 / 放下著 / 既是一物不將來 放下箇甚麼 / 放不下 擔取去",
    },
    "maha.srimala.vows": {
        "speaker_kind": "lay_bodhisattva",
        "display_label": "— 승만부인, 승만경 십수장",
        "base_edition": "대정신수대장경 T353 《승만사자후일승대방편방광경》 십수장",
    },
    "kr.wonhyo.hwajaeng": {
        "speaker_kind": "author",
        "display_label": "— 원효, 열반종요",
        "base_edition": "원효 《열반종요》 한문 원문",
        "source_text": "統衆典之部分 歸萬流之一味 開佛意之至公 和百家之異諍",
    },
}

# 감수에서 빠진 구절. 화자 귀속 근거가 무너진 것이라 제품 데이터에서 내린다.
#
# 이 구절들은 seed.json 의 items 에 넣지 않고 rejected 목록에 비석으로만 남긴다.
# items 를 읽는 쪽은 백엔드만이 아니다. 프론트 스텁도 같은 파일을 읽어 아무 구절이나
# 고르므로, 본문이 빈 레코드가 items 에 있으면 화면에 빈 카드가 뜰 수 있다.
# 비석을 남기는 이유는 같은 id 가 다시 들어오는 것을 막기 위해서다.
REJECTED: dict[str, dict[str, str]] = {
    "kr.mangong.oneflower": {
        "speaker_kind": "unknown",
        "text_type": "poetic_line",
        "citation": "만공 귀속으로 전하던 「世界一花」 문구",
        "evidence_note": (
            "「世界一花」 네 글자는 만공보다 앞선 당나라 왕유의 《육조능선사비명》 게송에 "
            "`世界一花 祖宗六葉` 으로 확인됩니다. 만공이 이 표현을 썼을 수는 있어도 "
            "만공이 만든 말이라고 적을 근거가 없어 제품 데이터에서 내립니다."
        ),
    }
}

# 계획 02 4-1. 쿨다운 10 에 여유 2 를 더한 수다
MIN_PER_THEME = 12
# 계획 00 M2. 홈 「오늘의 한마디」가 돌아갈 최소치
MIN_DAILY_OK = 30
# 계획 02 6-3 은 retrieval_text 60자를 걸었는데 감수본 400구절 중 178개가 그보다 짧다.
# 통째로 떨어뜨리는 대신 낮은 하한을 두고, 60 미만 개수를 세어 알린다.
#
# 하한을 30 에서 20 으로 내렸다. 감수자가 「닿는 상황」에서 상담용 각색을 걷어 내면서
# maha.lotus.4(24자) · maha.platform.3(25자) 두 건이 30 아래로 내려왔기 때문이다.
# 이 하한은 「칸이 비었거나 한 마디만 적혔다」를 잡는 냄새 탐지기이지 품질 계약이 아니다.
# 감수본이 정본이므로 문장을 늘려 맞추지 않고 탐지기를 그 아래로 내린다.
MIN_RETRIEVAL_LEN = 20
PLANNED_RETRIEVAL_LEN = 60

_PUNCT = re.compile(r"[\s\W_]+", re.UNICODE)
_ID_PART = re.compile(r"(\d+)")
_BLOCK_HEAD = re.compile(r"^### (\d{3})\. `([^`]+)` · (.+)$")
_META = re.compile(r"확신도 \*\*([^*]+)\*\*")
_TAGS = re.compile(r"태그 ([^|]+)")
_FIELD = re.compile(r"^\*\*([^*]+)\*\* ?(.*)$")
_REVIEWED_AT = re.compile(r"(\d{4}-\d{2}-\d{2})")


def visual_themes() -> tuple[str, ...]:
    """정본 spec/visual-theme.ts 의 VisualTheme 10종을 그대로 읽는다."""
    src = VISUAL_THEME_TS.read_text(encoding="utf-8")
    line = re.search(r"export type VisualTheme\s*=\s*([^;]+);", src)
    if line is None:
        raise SystemExit("spec/visual-theme.ts 에서 VisualTheme 를 못 찾았어요.")
    return tuple(re.findall(r"'([a-z_]+)'", line.group(1)))


def sort_key(scripture_id: str) -> tuple:
    """dhp.9 가 dhp.10 앞에 오게 숫자 칸을 숫자로 비교한다."""
    return tuple(
        (1, int(p)) if p.isdigit() else (0, p) for p in _ID_PART.split(scripture_id) if p
    )


def body_key(text: str) -> str:
    """본문 중복 검사용. 공백·문장부호를 지운 앞 60자."""
    return _PUNCT.sub("", text)[:60]


def work_of(scripture_id: str) -> tuple[str, str, str, str]:
    """id 로 문헌을 찾는다. 모르는 접두어는 통과시키지 않는다."""
    parts = scripture_id.split(".")
    for key in (".".join(parts[:2]), parts[0]):
        if key in WORKS:
            return WORKS[key]
    raise SystemExit(f"{scripture_id}: 어느 문헌인지 몰라 판본·언어를 정할 수 없어요.")


# ────────────────────────────────────────────────────────────────────────────
# 감수본 읽기
# ────────────────────────────────────────────────────────────────────────────


def split_blocks(md: str) -> list[list[str]]:
    """구절 블록만 잘라 낸다.

    「### 문헌별」 같은 목차 소제목은 번호가 없어 걸리지 않는다.
    블록은 구분선(---)에서 끊는다. 끊지 않으면 다음 문헌 절 첫머리의 「구절을 어떻게 골랐나」
    접기 상자가 앞 구절의 근거 메모로 딸려 들어온다. 실제로 thig.12.1 에서 그렇게 됐다.
    """
    lines = md.split("\n")
    heads = [i for i, line in enumerate(lines) if _BLOCK_HEAD.match(line)]
    blocks = []
    for a, b in zip(heads, heads[1:] + [len(lines)], strict=True):
        chunk = lines[a:b]
        end = next((i for i, line in enumerate(chunk) if line.strip() == "---"), len(chunk))
        blocks.append(chunk[:end])
    return blocks


def quote_after(block: list[str], start: int) -> str:
    """`>` 로 시작하는 줄을 모아 한 문단으로 잇는다.

    조주 문답처럼 여러 줄인 것도 있다. 줄바꿈을 살려 두어도 카드 CSS 가 `pre-line` 이
    아니라 화면에서는 어차피 한 줄로 이어지고, 공유 문구에만 줄바꿈이 남아 둘이 어긋난다.
    그래서 여기서 한 문단으로 합친다.
    """
    out: list[str] = []
    for line in block[start + 1 :]:
        if line.startswith(">"):
            out.append(line.lstrip(">").strip())
        elif out:
            break
    return " ".join(part for part in out if part)


def parse_block(block: list[str]) -> dict:
    """구절 블록 하나를 읽는다. 없는 칸은 빈 값으로 두고 게이트가 잡게 한다."""
    head = _BLOCK_HEAD.match(block[0])
    if head is None:
        raise SystemExit(f"블록 머리를 못 읽었어요: {block[0]!r}")
    no, sid, citation = int(head.group(1)), head.group(2), head.group(3).strip()

    meta = next((line for line in block if "확신도" in line), "")
    tags_ko = _TAGS.search(meta)
    # 태그끼리는 「 · 」로 나뉘고 「이별·상실」처럼 이름 안의 가운뎃점에는 공백이 없다.
    # 공백까지 포함해 잘라야 태그 이름이 반으로 쪼개지지 않는다
    tags = [w.strip() for w in re.split(r"\s·\s", tags_ko.group(1))] if tags_ko else []
    tags = [w for w in tags if w]

    parsed: dict = {
        "no": no,
        "id": sid,
        "citation": citation,
        "confidence": (_META.search(meta).group(1) if _META.search(meta) else ""),
        "tags_ko": tags,
        "license_needs_check": "라이선스 확인 필요" in meta,
        "text": "",
        "modern_gloss": "",
        "retrieval_text": "",
        "daily_line": "",
        "terms": [],
        "speaker_name": "",
        "text_type": "",
        "evidence_note": "",
        "review_mark": "",
        "memo": "",
        # 감수자가 덧붙인 판본·저작권·주의 줄. 근거 메모 앞에 그대로 붙여 남긴다
        "notes": "",
    }
    notes: list[str] = []

    for i, line in enumerate(block):
        field = _FIELD.match(line)
        if field:
            name, value = field.group(1), field.group(2).strip()
            if name == "경전 번역문":
                parsed["text"] = quote_after(block, i)
            elif name == "현대적 풀이":
                parsed["modern_gloss"] = value
            elif name == "닿는 상황":
                parsed["retrieval_text"] = re.sub(r"^\(검색이 읽는 문장\)\s*", "", value)
            elif name == "오늘의 한마디":
                parsed["daily_line"] = value.strip("「」")
            elif name == "용어 풀이":
                for term in re.split(r" · (?=\*\*)", value):
                    got = re.match(r"\*\*([^*]+)\*\*:\s*(.+)$", term.strip())
                    if got:
                        parsed["terms"].append({"word": got.group(1), "gloss": got.group(2)})
            elif name in ("화자", "화자/귀속", "화자/저자"):
                # 감수본은 「법구경 전승상 부처의 가르침 (`canonical_tradition`)」처럼
                # 종류 코드를 괄호로 덧붙여 둔 곳이 있다. 이름 칸에는 이름만 남긴다
                parsed["speaker_name"] = re.sub(r"\s*\(`[a-z_]+`\)\s*$", "", value).strip()
            elif name == "본문 유형":
                parsed["text_type"] = value.strip("`")
            elif name in ("판본 메모", "저작권 메모", "주의", "기존 귀속", "외부감수 판정"):
                notes.append(f"{name}: {value.replace('**', '')}")
            elif name == "감수":
                parsed["review_mark"] = value
        elif line.startswith("메모:"):
            parsed["memo"] = line[3:].strip()
        elif line.startswith("<details>"):
            note = re.sub(r"^<details><summary>[^<]*</summary>", "", line).strip()
            body = [note] if note else []
            for nxt in block[i + 1 :]:
                if nxt.startswith("</details>"):
                    break
                if nxt.strip():
                    body.append(nxt.strip())
            parsed["evidence_note"] = " ".join(body)

    parsed["notes"] = " · ".join(notes)
    return parsed


def review_status(mark: str) -> str:
    """감수 줄의 체크 상자를 읽는다. ☒ 가 찍힌 칸이 판정이다."""
    if re.search(r"☒ ?통과", mark):
        return "approved"
    if re.search(r"☒ ?빼야 함", mark):
        return "rejected"
    if re.search(r"☒ ?고쳐야 함", mark):
        # 아직 한 건도 없다. 생기면 「고친 문장을 메모에 적는다」 규칙을 코드로 옮겨야 한다
        raise SystemExit("「고쳐야 함」 표시가 생겼어요. 고친 문장을 어떻게 받을지 정해야 합니다.")
    return "needs_review"


def draft_themes() -> dict[str, list[str]]:
    """초안 JSON 에서 한국어 주제 낱말만 가져온다.

    attachment·approval·sleepless 테마는 태그 열 종으로는 아무도 가지 않아, 초안이 손으로
    적어 둔 낱말을 봐야 한다. 감수본에는 이 낱말이 실리지 않으므로 초안을 함께 읽는다.
    """
    out: dict[str, list[str]] = {}
    for path in sorted(DRAFT_DIR.glob("batch-*.json")):
        for item in json.loads(path.read_text(encoding="utf-8"))["items"]:
            out[item["id"]] = item.get("themes", [])
    if not out:
        raise SystemExit(f"{DRAFT_DIR} 에 초안이 없어요.")
    return out


# ────────────────────────────────────────────────────────────────────────────
# 시드 만들기
# ────────────────────────────────────────────────────────────────────────────


def themes_for(parsed: dict, keywords: list[str], errors: list[str]) -> list[str]:
    out: list[str] = []
    for tag_ko in parsed["tags_ko"]:
        code = TAG_FROM_KO.get(tag_ko)
        if code is None:
            errors.append(f"{parsed['id']}: 모르는 태그 {tag_ko!r} 라 테마를 못 정해요")
            continue
        mapped = TAG_TO_THEME[code]
        if mapped not in out:
            out.append(mapped)
    blob = " ".join(keywords)
    for theme, words in THEME_KEYWORDS.items():
        if theme not in out and any(w in blob for w in words):
            out.append(theme)
    return out


def convert(
    parsed: dict, keywords: list[str], reviewed_by: str, at: str, errors: list[str]
) -> dict:
    sid = parsed["id"]
    status = review_status(parsed["review_mark"])
    work, base_edition, language, guessed_type = work_of(sid)

    if status == "approved":
        override = REVIEWED.get(sid)
        if override is None:
            errors.append(f"{sid}: 감수를 통과했는데 귀속 표(REVIEWED)에 없어요")
            override = {}
        speaker_kind = override.get("speaker_kind", "unknown")
        # 전승 문헌에는 말한 사람이 없다. 「법구경 전승상 …」 같은 설명을 이름 칸에 두면
        # 화면이 그것을 화자 이름으로 읽는다
        speaker_name = "" if speaker_kind == "canonical_tradition" else parsed["speaker_name"]
        raw_type = parsed["text_type"]
        text_type = TEXT_TYPE_FOLD.get(raw_type, raw_type)
        display_label = override.get("display_label", "")
        base_edition = override.get("base_edition", base_edition)
        source_text = override.get("source_text", "")
        evidence_note = " · ".join(x for x in (parsed["notes"], parsed["evidence_note"]) if x)
    elif status == "rejected":
        override = REJECTED.get(sid, {})
        speaker_kind = override.get("speaker_kind", "unknown")
        speaker_name = parsed["speaker_name"]
        text_type = override.get("text_type", guessed_type)
        display_label = ""
        source_text = ""
        # 블록 머리가 「❌ 출시 제외 …」 판정문으로 바뀌어 있어 출처 자리에 그대로 둘 수 없다
        parsed["citation"] = override.get("citation", parsed["citation"])
        evidence_note = override.get("evidence_note", "")
        evidence_note = " · ".join(x for x in (parsed["notes"], evidence_note) if x)
    else:
        # 미감수다. 화자를 모르는 채로 두고, 본문 유형만 문헌 성격으로 추정한다.
        # 추정했다는 사실을 evidence_note 에 적어 둔다. 감수 전에는 운영에 못 나간다.
        #
        # 초안이 적어 둔 긴 「옮긴 근거」는 런타임 파일에 싣지 않는다. 그 안에는 대조용으로
        # 인용한 현대 영어 번역 문장이 들어 있고, 런타임 데이터에는 팔리·한문 원문과
        # 우리 자체 한국어 번역만 싣기로 했기 때문이다. 근거 원문은 감수본 마크다운에 남아 있다.
        speaker_kind = "unknown"
        speaker_name = ""
        text_type = guessed_type
        # 화자를 모르므로 귀속 문구는 출처만 적는다. 「— 부처」 같은 말을 붙이지 않는다
        display_label = parsed["citation"]
        source_text = ""
        evidence_note = " · ".join(x for x in ("미감수·추정", parsed["notes"]) if x)

    if speaker_kind not in SPEAKER_KINDS:
        errors.append(f"{sid}: 모르는 화자 종류 {speaker_kind!r}")
    if text_type not in TEXT_TYPES:
        errors.append(f"{sid}: 모르는 본문 유형 {text_type!r}")

    out: dict = {
        "id": sid,
        "citation": parsed["citation"],
        # canonical_translation_ko. 화면에 나가는 유일한 경전 문장이다
        "text": parsed["text"],
        # modern_explanation_ko
        "modern_gloss": parsed["modern_gloss"],
        "themes": themes_for(parsed, keywords, errors),
        "daily_ok": bool(parsed["daily_line"]),
        # daily_message_ko
        "daily_line": parsed["daily_line"],
        "retrieval_text": parsed["retrieval_text"],
        "source_work": work,
        "canonical_location": parsed["citation"],
        "base_edition": base_edition,
        "source_language": language,
        "source_text": source_text,
        "speaker_kind": speaker_kind,
        "speaker_name": speaker_name,
        "text_type": text_type,
        "attribution": {
            # speaker_kind 가 buddha 일 때만 참이다. 감수 통과가 참을 만들지 않는다
            "is_direct_buddha_speech": speaker_kind == "buddha",
            "display_label": display_label,
        },
        "review": {
            "status": status,
            "reviewed_by": reviewed_by if status != "needs_review" else "",
            "reviewed_at": at if status != "needs_review" else "",
            "evidence_note": evidence_note,
        },
    }
    if parsed["terms"]:
        out["terms"] = parsed["terms"]
    # 대승·선·한국 문헌은 판본 라이선스를 아직 확인하지 못했다.
    # 감수를 통과하며 확인이 끝난 것은 감수본에서 표시가 빠지고 「저작권 메모」로 바뀐다
    license_status = "needs_check" if parsed["license_needs_check"] else ""
    if status == "approved":
        license_status = REVIEWED.get(sid, {}).get("license_status", license_status)
    if license_status:
        out["license_status"] = license_status
    return out


def build() -> tuple[dict, list[str]]:
    """시드 본문과 게이트 위반 목록을 함께 돌려준다."""
    allowed = set(visual_themes())
    md = REVIEWED_MD.read_text(encoding="utf-8")
    keywords = draft_themes()

    title = md.split("\n", 3)[:3]
    at = next((m.group(1) for line in title if (m := _REVIEWED_AT.search(line))), "")
    reviewed_by = "외부 문헌 감수 v1"
    if not at:
        raise SystemExit("감수본 머리말에서 감수 날짜를 못 찾았어요.")

    blocks = split_blocks(md)
    errors: list[str] = []
    items: list[dict] = []
    seen_ids: dict[str, int] = {}
    seen_body: dict[str, str] = defaultdict(str)

    for block in blocks:
        parsed = parse_block(block)
        sid = parsed["id"]
        if sid in seen_ids:
            errors.append(f"id 중복: {sid} (블록 {seen_ids[sid]} 와 {parsed['no']})")
            continue
        seen_ids[sid] = parsed["no"]

        if sid not in keywords:
            errors.append(f"{sid}: 초안 JSON 에 없는 id 라 주제 낱말을 못 찾았어요")

        item = convert(parsed, keywords.get(sid, []), reviewed_by, at, errors)
        if item["review"]["status"] != "rejected":
            key = body_key(item["text"])
            if seen_body[key]:
                errors.append(f"본문 중복: {sid} 와 {seen_body[key]} (앞 60자가 같아요)")
            else:
                seen_body[key] = sid
        items.append(item)

    if len(blocks) != 400:
        errors.append(f"감수본 구절 블록이 {len(blocks)}개예요. 400개여야 합니다")

    items.sort(key=lambda it: sort_key(it["id"]))

    # 빠진 구절은 items 밖으로 낸다. 게이트도 남은 것만 본다
    shipping = [it for it in items if it["review"]["status"] != "rejected"]
    dropped = [it for it in items if it["review"]["status"] == "rejected"]
    for it in shipping:
        if not it["themes"]:
            errors.append(f"{it['id']}: 어느 테마에도 안 걸려요")
        for theme in it["themes"]:
            if theme not in allowed:
                errors.append(f"{it['id']}: spec 에 없는 테마 {theme!r}")
        if it["daily_ok"] and not it["daily_line"]:
            errors.append(f"{it['id']}: daily_ok 인데 daily_line 이 비어 있어요")
        if len(it["retrieval_text"]) < MIN_RETRIEVAL_LEN:
            errors.append(f"{it['id']}: retrieval_text 가 {MIN_RETRIEVAL_LEN}자보다 짧아요")
        for field in ("text", "modern_gloss", "citation"):
            if not it[field].strip():
                errors.append(f"{it['id']}: {field} 가 비어 있어요")
        if it["attribution"]["is_direct_buddha_speech"] and it["speaker_kind"] != "buddha":
            errors.append(f"{it['id']}: 화자가 부처가 아닌데 직접 발언 표시가 붙었어요")

    per_theme = Counter(t for it in shipping for t in it["themes"])
    for theme in sorted(allowed):
        if per_theme[theme] < MIN_PER_THEME:
            errors.append(
                f"테마 {theme} 구절이 {per_theme[theme]}개라 {MIN_PER_THEME}개에 못 미쳐요"
            )

    daily_ok = sum(1 for it in shipping if it["daily_ok"])
    if daily_ok < MIN_DAILY_OK:
        errors.append(f"daily_ok 가 {daily_ok}개라 {MIN_DAILY_OK}개에 못 미쳐요")

    status_count = Counter(it["review"]["status"] for it in items)
    # 빈 본문은 items 밖으로 나가야 한다. 프론트 스텁이 items 를 그대로 고르기 때문이다
    for it in dropped:
        if it["review"]["status"] != "rejected":
            errors.append(f"{it['id']}: 빠진 구절이 아닌데 items 밖으로 나갔어요")
    seed = {
        "_note": (
            "tools/build_scripture_seed.py 가 data/scriptures/경전 감수본 (감수후 v1).md 에서 "
            "만든 파일이다. 손으로 고치지 않는다. review.status 가 approved 인 구절만 운영에 "
            "나가고, rejected 는 어느 환경에서도 나가지 않는다."
        ),
        "counts": {
            "total": len(shipping),
            "approved": status_count["approved"],
            "needs_review": status_count["needs_review"],
            "rejected": status_count["rejected"],
            "direct_buddha_speech": sum(
                1 for it in shipping if it["attribution"]["is_direct_buddha_speech"]
            ),
            "daily_ok": daily_ok,
            "license_needs_check": sum(1 for it in shipping if it.get("license_status")),
            # 같은 수일 때 이름으로 다시 정렬한다. set 의 순서는 실행마다 달라서
            # 개수만으로 정렬하면 --check 가 아무 이유 없이 어긋난다고 말한다
            "per_theme": {
                t: per_theme[t] for t in sorted(allowed, key=lambda x: (-per_theme[x], x))
            },
        },
        "items": shipping,
        # 감수에서 빠진 구절. 어느 환경에서도 내보내지 않는다.
        # 같은 id 가 되돌아오는 것을 막는 비석이다
        "rejected": dropped,
    }
    return seed, errors


def dump(seed: dict) -> str:
    return json.dumps(seed, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="쓰지 않고 현재 파일과 같은지만 본다")
    args = parser.parse_args()

    seed, errors = build()
    counts = seed["counts"]
    short = sum(1 for it in seed["items"] if len(it["retrieval_text"]) < PLANNED_RETRIEVAL_LEN)

    print(
        f"구절 {counts['total']}개 · 감수 통과 {counts['approved']}개 · "
        f"미감수 {counts['needs_review']}개 · 제외 {counts['rejected']}개"
    )
    print(
        f"부처 직접 발언 {counts['direct_buddha_speech']}개 · daily_ok {counts['daily_ok']}개 · "
        f"라이선스 확인 필요 {counts['license_needs_check']}개"
    )
    print("테마 분포: " + " · ".join(f"{k} {v}" for k, v in counts["per_theme"].items()))
    if short:
        print(f"참고: retrieval_text 가 {PLANNED_RETRIEVAL_LEN}자 미만인 구절 {short}개")

    # spec/answer.schema.json 의 Scripture.terms 는 maxItems 2 다. 감수본이 셋을 적어 둔
    # 구절이 있으면 그대로 내보내는 순간 답변 계약을 깬다. spec 은 이 스크립트가 고칠 자리가
    # 아니므로 지우지 않고 이름을 대어 알린다
    over = [it["id"] for it in seed["items"] if len(it.get("terms", [])) > 2]
    if over:
        print(f"경고: 용어 풀이가 3개 이상인 구절 {len(over)}개 ({', '.join(over)}). "
              "spec 의 Scripture.terms 는 2개까지라 한쪽을 정해야 합니다")

    if errors:
        print("\n게이트 위반이라 쓰지 않았어요:", file=sys.stderr)
        for line in errors:
            print(f"  - {line}", file=sys.stderr)
        return 1

    body = dump(seed)
    if args.check:
        if not OUT.exists():
            print(f"\n{OUT} 이 없어요.", file=sys.stderr)
            return 1
        if OUT.read_text(encoding="utf-8") != body:
            print(f"\n{OUT} 이 감수본과 어긋나요. 다시 만들어 주세요.", file=sys.stderr)
            return 1
        print(f"\n{OUT.relative_to(ROOT)} 최신이에요.")
        return 0

    OUT.write_text(body, encoding="utf-8")
    print(f"\n{OUT.relative_to(ROOT)} 에 썼어요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
