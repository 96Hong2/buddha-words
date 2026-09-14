"""FastAPI 앱 조립.

프론트는 이 앱만 부른다. 토스 서버 API 도 LLM 도 직접 부르지 않는다.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.body_limit import BodySizeLimitMiddleware
from app.api.routes import router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.integrations.llm import get_llm_client

__all__ = ["app", "create_app"]


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    # 어떤 모델이 도는지 기동 로그에 한 줄 남긴다.
    # 스텁이 운영에 올라간 것을 첫 사진에서 알면 늦다.
    get_llm_client()

    app = FastAPI(
        title="부처의 말 API",
        version="0.1.0",
        description="앱인토스 미니앱의 백엔드. 인증은 X-Anon-Key 헤더 하나뿐이고 로그인 화면이 없다.",
        docs_url="/docs" if settings.expose_interactive_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.expose_interactive_docs else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Anon-Key", "X-Idempotency-Key"],
    )
    # 본문 문은 라우팅·CORS 보다 바깥이라야 큰 본문을 읽기 전에 끊는다.
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)

    app.include_router(router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "environment": settings.environment}

    return app


app = create_app()
