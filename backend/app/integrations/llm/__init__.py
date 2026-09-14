"""provider 고르기. 기본은 stub 이라 키 없이도 개발과 e2e 가 돈다."""

from __future__ import annotations

import logging
from functools import lru_cache

from app.core.config import get_settings
from app.integrations.llm.port import ConsultationClient
from app.integrations.llm.stub import StubClient

log = logging.getLogger(__name__)


@lru_cache
def get_llm_client() -> ConsultationClient:
    provider = get_settings().llm_provider
    if provider != "stub":
        # 실제 provider 는 M0 모델 실측 뒤에 붙인다. 그때까지 조용히 stub 으로 빠지지 않는다.
        raise RuntimeError(f"{provider} provider 는 아직 붙지 않았어요.")
    log.info("llm provider=stub")
    return StubClient()


__all__ = ["ConsultationClient", "get_llm_client"]
