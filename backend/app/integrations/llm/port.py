"""LLM 포트.

SDK 를 쓰지 않고 httpx 로 직접 부른다. 모델 id 와 프롬프트는 **배포 산출물**이라
환경변수로 갈아 끼우지 않는다. provider 만 고른다.

원문을 로그에 남기지 않는다. `store` 를 끄고 부른다.
"""

from __future__ import annotations

from typing import Protocol


class ConsultationClient(Protocol):
    async def classify(self, text: str) -> dict[str, object]:
        """입력 분류(2층). 출력 100토큰 안팎, strict JSON."""

    async def pass1(self, text: str, candidates: list[dict[str, str]]) -> dict[str, object]:
        """태그 · 오늘의 부처의 말 · 경전 id · 테마."""

    async def pass2(self, text: str, scripture: dict[str, str], deep: bool) -> dict[str, object]:
        """풀이 · 분석 · 행동 · 마무리."""

    async def light(self, text: str) -> dict[str, object]:
        """가벼운 입력의 짧은 답."""

    async def solace(self, text: str, scripture: dict[str, str]) -> dict[str, object]:
        """위로 전용 답변. 분석·행동 지침이 없다."""
