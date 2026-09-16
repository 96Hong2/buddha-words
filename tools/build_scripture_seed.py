#!/usr/bin/env python3
"""감수본 400구절을 제품이 쓰는 시드로 만든다.

입력
    data/scriptures/경전 감수본 (감수후 v2).md   400구절 전수 외부 감수본. **정본**
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
REVIEWED_MD = DATA / "경전 감수본 (감수후 v2).md"
DRAFT_DIR = DATA / "_draft"
OUT = DATA / "seed.json"
VISUAL_THEME_TS = ROOT / "spec" / "visual-theme.ts"
ANSWER_SCHEMA = ROOT / "spec" / "answer.schema.json"

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
    "bodhisattva",
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
    # v2 전수 감수가 화자를 뒤집은 자리다. 테리가타 웁비리 장에 실려 있지만 이 게송은
    # 웁비리 본인의 말이 아니라 딸을 잃고 우는 웁비리에게 부처가 건넨 말이다.
    # Thanissaro 역 등 여러 역주가 이 절을 「[The Buddha:]」로 명시한다.
    "thig.3.5": {
        "speaker_kind": "buddha",
        "display_label": "— 부처, 테리가타 3.5 (웁비리에게 건넨 말)",
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

# ────────────────────────────────────────────────────────────────────────────
# 화자를 400구절로 넓히는 두 장치
#
# v1 은 감수를 통과한 17구절마다 REVIEWED 에 손으로 한 줄씩 적었다. v2 는 395구절이
# 통과했으므로 그 방식으로는 못 간다. 그렇다고 화자를 지어내면 이번 감수가 잡아낸
# **결함 1위**(화자를 감춰 부처의 말처럼 읽히는 자리 23건)를 코드가 다시 만드는 셈이다.
#
# 그래서 둘로 나눈다.
#
#   SPEAKER_FROM_CITATION  감수자가 인용표기에 적어 둔 화자를 읽는다. 지어내지 않고
#                          **감수본에 쓰여 있는 글자만** 근거로 쓴다.
#   DEFAULT_SPEAKER_KIND   인용표기에 사람 이름이 없을 때 쓰는 문헌별 기본값.
#
# **buddha 는 두 장치 어느 쪽에서도 나오지 않는다.** 부처의 직접 발언은 REVIEWED 에
# 손으로 적은 구절에서만 나온다. 「부처의 말」이 서비스 이름이어도 코드가 화자를
# 부처로 올리지 않는다는 규칙은 v1 그대로다.
# ────────────────────────────────────────────────────────────────────────────

# 위에서부터 먼저 걸리는 것을 쓴다. 좁은 것을 앞에 둔다.
SPEAKER_FROM_CITATION: tuple[tuple[str, str], ...] = (
    (r"(유마힐)", "lay_bodhisattva"),
    (r"(승만부인)", "lay_bodhisattva"),
    (r"([가-힣]{2,6}보살)", "bodhisattva"),
    (r"([가-힣]{2,8}\s*장로니)", "nun"),
    (r"([가-힣]{2,8}\s*존자)", "disciple"),
    (r"([가-힣]{2,8}\s*장로)", "monk"),
    (r"(오조\s*홍인)", "zen_master"),
    (r"([가-힣]{2,6}\s*선사)", "zen_master"),
    (r"(혜능|임제|조주|서암|달마|대주혜해|곽암)", "zen_master"),
    (r"(원효|지눌|서산대사|서산|나옹|만공)", "author"),
    (r"(제자들|네\s*제자|아라한\s*제자들)", "disciple"),
)

# 인용표기에 사람 이름이 없을 때. 문헌 성격으로만 정하고 개인을 지목하지 않는다.
#
# canonical_tradition 은 「전승상 이 문헌의 가르침」이라는 뜻이다. 부처의 직접 발언이
# 아니고, 화면에도 「— 부처」가 붙지 않는다. 팔리 삼장과 대승 경은 여기에 둔다.
DEFAULT_SPEAKER_KIND: dict[str, str] = {
    "dhp": "canonical_tradition",
    "snp": "canonical_tradition",
    "sn": "canonical_tradition",
    "an": "canonical_tradition",
    "mn": "canonical_tradition",
    "dn": "canonical_tradition",
    "ud": "canonical_tradition",
    "iti": "canonical_tradition",
    "thag": "monk",
    "thig": "nun",
    "maha": "canonical_tradition",
    "zen": "zen_master",
    "kr": "author",
}

# 화자 이름이 반드시 화면 귀속 문구에 드러나야 하는 종류.
# 이 종류인데 이름이 안 보이면 「누가 한 말인지 모르는 채로」 카드가 나간다.
NAMED_SPEAKER_KINDS = frozenset(
    {"bodhisattva", "lay_bodhisattva", "disciple", "nun", "monk", "zen_master", "author", "deity"}
)


def speaker_from_citation(citation: str) -> tuple[str, str]:
    """인용표기에서 화자를 읽는다. 못 읽으면 ("", "") 다."""
    for pattern, kind in SPEAKER_FROM_CITATION:
        got = re.search(pattern, citation)
        if got:
            return kind, got.group(1).strip()
    return "", ""


def default_speaker_kind(scripture_id: str) -> str:
    parts = scripture_id.split(".")
    for key in (".".join(parts[:2]), parts[0]):
        if key in DEFAULT_SPEAKER_KIND:
            return DEFAULT_SPEAKER_KIND[key]
    return "unknown"


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
    },
    "kr.naong.cheongsan": {
        "speaker_kind": "unknown",
        "text_type": "poetic_line",
        "citation": "나옹 작으로 전하던 「청산은 나를 보고」",
        "evidence_note": (
            "나옹집 수록 여부가 학계에서 다투어지고, 원작자를 당나라 한산(寒山)으로 보는 "
            "설까지 있습니다. 진작을 확인할 1차 문헌을 찾지 못해 제품 데이터에서 내립니다."
        ),
    },
    "dhp.75": {
        "speaker_kind": "canonical_tradition",
        "text_type": "direct_verse",
        "evidence_note": (
            "번역문 결론부가 「부처의 제자인 비구는 홀로 머무는 수행을 길러야 한다」는 "
            "출가 권유입니다. 결론을 지우면 원전 훼손이고 두면 일반 사용자 카드에 "
            "출가를 권하게 되어, 고쳐서 살릴 수 없다고 판정했습니다."
        ),
    },
    "dhp.219": {
        "speaker_kind": "canonical_tradition",
        "text_type": "direct_verse",
        "evidence_note": (
            "짝이 되는 220게는 죽은 뒤 다음 생에서 선업이 가족처럼 맞아 준다는 내생 전용 "
            "이야기입니다. 내생 틀을 지우면 원문이 아니게 되고, 두면 일반 생활 고민 카드로 "
            "쓸 수 없어 고쳐서 살릴 수 없다고 판정했습니다."
        ),
    },
    "snp.3.1.424": {
        "speaker_kind": "canonical_tradition",
        "text_type": "direct_verse",
        "evidence_note": (
            "빔비사라 왕의 권유를 부처가 사양하며 한 출가 선언입니다. 일반화하면 원전에 "
            "없는 뜻이 되고 그대로 두면 출가를 권하는 결론부가 되어, 고쳐서 살릴 수 "
            "없다고 판정했습니다."
        ),
    },
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


def terms_cap() -> int:
    """용어 풀이를 몇 개까지 싣나. 정본은 spec 이고 여기서 읽어 쓴다."""
    schema = json.loads(ANSWER_SCHEMA.read_text(encoding="utf-8"))
    return int(schema["$defs"]["Scripture"]["properties"]["terms"]["maxItems"])


def review_status(mark: str) -> tuple[str, bool]:
    """감수 줄의 체크 상자를 읽는다. ☒ 가 찍힌 칸이 판정이다.

    (status, fix_applied) 를 돌려준다.

    v1 은 「고쳐야 함」이 생기면 멈췄다. 고친 문장을 어디서 받을지 정하지 않았기 때문이다.
    v2(400구절 전수 감수)가 그 자리를 정했다. **감수자가 고친 문장을 감수본 본문에 직접
    반영한다.** 그래서 「고쳐야 함」 블록의 번역문·풀이·한마디·출처는 이미 고쳐진 값이고,
    무엇을 왜 고쳤는지는 같은 블록의 메모 줄에 남는다.

    곧 「고쳐야 함」은 **통과다.** 다만 손댄 구절이라는 사실을 잃지 않으려고 fix_applied 로
    따로 표시하고 counts 에서도 따로 센다. 이 값을 approved 와 뭉개면 「감수가 무엇을
    고쳤는가」를 되짚을 자리가 없어진다.

    빼야 함은 그대로 rejected 다. 살릴 수 없다고 판정한 것이라 고친 문장이 없다.
    """
    if re.search(r"☒ ?통과", mark):
        return "approved", False
    if re.search(r"☒ ?빼야 함", mark):
        return "rejected", False
    if re.search(r"☒ ?고쳐야 함", mark):
        return "approved", True
    return "needs_review", False


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
    status, fix_applied = review_status(parsed["review_mark"])
    work, base_edition, language, guessed_type = work_of(sid)

    if status == "approved":
        # 귀속은 세 겹이다. 위가 이긴다.
        #   1. REVIEWED   손으로 적은 표. 부처 직접 발언은 여기서만 나온다
        #   2. 인용표기    감수자가 「사리뿟따 존자가 설한 …」처럼 적어 둔 글자
        #   3. 문헌 기본값 사람 이름이 없을 때. 개인을 지목하지 않는다
        override = REVIEWED.get(sid, {})
        cited_kind, cited_name = speaker_from_citation(parsed["citation"])
        if override.get("speaker_kind"):
            speaker_kind, speaker_source = override["speaker_kind"], "reviewed_table"
        elif cited_kind:
            speaker_kind, speaker_source = cited_kind, "citation"
        else:
            speaker_kind, speaker_source = default_speaker_kind(sid), "work_default"
        # 전승 문헌에는 말한 사람이 없다. 「법구경 전승상 …」 같은 설명을 이름 칸에 두면
        # 화면이 그것을 화자 이름으로 읽는다
        if speaker_kind == "canonical_tradition":
            speaker_name = ""
        else:
            speaker_name = parsed["speaker_name"] or cited_name
        raw_type = parsed["text_type"]
        text_type = TEXT_TYPE_FOLD.get(raw_type, raw_type) or guessed_type
        # 표에 손으로 적은 문구가 있으면 그것을, 없으면 감수된 인용표기를 그대로 쓴다.
        # 인용표기에는 v2 감수가 화자를 밝혀 넣었으므로 「— 부처」 같은 말을 새로 붙이지 않는다
        display_label = override.get("display_label") or parsed["citation"]
        base_edition = override.get("base_edition", base_edition)
        source_text = override.get("source_text", "")
        evidence_note = " · ".join(x for x in (parsed["notes"], parsed["evidence_note"]) if x)
        if fix_applied:
            # 무엇을 왜 고쳤는지는 감수본 메모 줄에 있다. 그것을 근거에 함께 남긴다
            evidence_note = " · ".join(
                x for x in ("감수에서 고침 반영", parsed["memo"], evidence_note) if x
            )
    elif status == "rejected":
        override = REJECTED.get(sid, {})
        speaker_kind = override.get("speaker_kind", "unknown")
        speaker_source = "reviewed_table" if override else "none"
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
        speaker_source = "none"
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
            # 화자를 어디서 얻었나. reviewed_table 이 가장 세고 work_default 가 가장 약하다
            "speaker_source": speaker_source,
        },
        "review": {
            "status": status,
            # 감수가 문장을 고쳐 통과시킨 구절이다. 고친 내용은 evidence_note 앞머리에 있다
            "fix_applied": fix_applied,
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
    reviewed_by = "외부 문헌 감수 v2 (400구절 전수)"
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
        # v2 전수 감수의 결함 1위를 코드로 막는다.
        # 문장은 맞는데 인용표기가 화자를 감춰 부처의 말처럼 읽히던 자리가 23건 있었다.
        # 사람이 말한 구절은 화면 귀속 문구에 그 이름이 반드시 드러나야 한다
        label = it["attribution"]["display_label"]
        if it["speaker_kind"] in NAMED_SPEAKER_KINDS:
            if not label.strip():
                errors.append(f"{it['id']}: 화자가 {it['speaker_kind']} 인데 귀속 문구가 비었어요")
            elif re.match(r"부처(?![의님])", label.lstrip("— ")):
                # 「부처의 제자들, …」은 괜찮다. 「부처, …」로 시작하는 것만 막는다
                errors.append(f"{it['id']}: 화자가 부처가 아닌데 귀속 문구가 부처로 시작해요")
            # 손으로 적은 표가 아니라 인용표기에서 이름을 얻은 자리만 본다.
            # 표는 사람이 확인해 쓴 문구라 대표 화자 하나만 적어 둔 것이 정상이다
            elif it["attribution"]["speaker_source"] == "citation":
                head = re.split(r"[(·,\s↔]", it["speaker_name"].strip(), maxsplit=1)[0]
                if head and head not in label:
                    errors.append(
                        f"{it['id']}: 귀속 문구에 화자 {head!r} 가 안 보여요 ({label!r})"
                    )
        # 감수를 통과한 구절은 화자를 모른 채로 나갈 수 없다
        if it["review"]["status"] == "approved" and it["speaker_kind"] == "unknown":
            errors.append(f"{it['id']}: 감수를 통과했는데 화자 종류가 unknown 이에요")

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
            "tools/build_scripture_seed.py 가 data/scriptures/경전 감수본 (감수후 v2).md 에서 "
            "만든 파일이다. 손으로 고치지 않는다. review.status 가 approved 인 구절만 운영에 "
            "나가고, rejected 는 어느 환경에서도 나가지 않는다."
        ),
        "counts": {
            "total": len(shipping),
            "approved": status_count["approved"],
            # approved 안에서 감수가 문장을 고쳐 통과시킨 것
            "approved_with_fix": sum(1 for it in shipping if it["review"]["fix_applied"]),
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
        f"구절 {counts['total']}개 · 감수 통과 {counts['approved']}개"
        f"(그중 고침 반영 {counts['approved_with_fix']}개) · "
        f"미감수 {counts['needs_review']}개 · 제외 {counts['rejected']}개"
    )
    print(
        f"부처 직접 발언 {counts['direct_buddha_speech']}개 · daily_ok {counts['daily_ok']}개 · "
        f"라이선스 확인 필요 {counts['license_needs_check']}개"
    )
    print("테마 분포: " + " · ".join(f"{k} {v}" for k, v in counts["per_theme"].items()))
    if short:
        print(f"참고: retrieval_text 가 {PLANNED_RETRIEVAL_LEN}자 미만인 구절 {short}개")

    # 상한을 여기 적지 않고 spec 에서 읽는다. 두 곳에 적으면 한쪽만 고쳐져 어긋난다.
    # 넘치면 경고가 아니라 게이트다. 그대로 내보내는 순간 답변 계약을 깨기 때문이다
    cap = terms_cap()
    over = [it["id"] for it in seed["items"] if len(it.get("terms", [])) > cap]
    if over:
        errors.append(
            f"용어 풀이가 {cap}개를 넘는 구절 {len(over)}개 ({', '.join(over)}). "
            f"spec 의 Scripture.terms 는 {cap}개까지예요"
        )

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
