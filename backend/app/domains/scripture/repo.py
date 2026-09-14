"""경전 저장소.

문장은 사람이 감수한 것만 나간다. **모델이 경전 문장을 만들지 않는다.**
모델은 id 만 고르고 여기서 본문을 채운다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

SEED = Path(__file__).resolve().parents[4] / "data" / "scriptures" / "dev-seed.json"


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

    def to_api(self) -> dict[str, object]:
        out: dict[str, object] = {"id": self.id, "citation": self.citation, "text": self.text}
        if self.terms:
            out["terms"] = [dict(t) for t in self.terms]
        return out


@lru_cache
def all_scriptures() -> tuple[Scripture, ...]:
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
        )
        for item in raw["items"]
    )


def by_id(scripture_id: str) -> Scripture | None:
    return next((s for s in all_scriptures() if s.id == scripture_id), None)


def candidates(theme: str, limit: int = 5) -> tuple[Scripture, ...]:
    """모델에게 넘길 후보. 모델은 이 목록 밖의 id 를 고를 수 없다."""
    matched = tuple(s for s in all_scriptures() if theme in s.themes)
    pool = matched or all_scriptures()
    return pool[:limit]


def whitelist(ids: list[str], allowed: tuple[Scripture, ...]) -> list[Scripture]:
    """모델이 고른 id 를 후보 안에서만 받는다. 밖의 id 는 버린다."""
    allowed_ids = {s.id for s in allowed}
    return [s for s in (by_id(i) for i in ids if i in allowed_ids) if s is not None]


def daily(date_iso: str) -> Scripture:
    """같은 날에는 같은 구절. 사용자와 무관하다."""
    pool = tuple(s for s in all_scriptures() if s.daily_ok)
    digest = 2166136261
    for ch in date_iso:
        digest ^= ord(ch)
        digest = (digest * 16777619) & 0xFFFFFFFF
    return pool[digest % len(pool)]
