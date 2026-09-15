"""구절 벡터.

`tools/build_embeddings.py` 가 미리 계산해 둔 것을 읽기만 한다.
런타임에 400구절을 다시 부르지 않는다.
씨앗이 바뀌면 해시가 달라지므로 다시 만들라고 알린다. 어긋난 벡터로 조용히 도는 일이 없게 한다.
씨앗뿐 아니라 어느 모델로 몇 차원을 만들었는지도 파일에 적힌 값과 맞춰 본다.
모델이 다르면 좌표계가 달라 거리가 뜻을 잃는데, 구절 글자는 그대로라 씨앗 해시로는 안 잡힌다.

벡터가 없어도 앱은 뜬다. 어휘 검색만으로도 후보는 나온다. 다만 그 사실이 로그에 남는다.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
from functools import lru_cache
from pathlib import Path

from app.domains.scripture.repo import Scripture, load_seed
from app.integrations.embedding import client

log = logging.getLogger(__name__)

STORE = Path(__file__).resolve().parents[4] / "data" / "scriptures" / "embeddings.json"


def embed_source(s: Scripture) -> str:
    """무엇을 임베딩했는지. 빌드 스크립트와 글자 하나까지 같아야 한다.

    상황 · 풀이 · 본문을 합친 것이 제일 잘 맞았다(tools/eval 실측). 상황만 쓰면 회수율이
    떨어지고(R@20 0.698 → 0.666), 출처는 넣지 않는다. 「법구경 3장」은 고민 글에 안 나온다.
    """
    return "\n".join([s.retrieval_text, s.modern_gloss, s.text]).strip()


def seed_digest() -> str:
    h = hashlib.sha256()
    for s in load_seed():
        h.update(s.id.encode())
        h.update(embed_source(s).encode())
    return h.hexdigest()


@lru_cache
def store() -> dict[str, list[float]]:
    """읽고 한 번만 검사한다. 씨앗·모델·차원 중 하나라도 어긋나면 쓰지 않는다."""
    if not STORE.exists():
        log.warning(
            "embeddings_missing",
            extra={"event": "embeddings_missing", "path": STORE.name},
        )
        return {}
    raw = json.loads(STORE.read_text(encoding="utf-8"))
    if raw.get("seed_digest") != seed_digest():
        log.warning(
            "embeddings_stale",
            extra={
                "event": "embeddings_stale",
                "hint": "tools/build_embeddings.py 를 다시 돌려 주세요",
            },
        )
        return {}
    if raw.get("model") != client.MODEL or raw.get("dims") != client.DIMS:
        log.warning(
            "embeddings_model_mismatch",
            extra={
                "event": "embeddings_model_mismatch",
                "file_model": raw.get("model"),
                "file_dims": raw.get("dims"),
                "query_model": client.MODEL,
                "query_dims": client.DIMS,
                "hint": "tools/build_embeddings.py 를 다시 돌려 주세요",
            },
        )
        return {}
    vectors: dict[str, list[float]] = raw["vectors"]
    wrong = [i for i, v in vectors.items() if len(v) != client.DIMS]
    if wrong:
        # 파일에 적힌 차원과 실제 벡터 길이가 다른 판. 잘린 파일이거나 손으로 고친 파일이다
        log.warning(
            "embeddings_dims_broken",
            extra={
                "event": "embeddings_dims_broken",
                "count": len(wrong),
                "first_id": wrong[0],
                "expected_dims": client.DIMS,
            },
        )
        return {}
    log.info(
        "embeddings_loaded",
        extra={"event": "embeddings_loaded", "count": len(vectors), "dims": raw.get("dims")},
    )
    return vectors


def available() -> bool:
    return bool(store())


@lru_cache
def _norms() -> dict[str, float]:
    """길이를 미리 재 둔다. 요청마다 400번 다시 재지 않는다."""
    return {i: math.sqrt(sum(x * x for x in v)) or 1.0 for i, v in store().items()}


def similarity(query: list[float], scripture_id: str) -> float:
    vec = store().get(scripture_id)
    if not vec:
        return 0.0
    if len(query) != len(vec):
        # 길이가 다른 채로 곱하면 짧은 쪽까지만 세고 그럴싸한 점수가 나온다. 그 조용한 오답을 막는다
        raise ValueError(f"쿼리 벡터 {len(query)} 와 구절 벡터 {len(vec)} 의 길이가 달라요.")
    dot = sum(x * y for x, y in zip(query, vec, strict=True))
    qn = math.sqrt(sum(x * x for x in query)) or 1.0
    return dot / (qn * _norms()[scripture_id])


def ranked(query: list[float], ids: list[str]) -> list[str]:
    """가까운 순서. 점수가 아니라 순서만 쓴다(RRF 가 순위로 합친다)."""
    scored = {i: similarity(query, i) for i in ids}
    return sorted(ids, key=lambda i: -scored[i])
