"""설정 한 곳.

기동 가드가 여기 있다. 설정이 잘못된 리비전은 첫 요청 500 이 아니라 **기동 실패**로 드러나야
트래픽을 받지 않는다.
"""

from __future__ import annotations

import logging
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger(__name__)

# 익명키 검증기가 붙었나. 검증 자리는 app/api/deps.py 의 anon_key 이고,
# 토스 mTLS 인증서를 받아 그 자리를 채우면 이 값을 True 로 올린다.
# False 인 동안은 운영으로 띄우지 않는다. 검증을 켜 둬도 검증기가 없으면 전부 501 이다.
ANON_KEY_VERIFIER_READY = False

# 후보 풀 스위치의 환경변수 이름. `Settings.scripture_pool` 이 이 이름으로 값을 읽는다.
# 이름을 여러 곳에 다시 적지 않게 여기 하나만 두고 저장소와 테스트가 가져다 쓴다
SCRIPTURE_POOL_ENV = "SCRIPTURE_POOL"

# 공유 링크를 누른 사람을 보낼 웹 주소의 환경변수 이름. `Settings.web_origin` 이 이 값을 읽는다
WEB_ORIGIN_ENV = "WEB_ORIGIN"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["local", "dev", "prod"] = "local"
    log_level: str = "INFO"

    # 미니앱 WebView 와 콘솔 QR 테스트 origin.
    # 이 목록은 「이 주소에서 오는 요청을 받는다」는 뜻이다. 사람을 보낼 곳은 아래 web_origin 이다
    #
    # ⚠ 같은 번들이 심사 전과 출시 후에 **다른 호스트**로 서비스된다.
    # 콘솔에서 받은 테스트 링크·QR 로 들어가면 private-apps, 출시 뒤에는 apps 다.
    # 출시 호스트만 넣어 두었더니 실기기에서 예비요청이 전부 400 으로 막혀,
    # 어떤 고민을 보내도 「지금은 답을 만들지 못했어요」만 떴다. 둘 다 있어야 한다.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5183",
        "https://buddha-words.apps.tossmini.com",
        "https://buddha-words.private-apps.tossmini.com",
    ]

    # 공유 링크(/s/{토큰})를 누른 사람을 넘길 웹 앱 주소. 넘기는 자리는 `api/routes.py` 다.
    #
    # 비어 있으면 넘기지 않고 백엔드 랜딩에 머문다. 그 화면에 카드 한 장과 딥링크가 있다.
    # 예전에는 비면 cors_origins 의 첫 https 주소로 떨어졌는데, 그 값이 토스 미니앱 WebView
    # 주소라 카톡에서 링크를 누른 사람이 말없이 거기로 갔다. 받을 수 있는 주소와 보내도 되는
    # 주소는 다르다. 두 개념을 한 값으로 쓰지 않는다
    web_origin: str | None = None

    # 요청 본문 상한. 고민 글 하나를 넉넉히 담고 그 이상은 읽기 전에 끊는다.
    max_body_bytes: int = 32 * 1024

    # 재기동을 넘겨야 하는 것이 사는 파일. 지금은 공유 링크(TTL 30일)만 여기 있다.
    # 담기는 칸은 `domains/share/card.py` 의 ShareCardData 가 정하고, 고민 원문도 답변 본문도
    # 그 칸에 없다. 답변 행을 왜 안 내렸는지는 `domains/answer/compose.py` 의 _PENDING 주석에.
    # 기본값을 저장소 밖에 두어 작업 트리가 더러워지지 않게 한다. `database_url` 이 비었을 때만 쓴다
    state_db_path: Path = Path(tempfile.gettempdir()) / "buddha-words" / "state.db"

    # 저장 자리를 통째로 갈아 끼우는 값. 비어 있으면 위의 SQLite 파일을 쓴다.
    #
    # 배포는 Cloud Run 이고 DB 는 Cloud SQL PostgreSQL 이다(docs/plan/04-아키텍처와-재사용.md).
    # Cloud Run 인스턴스 안의 파일은 배포·유휴 종료·오토스케일마다 사라지고 인스턴스끼리
    # 서로 다른 파일을 본다. 그래서 파일에 적어 두어도 공유 링크의 30일 약속은 지켜지지 않는다.
    # 붙는 자리는 `domains/share/store.py` 이고, 값을 주는 것만으로 PostgreSQL 로 바뀐다.
    database_url: str | None = None

    # 익명키 검증. 운영에서 끄면 아무 문자열로 남의 데이터에 닿는다.
    allow_unverified_anon_key: bool = True

    # LLM. 키 없이도 개발과 e2e 가 돌아야 한다.
    llm_provider: Literal["stub", "openai", "gemini"] = "stub"
    llm_api_key: str | None = None

    # 검색 후보 풀을 무엇으로 채우나.
    #
    #   auto      환경이 정한다. prod 는 감수 통과분만, local·dev 는 초안까지 전부
    #   approved  어느 환경이든 감수 통과분만. 개발에서 운영과 같은 화면을 볼 때 쓴다
    #   draft     초안까지 후보에 넣는다. 운영에서는 아래 기동 가드가 멈춘다
    #
    # 기본값이 auto 인 이유는 `retrieval_pool()` 머리말에 적어 두었다. 요약하면,
    # 감수 통과 16구절로는 어떤 고민에도 닿는 구절이 없어서 개발 화면이 늘 엉뚱한 답을 낸다.
    scripture_pool: Literal["auto", "approved", "draft"] = "auto"

    # 전역 일일 예산 문. 넘으면 등급을 내리고, 더 넘으면 새 요청을 막는다.
    # 세고 판정하는 자리는 app/integrations/llm/budget.py 다.
    budget_warn_usd: float = 10.0
    budget_block_usd: float = 20.0

    @property
    def expose_interactive_docs(self) -> bool:
        return self.environment == "local"

    @property
    def scripture_pool_mode(self) -> str:
        """실제로 쓸 후보 풀. auto 를 환경으로 푼 값이라 언제나 approved 또는 draft 다."""
        if self.scripture_pool != "auto":
            return self.scripture_pool
        return "approved" if self.environment == "prod" else "draft"


def _guard(settings: Settings) -> None:
    """설정이 틀리면 뜨지 않는다. 첫 요청 500 보다 기동 실패가 낫다."""
    # 어느 환경이든 마찬가지다. 키 없이 실제 provider 를 고르면 stub 으로 빠지지 않고 여기서 멈춘다
    if settings.llm_provider != "stub" and not settings.llm_api_key:
        raise RuntimeError(f"{settings.llm_provider} 를 골랐는데 키가 비어 있어요.")

    # 주소를 잘못 적으면 조용히 파일로 빠지는 것이 가장 나쁘다. 배포는 초록인데 링크만 죽는다
    if settings.database_url and not settings.database_url.startswith(
        ("postgresql://", "postgres://")
    ):
        # 값 자체를 싣지 않는다. 주소에 비밀번호가 들어 있고 이 문장은 기동 로그로 나간다.
        # `://` 앞이 없으면 그 사실만 말한다. 잘라 봐야 주소 전체가 그대로 실린다
        scheme, found, _ = settings.database_url.partition("://")
        raise RuntimeError(
            "DATABASE_URL 은 PostgreSQL 주소여야 해요. "
            + (
                f"지금 값은 {scheme}:// 로 시작해요."
                if found
                else "지금 값에는 postgresql:// 같은 앞부분이 아예 없어요."
            )
        )

    # 주소 꼴이 아닌 값은 막는다. 오타 하나면 공유 링크를 누른 사람이 아무 데도 못 가는데,
    # 그걸 알아채는 것은 누군가 링크를 눌러 본 뒤다. DATABASE_URL 과 같은 부류다
    if settings.web_origin and not settings.web_origin.startswith(("http://", "https://")):
        raise RuntimeError(
            f"{WEB_ORIGIN_ENV} 은 http:// 또는 https:// 로 시작하는 주소여야 해요. "
            "지금 값에는 그 앞부분이 없어요."
        )

    if not settings.web_origin:
        # 값이 없는 것은 막지 않는다. 웹 진입을 아직 안 띄운 배포가 있고, 없어도 제품은 돈다.
        # 백엔드 랜딩에 카드와 딥링크가 있어 사람이 갈 곳은 남는다. 위험한 상태가 아니라
        # 덜 친절한 상태라, 기동을 세우는 대신 배포한 사람이 보게 로그로 남긴다.
        #
        # 이 줄은 `configure_logging` 보다 먼저 돌 수 있다. 그래서 본문을 이벤트 이름으로 두고
        # 사람이 읽을 문장은 필드로 보낸다. 가림막은 본문이 이벤트 이름일 때만 남긴다
        log.warning(
            "web_origin_missing",
            extra={
                "event": "web_origin_missing",
                "env": WEB_ORIGIN_ENV,
                "effect": "공유 링크를 누른 사람이 백엔드 랜딩에 머뭅니다. 웹으로 넘기지 않아요.",
            },
        )

    if settings.environment != "prod":
        return
    if settings.scripture_pool == "draft":
        # 감수를 통과하지 않은 문장이 경전으로 화면에 나가는 길이다. 첫 요청이 아니라 여기서 막는다
        raise RuntimeError(
            f"운영에서는 {SCRIPTURE_POOL_ENV}=draft 를 쓸 수 없어요. "
            "감수를 통과하지 않은 문장이 답변에 경전으로 실립니다."
        )
    if settings.allow_unverified_anon_key:
        raise RuntimeError("운영에서 익명키 검증을 끌 수 없어요.")
    if not ANON_KEY_VERIFIER_READY:
        raise RuntimeError(
            "익명키 검증기가 아직 없어서 운영으로 띄울 수 없어요. "
            "app/api/deps.py 의 검증을 채우고 ANON_KEY_VERIFIER_READY 를 올린 뒤 배포해 주세요."
        )
    if not settings.database_url:
        # 안 주면 인스턴스 안 임시 파일로 조용히 빠진다. Cloud Run 에서는 배포·유휴 종료·
        # 오토스케일마다 그 파일이 사라지고 인스턴스끼리 서로 다른 파일을 본다. 카톡에 붙은
        # 링크가 배포 한 번에 통째로 깨지는데 배포도 /health 도 초록이라 아무도 모른다
        raise RuntimeError(
            "운영에는 DATABASE_URL 이 있어야 해요. "
            "없으면 공유 링크가 인스턴스 안 임시 파일에 남아 배포 한 번에 사라집니다."
        )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    _guard(settings)
    return settings
