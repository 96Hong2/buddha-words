"""provider 고르기. 기본은 stub 이라 키 없이도 개발과 e2e 가 돈다.

고를 수 있는 것은 provider 와 키뿐이다. **모델 id 와 프롬프트는 환경변수로 바꾸지 않는다**
(앱인토스 AI 운영 요건 4번). 무엇을 쓰는지는 openai.py 상수와 MODELS.md 에 있다.

설정이 틀리면 조용히 stub 으로 빠지지 않는다. 기동 가드(core/config.py)가 먼저 막고,
거기를 지나온 뒤에도 못 만들면 여기서 터진다.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from app.core.config import get_settings
from app.integrations.llm import budget
from app.integrations.llm.port import (
    ConsultationClient,
    LlmError,
    LlmRefusalError,
    LlmSchemaError,
    LlmTransportError,
)
from app.integrations.llm.stub import StubClient

log = logging.getLogger(__name__)


@lru_cache
def get_llm_client() -> ConsultationClient:
    settings = get_settings()
    provider = settings.llm_provider

    if provider == "stub":
        # 로그 포맷이 message 를 통째로 가리므로 provider 는 extra 로 싣는다.
        # 스텁이 운영에 올라간 것을 로그에서 못 보면 늦다
        log.info("llm_provider", extra={"event": "llm_provider", "provider": "stub"})
        return StubClient()

    if provider == "openai":
        # 늦게 들여온다. stub 으로 도는 개발·e2e 가 httpx 커넥션을 열 이유가 없다
        from app.integrations.llm.openai import (
            MODEL_CHEAP,
            MODEL_PREMIUM,
            MODEL_STANDARD,
            OpenAIClient,
            downgrade_effect,
        )

        if not settings.llm_api_key:
            raise RuntimeError("openai 를 골랐는데 LLM_API_KEY 가 비어 있어요.")
        effect = downgrade_effect()
        log.info(
            "llm_provider",
            extra={
                "event": "llm_provider",
                "provider": "openai",
                "cheap": MODEL_CHEAP,
                "standard": MODEL_STANDARD,
                "premium": MODEL_PREMIUM,
                # 예산 강등이 모델을 바꿔서 값을 줄이는지. "same_model" 이면 모델은 그대로이고
                # 값은 분량 지시를 내려서 줄인다(compose 의 deep=False)
                "downgrade_effect": effect,
                **budget.snapshot(),
            },
        )
        if effect == "costlier":
            # 등급 이름과 실제 단가가 뒤집혔다. 예산 문이 닫히면 값을 줄이려던 강등이
            # 오히려 더 쓴다. 기동 로그에서 보이게 둔다
            log.warning(
                "budget_downgrade_costs_more",
                extra={
                    "event": "budget_downgrade_costs_more",
                    "cheap": MODEL_CHEAP,
                    "premium": MODEL_PREMIUM,
                },
            )
        return OpenAIClient(settings.llm_api_key)

    raise RuntimeError(f"{provider} provider 는 아직 붙지 않았어요.")


__all__ = [
    "ConsultationClient",
    "budget",
    "LlmError",
    "LlmRefusalError",
    "LlmSchemaError",
    "LlmTransportError",
    "get_llm_client",
]
