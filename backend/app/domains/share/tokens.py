"""색.

정본은 `design/foundations/_tokens.css` 하나다. 서버 렌더가 자기 색표를 따로 들고 있으면
화면과 카드가 조금씩 어긋나고, 어긋난 것을 아무도 모른다. 그래서 값을 여기서 만들지 않고
그 파일을 읽어 `var(--x)` 사슬까지 푼다.

없는 토큰을 부르면 기본색으로 넘어가지 않고 그 자리에서 터진다.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
TOKENS_CSS = REPO_ROOT / "design" / "foundations" / "_tokens.css"

RGB = tuple[int, int, int]

_DECL = re.compile(r"--([A-Za-z0-9-]+)\s*:\s*([^;{}]+);")
_VAR = re.compile(r"^var\(\s*--([A-Za-z0-9-]+)\s*\)$")
_RGBA = re.compile(r"^rgba?\(([^)]*)\)$")


@lru_cache
def _raw() -> dict[str, str]:
    if not TOKENS_CSS.exists():
        raise RuntimeError(f"색 토큰 정본이 없어요: {TOKENS_CSS}")
    text = TOKENS_CSS.read_text(encoding="utf-8")
    # 같은 이름이 여러 번 나오면 CSS 캐스케이드처럼 뒤에 쓴 것이 이긴다
    return {m.group(1): m.group(2).strip() for m in _DECL.finditer(text)}


def _resolve(name: str, depth: int = 0) -> str:
    if depth > 8:
        raise RuntimeError(f"색 토큰 --{name} 이 자기 자신을 돌고 있어요.")
    table = _raw()
    if name not in table:
        raise KeyError(f"색 토큰 --{name} 이 {TOKENS_CSS.name} 에 없어요.")
    value = table[name]
    chained = _VAR.match(value)
    if chained:
        return _resolve(chained.group(1), depth + 1)
    return value


def _parse(value: str, name: str) -> tuple[int, int, int, float]:
    if value.startswith("#"):
        digits = value[1:]
        if len(digits) == 3:
            digits = "".join(c * 2 for c in digits)
        if len(digits) != 6:
            raise ValueError(f"색 토큰 --{name} 의 값을 읽을 수 없어요: {value}")
        return int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16), 1.0
    fn = _RGBA.match(value)
    if fn:
        parts = [p.strip() for p in fn.group(1).split(",")]
        if len(parts) not in (3, 4):
            raise ValueError(f"색 토큰 --{name} 의 값을 읽을 수 없어요: {value}")
        r, g, b = (int(float(p)) for p in parts[:3])
        alpha = float(parts[3]) if len(parts) == 4 else 1.0
        return r, g, b, alpha
    raise ValueError(f"색 토큰 --{name} 은 단색이 아니에요: {value}")


@lru_cache
def rgb(name: str) -> RGB:
    """`--` 없이 토큰 이름만 넘긴다. 예: `rgb("text")`"""
    r, g, b, _ = _parse(_resolve(name), name)
    return r, g, b


@lru_cache
def rgba(name: str, alpha: float | None = None) -> tuple[int, int, int, int]:
    r, g, b, own = _parse(_resolve(name), name)
    use = own if alpha is None else alpha
    return r, g, b, max(0, min(255, round(use * 255)))
