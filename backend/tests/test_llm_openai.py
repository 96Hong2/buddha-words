"""OpenAI provider 검사.

목으로 격리하지 않는다. 여기서 보는 것은 셋이다.

1. **키 맞추기.** OpenAI 가 채우는 자리와 StubClient 가 내는 자리가 같아야 한다.
   하나라도 어긋나면 compose 가 못 읽어 화면이 빈다. 그래서 두 쪽을 직접 맞대 본다.
2. **조용한 폴백이 없다.** 설정이 틀리면 stub 으로 빠지지 않고 터진다.
3. **실제 호출.** `LLM_LIVE=1` 을 켜면 진짜 모델을 다섯 자리 모두 부른다.
   평소에는 건너뛴다. 느리고 값이 흔들려 단언을 걸 자리가 아니다.
"""

from __future__ import annotations

import asyncio
import os
import time

import httpx
import pytest

from app.core.config import Settings, _guard
from app.domains.answer import compose
from app.domains.routing.rules import LENGTH_POLICY
from app.domains.scripture import repo
from app.integrations.llm import schemas
from app.integrations.llm.openai import (
    LENGTH_FLOOR_DEEP,
    LENGTH_FLOOR_NORMAL,
    MODEL_CHEAP,
    MODEL_FOR_TIER,
    MODEL_PREMIUM,
    MODEL_STANDARD,
    PRICE_USD_PER_1M,
    OpenAIClient,
    Spend,
    answer_length,
    downgrade_effect,
)
from app.integrations.llm.port import LlmSchemaError, LlmTransportError
from app.integrations.llm.stub import StubClient

CONCERN = (
    "요즘 회사에서 팀장님이 제 의견을 계속 무시하세요. "
    "동료들 앞에서 제가 낸 안을 다른 사람 것처럼 말한 적도 있어요. 그만둘까 고민이에요."
)
LIGHT_TEXT = "점심 뭐 먹지?"

live_only = pytest.mark.skipif(
    os.environ.get("LLM_LIVE") != "1" or not os.environ.get("LLM_API_KEY"),
    reason="실제 모델 호출. LLM_LIVE=1 과 LLM_API_KEY 가 있을 때만 돈다",
)


def _props(schema: dict) -> set[str]:
    return set(schema["properties"])


# ────────────────────────────────────────────────────────────────────────────
# 1. 키 맞추기. stub 과 openai 가 같은 자리를 채우나
# ────────────────────────────────────────────────────────────────────────────


def _run(coro):
    """pytest-asyncio 를 들이지 않는다. 비동기 호출은 여기서 직접 돌린다."""
    return asyncio.run(coro)


def test_stub_keys_match_openai_schema() -> None:
    stub = StubClient()
    scripture = {"id": "x", "citation": "c", "text": "t", "modern_gloss": "g"}

    assert _props(schemas.CLASSIFY) == set(_run(stub.classify(CONCERN)))
    assert _props(schemas.PASS1) == set(_run(stub.pass1(CONCERN, [{"id": "dhp.001"}], "cheap")))
    assert _props(schemas.LIGHT) == set(_run(stub.light(LIGHT_TEXT)))
    assert _props(schemas.SOLACE) == set(_run(stub.solace(CONCERN, scripture)))
    # terms 는 정본에서 선택이라 stub 이 안 낸다. 나머지는 글자 그대로 같아야 한다
    assert _props(schemas.PASS2) - {"terms"} == set(
        _run(stub.pass2(CONCERN, scripture, True, "premium"))
    )


def test_pass1_schema_holds_the_product_rules() -> None:
    """경구체 길이와 후보 개수는 화면 계약이라 스키마가 직접 잰다."""
    good = {
        "responseType": "answer",
        "safetyFlag": "none",
        "contextFlags": [],
        "emotionTags": ["anger"],
        "modernBuddhaMessage": "남의 속도를 좇지 마라. 너의 길은 아직 끝나지 않았다.",
        "scriptureIds": ["dhp.001"],
        "visualTheme": "comparison",
    }
    assert schemas.violations(good, schemas.PASS1) == []

    too_short = {**good, "modernBuddhaMessage": "놓아라."}
    assert schemas.violations(too_short, schemas.PASS1)

    unknown_tag = {**good, "emotionTags": ["burnout"]}
    assert schemas.violations(unknown_tag, schemas.PASS1)

    three_scriptures = {**good, "scriptureIds": ["a", "b", "c"]}
    assert schemas.violations(three_scriptures, schemas.PASS1)


def test_violations_finds_nested_breaks() -> None:
    broken = {
        "scriptureExplanation": "짧아요",
        "terms": [],
        "personalAnalysis": [{"heading": "짧", "body": "ㄱ" * 130}],
        "actions": [{"title": "짧다", "why": ""}],
        "closingMessage": "오늘 하루도 잘 넘기셨어요 정말로요.",
    }
    found = schemas.violations(broken, schemas.PASS2)
    assert any("scriptureExplanation" in f for f in found)
    assert any("heading" in f for f in found)
    assert any("title" in f for f in found)


# ────────────────────────────────────────────────────────────────────────────
# 2. 조용한 폴백이 없다
# ────────────────────────────────────────────────────────────────────────────


def test_guard_rejects_keyless_openai() -> None:
    """키 없이 openai 를 고르면 기동에서 멈춘다. 첫 요청 500 이나 stub 폴백이 아니다."""
    with pytest.raises(RuntimeError):
        _guard(Settings(environment="local", llm_provider="openai", llm_api_key=None))
    # 키가 있으면 지나간다
    _guard(Settings(environment="local", llm_provider="openai", llm_api_key="sk-test"))


def test_stub_provider_needs_no_key() -> None:
    _guard(Settings(environment="local", llm_provider="stub", llm_api_key=None))


def test_deadline_stops_instead_of_holding_the_request() -> None:
    """위쪽이 받아만 두고 답하지 않을 때. 재시도를 다 쓰지 않고 예산에서 끊는다.

    가짜 응답을 끼워 넣지 않는다. 받기만 하고 조용한 진짜 TCP 서버를 하나 띄워
    실제로 기다려 본다. 이 문이 없으면 한 요청이 몇 분을 쥐고 있게 된다.
    """

    async def go() -> None:
        async def silent(reader, writer) -> None:  # type: ignore[no-untyped-def]
            await asyncio.sleep(300)

        server = await asyncio.start_server(silent, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        client = OpenAIClient("sk-not-used", f"http://127.0.0.1:{port}/v1/chat/completions")
        started = time.monotonic()
        with pytest.raises(LlmTransportError):
            await client._ask(
                stage="solace",
                model=MODEL_CHEAP,
                system="쓰이지 않아요.",
                user="쓰이지 않아요.",
                schema=schemas.SOLACE,
                max_tokens=16,
                effort="low",
                timeout=httpx.Timeout(connect=2.0, read=30.0, write=2.0, pool=2.0),
                deadline=time.monotonic() + 3.0,
            )
        elapsed = time.monotonic() - started
        # 읽기 타임아웃 30초를 세 번 쓰면 90초다. 예산 3초에서 끊겨야 한다
        assert elapsed < 8.0, f"{elapsed:.1f}초나 쥐고 있었어요"
        await client.aclose()
        # wait_closed() 를 기다리지 않는다. 3.12 부터 핸들러가 끝날 때까지 붙잡는데
        # 이 핸들러는 일부러 잠들어 있다. 남은 작업은 asyncio.run 이 끝내면서 접는다
        server.close()

    _run(go())


# ────────────────────────────────────────────────────────────────────────────
# 4. 분량 문. 하한 80% 를 밑돌면 한 번만 다시 만든다 (개발 계획 1.4)
# ────────────────────────────────────────────────────────────────────────────


def test_length_floor_follows_the_plan() -> None:
    """하한은 계획의 분량 규약에서 나온다. 규약이 바뀌면 여기서 걸린다."""
    assert LENGTH_FLOOR_DEEP == int(LENGTH_POLICY["deep"]["total"][0] * 0.8)
    assert LENGTH_FLOOR_NORMAL == int(LENGTH_POLICY["normal"]["total"][0] * 0.8)


def test_answer_length_counts_what_the_screen_shows() -> None:
    raw = {
        "scriptureExplanation": "가" * 100,
        "personalAnalysis": [{"heading": "나" * 10, "body": "다" * 200}],
        "actions": [{"title": "라" * 10, "why": "마" * 20}],
        "closingMessage": "바" * 30,
    }
    assert answer_length(raw) == 370
    assert answer_length({}) == 0


# ────────────────────────────────────────────────────────────────────────────
# 5. 등급과 단가. 강등이 거꾸로 돌지 않나
# ────────────────────────────────────────────────────────────────────────────


def test_budget_downgrade_never_costs_more() -> None:
    """예산 강등이 값을 올리면 예산 문이 거꾸로 도는 것이다.

    실제로 한동안 그렇게 박혀 있었다. cheap 에 gpt-5.4-mini, premium 에 gpt-5.6-luna 였는데
    mini 가 luna 보다 3.75배 비싸서, 값을 줄이려던 강등이 값을 2.4배로 올렸다.
    등급에 모델을 새로 박을 때 같은 실수를 하면 여기서 걸린다.
    """
    assert downgrade_effect() != "costlier"


def test_every_tier_model_has_a_price() -> None:
    """단가를 모르는 모델을 부르면 예산 문이 0원으로 세어 조용히 열려 있게 된다."""
    for tier, model in MODEL_FOR_TIER.items():
        assert model in PRICE_USD_PER_1M, f"{tier} 등급의 {model} 단가가 없어요"


def test_tier_prices_do_not_invert() -> None:
    """싼 등급이 비싼 등급보다 비싸지 않아야 한다. 이름이 값을 보증하지 않는다.

    네 칸을 하나씩 맞댄다. 튜플째로 비교하면 앞 칸만 보고 넘어가서, 입력은 싸고 출력만
    비싼 모델을 통과시킨다. 값의 대부분은 출력 쪽에서 난다.
    """
    ladder = [MODEL_FOR_TIER["cheap"], MODEL_FOR_TIER["standard"], MODEL_FOR_TIER["premium"]]
    prices = [PRICE_USD_PER_1M[m] for m in ladder]
    for lower, upper in zip(prices, prices[1:], strict=False):
        assert all(c <= p for c, p in zip(lower, upper, strict=True)), (
            f"{lower} 가 {upper} 보다 비싼 칸이 있어요"
        )


def test_spend_counts_cached_input_at_the_cached_rate() -> None:
    """캐시된 입력은 정가의 10% 로 청구된다. 전부 정가로 세면 필요 없는 강등을 부른다."""
    model = MODEL_PREMIUM
    price_in, price_cached, _price_write, price_out = PRICE_USD_PER_1M[model]
    spent = Spend.of(
        model,
        {
            "prompt_tokens": 2000,
            "prompt_tokens_details": {"cached_tokens": 1500},
            "completion_tokens": 1000,
        },
    )
    assert (spent.tokens_in, spent.cached_in, spent.tokens_out) == (2000, 1500, 1000)
    want = (500 * price_in + 1500 * price_cached + 1000 * price_out) / 1_000_000
    assert spent.usd == pytest.approx(want)
    # 캐시를 안 세던 옛 셈보다 싸야 한다. 같으면 캐시 값을 안 쓰고 있는 것이다
    assert spent.usd < (2000 * price_in + 1000 * price_out) / 1_000_000


def test_spend_counts_cache_writes_at_the_higher_rate() -> None:
    """캐시에 올린 입력은 정가보다 비싸다. 안 세면 예산 문이 덜 썼다고 본다.

    실제 응답이 세 칸을 겹치지 않게 나눠 준다. 2026-09-15 에 1차 패스를 처음 부른 응답이
    prompt_tokens 3,594 = cached 1,167 + cache_write 2,424 + 정가 3 이었다.
    """
    model = MODEL_PREMIUM
    price_in, price_cached, price_write, price_out = PRICE_USD_PER_1M[model]
    assert price_write > price_in, "캐시 쓰기가 정가보다 싸면 이 칸을 따로 셀 이유가 없어요"

    spent = Spend.of(
        model,
        {
            "prompt_tokens": 3594,
            "prompt_tokens_details": {"cached_tokens": 1167, "cache_write_tokens": 2424},
            "completion_tokens": 247,
        },
    )
    assert (spent.cached_in, spent.written_in) == (1167, 2424)
    want = (3 * price_in + 1167 * price_cached + 2424 * price_write + 247 * price_out) / 1_000_000
    assert spent.usd == pytest.approx(want)
    # 캐시 쓰기를 정가로 세던 옛 셈보다 비싸야 한다. 같으면 이 칸을 안 쓰고 있는 것이다
    cheaper = (2427 * price_in + 1167 * price_cached + 247 * price_out) / 1_000_000
    assert spent.usd > cheaper


def test_spend_survives_usage_without_cache_details() -> None:
    """캐시 필드를 안 주는 응답도 있다. 그때는 전부 정가로 센다."""
    model = MODEL_PREMIUM
    price_in, _price_cached, _price_write, price_out = PRICE_USD_PER_1M[model]
    spent = Spend.of(model, {"prompt_tokens": 800, "completion_tokens": 200})
    assert (spent.cached_in, spent.written_in) == (0, 0)
    assert spent.usd == pytest.approx((800 * price_in + 200 * price_out) / 1_000_000)
    # usage 를 아예 못 받은 경우
    assert Spend.of(model, None).usd == 0.0


def test_spend_adds_up_across_calls() -> None:
    """다시 묻기까지 합쳐 한 자리의 값으로 센다. 버린 답도 값은 나갔다."""
    model = MODEL_PREMIUM
    first = Spend.of(
        model,
        {
            "prompt_tokens": 100,
            "prompt_tokens_details": {"cached_tokens": 40},
            "completion_tokens": 10,
        },
    )
    total = first.plus(first)
    assert (total.tokens_in, total.cached_in, total.tokens_out) == (200, 80, 20)
    assert total.usd == pytest.approx(first.usd * 2)


# ────────────────────────────────────────────────────────────────────────────
# 3. 실제 호출. LLM_LIVE=1 일 때만
# ────────────────────────────────────────────────────────────────────────────


@live_only
def test_live_five_methods() -> None:
    client = OpenAIClient(os.environ["LLM_API_KEY"])
    pool = compose.candidate_pool(CONCERN)
    candidates = compose._candidate_payload(pool)
    allowed = {s.id for s in pool}

    async def go() -> None:
        verdict = await client.classify(CONCERN)
        assert verdict["route"] in ("light", "normal", "deep", "crisis", "invalid")

        p1 = await client.pass1(CONCERN, candidates, "premium")
        # 경전 본문을 모델이 만들지 않는다. 후보 밖의 id 를 고르지 않는다
        assert set(p1["scriptureIds"]) <= allowed

        picked = repo.by_id(p1["scriptureIds"][0])
        scripture = {
            "id": picked.id,
            "citation": picked.citation,
            "text": picked.text,
            "modern_gloss": picked.modern_gloss,
        }
        p2 = await client.pass2(CONCERN, scripture, deep=True, tier="premium")
        assert schemas.violations(p2, schemas.PASS2) == []

        light = await client.light(LIGHT_TEXT)
        assert light["responseType"] == "light"

        sol = await client.solace("다 놓아버리고 싶어요. 사라지고 싶은 마음만 들어요.", scripture)
        # 금지어에 걸리면 고정 문구로 바뀐다. 평소에는 걸리지 않아야 한다
        assert not compose.solace_blocked(sol["opening"], sol["closing"])

        await client.aclose()

    _run(go())


@live_only
def test_live_deep_answer_clears_the_length_floor() -> None:
    """DEEP 2차 패스가 분량 하한을 넘는지 실제로 본다. 못 넘으면 다시 만들어서 넘긴다."""
    client = OpenAIClient(os.environ["LLM_API_KEY"])
    picked = compose.candidate_pool(CONCERN)[0]
    scripture = {
        "id": picked.id,
        "citation": picked.citation,
        "text": picked.text,
        "modern_gloss": picked.modern_gloss,
    }

    async def go() -> None:
        out = await client.pass2(CONCERN, scripture, deep=True, tier="premium")
        assert schemas.violations(out, schemas.PASS2) == []
        chars = answer_length(out)
        assert chars >= LENGTH_FLOOR_DEEP, f"{chars}자밖에 안 나왔어요"
        await client.aclose()

    _run(go())


@live_only
def test_live_models_are_reachable() -> None:
    """등급 셋에 박아 둔 모델 id 가 실제로 부를 수 있는 것인지 본다."""
    client = OpenAIClient(os.environ["LLM_API_KEY"])

    async def go() -> None:
        for model in {MODEL_CHEAP, MODEL_STANDARD, MODEL_PREMIUM}:
            out = await client._ask(
                stage="solace",
                model=model,
                system="한국어 해요체로 두 문장을 쓰세요.",
                user="가벼운 인사를 적어 주세요.",
                schema=schemas.SOLACE,
                max_tokens=2000,
                effort="low",
                timeout=httpx.Timeout(30.0),
            )
            assert out["opening"]
        await client.aclose()

    _run(go())


@live_only
def test_live_truncated_output_raises_instead_of_filling() -> None:
    """예산 안에서 답이 안 끝나면 빈 자리를 채우지 않고 예외를 올린다.

    출력 예산을 답이 들어갈 수 없게 좁혀 실제로 잘리게 만든다. 한 번 더 물어보고도
    안 되면 LlmSchemaError 다. 서버가 반쪽짜리를 지어내 채우지 않는지 보는 자리다.
    """
    client = OpenAIClient(os.environ["LLM_API_KEY"])

    async def go() -> None:
        with pytest.raises(LlmSchemaError):
            await client._ask(
                stage="solace",
                model=MODEL_CHEAP,
                system="한국어 해요체로 두 문장씩 쓰세요.",
                user="위로의 말을 적어 주세요.",
                schema=schemas.SOLACE,
                max_tokens=16,
                effort="low",
                timeout=httpx.Timeout(30.0),
            )
        await client.aclose()

    _run(go())
