"""기동 가드: 운영으로 뜰 수 있는 설정인가.

익명키 검증기가 없는 채로 운영이 뜨면 /health 는 ok 를 돌려주고 사용자 요청만 전부 501 이
된다. 배포는 초록인데 앱만 죽는 모양이라, 뜨기 전에 막는다.
"""

from __future__ import annotations

import pytest

from app.core import config
from app.core.config import Settings, _guard

PROD_DB = "postgresql://buddha:pw@10.0.0.2:5432/buddha_words"


def _prod(*, allow_unverified: bool, database_url: str | None = PROD_DB) -> Settings:
    """운영으로 뜨는 설정 한 벌. 지금 재려는 칸 말고는 전부 통과하는 값으로 채운다."""
    return Settings(
        environment="prod",
        llm_provider="stub",
        llm_api_key=None,
        allow_unverified_anon_key=allow_unverified,
        database_url=database_url,
    )


def test_prod_stops_while_the_verifier_is_missing() -> None:
    """검증을 켜 두었어도 검증기가 없으면 뜨지 않는다."""
    with pytest.raises(RuntimeError, match="익명키 검증기"):
        _guard(_prod(allow_unverified=False))


def test_prod_stops_when_verification_is_turned_off() -> None:
    with pytest.raises(RuntimeError, match="익명키 검증을 끌 수 없어요"):
        _guard(_prod(allow_unverified=True))


def test_prod_passes_once_the_verifier_is_there(monkeypatch: pytest.MonkeyPatch) -> None:
    """검증기를 붙이고 깃발을 올리면 그때 지나간다."""
    monkeypatch.setattr(config, "ANON_KEY_VERIFIER_READY", True)
    _guard(_prod(allow_unverified=False))
    with pytest.raises(RuntimeError, match="익명키 검증을 끌 수 없어요"):
        _guard(_prod(allow_unverified=True))


def test_prod_stops_without_a_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """저장 자리를 안 주면 뜨지 않는다.

    안 막으면 인스턴스 안 임시 파일로 조용히 빠진다. Cloud Run 은 그 파일을 배포마다 버리고
    인스턴스끼리 서로 다른 파일을 봐서, 카톡에 붙은 공유 링크가 배포 한 번에 죽는다.
    그런데 배포도 /health 도 초록이라 아무도 모른다.
    """
    monkeypatch.setattr(config, "ANON_KEY_VERIFIER_READY", True)
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        _guard(_prod(allow_unverified=False, database_url=None))
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        _guard(_prod(allow_unverified=False, database_url=""))


def test_local_keeps_running_without_a_database_url() -> None:
    """로컬·개발은 그대로 파일에 적는다. 개발하려고 PostgreSQL 을 띄우게 만들지 않는다."""
    _guard(Settings(environment="local", llm_provider="stub", llm_api_key=None, database_url=None))
    _guard(Settings(environment="dev", llm_provider="stub", llm_api_key=None, database_url=None))


def test_local_runs_without_the_verifier() -> None:
    """로컬·개발은 믿고 넘어간다. 화면을 만드는 데 인증서를 기다리지 않는다."""
    _guard(Settings(environment="local", llm_provider="stub", llm_api_key=None))
    _guard(Settings(environment="dev", llm_provider="stub", llm_api_key=None))
