"""FastAPI 앱 조립.

프론트는 이 앱만 부른다. 토스 서버 API 도 LLM 도 직접 부르지 않는다.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.body_limit import BodySizeLimitMiddleware
from app.api.routes import router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.domains.scripture import gate
from app.integrations.llm import get_llm_client

__all__ = ["app", "create_app"]


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    # 어떤 모델이 도는지 기동 로그에 한 줄 남긴다.
    # 스텁이 운영에 올라간 것을 첫 사진에서 알면 늦다.
    get_llm_client()

    # 경전 데이터의 문. 규격을 어긴 구절이 있으면 여기서 멈춘다.
    # 후보 풀이 몇 구절인지도 이 자리에서 로그에 남는다(scripture_pool_ready).
    gate.startup_check()

    app = FastAPI(
        title="부처의 말 API",
        version="0.1.0",
        description=(
            "앱인토스 미니앱의 백엔드. 인증은 X-Anon-Key 헤더 하나뿐이고 로그인 화면이 없다."
        ),
        docs_url="/docs" if settings.expose_interactive_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.expose_interactive_docs else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        # 목록에 없는 헤더는 preflight 에서 막힌다. 기기가 보내도 서버에 닿지 않는다.
        # X-Timezone 은 사용량의 자정 기준이라 빠지면 모두가 서울 자정으로 묶인다
        allow_headers=["Content-Type", "X-Anon-Key", "X-Idempotency-Key", "X-Timezone"],
    )
    # 본문 문은 라우팅·CORS 보다 바깥이라야 큰 본문을 읽기 전에 끊는다.
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)

    @app.exception_handler(RequestValidationError)
    async def validation_failed(_: Request, exc: RequestValidationError) -> JSONResponse:
        """검증 실패 응답에서 받은 값을 떨어뜨린다.

        FastAPI 기본 핸들러는 `input` 에 받은 본문을 그대로 싣는다. 고민 원문이
        422 본문으로 돌아가고, 4xx 본문을 통째로 모으는 게이트웨이·APM 으로도 흘러간다.
        어디가 왜 틀렸는지는 자리(loc)와 종류(type)면 충분하다.
        """
        detail = [
            {"type": error.get("type", "invalid"), "loc": list(error.get("loc", ()))}
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={"detail": detail},
        )

    app.include_router(router)

    @app.get("/health")
    async def health() -> dict[str, object]:
        """이 서버가 어느 판으로 도는지. 기동 로그를 놓친 사람이 보는 자리다.

        후보 풀을 함께 낸다. 화면에 나온 경전이 사람이 감수한 문장인지 아닌지가 여기서
        갈리는데, 그 사실을 서버에 물을 길이 없으면 개발 판을 운영 판으로 착각한다.
        답변 스키마(`spec/answer.schema.json`)는 닫혀 있어 답변에는 실을 수 없다.
        """
        return {
            "status": "ok",
            "environment": settings.environment,
            "scripturePool": gate.pool_status(),
        }

    return app


app = create_app()
