"""공유 카드를 서버가 그린다.

카톡에 링크를 보냈을 때 미리보기에 뜨는 그림이 이것이다. 두 장을 만든다.

  카드 1080×1620  링크 랜딩과 이미지 저장에 쓴다. 여섯이 다 들어간다
  OG   1200×600   메신저 미리보기. 작게 잘려 보여도 넷(구절 · 귀속 · 소표기 · 워드마크)이 읽힌다

카드에 들어가는 것: 부처 그림 · 경전 원문과 귀속 · 한 줄 풀이 · AI 소표기 ·
부처의 말 워드마크 · 「나도 내 고민에 맞는 말을 받아보기」.

**사용자가 적은 고민 원문은 어떤 경우에도 들어가지 않는다.** 규칙을 주석이 아니라 시그니처로
지킨다. 그리는 함수는 `ShareCardData` 만 받고 그 자료형에는 원문을 담을 자리가 없다.
문자열을 따로 끼워 넣으려 하면 TypeError 로 막힌다.

── 왜 「오늘의 부처의 말」과 마음 태그가 카드에서 빠졌나 ──────────────────────

전에는 그 한마디가 카드의 가장 큰 글씨였다. 원문 문자열은 실리지 않았지만, 한마디는 그 고민을
읽고 쓴 문장이라 상황이 그대로 비쳤다. 실제로 그려 본 카드가 이랬다.

    #불안 #인정욕구 #분노
    「아이 소식으로 너를 재단하게 두지 마라. 남의 말은 너의 가치를 정하지 못한다.」

받는 사람은 이 두 줄로 보낸 사람이 아이 문제로 누구에게 무슨 말을 들었는지 읽는다. 원문을
싣지 않는다는 규칙의 목적이 문장 생성으로 우회된 것이다.

그래서 카드의 주인공을 경전 구절로 바꿨다. 남는 것은 전부 이 고민과 무관하게
존재하던 글이다. 한 줄 풀이만 모델이 쓰는데, 그 자리는 「구절 자체의 뜻」을 적는 첫 문장으로
못 박혀 있다(`integrations/llm/prompts.py` PASS2 · `one_line_gloss`).

치수는 화면 카드(`frontend/src/domains/share/share.css`, 390px 기준)를 1080/390 배로 키운 값이다.
두 장이 같은 판에서 나와야 앱에서 본 카드와 카톡에서 본 카드가 같아 보인다.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, fields

from PIL import Image, ImageDraw, ImageFont

from app.domains.share import artwork, fonts, tokens
from app.domains.share.fonts import font
from app.domains.share.text import Line, block_height, draw_lines, line_height, wrap

CARD_SIZE = (1080, 1620)
OG_SIZE = (1200, 600)

# 화면 카드가 390px 기준이라 치수를 이 배율로 키운다
S = CARD_SIZE[0] / 390.0

# 소표기. 생성형 AI 고지를 겸한다. 계획 M5 완료선 1 이 이 표기를 센다.
#
# 앞머리는 **감수를 통과한 구절에만** 감수했다고 적는다. 카드는 앱 밖으로 나가 「부처의 말」
# 워드마크와 나란히 놓이는 그림이라, 초안 구절에 감수 도장을 찍으면 되돌릴 방법이 없다.
# 미감수 문구는 경전 저장소가 쓰는 말과 같다(`domains/scripture/repo.py` 의 `_REVIEW_PENDING`).
# 같은 말을 써야 화면과 카드가 다른 기준을 말하지 않는다
REVIEWED_HEAD = "경전 원문은 사람이 감수했어요"
DRAFT_HEAD = "문헌 감수는 아직 받지 않은 구절이에요"
# 카드에서 AI 가 쓴 글은 한 줄 풀이 하나뿐이라 그것만 가리킨다. 문구는 화면 카드와 같다
AI_TAIL = "한 줄 풀이는 AI 생성"
# OG 미리보기에는 한 줄 풀이가 실리지 않는다. 없는 글을 가리키지 않게 따로 적는다.
# 여기서 AI 가 한 일은 이 고민에 맞는 구절을 고른 것이다
OG_TAIL = "AI 가 고른 구절이에요"


def ai_note(reviewed: bool) -> str:
    """카드 1080×1620 아래에 적는 한 줄."""
    return f"{REVIEWED_HEAD if reviewed else DRAFT_HEAD} · {AI_TAIL}"


def og_note(reviewed: bool) -> str:
    """OG 미리보기에 적는 한 줄."""
    return f"{REVIEWED_HEAD if reviewed else DRAFT_HEAD} · {OG_TAIL}"


# 금색 상자 안만 경전 원문이라고 알리는 머리. 화면 카드의 sh-card__qlab 과 같다
QUOTE_LABEL = "경전 원문"
WORDMARK = "부처의 말"
CTA = "나도 내 고민에 맞는 말을 받아보기"

# 한 줄 풀이 상한. 해설 첫 문장을 여기서 자른다. 모델을 다시 부르지 않는다
GLOSS_CHARS = 96


@dataclass(frozen=True, slots=True)
class ShareCardData:
    """카드에 그릴 것 전부.

    글이 실리는 칸이 앞의 셋뿐인 것이 규칙이다. 고민 원문을 담을 자리가 없어야 실수로도
    못 싣는다. 한마디와 마음 태그는 그 고민에서 나온 값이라 여기서 뺐다(머리말 참고).
    `reviewed` 는 참거짓 깃발이라 어떤 문장도 실어 나르지 못한다.
    """

    scripture_text: str
    # 누가 한 말인가. 출처가 아니라 귀속이다. 카드는 앱 밖으로 나가므로 이 줄이 특히 중요하다
    scripture_attribution: str
    gloss_line: str
    # 이 구절이 문헌 감수를 통과했나. 소표기가 이 값을 보고 문장을 가른다.
    # None 은 부른 쪽이 말해 주지 않았다는 뜻이고, 그때는 `is_reviewed` 가 시드에서 찾아본다
    reviewed: bool | None = None


# 카드가 받는 것의 전부. 테스트가 이 집합이 늘어나지 않았는지 본다.
# 글이 실리는 칸은 앞의 셋이고 `reviewed` 는 참거짓 깃발이라 문장을 실어 나르지 못한다
ALLOWED_FIELDS = frozenset(f.name for f in fields(ShareCardData))

_SENTENCE_END = re.compile(r"[.!?]")


class UnrenderableTextError(Exception):
    """글꼴이 못 그리는 글자가 카드에 들어왔다.

    메시지에 글자 자체를 담지 않는다. 코드포인트만 적는다. 한마디는 고민에서 나온 글이라
    조각이라도 로그에 남기지 않는다.
    """


# 어느 글을 어느 글꼴로 그리는지. 여기 없는 글은 카드에 그려지지 않는다
def _typeset_plan(data: ShareCardData) -> tuple[tuple[str, str, str], ...]:
    return (
        ("경전 원문", "serif", data.scripture_text),
        ("귀속", "sans_semibold", data.scripture_attribution),
        ("한 줄 풀이", "sans_medium", data.gloss_line),
        ("경전 원문 머리", "sans_bold", QUOTE_LABEL),
        ("소표기와 CTA", "sans_semibold", ai_note(True) + ai_note(False) + og_note(False) + CTA),
        ("워드마크", "serif_bold", WORDMARK),
    )


def check_renderable(data: ShareCardData) -> None:
    """글꼴이 못 그리는 글자가 하나라도 있으면 그리지 않고 터진다.

    한자가 그 자리다. Pretendard 도 MaruBuri 도 한자를 담고 있지 않아 그대로 그리면
    네모(두부)가 찍힌다. 카드는 한 장이 통째로 카톡에 돌아다니는 그림이라 되돌릴 수 없다.
    """
    broken = []
    for where, role, text in _typeset_plan(data):
        gone = fonts.missing(role, text)
        if gone:
            points = " ".join(f"U+{ord(c):04X}" for c in gone)
            broken.append(f"{where}({fonts.FILES[role]}) {len(gone)}자 {points}")
    if broken:
        raise UnrenderableTextError("카드 글꼴에 없는 글자가 있어요: " + " · ".join(broken))


def is_reviewed(data: ShareCardData) -> bool:
    """이 카드의 경전이 문헌 감수를 통과했나.

    부른 쪽이 `reviewed` 를 채워 주면 그 값이 답이다. 비어 있으면 시드에서 같은 문장을 찾아
    감수 상태를 읽는다. 카드가 들고 있는 것은 구절 본문뿐이라 그것으로 되짚는다.
    시드에 없는 문장이면 감수했다고 적지 않는다. 증거가 없을 때 도장을 찍는 쪽이 사고다.
    """
    if data.reviewed is not None:
        return data.reviewed
    return data.scripture_text in _approved_texts()


def _approved_texts() -> frozenset[str]:
    """감수를 통과한 구절의 본문 전부. 시드는 저장소가 한 번 읽어 들고 있다."""
    from app.domains.scripture.repo import load_seed

    return frozenset(s.text for s in load_seed() if s.reviewed)


def one_line_gloss(source: str) -> str:
    """해설 첫 문장을 96자까지. 화면의 `oneLineGloss` 와 같은 규칙이다."""
    text = re.sub(r"\s+", " ", source.strip())
    stop = _SENTENCE_END.search(text)
    first = text[: stop.end()] if stop else text
    if len(first) <= GLOSS_CHARS:
        return first
    return first[: GLOSS_CHARS - 1].rstrip() + "…"


# ────────────────────────────────────────────────────────────────────────────
# 카드 1080×1620
# ────────────────────────────────────────────────────────────────────────────

PAD_X = 32 * S
PAD_BOTTOM = 26 * S
# 그림 띠. 글이 짧으면 남은 자리를 그림이 가져가고, 길면 480 까지 물러선다.
# 480 아래로는 못 내려간다. 부처의 머리 하나가 원본 높이의 0.29 라 그보다 얇으면 얼굴이 잘린다.
# 띠가 길어지면 crop 비율이 달라져 연못과 나무까지 들어온다(artwork.hero).
HERO_MIN, HERO_MAX = 480.0, 760.0
HERO_FADE = 150
GAP_HERO = 16 * S
# 한 줄 풀이와 소표기 사이에 늘 남겨 두는 숨. 이만큼을 먼저 떼고 남은 것을 그림에 준다
GAP_TAIL = 14 * S

QUOTE_GAP = 14 * S
QUOTE_PAD = 15 * S
QUOTE_PAD_B = 13 * S
QUOTE_RADIUS = 11.6 * S
QUOTE_RULE = max(2, round(1 * S))
QLAB_FS = 10.4 * S
QLAB_LH = 1.2
QLAB_GAP = 7 * S

# 경전이 카드의 주인공이라 짧은 구절은 크게 세운다. 감수 원문은 자르지 않고 네 단계로 낮춘다.
# 경계와 크기는 화면 카드(ShareCard.tsx verseClass · share.css)와 같은 값이다
VERSE_STEPS = (
    (60, 19.4 * S, 1.62),
    (110, 16.4 * S, 1.68),
    (160, 14.2 * S, 1.72),
    (10**6, 12.6 * S, 1.75),
)
CITE_GAP = 8 * S
CITE_FS = 11.6 * S
CITE_LH = 1.4

GLOSS_GAP = 13 * S
GLOSS_FS = 12.4 * S
GLOSS_LH = 1.66

AI_FS = 8.4 * S
AI_LH = 1.4
AI_PAD_B = 9 * S

BRAND_RULE = max(2, round(1 * S))
BRAND_PAD_T = 14 * S
BRAND_GAP = 10 * S
MARK_BOX = 34 * S
MARK_RADIUS = 10 * S
MARK_GLYPH = 20 * S
WORD_FS = 11.6 * S
WORD_LH = 1.25
CTA_FS = 8.7 * S
CTA_LH = 1.5
CTA_MT = 2 * S

# 글이 길면 이 순서로 줄여 가며 자리를 만든다. 여기까지 줄여도 안 들어가면 풀이를 먼저 접는다
FIT_STEPS = (1.0, 0.94, 0.88, 0.82, 0.76, 0.70, 0.64)


@dataclass(slots=True)
class _Body:
    fit: float
    script_font_size: float
    script_line_height: float
    qlab_rows: list[Line]
    script_rows: list[Line]
    cite_rows: list[Line]
    gloss_rows: list[Line]
    height: float


def _verse_step(text: str) -> tuple[float, float]:
    """구절 길이로 글자 크기와 줄간격을 고른다. 화면 카드의 verseClass 와 같은 경계다."""
    length = len(text.replace("\n", ""))
    for limit, size, ratio in VERSE_STEPS:
        if length <= limit:
            return size, ratio
    return VERSE_STEPS[-1][1], VERSE_STEPS[-1][2]


def _build_body(data: ShareCardData, fit: float) -> _Body:
    inner = CARD_SIZE[0] - 2 * PAD_X
    quote_inner = inner - 2 * QUOTE_PAD

    size, ratio = _verse_step(data.scripture_text)
    size *= fit
    qlab_font = font("sans_bold", QLAB_FS)
    script_font = font("serif", size)
    cite_font = font("sans_semibold", CITE_FS * fit)
    gloss_font = font("sans_medium", GLOSS_FS * fit)

    qlab_rows = wrap(QUOTE_LABEL, qlab_font, quote_inner)
    script_rows = wrap(data.scripture_text, script_font, quote_inner)
    cite_rows = wrap(data.scripture_attribution, cite_font, quote_inner)
    gloss_rows = wrap(data.gloss_line, gloss_font, inner)

    height = (
        QUOTE_PAD
        + block_height(len(qlab_rows), qlab_font, QLAB_LH)
        + QLAB_GAP
        + block_height(len(script_rows), script_font, ratio)
        + CITE_GAP
        + block_height(len(cite_rows), cite_font, CITE_LH)
        + QUOTE_PAD_B
        + GLOSS_GAP
        + block_height(len(gloss_rows), gloss_font, GLOSS_LH)
    )
    return _Body(fit, size, ratio, qlab_rows, script_rows, cite_rows, gloss_rows, height)


def _bottom_height() -> float:
    brand = max(
        MARK_BOX,
        line_height(font("serif_bold", WORD_FS), WORD_LH)
        + CTA_MT
        + line_height(font("sans_semibold", CTA_FS), CTA_LH),
    )
    return (
        line_height(font("sans_semibold", AI_FS), AI_LH)
        + AI_PAD_B
        + BRAND_RULE
        + BRAND_PAD_T
        + brand
        + PAD_BOTTOM
    )


def _fit_body(data: ShareCardData) -> _Body:
    room = CARD_SIZE[1] - _bottom_height() - GAP_TAIL - GAP_HERO - HERO_MIN
    body = _build_body(data, FIT_STEPS[0])
    for fit in FIT_STEPS:
        body = _build_body(data, fit)
        if body.height <= room:
            return body
    # 여기까지 왔으면 경전이 이례적으로 길다. 경전은 감수 원문이라 자르지 않고
    # 한 줄 풀이를 먼저 접는다. 그래도 안 되면 마지막 단계 그대로 그리고 아래가 밀린다
    trimmed = ShareCardData(
        scripture_text=data.scripture_text,
        scripture_attribution=data.scripture_attribution,
        gloss_line="",
        reviewed=data.reviewed,
    )
    shrunk = _build_body(trimmed, FIT_STEPS[-1])
    return shrunk if shrunk.height <= room else body


def _brand_row(draw: ImageDraw.ImageDraw, canvas: Image.Image, top: float) -> None:
    left = PAD_X
    right = CARD_SIZE[0] - PAD_X
    draw.rectangle((left, top, right, top + BRAND_RULE - 1), fill=tokens.rgb("line"))

    y = top + BRAND_RULE + BRAND_PAD_T
    box = round(MARK_BOX)
    draw.rounded_rectangle(
        (left, y, left + box, y + box), radius=MARK_RADIUS, fill=tokens.rgb("accent-soft")
    )
    glyph = artwork.lotus_mark(round(MARK_GLYPH))
    canvas.paste(
        glyph, (round(left + (box - glyph.width) / 2), round(y + (box - glyph.height) / 2)), glyph
    )

    text_x = left + box + BRAND_GAP
    word_font = font("serif_bold", WORD_FS)
    cta_font = font("sans_semibold", CTA_FS)
    stack = line_height(word_font, WORD_LH) + CTA_MT + line_height(cta_font, CTA_LH)
    text_y = y + (box - stack) / 2
    text_y = draw_lines(
        draw,
        [Line(WORDMARK, 0)],
        font=word_font,
        ratio=WORD_LH,
        top=text_y,
        fill=tokens.rgb("text"),
        left=text_x,
    )
    draw_lines(
        draw,
        [Line(CTA, 0)],
        font=cta_font,
        ratio=CTA_LH,
        top=text_y + CTA_MT,
        fill=tokens.rgb("text-muted"),
        left=text_x,
    )


def render_card(data: ShareCardData) -> bytes:
    """1080×1620 PNG. 받는 것은 `ShareCardData` 하나뿐이다."""
    check_renderable(data)
    width, height = CARD_SIZE
    paper = tokens.rgb("surface")
    canvas = Image.new("RGB", CARD_SIZE, paper)

    body = _fit_body(data)
    bottom = _bottom_height()
    hero_h = height - bottom - GAP_TAIL - GAP_HERO - body.height
    hero_h = round(min(max(hero_h, HERO_MIN), HERO_MAX))

    band = artwork.hero(width, hero_h)
    artwork.fade_down(band, paper, min(HERO_FADE, hero_h // 3))
    canvas.paste(band, (0, 0))

    draw = ImageDraw.Draw(canvas)
    center = width / 2

    # 경전 인용면. 카드의 주인공이라 그림 바로 아래에 선다.
    # 위쪽 금색 선과 「경전 원문」 머리가 이 자리가 경전임을 말한다
    quote_top = hero_h + GAP_HERO
    qlab_font = font("sans_bold", QLAB_FS)
    script_font = font("serif", body.script_font_size)
    cite_font = font("sans_semibold", CITE_FS * body.fit)
    quote_h = (
        QUOTE_PAD
        + block_height(len(body.qlab_rows), qlab_font, QLAB_LH)
        + QLAB_GAP
        + block_height(len(body.script_rows), script_font, body.script_line_height)
        + CITE_GAP
        + block_height(len(body.cite_rows), cite_font, CITE_LH)
        + QUOTE_PAD_B
    )
    draw.rounded_rectangle(
        (PAD_X, quote_top, width - PAD_X, quote_top + quote_h),
        radius=QUOTE_RADIUS,
        fill=tokens.rgb("surface-scripture"),
    )
    draw.rectangle(
        (PAD_X + QUOTE_RADIUS, quote_top, width - PAD_X - QUOTE_RADIUS, quote_top + QUOTE_RULE - 1),
        fill=tokens.rgb("accent-rule"),
    )
    inner_y = draw_lines(
        draw,
        body.qlab_rows,
        font=qlab_font,
        ratio=QLAB_LH,
        top=quote_top + QUOTE_PAD,
        fill=tokens.rgb("accent-text"),
        center=center,
    )
    inner_y = draw_lines(
        draw,
        body.script_rows,
        font=script_font,
        ratio=body.script_line_height,
        top=inner_y + QLAB_GAP,
        fill=tokens.rgb("text"),
        center=center,
    )
    draw_lines(
        draw,
        body.cite_rows,
        font=cite_font,
        ratio=CITE_LH,
        top=inner_y + CITE_GAP,
        fill=tokens.rgb("accent-text"),
        center=center,
    )
    y = quote_top + quote_h

    if body.gloss_rows and body.gloss_rows[0].text:
        gloss_font = font("sans_medium", GLOSS_FS * body.fit)
        draw_lines(
            draw,
            body.gloss_rows,
            font=gloss_font,
            ratio=GLOSS_LH,
            top=y + GLOSS_GAP,
            fill=tokens.rgb("text-muted"),
            center=center,
        )

    # 아래 두 줄은 글 길이와 무관하게 늘 같은 자리다. 잘리면 안 되는 표기라서 바닥에 못 박는다
    brand_stack = max(
        MARK_BOX,
        line_height(font("serif_bold", WORD_FS), WORD_LH)
        + CTA_MT
        + line_height(font("sans_semibold", CTA_FS), CTA_LH),
    )
    brand_top = height - PAD_BOTTOM - brand_stack - BRAND_PAD_T - BRAND_RULE
    ai_font = font("sans_semibold", AI_FS)
    draw_lines(
        draw,
        [Line(ai_note(is_reviewed(data)), 0)],
        font=ai_font,
        ratio=AI_LH,
        top=brand_top - AI_PAD_B - line_height(ai_font, AI_LH),
        fill=tokens.rgb("text-weak"),
        right=width - PAD_X,
    )
    _brand_row(draw, canvas, brand_top)

    return _png(canvas)


# ────────────────────────────────────────────────────────────────────────────
# OG 1200×600. 메신저가 작게 잘라 보여 주는 자리라 글을 적게 싣는다
# ────────────────────────────────────────────────────────────────────────────

OG_PAD = 56
OG_ART = 440
OG_FADE = 160
# 글이 길면 이 순서로 줄인다. 아래 워드마크는 자리가 고정이라 글이 그 위에서 멈춰야 한다
OG_LINE_STEPS = (40.0, 36.0, 32.0, 29.0, 26.0, 24.0)
OG_LINE_LH = 1.62
OG_QLAB_FS = 20.0
OG_QLAB_LH = 1.2
OG_QLAB_GAP = 14
OG_CITE_FS = 22.0
OG_CITE_LH = 1.4
OG_CITE_GAP = 18
# 귀속은 화면 밖으로 흘려보내지 않고 꺾는다. 두 줄까지 두고 넘치면 말줄임한다
OG_CITE_ROWS = 2
OG_NOTE_FS = 19.0
OG_NOTE_LH = 1.45
OG_NOTE_GAP = 6
OG_BRAND_BOX = 64
# 글 뭉치와 워드마크 사이에 늘 남는 숨. 이 아래로 글이 내려오지 못한다
OG_BRAND_GAP = 22


def _clamp_rows(
    rows: list[Line], limit: int, used: ImageFont.FreeTypeFont, width: float
) -> list[Line]:
    """줄 수를 제한하고 마지막 줄을 말줄임으로 닫는다."""
    if len(rows) <= limit:
        return rows
    kept = list(rows[:limit])
    tail = kept[-1].text
    while tail and used.getlength(tail + "…") > width:
        tail = tail[:-1]
    closed = tail.rstrip() + "…"
    kept[-1] = Line(closed, used.getlength(closed))
    return kept


@dataclass(slots=True)
class _OgBody:
    verse_font: ImageFont.FreeTypeFont
    verse_rows: list[Line]
    cite_rows: list[Line]
    note_rows: list[Line]


def _og_body(data: ShareCardData, inner: float, room: float) -> _OgBody:
    """경전 구절 · 귀속 · 소표기를 주어진 세로 자리 안에 앉힌다.

    구절만 줄인다. 귀속과 소표기는 작은 글씨라 더 줄이면 미리보기에서 안 읽힌다.
    """
    cite_font = font("sans_semibold", OG_CITE_FS)
    note_font = font("sans_semibold", OG_NOTE_FS)
    cite_rows = _clamp_rows(
        wrap(data.scripture_attribution, cite_font, inner), OG_CITE_ROWS, cite_font, inner
    )
    note_rows = wrap(og_note(is_reviewed(data)), note_font, inner)
    tail = (
        OG_CITE_GAP
        + block_height(len(cite_rows), cite_font, OG_CITE_LH)
        + OG_NOTE_GAP
        + block_height(len(note_rows), note_font, OG_NOTE_LH)
    )

    body = None
    for size in OG_LINE_STEPS:
        verse_font = font("serif", size)
        rows = wrap(data.scripture_text, verse_font, inner)
        body = _OgBody(verse_font, rows, cite_rows, note_rows)
        if block_height(len(rows), verse_font, OG_LINE_LH) + tail <= room:
            return body
    # 마지막 단계로도 안 들어가면 미리보기에서만 줄 수로 자르고 말줄임으로 닫는다.
    # 전문은 카드 1080×1620 이 진다. 감수 원문을 그 카드에서 자르는 일은 없다
    assert body is not None
    limit = max(1, int((room - tail) // line_height(body.verse_font, OG_LINE_LH)))
    body.verse_rows = _clamp_rows(body.verse_rows, limit, body.verse_font, inner)
    return body


def render_og(data: ShareCardData) -> bytes:
    """1200×600 PNG. 카톡 미리보기에서 넷(구절 · 귀속 · 소표기 · 워드마크)이 읽혀야 한다.

    한 줄 풀이는 여기 싣지 않는다. 미리보기는 작게 잘려 보이는 자리라 다 넣으면 어느 것도
    안 읽힌다. 여섯은 카드 1080×1620 이 다 진다.
    """
    check_renderable(data)
    width, height = OG_SIZE
    paper = tokens.rgb("surface")
    canvas = Image.new("RGB", OG_SIZE, paper)

    band = artwork.hero(OG_ART, height)
    canvas.paste(band, (0, 0))
    # 그림과 종이가 만나는 세로 경계를 녹인다. 잘린 선이 그대로 보이면 붙여 놓은 티가 난다
    fade = Image.new("RGBA", (OG_FADE, 1))
    columns = fade.load()
    for x in range(OG_FADE):
        columns[x, 0] = (*paper, round(255 * (x / (OG_FADE - 1)) ** 1.3))
    fade = fade.resize((OG_FADE, height), Image.BILINEAR)
    canvas.paste(fade, (OG_ART - OG_FADE, 0), fade)

    draw = ImageDraw.Draw(canvas)
    left = OG_ART + OG_PAD - 40
    inner = width - left - OG_PAD

    # 「경전 원문」 머리. 미리보기만 보고 넘기는 사람에게도 이 글이 경전이라는 것을 알린다
    qlab_font = font("sans_bold", OG_QLAB_FS)
    y = draw_lines(
        draw,
        [Line(QUOTE_LABEL, 0)],
        font=qlab_font,
        ratio=OG_QLAB_LH,
        top=float(OG_PAD),
        fill=tokens.rgb("accent-text"),
        left=left,
    )
    y += OG_QLAB_GAP

    # 워드마크 자리는 바닥에 못 박혀 있다. 글은 그 위에서 멈춘다
    box = OG_BRAND_BOX
    brand_y = height - OG_PAD - box
    body = _og_body(data, inner, brand_y - OG_BRAND_GAP - y)

    # 경전 구절
    y = draw_lines(
        draw,
        body.verse_rows,
        font=body.verse_font,
        ratio=OG_LINE_LH,
        top=y,
        fill=tokens.rgb("text"),
        left=left,
    )

    # 귀속과 AI 소표기
    y = draw_lines(
        draw,
        body.cite_rows,
        font=font("sans_semibold", OG_CITE_FS),
        ratio=OG_CITE_LH,
        top=y + OG_CITE_GAP,
        fill=tokens.rgb("accent-text"),
        left=left,
    )
    draw_lines(
        draw,
        body.note_rows,
        font=font("sans_semibold", OG_NOTE_FS),
        ratio=OG_NOTE_LH,
        top=y + OG_NOTE_GAP,
        fill=tokens.rgb("text-weak"),
        left=left,
    )

    # 워드마크와 CTA. 바닥에 못 박는다
    draw.rounded_rectangle(
        (left, brand_y, left + box, brand_y + box), radius=19, fill=tokens.rgb("accent-soft")
    )
    glyph = artwork.lotus_mark(40)
    canvas.paste(glyph, (round(left + (box - 40) / 2), round(brand_y + (box - 40) / 2)), glyph)

    word_font = font("serif_bold", 24)
    cta_font = font("sans_semibold", 19)
    stack = line_height(word_font, 1.25) + 4 + line_height(cta_font, 1.5)
    text_y = brand_y + (box - stack) / 2
    text_y = draw_lines(
        draw,
        [Line(WORDMARK, 0)],
        font=word_font,
        ratio=1.25,
        top=text_y,
        fill=tokens.rgb("text"),
        left=left + box + 18,
    )
    draw_lines(
        draw,
        [Line(CTA, 0)],
        font=cta_font,
        ratio=1.5,
        top=text_y + 4,
        fill=tokens.rgb("text-muted"),
        left=left + box + 18,
    )

    return _png(canvas)


def _png(canvas: Image.Image) -> bytes:
    # optimize=True 는 카드 한 장에 0.7초를 쓰고 용량은 6% 줄인다. 값이 안 맞아 쓰지 않는다.
    # 카드는 링크마다 한 번만 그려 두고 다시 쓴다(store.rendered).
    buffer = io.BytesIO()
    canvas.save(buffer, format="PNG", compress_level=6)
    return buffer.getvalue()
