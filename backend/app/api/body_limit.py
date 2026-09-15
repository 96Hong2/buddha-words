"""본문 크기 문.

FastAPI 는 인증보다 먼저 본문을 통째로 읽는다. 라우팅·CORS 보다 바깥에 선 ASGI 미들웨어라야
큰 본문을 읽기 전에 끊는다.
"""

from __future__ import annotations

from starlette.types import ASGIApp, Message, Receive, Scope, Send


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        received = 0

        async def guarded() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise ValueError("본문이 너무 커요.")
            return message

        await self.app(scope, guarded, send)
