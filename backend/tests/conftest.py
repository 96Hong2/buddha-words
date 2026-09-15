"""테스트 판 공통 설정.

**LLM provider 를 stub 으로 못 박는다.** 계약 테스트는 라우터·조립·사용량을 진짜로 돌리되
모델만 결정론 stub 으로 쓴다(test_answer_contract.py 머리말). 개발자 기계의 `.env` 가
`LLM_PROVIDER=openai` 라고 해서 테스트가 실제 모델을 부르면 느리고 흔들리고 돈이 나간다.

실제 모델을 부르는 검사는 `LLM_LIVE=1` 을 켤 때만 돈다(test_llm_openai.py).

후보 풀은 환경이 정한다. 테스트는 local 이라 기본이 초안 포함 399구절이고, 운영과 같은
16구절 판을 보려면 `approved_pool` 픽스처를 쓴다. 픽스처가 갈아 끼우는 것은 실제 설정
이름(`SCRIPTURE_POOL`)이라, 제품이 읽는 자리와 테스트가 읽는 자리가 같다.

**재기동을 넘기는 저장도 판마다 새 파일로 못 박는다.** 공유 링크와 답변 행이 이제 파일에
사는데, 기본 경로를 그대로 쓰면 테스트의 `reset_store()` 가 개발 서버가 띄워 둔 링크를 지운다.
"""

from __future__ import annotations

import os
import shutil
import tempfile
from collections.abc import Callable, Iterator
from pathlib import Path

os.environ["LLM_PROVIDER"] = "stub"

_STATE_DIR = Path(tempfile.mkdtemp(prefix="buddha-words-tests-"))
os.environ["STATE_DB_PATH"] = str(_STATE_DIR / "state.db")

import pytest  # noqa: E402

from app.core.config import SCRIPTURE_POOL_ENV, get_settings  # noqa: E402
from app.domains.scripture import repo  # noqa: E402


def reset_pool_caches() -> None:
    """설정에 매인 캐시를 전부 비운다. 이름이 늘고 줄어도 견디게 훑는다."""
    get_settings.cache_clear()
    for value in vars(repo).values():
        clear = getattr(value, "cache_clear", None)
        if callable(clear):
            clear()


@pytest.fixture
def switch_pool(monkeypatch: pytest.MonkeyPatch) -> Iterator[Callable[[str], tuple]]:
    """후보 풀을 갈아 끼운다. 돌려주는 것은 갈아 끼운 뒤의 실제 후보 풀이다."""

    def switch(mode: str) -> tuple:
        monkeypatch.setenv(SCRIPTURE_POOL_ENV, mode)
        reset_pool_caches()
        return repo.retrieval_pool()

    yield switch
    # monkeypatch 가 환경변수를 되돌린 뒤, 그 값으로 만들어진 캐시도 같이 버린다
    reset_pool_caches()


@pytest.fixture
def approved_pool(switch_pool: Callable[[str], tuple]) -> tuple:
    """운영과 같은 후보 풀. 감수를 통과한 16구절뿐이다."""
    return switch_pool("approved")


@pytest.fixture(scope="session", autouse=True)
def _state_db_dir() -> Iterator[None]:
    """판이 끝나면 저장 파일을 치운다. 임시 폴더에 판마다 하나씩 쌓이지 않게."""
    yield
    shutil.rmtree(_STATE_DIR, ignore_errors=True)
