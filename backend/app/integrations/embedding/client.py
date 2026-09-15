"""쿼리 임베딩 구현. SDK 없이 httpx 로 직접 부른다."""

from __future__ import annotations

import logging
import time
from typing import Protocol

import httpx

log = logging.getLogger(__name__)

# 모델 이름과 차원의 정본. tools/build_embeddings.py 가 이것을 가져다 쓰고,
# 만들어진 파일이 이 값과 다르면 app/domains/scripture/vectors.py 가 그 벡터를 쓰지 않는다
MODEL = "text-embedding-3-small"
DIMS = 1536

URL = "https://api.openai.com/v1/embeddings"

# 후보를 좁히는 일이라 늦으면 값어치가 없다. 답변 전체 예산(3~5초)의 일부만 쓴다
TIMEOUT_SECONDS = 3.0


class EmbeddingClient(Protocol):
    async def embed(self, text: str) -> list[float] | None:
        """못 만들면 None. 부르는 쪽은 어휘 검색만으로 이어 간다."""


class NullEmbeddings:
    async def embed(self, text: str) -> list[float] | None:
        return None


class OpenAIEmbeddings:
    def __init__(self, api_key: str) -> None:
        self._key = api_key

    async def embed(self, text: str) -> list[float] | None:
        """실패해도 예외를 올리지 않는다.

        후보를 좁히는 단계라 이것이 없으면 어휘 검색만 쓰면 된다. 여기서 터뜨리면
        벡터 하나 때문에 답변 전체가 막힌다. 대신 실패가 로그에 남는다.
        """
        if not self._key:
            return None
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                response = await client.post(
                    URL,
                    headers={"Authorization": f"Bearer {self._key}"},
                    json={"model": MODEL, "input": text, "dimensions": DIMS},
                )
                response.raise_for_status()
                vector: list[float] = response.json()["data"][0]["embedding"]
        except (httpx.HTTPError, KeyError, IndexError) as exc:
            log.warning(
                "embed_failed",
                extra={"event": "embed_failed", "kind": type(exc).__name__},
            )
            return None
        log.info(
            "embed_ok",
            extra={"event": "embed_ok", "ms": round((time.perf_counter() - started) * 1000)},
        )
        return vector
