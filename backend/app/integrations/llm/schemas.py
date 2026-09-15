"""모델 출력 스키마와 그 검사기.

`spec/answer.schema.json` 의 `LlmPass1` · `LlmPass2` · `LlmLight` 를 OpenAI structured outputs
strict 모드가 받는 모양으로 옮긴 것이다. strict 는 모든 키가 `required` 에 있고
`additionalProperties` 가 false 여야 한다. 그래서 정본에서 선택인 `terms` · `why` 도 여기서는
필수로 두고, 내용이 없으면 빈 값으로 받는다.

검사를 두 번 한다. 스키마를 요청에 실어 모델을 묶고, 받은 값도 여기서 다시 잰다.
길이·개수는 strict 가 늘 지켜 주지 않으므로 서버가 직접 재야 한다.
빠진 자리를 채우지 않는다. 어긋나면 그대로 올린다.
"""

from __future__ import annotations

from typing import Any

EMOTION_TAGS = [
    "anxiety",
    "comparison",
    "approval",
    "attachment",
    "anger",
    "regret",
    "loneliness",
    "emptiness",
    "confusion",
    "fatigue",
    "other",
]
VISUAL_THEMES = [
    "anxiety",
    "anger",
    "loss",
    "comparison",
    "choice",
    "sleepless",
    "attachment",
    "emptiness",
    "relationship",
    "approval",
]
CONTEXT_FLAGS = ["self_harm", "abuse_victim", "bereavement", "discrimination_victim", "minor"]


def _obj(props: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(props),
        "properties": props,
    }


CLASSIFY = _obj(
    {
        "route": {"enum": ["light", "normal", "deep", "crisis", "invalid"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        # 판정 근거 코드. 그대로 로그에 실리므로 원문이 들어가지 않게 짧게 묶는다
        "reasons": {
            "type": "array",
            "minItems": 1,
            "maxItems": 3,
            "items": {"type": "string", "maxLength": 40},
        },
        "minor": {"type": "boolean"},
        "abuse": {"type": "boolean"},
    }
)

PASS1 = _obj(
    {
        "responseType": {"enum": ["answer", "refusal"]},
        "safetyFlag": {"enum": ["none", "concern", "crisis"]},
        "contextFlags": {"type": "array", "maxItems": 5, "items": {"enum": CONTEXT_FLAGS}},
        "emotionTags": {
            "type": "array",
            "minItems": 1,
            "maxItems": 4,
            "items": {"enum": EMOTION_TAGS},
        },
        "modernBuddhaMessage": {"type": "string", "minLength": 18, "maxLength": 70},
        "scriptureIds": {
            "type": "array",
            "minItems": 1,
            "maxItems": 2,
            "items": {"type": "string", "maxLength": 40},
        },
        "visualTheme": {"enum": VISUAL_THEMES},
    }
)

_ANALYSIS = _obj(
    {
        "heading": {"type": "string", "minLength": 4, "maxLength": 24},
        "body": {"type": "string", "minLength": 120, "maxLength": 700},
    }
)
_ACTION = _obj(
    {
        "title": {"type": "string", "minLength": 6, "maxLength": 40},
        "why": {"type": "string", "maxLength": 80},
    }
)
_TERM = _obj(
    {
        "word": {"type": "string", "maxLength": 40},
        "gloss": {"type": "string", "maxLength": 80},
    }
)

PASS2 = _obj(
    {
        "scriptureExplanation": {"type": "string", "minLength": 150, "maxLength": 420},
        "terms": {"type": "array", "maxItems": 2, "items": _TERM},
        "personalAnalysis": {"type": "array", "minItems": 1, "maxItems": 3, "items": _ANALYSIS},
        "actions": {"type": "array", "minItems": 1, "maxItems": 3, "items": _ACTION},
        "closingMessage": {"type": "string", "minLength": 15, "maxLength": 60},
    }
)

LIGHT = _obj(
    {
        # strict 모드는 type 없는 const 를 받지 않는다. 한 값짜리 enum 으로 묶는다
        "responseType": {"type": "string", "enum": ["light"]},
        "message": {"type": "string", "minLength": 80, "maxLength": 420},
        "emotionTags": {"type": "array", "maxItems": 2, "items": {"enum": EMOTION_TAGS}},
    }
)

SOLACE = _obj(
    {
        "opening": {"type": "string", "minLength": 20, "maxLength": 200},
        "closing": {"type": "string", "minLength": 20, "maxLength": 200},
    }
)


# ────────────────────────────────────────────────────────────────────────────
# 검사기. jsonschema 는 개발 의존성이라 운영 경로에서 쓰지 않는다.
# 위 스키마가 쓰는 키워드만 다룬다.
# ────────────────────────────────────────────────────────────────────────────

_TYPES: dict[str, type | tuple[type, ...]] = {
    "object": dict,
    "array": list,
    "string": str,
    "boolean": bool,
    "number": (int, float),
    "integer": int,
}


def violations(value: Any, schema: dict[str, Any], path: str = "$") -> list[str]:
    """어긋난 자리를 전부 모아 돌려준다. 값은 담지 않는다. 원문이 섞일 수 있다."""
    out: list[str] = []

    if "const" in schema and value != schema["const"]:
        out.append(f"{path}: const 불일치")
        return out
    if "enum" in schema and value not in schema["enum"]:
        out.append(f"{path}: enum 밖의 값")
        return out

    expected = schema.get("type")
    if expected:
        py = _TYPES[expected]
        # bool 은 int 의 하위형이라 number 검사에 새어 든다
        if isinstance(value, bool) and expected in ("number", "integer"):
            out.append(f"{path}: {expected} 가 아님")
            return out
        if not isinstance(value, py):
            out.append(f"{path}: {expected} 가 아님")
            return out

    if expected == "string":
        if "minLength" in schema and len(value) < schema["minLength"]:
            out.append(f"{path}: {schema['minLength']}자 미만 (실제 {len(value)})")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            out.append(f"{path}: {schema['maxLength']}자 초과 (실제 {len(value)})")
    elif expected == "number":
        if "minimum" in schema and value < schema["minimum"]:
            out.append(f"{path}: minimum 미만")
        if "maximum" in schema and value > schema["maximum"]:
            out.append(f"{path}: maximum 초과")
    elif expected == "array":
        if "minItems" in schema and len(value) < schema["minItems"]:
            out.append(f"{path}: {schema['minItems']}개 미만 (실제 {len(value)})")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            out.append(f"{path}: {schema['maxItems']}개 초과 (실제 {len(value)})")
        item_schema = schema.get("items")
        if item_schema:
            for i, item in enumerate(value):
                out += violations(item, item_schema, f"{path}[{i}]")
    elif expected == "object":
        for key in schema.get("required", []):
            if key not in value:
                out.append(f"{path}.{key}: 없음")
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in props:
                    out.append(f"{path}.{key}: 스키마에 없는 키")
        for key, sub in props.items():
            if key in value:
                out += violations(value[key], sub, f"{path}.{key}")

    return out
