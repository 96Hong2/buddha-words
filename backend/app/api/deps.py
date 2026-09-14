"""요청마다 필요한 것.

인증은 `X-Anon-Key` 헤더 하나다. 로그인 화면이 없다.
검증은 토스 서버 API 가 하고, 로컬에서는 믿고 넘어간다. 운영에서 믿고 넘어가면 기동이 막힌다.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings


async def anon_key(
    settings: Annotated[Settings, Depends(get_settings)],
    x_anon_key: Annotated[str | None, Header(alias="X-Anon-Key")] = None,
) -> str:
    if not x_anon_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "익명 식별키가 없어요.")
    if settings.allow_unverified_anon_key:
        return x_anon_key
    # 실제 검증기는 mTLS 인증서를 받은 뒤 붙인다. 그때까지 운영은 기동 가드가 막는다.
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "익명키 검증기가 아직 없어요.")


AnonKey = Annotated[str, Depends(anon_key)]
