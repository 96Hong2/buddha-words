"""LLM 포트.

SDK 를 쓰지 않고 httpx 로 직접 부른다. 모델 id 와 프롬프트는 **배포 산출물**이라
환경변수로 갈아 끼우지 않는다. provider 만 고른다.

원문을 로그에 남기지 않는다. `store` 를 끄고 부른다.
"""

from __future__ import annotations

from typing import Literal, Protocol

Tier = Literal["cheap", "standard", "premium"]
"""모델 등급. 계획 00 1.3 절 표가 정본이다.

cheap: classifier · LIGHT · NORMAL 1차·2차
standard: 위로 답변 · Deep Extension
premium: DEEP 1차·2차

**등급과 실제 모델 id 는 다른 것이다.** 등급은 부르는 쪽(compose)이 정하고,
그 등급을 어느 모델로 부를지는 provider 가 정한다(배포 산출물).
"""


class ConsultationClient(Protocol):
    async def classify(self, text: str) -> dict[str, object]:
        """입력 분류(2층). 출력 100토큰 안팎, strict JSON."""

    async def pass1(
        self, text: str, candidates: list[dict[str, str]], tier: Tier
    ) -> dict[str, object]:
        """태그 · 오늘의 부처의 말 · 경전 id · 테마. DEEP 은 premium 으로 온다."""

    async def pass2(
        self, text: str, scripture: dict[str, str], deep: bool, tier: Tier
    ) -> dict[str, object]:
        """풀이 · 분석 · 행동 · 마무리.

        `deep` 은 분량 지시이고 `tier` 는 모델 등급이라 따로 받는다. 예산 문이 닫히면
        DEEP 이라도 `deep=False` · `tier="cheap"` 으로 내려온다.
        """

    async def light(self, text: str) -> dict[str, object]:
        """가벼운 입력의 짧은 답."""

    async def solace(self, text: str, scripture: dict[str, str]) -> dict[str, object]:
        """위로 전용 답변. 분석·행동 지침이 없다."""


class LlmError(RuntimeError):
    """provider 가 답을 못 줬다. compose 와 routes 가 이 예외를 잡아 화면 오류로 바꾼다."""


class LlmTransportError(LlmError):
    """네트워크·타임아웃·5xx·429. 재시도를 다 쓰고도 못 받았다."""


class LlmSchemaError(LlmError):
    """모델이 스키마를 어겼다. 한 번 더 물어보고도 어긋나면 이걸 올린다.

    빠진 자리를 서버가 임의로 채우지 않는다. 채우면 사람이 쓴 말이 아닌 것이 화면에 나간다.
    """


class LlmRefusalError(LlmError):
    """모델이 답하기를 거절했다. 안전 판정은 provider 밖에서 한다."""
