"""설정 한 곳.

기동 가드가 여기 있다. 설정이 잘못된 리비전은 첫 요청 500 이 아니라 **기동 실패**로 드러나야
트래픽을 받지 않는다.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["local", "dev", "prod"] = "local"
    log_level: str = "INFO"

    # 미니앱 WebView 와 콘솔 QR 테스트 origin.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5183",
        "https://buddha-words.apps.tossmini.com",
    ]

    # 요청 본문 상한. 고민 글 하나를 넉넉히 담고 그 이상은 읽기 전에 끊는다.
    max_body_bytes: int = 32 * 1024

    # 익명키 검증. 운영에서 끄면 아무 문자열로 남의 데이터에 닿는다.
    allow_unverified_anon_key: bool = True

    # LLM. 키 없이도 개발과 e2e 가 돌아야 한다.
    llm_provider: Literal["stub", "openai", "gemini"] = "stub"
    llm_api_key: str | None = None

    # 전역 일일 예산 문. 넘으면 등급을 내리고, 더 넘으면 새 요청을 막는다.
    budget_warn_usd: float = 10.0
    budget_block_usd: float = 20.0

    @property
    def expose_interactive_docs(self) -> bool:
        return self.environment == "local"


def _guard(settings: Settings) -> None:
    """운영인데 위험한 설정이면 뜨지 않는다."""
    if settings.environment != "prod":
        return
    if settings.allow_unverified_anon_key:
        raise RuntimeError("운영에서 익명키 검증을 끌 수 없어요.")
    if settings.llm_provider != "stub" and not settings.llm_api_key:
        raise RuntimeError(f"{settings.llm_provider} 를 골랐는데 키가 비어 있어요.")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    _guard(settings)
    return settings
