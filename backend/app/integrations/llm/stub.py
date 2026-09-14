"""키 없이 도는 스텁 provider.

개발과 e2e 는 이걸로 돈다. 실제 모델은 값이 들고 결과가 흔들려 화면 단언을 못 한다.
결정론이라 같은 글에는 늘 같은 답이 나온다.
"""

from __future__ import annotations

_MESSAGE = {
    "anxiety": "오지 않은 일을 미리 앓지 마라. 지금 네 발이 닿은 자리만이 네 것이다.",
    "anger": "불을 불로 끄려 하지 마라. 손에 쥔 돌이 먼저 네 손을 태운다.",
    "loss": "떠난 것을 붙들지 마라. 강물은 지나가야 다음 물이 온다.",
    "comparison": "남의 속도를 좇지 마라. 그 사람의 길은 그 사람의 것이고, 너의 길은 아직 끝나지 않았다.",
    "choice": "두 길 앞에서 오래 서 있는 것도 걸음이다. 다만 서 있는 줄은 알고 서 있어라.",
    "sleepless": "밤에 떠오른 생각을 밤에 판단하지 마라. 어둠은 크기를 부풀린다.",
    "attachment": "쥔 손으로는 받을 수 없다. 펴는 것이 곧 얻는 것이다.",
    "emptiness": "비어 있음을 결핍이라 부르지 마라. 그릇은 비어 있어 담는다.",
    "relationship": "가까울수록 사이를 두어라. 나무도 붙어 자라면 함께 시든다.",
    "approval": "남의 저울로 네 무게를 재지 마라. 그 저울은 매일 눈금이 바뀐다.",
}

_THEME_WORDS: list[tuple[str, str, tuple[str, ...]]] = [
    ("anger", "anger", ("화가", "짜증", "분노", "억울", "싸웠")),
    ("sleepless", "anxiety", ("잠", "불면", "새벽", "못 자")),
    ("loss", "loneliness", ("이별", "헤어", "떠났", "돌아가셨", "상실")),
    ("comparison", "comparison", ("비교", "남들", "뒤처", "부럽")),
    ("relationship", "fatigue", ("친구", "동료", "남편", "아내", "가족", "관계")),
    ("approval", "approval", ("인정", "눈치", "평가", "미움받")),
    ("attachment", "attachment", ("미련", "집착", "못 놓", "아직도")),
    ("emptiness", "emptiness", ("공허", "무기력", "의미가", "허무")),
    ("anxiety", "anxiety", ("불안", "걱정", "두렵", "무서")),
]


def theme_of(text: str) -> tuple[str, str]:
    for theme, tag, words in _THEME_WORDS:
        if any(w in text for w in words):
            return theme, tag
    return "choice", "confusion"


class StubClient:
    async def classify(self, text: str) -> dict[str, object]:
        people = ("남편", "아내", "엄마", "아빠", "부모", "친구", "동료", "상사", "팀장")
        decisions = ("해야 할까", "할까요", "그만둘", "이혼", "헤어질", "결정", "선택")
        score = 0.2
        if any(p in text for p in people):
            score += 0.3
        if any(d in text for d in decisions):
            score += 0.3
        if len(text) >= 120:
            score += 0.25
        return {
            "route": "deep" if score >= 0.7 else "normal",
            "confidence": round(score, 2),
            "reasons": ["stub_classifier"],
            "minor": False,
            "abuse": False,
        }

    async def pass1(self, text: str, candidates: list[dict[str, str]]) -> dict[str, object]:
        theme, tag = theme_of(text)
        return {
            "responseType": "answer",
            "safetyFlag": "none",
            "contextFlags": [],
            "emotionTags": [tag, "confusion"],
            "modernBuddhaMessage": _MESSAGE[theme],
            # 후보 안의 id 만 고른다. 서버가 화이트리스트로 다시 거른다.
            "scriptureIds": [candidates[0]["id"]] if candidates else [],
            "visualTheme": theme,
        }

    async def pass2(self, text: str, scripture: dict[str, str], deep: bool) -> dict[str, object]:
        sections = [
            {
                "heading": "지금 무엇이 무거운가",
                "body": (
                    "적어 주신 글에는 상황 자체보다 그 상황을 어떻게 받아들여야 할지 모르겠다는 "
                    "마음이 더 크게 들어 있어요. 무엇을 해야 할지 몰라서 힘든 것이 아니라, 지금 "
                    "느끼는 감정이 괜찮은 것인지 확신이 서지 않아서 더 오래 맴도는 거예요."
                ),
            },
        ]
        if deep:
            sections.append(
                {
                    "heading": "내가 정할 수 있는 자리",
                    "body": (
                        "이 상황에는 내가 어쩔 수 있는 부분과 어쩔 수 없는 부분이 섞여 있어요. "
                        "상대의 마음과 이미 지나간 일은 뒤쪽이고, 앞으로 어떻게 반응할지와 어디까지 "
                        "감당할지는 앞쪽이에요. 둘을 섞어 두면 무게가 "
                        "두 배가 돼요. 오늘은 앞쪽 하나만 붙잡아도 충분해요."
                    ),
                }
            )
        return {
            "scriptureExplanation": (
                f"{scripture.get('modern_gloss', '')} 이 구절은 상황을 바꾸라는 말이 아니라, "
                "상황을 보는 자리를 한 걸음 옮겨 보라는 말이에요. 같은 일을 겪어도 어디에 서서 "
                "보느냐에 따라 견딜 수 있는 무게가 달라져요. 지금 바꿀 수 있는 것과 바꿀 수 없는 "
                "것을 먼저 갈라 두면 마음이 한결 가벼워져요."
            ),
            "personalAnalysis": sections,
            "actions": [
                {"title": "오늘 자기 전에 이 마음 한 줄만 적어 두기", "why": "머리에서 꺼내 놓으면 크기가 실제 크기로 돌아와요"},
                {"title": "내일 이 일로 가장 먼저 만날 사람 한 명 정하기", "why": "혼자 굴리는 시간이 길수록 결론이 극단으로 가요"},
            ],
            "closingMessage": "오늘 하루를 잘 넘긴 것만으로도 충분히 하신 거예요.",
        }

    async def light(self, text: str) -> dict[str, object]:
        return {
            "responseType": "light",
            "message": (
                "오늘은 가볍게 지나가도 괜찮은 날인가 봐요. 부처도 탁발을 나가기 전에는 그날 "
                "무엇을 먹을지 정하지 않았다고 해요. 정해 두지 않아야 받는 대로 맛있게 먹으니까요."
            ),
            "emotionTags": ["other"],
        }

    async def solace(self, text: str, scripture: dict[str, str]) -> dict[str, object]:
        return {
            "opening": (
                "그렇게까지 버텨 오신 이야기를 들었어요. 그 마음을 혼자 들고 계셨다는 게 가장 "
                "무겁게 남아요. 지금 느끼는 것이 과한 것도, 틀린 것도 아니에요."
            ),
            "closing": (
                "지금 당장 무엇을 결정하지 않으셔도 돼요. 물 한 잔 마시고 창문을 한 번 열어 보셔요. "
                "그다음은 그다음에 생각해도 늦지 않아요."
            ),
        }
