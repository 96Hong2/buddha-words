"""고민 글을 벡터로 바꾸는 자리.

구절 벡터는 빌드 때 미리 만든다(tools/build_embeddings.py). 런타임에 부르는 것은
고민 글 하나뿐이고, 값은 요청당 100토큰 안팎이라 사실상 셈에 잡히지 않는다.

모델 id 는 배포 산출물이다. 환경변수로 갈아 끼우지 않는다. 구절 벡터와 같은 모델이 아니면
거리가 뜻을 잃으므로 tools/build_embeddings.py 의 MODEL 과 늘 같아야 한다.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from app.core.config import get_settings
from app.integrations.embedding.client import EmbeddingClient, NullEmbeddings, OpenAIEmbeddings

log = logging.getLogger(__name__)

__all__ = ["EmbeddingClient", "get_embedding_client"]


@lru_cache
def get_embedding_client() -> EmbeddingClient:
    settings = get_settings()
    if settings.llm_provider != "openai":
        # 스텁으로 도는 판에서는 벡터도 부르지 않는다. e2e 가 같은 입력에 같은 답을 받아야 한다.
        log.info("embedding_provider", extra={"event": "embedding_provider", "provider": "none"})
        return NullEmbeddings()
    log.info("embedding_provider", extra={"event": "embedding_provider", "provider": "openai"})
    return OpenAIEmbeddings(api_key=settings.llm_api_key or "")
