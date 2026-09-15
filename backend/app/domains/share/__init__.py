"""공유 카드. 서버가 그린다.

바깥에서 쓸 것은 여기 모아 둔 이름들뿐이다. 그리는 함수는 `ShareCardData` 만 받고,
그 자료형에는 고민 원문을 담을 자리가 없다.
"""

from __future__ import annotations

from app.domains.share.card import (
    CARD_SIZE,
    OG_SIZE,
    ShareCardData,
    UnrenderableTextError,
    check_renderable,
    one_line_gloss,
    render_card,
    render_og,
)
from app.domains.share.store import card_from_row, get, put, rendered, reset_store

__all__ = [
    "CARD_SIZE",
    "OG_SIZE",
    "ShareCardData",
    "UnrenderableTextError",
    "card_from_row",
    "check_renderable",
    "get",
    "one_line_gloss",
    "put",
    "render_card",
    "render_og",
    "rendered",
    "reset_store",
]
