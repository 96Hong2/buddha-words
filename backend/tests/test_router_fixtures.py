"""라우터 픽스처. spec/router.fixtures.json 을 그대로 읽어 돌린다.

기대값을 파이썬으로 다시 적지 않는다. 픽스처가 정본이라 실패하면 rules.py 를 고친다.
"""

import json
from pathlib import Path
from typing import Any

import pytest

from app.domains.routing.rules import (
    ClassifierVerdict,
    RouteDecision,
    escalate_to_solace,
    merge,
    needs_classifier,
    route_by_rules,
)

FIXTURES = Path(__file__).resolve().parents[2] / "spec" / "router.fixtures.json"
CASES: list[dict[str, Any]] = json.loads(FIXTURES.read_text(encoding="utf-8"))["cases"]

# 픽스처는 TS 필드 이름(카멜)으로 적혀 있다. 파이썬 쪽 스네이크 이름으로 옮긴다
FLAG_FIELD = {
    "minor": "minor",
    "abuse": "abuse",
    "lowEntropy": "low_entropy",
    "injection": "injection",
}


def _final(case: dict[str, Any], rules: RouteDecision) -> RouteDecision:
    """verdict 키가 아예 없으면 rules 만, null 이면 분류 실패로 merge 한다"""
    if "verdict" not in case:
        return rules
    raw = case["verdict"]
    return merge(rules, ClassifierVerdict(**raw) if raw is not None else None)


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_router_fixture(case: dict[str, Any]) -> None:
    rules = route_by_rules(case["input"])
    final = _final(case, rules)
    expect = case["expect"]

    if "route" in expect:
        assert rules.route == expect["route"]
        assert not needs_classifier(rules), (
            f"rules 만으로 확정돼야 하는데 classifier 가 필요하다 (confidence {rules.confidence})"
        )
    if "rules" in expect:
        assert rules.route == expect["rules"]
    if "final" in expect:
        assert final.route == expect["final"]
    if "stage" in expect:
        assert final.stage == expect["stage"]
    if "useRag" in expect:
        assert final.use_rag == expect["useRag"]
    if "modelTier" in expect:
        assert final.model_tier == expect["modelTier"]
    if "floor" in expect:
        assert rules.floor == expect["floor"]
    for flag in expect.get("flagsInclude", []):
        assert getattr(final.flags, FLAG_FIELD[flag]), f"flag {flag} 가 서지 않았다"
    if "crisisLevel" in expect:
        assert final.crisis_level == expect["crisisLevel"]
    if "solace" in expect:
        up = escalate_to_solace(final)
        if expect["solace"] == "blocked":
            assert up is None, "위로 답변으로 넘어가면 안 되는 글이 통과했다"
        if expect["solace"] == "allowed":
            assert up is not None, "위로 답변으로 넘어가야 하는 글이 막혔다"
            assert up.route == "solace"
            if "solaceTier" in expect:
                assert up.model_tier == expect["solaceTier"]

