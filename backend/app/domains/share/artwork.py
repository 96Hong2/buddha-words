"""그림 조각.

배경은 `spec/visual-theme.ts` 의 `SHARE_CARD_BG` 가 가리키는 파일 하나다. 파일 이름을 여기에
다시 적지 않고 spec 에서 읽는다. spec 이 바뀌면 카드도 따라 바뀌어야 하기 때문이다.

워드마크 연꽃은 시안 SVG 와 같은 모양을 좌표로 그린다. Pillow 에 베지어가 없어서 곡선을
직접 샘플링한다. 네 배로 그린 뒤 줄여서 가장자리를 부드럽게 만든다.
"""

from __future__ import annotations

import math
import re
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw

from app.domains.share import tokens

REPO_ROOT = tokens.REPO_ROOT
VISUAL_THEME_TS = REPO_ROOT / "spec" / "visual-theme.ts"

# 그림을 찾는 곳. 고해상 원본이 먼저다
ASSET_DIRS = (
    REPO_ROOT / "assets" / "buddha_hires_v2",
    REPO_ROOT / "assets",
    REPO_ROOT / "frontend" / "public" / "assets",
    REPO_ROOT / "design" / "assets",
)
ASSET_SUFFIXES = (".png", ".webp", ".jpg")

_SHARE_BG = re.compile(r"SHARE_CARD_BG\s*=\s*['\"]([^'\"]+)['\"]")


@lru_cache
def share_bg_name() -> str:
    if not VISUAL_THEME_TS.exists():
        raise RuntimeError(f"visual-theme 정본이 없어요: {VISUAL_THEME_TS}")
    found = _SHARE_BG.search(VISUAL_THEME_TS.read_text(encoding="utf-8"))
    if not found:
        raise RuntimeError(f"{VISUAL_THEME_TS.name} 에 SHARE_CARD_BG 가 없어요.")
    return found.group(1)


@lru_cache
def share_bg_path() -> Path:
    name = share_bg_name()
    for folder in ASSET_DIRS:
        for suffix in ASSET_SUFFIXES:
            candidate = folder / f"{name}{suffix}"
            if candidate.exists():
                return candidate
    where = " · ".join(str(d) for d in ASSET_DIRS)
    raise RuntimeError(f"공유 카드 배경 {name} 을 찾을 수 없어요. 본 곳: {where}")


@lru_cache
def _source() -> Image.Image:
    return Image.open(share_bg_path()).convert("RGB")


# 배경 원본에서 부처 얼굴이 놓인 높이. 여기를 띠의 가운데로 잡는다
FOCUS = 0.33


def hero(width: int, height: int, focus: float = FOCUS) -> Image.Image:
    """배경 원본에서 요청한 상자 비율의 띠를 잘라 준다.

    띠는 얼굴 높이를 가운데에 두되 원본 밖으로 나가지 않는다. 상자가 납작할수록 띠가 얇아져
    얼굴이 크게 잡히고, 길수록 연못과 나무까지 들어온다.
    """
    src = _source()
    ratio = width / height
    band_h = src.width / ratio
    if band_h > src.height:
        band_w = src.height * ratio
        x0 = round((src.width - band_w) / 2)
        box = (x0, 0, x0 + round(band_w), src.height)
    else:
        y0 = min(max(src.height * focus - band_h / 2, 0.0), src.height - band_h)
        box = (0, round(y0), src.width, round(y0 + band_h))
    return src.crop(box).resize((width, height), Image.LANCZOS)


def fade_down(image: Image.Image, color: tuple[int, int, int], depth: int) -> None:
    """그림 아래쪽을 종이 색으로 녹인다. 잘린 선이 그대로 드러나지 않게."""
    if depth <= 0:
        return
    width, height = image.size
    veil = Image.new("RGBA", (1, depth))
    pixels = veil.load()
    for i in range(depth):
        ratio = i / max(1, depth - 1)
        pixels[0, i] = (*color, round(255 * ratio**1.4))
    image.paste(
        veil.resize((width, depth), Image.BILINEAR),
        (0, height - depth),
        veil.resize((width, depth), Image.BILINEAR),
    )


def _bezier(p0, p1, p2, p3, steps: int = 24) -> list[tuple[float, float]]:
    out = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]
        out.append((x, y))
    return out


def _arc(center, radius, a0, a1, steps: int = 20) -> list[tuple[float, float]]:
    return [
        (
            center[0] + radius * math.cos(math.radians(a0 + (a1 - a0) * i / steps)),
            center[1] + radius * math.sin(math.radians(a0 + (a1 - a0) * i / steps)),
        )
        for i in range(steps + 1)
    ]


@lru_cache
def lotus_mark(size: int) -> Image.Image:
    """시안의 연꽃 아이콘. 24 단위 좌표를 size 로 키운다."""
    ss = 4
    canvas = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    k = size * ss / 24

    def scale(points):
        return [(x * k, y * k) for x, y in points]

    # 가운데 꽃잎. 꼭대기에서 내려오는 곡선 + 아래쪽 반원. 왼쪽은 오른쪽을 x=12 로 접은 것
    right = _bezier((12, 4.2), (14.7, 6.4), (16.2, 8.8), (16.2, 11.1))
    bottom = _arc((12, 11.1), 4.2, 0, 180)
    left = [(24 - x, y) for x, y in reversed(right)]
    draw.polygon(scale(right + bottom + left), fill=tokens.rgb("accent-rule"))

    # 옆 꽃잎 둘
    petal = _bezier((3.6, 13.6), (6.7, 12.7), (9.2, 13.3), (11.0, 15.0))
    petal += _bezier((11.0, 15.0), (9.2, 16.7), (6.7, 17.3), (3.6, 16.4))
    draw.polygon(scale(petal), fill=tokens.rgb("accent"))
    draw.polygon(scale([(24 - x, y) for x, y in petal]), fill=tokens.rgb("accent"))

    # 받침 선
    draw.line(
        scale([(6.6, 18.8), (17.4, 18.8)]), fill=tokens.rgb("accent-rule"), width=round(1.4 * k)
    )

    return canvas.resize((size, size), Image.LANCZOS)


# 배경 그림이 없으면 기동에서 터진다. 글꼴과 같은 이유다.
# 첫 공유 요청 500 으로 알면 늦고, 그 사이 조용히 다른 그림으로 넘어가지도 않는다.
share_bg_path()
