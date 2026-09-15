"""글꼴.

카드는 서버가 그린다. 서버는 리눅스 컨테이너라 한글 글꼴이 하나도 없다. 시스템 글꼴에
기대면 한글이 전부 네모(두부)로 그려지고, 그 사고는 카톡 미리보기에서야 드러난다.
그래서 글꼴 파일을 프롬프트·모델 id 와 같은 **배포 산출물**로 본다. 이 폴더에 넣고 함께 나간다.

본문·UI 는 Pretendard, 제목·경전은 MaruBuri. 둘 다 무료 배포가 허용된 글꼴이고
출처와 판은 fonts/LICENSES.md 에 적었다.

파일이 없거나 한글이 빠진 판이면 기동에서 터진다. 두부로 그려진 카드를 내보내지 않는다.

두 글꼴 다 한자를 담고 있지 않다. 지금 경전 400구절에는 한자가 없지만 대승·선 계열이
감수를 통과해 들어올 때 한문 병기가 따라올 수 있다. 그래서 `missing()` 으로 글자 하나하나를
미리 재고, 못 그리는 글자가 있으면 카드를 만들지 않는다. 두부는 조용히 지나가면 안 된다.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import ImageFont

FONT_DIR = Path(__file__).resolve().parent / "fonts"

# 역할 → 파일. 화면 CSS 의 --font-sans / --font-serif 와 굵기를 맞춘 것이다
FILES: dict[str, str] = {
    "sans_medium": "Pretendard-Medium.otf",  # 한 줄 풀이 등 본문 500
    "sans_semibold": "Pretendard-SemiBold.otf",  # 출처·소표기·CTA 600
    "sans_bold": "Pretendard-Bold.otf",  # 마음 태그 칩 700
    "serif": "MaruBuri-Regular.otf",  # 경전 번역문 400
    "serif_bold": "MaruBuri-Bold.otf",  # 오늘의 부처의 말 · 워드마크 700
}

# 한글이 실제로 들어 있는지 보는 표본. 받침 있는 글자와 없는 글자를 섞었다
_PROBE = ("가", "뷁")

# 글꼴에 없는 글자가 어떤 모양으로 그려지는지 재는 기준 글자.
# U+FFFF 는 유니코드가 「글자로 쓰지 말라」고 못 박은 자리라 어느 글꼴에도 글리프가 없고,
# FreeType 은 그런 자리를 전부 .notdef 하나로 그린다. 사유 영역(U+E000~)은 쓸 수 없다.
# Pretendard 가 그 영역에 자기 글리프를 갖고 있어 기준이 안 된다.
_NOTDEF = "￿"

# 글꼴이 없어도 되는 글자. 공백은 빈 비트맵이라 .notdef 와 구분되지 않는다
_SKIP = frozenset(" \t\n\r ​")

# 크기가 달라도 결과는 같으므로 이 크기 하나로 잰다
_PROBE_SIZE = 64


def _path(role: str) -> Path:
    try:
        return FONT_DIR / FILES[role]
    except KeyError:
        raise KeyError(f"글꼴 역할 {role} 은 없어요. 쓸 수 있는 것: {sorted(FILES)}") from None


@lru_cache
def font(role: str, size: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(_path(role), size=round(size))


@lru_cache
def _notdef_shape(role: str) -> bytes:
    return bytes(font(role, _PROBE_SIZE).getmask(_NOTDEF, mode="L"))


@lru_cache
def _drawable(role: str, ch: str) -> bool:
    return bytes(font(role, _PROBE_SIZE).getmask(ch, mode="L")) != _notdef_shape(role)


def missing(role: str, text: str) -> str:
    """그 글꼴이 못 그리는 글자만 나온 순서대로 돌려준다. 다 그릴 수 있으면 빈 문자열.

    카드에 두부가 찍히는 것은 되돌릴 수 없다. 링크가 이미 카톡으로 퍼진 뒤에 드러나기 때문이다.
    그래서 그리기 전에 잰다.
    """
    seen: dict[str, None] = {}
    for ch in text:
        if ch in _SKIP or ch in seen:
            continue
        if not _drawable(role, ch):
            seen[ch] = None
    return "".join(seen)


def verify() -> None:
    """파일이 다 있고 한글 글리프가 실제로 들어 있는지 본다.

    글꼴에 한글이 없으면 FreeType 은 예외 대신 .notdef 를 그린다. 그래서 파일 존재만으로는
    모자라고, 서로 다른 두 글자를 그려 비트맵이 정말 다른지까지 본다. 같으면 둘 다 .notdef 다.
    """
    for role, name in FILES.items():
        path = _path(role)
        if not path.exists():
            raise RuntimeError(
                f"공유 카드 글꼴이 없어요: {path}. fonts/LICENSES.md 의 내려받는 곳을 보세요."
            )
        loaded = font(role, 64)
        shapes = {bytes(loaded.getmask(ch, mode="L")) for ch in _PROBE}
        if len(shapes) < len(_PROBE):
            raise RuntimeError(f"글꼴 {name} 에 한글이 없어요. 카드가 네모로 그려집니다.")


verify()
