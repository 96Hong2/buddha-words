"""글 줄바꿈과 그리기.

Pillow 는 줄바꿈을 해 주지 않는다. 직접 한다.

**어절 단위로 꺾는다.** 브라우저 기본값은 한글을 글자 단위로 꺾어서 「부러워하며」가
「부러 / 워하며」로 갈라진다. 화면에서는 한 줄을 훑고 지나가지만, 카드는 한 장이 통째로
남아 돌아다니는 그림이라 그 자리가 계속 보인다. CSS 로 치면 `word-break: keep-all` 쪽이다.
한 어절이 한 줄보다 길면 그때만 글자 단위로 쪼갠다.

자간(letter-spacing)은 쓰지 않는다. 글자마다 따로 그리면 커닝과 자소 결합이 깨진다.
화면 CSS 의 -0.02em 은 68px 글자에서 글자당 1.4px 이고, 가운데 정렬이라 좌우가 함께 줄어든다.
"""

from __future__ import annotations

from dataclasses import dataclass

from PIL import ImageDraw, ImageFont

# 줄 첫머리에 혼자 남으면 안 되는 닫는 문장부호
_NO_LINE_START = ".,!?;:)]}」』”’·…"


@dataclass(frozen=True, slots=True)
class Line:
    text: str
    width: float


def _split_long(word: str, font: ImageFont.FreeTypeFont, max_width: float) -> list[str]:
    """한 어절이 한 줄보다 길 때만 글자 단위로 쪼갠다."""
    pieces: list[str] = []
    current = ""
    for ch in word:
        if current and font.getlength(current + ch) > max_width:
            pieces.append(current)
            current = ch
        else:
            current += ch
    if current:
        pieces.append(current)
    return pieces


def wrap(text: str, font: ImageFont.FreeTypeFont, max_width: float) -> list[Line]:
    """줄바꿈 문자(\\n)는 그대로 살린다. 경구체가 줄을 나눠 쓰기 때문이다."""
    lines: list[Line] = []

    def flush(value: str) -> None:
        lines.append(Line(value, font.getlength(value)))

    for paragraph in text.split("\n"):
        stripped = " ".join(paragraph.split())
        if not stripped:
            lines.append(Line("", 0.0))
            continue

        # (조각, 앞에 띄어쓰기가 붙는가). 어절 하나가 한 줄보다 길 때만 조각이 여럿이 된다
        atoms: list[tuple[str, bool]] = []
        for index, word in enumerate(stripped.split(" ")):
            for order, piece in enumerate(_split_long(word, font, max_width)):
                atoms.append((piece, index > 0 and order == 0))

        current = ""
        for piece, spaced in atoms:
            if not current:
                current = piece
                continue
            trial = f"{current} {piece}" if spaced else current + piece
            # 닫는 부호 하나가 다음 줄 첫머리로 넘어가는 것은 넘침보다 보기 나쁘다
            fits = font.getlength(trial) <= max_width
            if fits or (len(piece) == 1 and piece in _NO_LINE_START):
                current = trial
                continue
            flush(current)
            current = piece
        if current:
            flush(current)
    return lines


def line_height(font: ImageFont.FreeTypeFont, ratio: float) -> float:
    return font.size * ratio


def block_height(count: int, font: ImageFont.FreeTypeFont, ratio: float) -> float:
    return count * line_height(font, ratio)


def draw_lines(
    draw: ImageDraw.ImageDraw,
    lines: list[Line],
    *,
    font: ImageFont.FreeTypeFont,
    ratio: float,
    top: float,
    fill: tuple[int, int, int],
    left: float | None = None,
    center: float | None = None,
    right: float | None = None,
) -> float:
    """줄 상자 가운데에 베이스라인을 놓는다. 그려진 블록의 아래 y 를 돌려준다."""
    if (left is None) == (center is None) == (right is None):
        raise ValueError("left · center · right 중 하나만 준다.")
    ascent, descent = font.getmetrics()
    step = line_height(font, ratio)
    y = top
    for line in lines:
        baseline = y + (step - (ascent + descent)) / 2 + ascent
        if line.text:
            if center is not None:
                draw.text((center, baseline), line.text, font=font, fill=fill, anchor="ms")
            elif right is not None:
                draw.text((right, baseline), line.text, font=font, fill=fill, anchor="rs")
            else:
                draw.text((left, baseline), line.text, font=font, fill=fill, anchor="ls")
        y += step
    return y
