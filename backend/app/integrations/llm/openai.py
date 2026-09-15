"""OpenAI provider.

SDK 를 쓰지 않고 httpx 로 `/v1/chat/completions` 를 직접 부른다.

지키는 것 넷
1. `store: false`. 고민 원문이 OpenAI 쪽에 남지 않는다. 원문은 로그에도 남기지 않는다.
2. 출력은 structured outputs strict JSON. 받은 값도 서버가 다시 잰다.
   어긋나면 한 번 더 묻고, 그래도 어긋나면 예외를 올린다. **빈 자리를 임의로 채우지 않는다.**
3. 모델 id 와 프롬프트는 배포 산출물이라 이 파일과 prompts.py 에 상수로 박는다.
   환경변수로 고르는 것은 provider 와 키뿐이다. 고른 근거는 MODELS.md 에 있다.
4. 타임아웃과 재시도를 건다. 다 쓰고도 못 받으면 port.py 의 LlmError 로 올린다.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.integrations.llm import budget, prompts, schemas
from app.integrations.llm.port import (
    LlmError,
    LlmRefusalError,
    LlmSchemaError,
    LlmTransportError,
    Tier,
)

log = logging.getLogger(__name__)

API_URL = "https://api.openai.com/v1/chat/completions"

# ────────────────────────────────────────────────────────────────────────────
# 모델. 등급 세 급은 개발 계획 1.3 절 「모델 등급과 실제 모델」이 정한 것이고,
# 여기 박힌 실제 id 는 MODELS.md 의 실측으로 고른 것이다. 환경변수로 바꾸지 않는다.
# ────────────────────────────────────────────────────────────────────────────

# 세 등급이 모두 같은 모델이다. 실수가 아니라 실측으로 그렇게 된 것이다.
# gpt-5.6-luna 가 다섯 자리 전부에서 가장 싸면서 품질도 가장 좋았다. 더 비싼 후보들
# (gpt-5.6-sol · gpt-5.5 · gpt-6-astra)은 20~100배를 받으면서 더 나은 답을 주지 않았고
# 화면 예산도 넘겼다. 자세한 표는 MODELS.md 에 있다.
#
# 등급 상수를 셋으로 남겨 두는 이유는 계획 1.3 절의 등급 계약이 살아 있기 때문이다.
# 나중에 한 자리만 다른 모델로 바꿀 때 여기 한 줄만 고치면 된다.
MODEL_CHEAP = "gpt-5.6-luna"
MODEL_STANDARD = "gpt-5.6-luna"
MODEL_PREMIUM = "gpt-5.6-luna"

# 등급 → 모델. 등급은 compose 가 정하고 그것을 어느 모델로 부를지는 여기서만 정한다
MODEL_FOR_TIER: dict[Tier, str] = {
    "cheap": MODEL_CHEAP,
    "standard": MODEL_STANDARD,
    "premium": MODEL_PREMIUM,
}

# 100만 토큰당 (입력, 캐시된 입력, 캐시 쓰기, 출력) 달러. 예산 문이 세는 값의 근거라 여기
# 상수로 박는다. 2026-09-15 에 OpenAI 공식 가격표(developers.openai.com/api/docs/pricing)의
# 네 칸(Input · Cached input · Cache writes · Output)에서 그대로 옮겼다.
# 값이 바뀌면 이 표와 MODELS.md 를 같이 고친다.
#
# 캐시 쓰기가 입력보다 비싸다(luna 는 $0.25 대 $0.20). 처음 보는 접두를 캐시에 올리는 값이라
# 안 쓰던 토큰이 아니라 **더 받는 토큰**이다. 이 칸을 빼고 세면 예산 문이 덜 썼다고 본다.
PRICE_USD_PER_1M: dict[str, tuple[float, float, float, float]] = {
    "gpt-5.6-luna": (0.20, 0.02, 0.25, 1.20),
}

# 등급에 박아 둔 모델 중 값을 모르는 것이 있으면 기동에서 드러난다.
# 값을 모르는 모델을 부르면 예산 문이 0원으로 세어 조용히 열려 있게 된다
_UNPRICED = sorted({m for m in MODEL_FOR_TIER.values() if m not in PRICE_USD_PER_1M})
if _UNPRICED:
    raise RuntimeError(f"단가를 모르는 모델이 있어요: {', '.join(_UNPRICED)}")


@dataclass(frozen=True)
class Spend:
    """한 번 부르는 데 쓴 것. 토큰 수는 로그로, 달러는 예산 문으로 간다."""

    tokens_in: int
    cached_in: int
    written_in: int
    tokens_out: int
    usd: float

    @classmethod
    def of(cls, model: str, usage: dict[str, Any] | None) -> Spend:
        """usage 를 안 주는 응답은 0 으로 센다(재시도로 아예 못 받은 경우).

        입력 토큰이 세 값으로 갈린다. 셋 다 단가가 달라서 따로 센다.

        - 캐시에서 읽은 것(`cached_tokens`)은 정가의 10%.
        - 캐시에 올린 것(`cache_write_tokens`)은 정가보다 **비싸다**(luna 는 1.25배).
          접두가 1,024토큰을 넘는 자리(1차·2차 패스)는 부를 때마다 여기가 찬다.
        - 나머지가 정가다.

        어느 한쪽만 세면 예산 문이 틀린 값으로 강등을 정한다. 캐시 읽기만 세던 셈은
        1차 패스에서 실제보다 15% 적게 썼다고 봤다
        (MODELS.md 「예산 문도 캐시 값으로 센다」 절).
        """
        if not usage:
            return cls(0, 0, 0, 0, 0.0)
        price_in, price_cached, price_write, price_out = PRICE_USD_PER_1M[model]
        tokens_in = int(usage.get("prompt_tokens") or 0)
        details = usage.get("prompt_tokens_details") or {}
        # 셋 다 prompt_tokens 안에 든 값이라 겹치지 않게 잘라 쓴다.
        # 필드를 안 주는 응답도 있다. 그때는 전부 정가로 센다
        cached_in = min(int(details.get("cached_tokens") or 0), tokens_in)
        written_in = min(int(details.get("cache_write_tokens") or 0), tokens_in - cached_in)
        plain_in = tokens_in - cached_in - written_in
        # reasoning 토큰도 출력으로 청구된다. completion_tokens 가 그것까지 담은 값이다
        tokens_out = int(usage.get("completion_tokens") or 0)
        usd = (
            plain_in * price_in
            + cached_in * price_cached
            + written_in * price_write
            + tokens_out * price_out
        ) / 1_000_000
        return cls(tokens_in, cached_in, written_in, tokens_out, usd)

    def plus(self, other: Spend) -> Spend:
        return Spend(
            self.tokens_in + other.tokens_in,
            self.cached_in + other.cached_in,
            self.written_in + other.written_in,
            self.tokens_out + other.tokens_out,
            self.usd + other.usd,
        )


DowngradeEffect = Literal["cheaper", "same_model", "costlier"]
"""예산 강등이 모델 교체로 값을 줄이는지."""


def downgrade_effect() -> DowngradeEffect:
    """예산 문의 premium → cheap 강등이 모델을 바꿔서 값을 줄이나.

    등급 이름이 값을 보증하지 않는다. 두 모델의 단가가 뒤집히면 강등이 오히려 더 쓴다.
    기동 로그가 이 값을 싣고, "costlier" 면 경고가 뜬다.

    지금은 세 등급이 같은 모델이라 "same_model" 이다. 강등이 값을 줄이는 것은 모델을
    바꿔서가 아니라 compose 가 분량 지시를 함께 내리기 때문이다(`deep=False`).
    실측으로 상담 한 건 값이 43% 내려간다(MODELS.md 「예산 강등을 실제로 태워 본 값」).
    """
    cheap = PRICE_USD_PER_1M[MODEL_CHEAP]
    premium = PRICE_USD_PER_1M[MODEL_PREMIUM]
    if cheap == premium:
        return "same_model"
    # 네 칸을 하나씩 맞댄다. 입력만 싸고 출력이 비싼 모델이 있어서 묶어서 비교하면 놓친다
    if all(c <= p for c, p in zip(cheap, premium, strict=True)):
        return "cheaper"
    return "costlier"


# 생각 깊이. 앞쪽 화면은 3~5초 안에 나가야 해서 얕게, 깊은 풀이만 중간으로 둔다
EFFORT_FAST = "low"
EFFORT_DEEP = "medium"

# 출력 상한. reasoning 토큰이 이 예산 안에서 같이 쓰인다
TOKENS_CLASSIFY = 1200
TOKENS_PASS1 = 2500
TOKENS_PASS2_NORMAL = 5000
TOKENS_PASS2_DEEP = 9000
TOKENS_LIGHT = 2500
TOKENS_SOLACE = 2500

# 타임아웃. 앞쪽 화면(classify · pass1 · light)과 뒤쪽 풀이(pass2)의 예산이 다르다
TIMEOUT_FAST = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)
TIMEOUT_SLOW = httpx.Timeout(connect=5.0, read=60.0, write=10.0, pool=5.0)

# 한 자리에 쓰는 전체 시간. 재시도와 다시 묻기까지 이 안에서 끝낸다.
# 이 문이 없으면 위쪽이 멈췄을 때 재시도 3번 × 읽기 타임아웃 × 두 번 묻기로
# 한 요청이 몇 분을 쥐고 있게 된다. 화면 예산은 앞쪽 3~5초, 풀이 15~20초다
BUDGET_FAST = 40.0
BUDGET_SLOW = 90.0
# 분량이 모자라 다시 만들려면 최소 이만큼은 남아 있어야 한다
LENGTH_RETRY_MIN_SECONDS = 20.0

# 재시도. 네트워크·5xx·429 는 물러났다 다시, 스키마 위반은 한 번만 더 묻는다
TRANSPORT_ATTEMPTS = 3
BACKOFF_SECONDS = (0.6, 1.8)
RETRYABLE_STATUS = frozenset({408, 409, 425, 429, 500, 502, 503, 504})

# 분량 하한. 개발 계획 1.4 「분량은 밀도로 잰다」가 정한 하한의 80% 다.
# 밑돌면 한 번만 다시 만든다. 서버가 짧은 답을 늘려 쓰지 않는다
LENGTH_FLOOR_DEEP = 1040  # DEEP 하한 1,300자의 80%
LENGTH_FLOOR_NORMAL = 560  # NORMAL 하한 700자의 80%


def answer_length(raw: dict[str, Any]) -> int:
    """2차 패스가 화면에 내보내는 글자 수. 분량 문이 재는 값이다."""
    analysis = raw.get("personalAnalysis") or []
    actions = raw.get("actions") or []
    return (
        len(str(raw.get("scriptureExplanation", "")))
        + sum(len(str(s.get("heading", ""))) + len(str(s.get("body", ""))) for s in analysis)
        + sum(len(str(a.get("title", ""))) + len(str(a.get("why", ""))) for a in actions)
        + len(str(raw.get("closingMessage", "")))
    )


def _clamp(timeout: httpx.Timeout, left: float) -> httpx.Timeout:
    """남은 예산보다 길게 기다리지 않는다."""
    return httpx.Timeout(
        connect=min(timeout.connect or left, left),
        read=min(timeout.read or left, left),
        write=min(timeout.write or left, left),
        pool=min(timeout.pool or left, left),
    )


class OpenAIClient:
    """ConsultationClient 구현. 다섯 자리 모두 strict JSON 으로 받는다."""

    def __init__(self, api_key: str, base_url: str = API_URL) -> None:
        self._api_key = api_key
        self._url = base_url
        self._client: httpx.AsyncClient | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    # ── httpx ───────────────────────────────────────────────────────────────

    def _http(self) -> httpx.AsyncClient:
        """루프마다 하나. 커넥션 풀은 만든 루프에 묶여 있어 루프가 바뀌면 다시 만든다."""
        loop = asyncio.get_running_loop()
        if self._client is None or self._loop is not loop:
            self._client = httpx.AsyncClient(timeout=TIMEOUT_FAST)
            self._loop = loop
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
            self._loop = None

    # ── 한 번 부르기 ────────────────────────────────────────────────────────

    async def _post(
        self, payload: dict[str, Any], timeout: httpx.Timeout, deadline: float
    ) -> dict[str, Any]:
        """전송 계층. 물러났다 다시 거는 것까지가 여기 일이고, 마감 시각을 넘기지 않는다."""
        last: Exception | None = None
        for attempt in range(TRANSPORT_ATTEMPTS):
            left = deadline - time.monotonic()
            if left <= 0:
                break
            if attempt:
                nap = BACKOFF_SECONDS[min(attempt - 1, len(BACKOFF_SECONDS) - 1)]
                await asyncio.sleep(min(nap, left))
                left = deadline - time.monotonic()
                if left <= 0:
                    break
            try:
                resp = await self._http().post(
                    self._url,
                    json=payload,
                    timeout=_clamp(timeout, left),
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                )
            except httpx.HTTPError as exc:
                last = exc
                continue
            if resp.status_code in RETRYABLE_STATUS:
                last = LlmTransportError(f"status={resp.status_code}")
                continue
            if resp.status_code >= 400:
                # 키·모델·스키마가 틀렸다. 다시 걸어도 같은 답이라 바로 올린다
                raise LlmTransportError(f"status={resp.status_code}")
            return resp.json()
        raise LlmTransportError("주어진 시간 안에 답을 못 받았어요.") from last

    async def _once(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        schema: dict[str, Any],
        schema_name: str,
        max_tokens: int,
        effort: str,
        timeout: httpx.Timeout,
        deadline: float,
    ) -> tuple[dict[str, Any] | None, str, Spend]:
        """한 번 물어보고 판정까지.

        돌려주는 것은 (판정 통과한 값, 어긋난 사유, 이번에 쓴 것)이다. 사유에 원문은 없다.
        어긋나서 버리는 답도 값은 나갔으므로 예산 문에는 먼저 싣는다.
        """
        payload = {
            "model": model,
            "store": False,
            "messages": messages,
            "max_completion_tokens": max_tokens,
            "reasoning_effort": effort,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": True, "schema": schema},
            },
        }
        data = await self._post(payload, timeout, deadline)
        spent = Spend.of(model, data.get("usage"))
        budget.record(spent.usd)
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}

        if message.get("refusal"):
            raise LlmRefusalError("모델이 답하지 않기로 했어요.")
        if choice.get("finish_reason") == "length":
            return None, "출력이 예산 안에서 끝나지 않았어요.", spent

        content = message.get("content")
        if not content:
            return None, "본문이 비어 있어요.", spent
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            return None, "JSON 이 아니에요.", spent
        if not isinstance(parsed, dict):
            return None, "객체가 아니에요.", spent

        found = schemas.violations(parsed, schema)
        if found:
            return None, "; ".join(found[:4]), spent
        return parsed, "", spent

    async def _ask(
        self,
        *,
        stage: str,
        model: str,
        system: str,
        user: str,
        schema: dict[str, Any],
        max_tokens: int,
        effort: str,
        timeout: httpx.Timeout,
        deadline: float | None = None,
        note: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """스키마를 지킬 때까지 최대 두 번. 그래도 어긋나면 올린다.

        처음 묻기와 다시 묻기가 `deadline` 하나를 나눠 쓴다. 넘기면 거기서 끊는다.

        `note` 는 그 자리에서만 뜻이 있는 계측값(후보 몇 개를 실었나 같은 것)이다.
        세는 값만 담는다. 글은 담지 않는다.
        """
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        started = time.monotonic()
        if deadline is None:
            deadline = started + BUDGET_FAST
        parsed, why, spent = await self._once(
            model=model,
            messages=messages,
            schema=schema,
            schema_name=stage,
            max_tokens=max_tokens,
            effort=effort,
            timeout=timeout,
            deadline=deadline,
        )
        retried = False
        if parsed is None:
            retried = True
            log.warning(
                "llm_schema_retry",
                extra={"event": "llm_schema_retry", "stage": stage, "model": model, "why": why},
            )
            parsed, why, again = await self._once(
                model=model,
                messages=[*messages, {"role": "user", "content": prompts.RETRY_NUDGE}],
                schema=schema,
                schema_name=stage,
                # 예산을 넉넉히 준다. 잘려서 어긋난 경우가 가장 흔하다
                max_tokens=int(max_tokens * 1.5),
                effort=effort,
                timeout=timeout,
                deadline=deadline,
            )
            spent = spent.plus(again)
        elapsed_ms = int((time.monotonic() - started) * 1000)
        if parsed is None:
            log.error(
                "llm_schema_failed",
                extra={"event": "llm_schema_failed", "stage": stage, "model": model, "why": why},
            )
            raise LlmSchemaError(f"{stage}: {why}")
        # 원문도 답변 본문도 남기지 않는다. 남기는 것은 어느 자리를 어느 모델로 몇 초에 불렀나뿐이다
        log.info(
            "llm_call",
            extra={
                "event": "llm_call",
                "stage": stage,
                "model": model,
                "ms": elapsed_ms,
                "retried": retried,
                # 프롬프트가 부푼 것은 토큰 값이 오르고 나서야 보인다. 글자 수를 같이 남겨
                # 어느 자리가 부풀었는지 로그만 보고 짚는다. 세는 값이라 원문이 실리지 않는다
                "chars_in": len(system) + len(user),
                "tokens_in": spent.tokens_in,
                # 캐시에서 읽은 입력 토큰. 고정 프롬프트가 실제로 먹히는지 여기로 본다.
                # 0 이 계속 찍히면 접두 캐싱이 끊긴 것이다(MODELS.md 「캐시」 절)
                "cached_in": spent.cached_in,
                # 캐시에 올린 입력 토큰. 정가보다 비싸게 받는 자리라 따로 남긴다
                "written_in": spent.written_in,
                "tokens_out": spent.tokens_out,
                "usd": round(spent.usd, 6),
                "spent_usd": round(budget.spent_today(), 4),
                **(note or {}),
            },
        )
        return parsed

    # ── ConsultationClient ──────────────────────────────────────────────────

    async def classify(self, text: str) -> dict[str, object]:
        return await self._ask(
            stage="classify",
            model=MODEL_CHEAP,
            system=prompts.CLASSIFY_SYSTEM,
            user=prompts.classify_user(text),
            schema=schemas.CLASSIFY,
            max_tokens=TOKENS_CLASSIFY,
            effort=EFFORT_FAST,
            timeout=TIMEOUT_FAST,
            deadline=time.monotonic() + BUDGET_FAST,
        )

    async def pass1(
        self, text: str, candidates: list[dict[str, str]], tier: Tier
    ) -> dict[str, object]:
        """DEEP 은 premium, 나머지는 cheap 으로 온다(계획 1.3 등급 표).

        등급이 올라가도 생각 깊이와 타임아웃은 그대로 둔다. 이 자리는 화면이 3~5초 안에
        바뀌어야 하는 구간이라 예산을 늘릴 자리가 아니다. 깊이는 2차 패스에서 낸다.
        """
        return await self._ask(
            stage="pass1",
            model=MODEL_FOR_TIER[tier],
            system=prompts.PASS1_SYSTEM,
            user=prompts.pass1_user(text, candidates),
            schema=schemas.PASS1,
            max_tokens=TOKENS_PASS1,
            effort=EFFORT_FAST,
            timeout=TIMEOUT_FAST,
            deadline=time.monotonic() + BUDGET_FAST,
            # 후보를 좁히는 일이 실제로 돌았는지는 여기 숫자로만 확인된다.
            # 400 이 찍히면 좁히는 자리가 끊긴 것이다.
            # 등급도 함께 남긴다. 두 등급이 같은 모델 id 를 쓰면 모델 이름만으로는 못 가른다
            note={"candidates": len(candidates), "tier": tier},
        )

    async def pass2(
        self, text: str, scripture: dict[str, str], deep: bool, tier: Tier
    ) -> dict[str, object]:
        """풀이 · 분석 · 행동 · 마무리.

        `deep` 은 분량 지시이고 `tier` 는 모델 등급이다. 둘을 따로 받는 이유는 예산 문이
        닫혔을 때 DEEP 을 「cheap 모델 + 보통 분량」으로 함께 내리기 때문이다.

        분량이 하한의 80% 를 밑돌면 **한 번만** 다시 만든다(개발 계획 1.4). 짧게 나온 답을
        서버가 늘려 쓰지 않는다. 다시 만든 것이 더 짧으면 처음 것을 그대로 쓴다.
        """
        stage = "pass2_deep" if deep else "pass2"
        model = MODEL_FOR_TIER[tier]
        user = prompts.pass2_user(text, scripture, deep)
        common = {
            "stage": stage,
            "model": model,
            "system": prompts.PASS2_SYSTEM,
            "schema": schemas.PASS2,
            "max_tokens": TOKENS_PASS2_DEEP if deep else TOKENS_PASS2_NORMAL,
            "effort": EFFORT_DEEP if deep else EFFORT_FAST,
            "timeout": TIMEOUT_SLOW,
            # 등급을 남기는 이유. Deep Extension 은 standard 로, NORMAL 2차 패스는 cheap 으로
            # 오는데 둘의 모델 id 가 같아서 모델 이름만으로는 어느 쪽인지 가릴 수 없다
            "note": {"tier": tier},
        }
        deadline = time.monotonic() + BUDGET_SLOW

        raw = await self._ask(user=user, deadline=deadline, **common)
        chars = answer_length(raw)
        floor = LENGTH_FLOOR_DEEP if deep else LENGTH_FLOOR_NORMAL
        if chars >= floor or time.monotonic() + LENGTH_RETRY_MIN_SECONDS > deadline:
            return raw

        log.info(
            "llm_length_retry",
            extra={
                "event": "llm_length_retry",
                "stage": stage,
                "model": model,
                "chars": chars,
                "floor": floor,
            },
        )
        try:
            again = await self._ask(
                user=f"{user}\n\n{prompts.LENGTH_NUDGE}", deadline=deadline, **common
            )
        except LlmError:
            # 다시 만들다 실패했다고 처음 답까지 버리지 않는다. 짧아도 사람이 읽을 답이다
            return raw
        return again if answer_length(again) > chars else raw

    async def light(self, text: str) -> dict[str, object]:
        return await self._ask(
            stage="light",
            model=MODEL_CHEAP,
            system=prompts.LIGHT_SYSTEM,
            user=prompts.light_user(text),
            schema=schemas.LIGHT,
            max_tokens=TOKENS_LIGHT,
            effort=EFFORT_FAST,
            timeout=TIMEOUT_FAST,
            deadline=time.monotonic() + BUDGET_FAST,
        )

    async def solace(self, text: str, scripture: dict[str, str]) -> dict[str, object]:
        return await self._ask(
            stage="solace",
            model=MODEL_STANDARD,
            system=prompts.SOLACE_SYSTEM,
            user=prompts.solace_user(text, scripture),
            schema=schemas.SOLACE,
            max_tokens=TOKENS_SOLACE,
            effort=EFFORT_FAST,
            timeout=TIMEOUT_FAST,
            deadline=time.monotonic() + BUDGET_FAST,
        )
