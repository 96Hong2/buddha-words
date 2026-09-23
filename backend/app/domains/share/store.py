"""공유 링크가 가리키는 것.

링크는 로그인 없이 누구나 연다. 그래서 익명키로 보호되는 답변 행을 그대로 열어 줄 수 없고,
**카드에 그릴 세 조각만** 따로 떼어 토큰 뒤에 둔다. 토큰은 추측할 수 없는 난수다.

링크가 사는 자리는 **설정이 고른다**. `DATABASE_URL` 이 있으면 PostgreSQL, 없으면 SQLite
파일(`core/persist.py`)이다. 전에는 프로세스 메모리라 배포 한 번에 그 전 링크가 전부 죽었고,
그다음에는 파일이었다. 파일은 로컬에서는 맞지만 배포에서는 아니다. 배포가 Cloud Run 이라
인스턴스 안 파일이 배포·유휴 종료·오토스케일마다 사라지고 인스턴스끼리 서로 다른 파일을 본다.
TTL 이 30일인데 그때까지 사는 것은 그 인스턴스가 살아 있는 동안뿐인 셈이다.

담기는 것은 카드가 받는 칸과 만든 시각뿐이라, 고민 원문도 답변 본문도 들어갈 자리가 없다
(`card.py` 의 ShareCardData). 다만 한 줄 풀이는 2차 패스 해설의 첫 문장이라 **답변에서 나온
글이 30일 남는다.** 그것을 화면에 적어 두는 자리는 설정의 개인정보 안내다.
"""

from __future__ import annotations

import logging
import secrets
import time
from collections.abc import Callable
from dataclasses import asdict
from typing import Any, Protocol

from app.core import persist
from app.domains.share.card import ShareCardData, ShareFullData, one_line_gloss

log = logging.getLogger(__name__)

# 공유 링크가 사는 시간. 카톡 미리보기 크롤러가 늦게 와도 잡히게 넉넉히 둔다
TTL_SECONDS = 30 * 24 * 60 * 60

# 저장 자리가 쓰는 테이블 이름. SQLite 든 PostgreSQL 이든 같은 이름을 쓴다
TABLE_NAME = "share_cards"


class AnswerRow(Protocol):
    """카드가 답변 행에서 읽는 것. **원문(text) 이 여기 없다.**"""

    scripture_ids: list[str]
    pass2: dict[str, Any] | None


# 답변 행에서 읽는 이름 전부. 테스트가 여기에 원문 필드가 끼어들지 않았는지 본다.
# 마음 태그(emotion_tags)와 한마디(modern_message)는 그 고민에서 나온 값이라 더 읽지 않는다
ROW_FIELDS_READ = ("scripture_ids", "pass2")


# 담는 자리의 모양과 두 구현(SQLite · PostgreSQL)은 `core/persist.py` 에 있다.
# 예약(reminder)·무료 장부(quota)도 같은 것을 쓴다.
CardTable = persist.KeyValueTable


def _table() -> CardTable:
    """설정이 가리키는 저장 자리. `DATABASE_URL` 하나로 갈린다."""
    return persist.bind(TABLE_NAME)


# 그려 둔 PNG. **저장 자리가 아니라 프로세스 메모리에 둔다.**
# 한 링크가 카드 804KB + OG 411KB 로 1.2MB 다(실측). 30일치를 담으면 링크 천 개에 1.2GB 라
# 카드가 링크보다 천 배 무겁다. 이 캐시가 막는 것은 크롤러의 연속 요청뿐이고, 재기동 뒤에는
# 그 링크를 처음 긁을 때 한 번 더 그리면 그만이다. 링크 자체는 저장 자리에 있어 깨지지 않는다
_RENDERED: dict[str, tuple[float, dict[str, bytes]]] = {}


def close() -> None:
    """프로세스가 들고 있던 것을 놓는다. 저장 자리에 적힌 것은 그대로 둔다.

    재기동 시험이 부른다. **저장 자리 객체까지 버려야** 한다. 캐시만 비우면 저장이 프로세스
    메모리로 되돌아가도 시험이 초록으로 남는다. 실제로 그런 적이 있다.
    """
    persist.unbind(TABLE_NAME)
    _RENDERED.clear()


def _sweep(now: float) -> None:
    _table().sweep(TTL_SECONDS, now)
    stale = [k for k, (born, _) in _RENDERED.items() if now - born > TTL_SECONDS]
    for key in stale:
        del _RENDERED[key]


def reset_store() -> None:
    """테스트가 격리하려고 부른다. 저장 자리와 메모리를 둘 다 비운다."""
    _table().clear()
    _RENDERED.clear()


def full_from_row(row: AnswerRow, message: str) -> ShareFullData | None:
    """답변 행에서 전체 보내기에 담을 것을 뽑는다. 2차 패스가 없으면 담을 것이 없다.

    `message` 는 「오늘의 부처의 말」 한 줄이고 화면이 넘겨 준다. 행에서 읽지 않는 이유는
    `ROW_FIELDS_READ` 를 그대로 두기 위해서다. 그 목록이 좁을수록 원문이 새어 나올 길이 없다.

    **고민 원문은 어느 칸으로도 오지 않는다.** 여기서 읽는 것은 2차 패스가 만든 글뿐이다.
    """
    pass2 = getattr(row, "pass2", None) or {}
    if pass2.get("status") != "done":
        return None
    sections = [
        {"heading": str(item.get("heading", "")), "body": str(item.get("body", ""))}
        for item in pass2.get("personalAnalysis") or []
    ]
    actions = [
        {"title": str(item.get("title", "")), "why": str(item.get("why") or "")}
        for item in pass2.get("actions") or []
    ]
    return ShareFullData(
        buddha_message=message,
        explanation=str(pass2.get("scriptureExplanation", "")),
        analysis=sections,
        actions=actions,
        closing=str(pass2.get("closingMessage", "")),
    )


def card_from_row(row: AnswerRow, scripture: Any) -> ShareCardData:
    """답변 행과 경전에서 카드 세 조각을 뽑는다.

    `ROW_FIELDS_READ` 의 이름만 읽는다. 고민 원문은 읽지 않으므로 카드에 실릴 길이 없다.
    한 줄 풀이는 2차 패스 해설의 첫 문장이고, 없으면 그 자리를 비운다. 모델을 다시 부르지 않는다.

    경전 아래 줄에는 **출처가 아니라 귀속**을 싣는다(`display_attribution`). 카드는 앱 밖으로
    나가 카톡에 한 장으로 돌아다니는 그림이라, 화자가 빠진 채 「부처의 말」 워드마크와 나란히
    놓이면 육조단경 구절이 부처가 한 말로 읽힌다. 앱 화면보다 이 자리가 더 위험하다.

    한문 원문(`source_text`)은 싣지 않는다. 카드 글꼴 두 벌에 한자가 없어 두부로 그려진다.
    """
    pass2 = getattr(row, "pass2", None) or {}
    explanation = (
        str(pass2.get("scriptureExplanation", "")) if pass2.get("status") == "done" else ""
    )
    return ShareCardData(
        scripture_text=scripture.text,
        scripture_attribution=scripture.display_attribution,
        gloss_line=one_line_gloss(explanation) if explanation else "",
    )


# 담긴 줄이 어느 판인가. 없으면 봉투가 생기기 전에 저장된 줄이다
ENVELOPE_VERSION = 2


def put(card: ShareCardData, full: ShareFullData | None = None) -> str:
    """링크 하나를 연다. `full` 을 주면 답변 전체를 함께 담는다.

    봉투로 감싸는 이유: 예전에는 카드 칸을 그대로 한 줄에 폈다. 거기에 답변 전체를 더하면
    두 자료형의 칸이 한 사전에서 섞여, 어느 글이 어느 약속으로 들어온 것인지 알 수 없게 된다.
    봉투를 씌우면 「카드에 담길 수 있는 것」과 「전체 보내기를 고른 사람만 함께 보내는 것」이
    저장된 글자 위에서도 갈린다.
    """
    now = time.time()
    _sweep(now)
    token = secrets.token_urlsafe(16)
    payload: dict[str, Any] = {"v": ENVELOPE_VERSION, "card": asdict(card)}
    if full is not None:
        payload["full"] = asdict(full)
    _table().put(token, payload, now)
    log.info(
        "share_card_created",
        extra={"share_id": token, "scope": "full" if full is not None else "scripture"},
    )
    return token


def _decode(
    share_id: str, fields: dict[str, Any]
) -> tuple[ShareCardData, ShareFullData | None] | None:
    """적혀 있던 글자로 카드와 전체 본문을 되살린다.

    카드의 칸이 바뀐 뒤에 배포하면 그 전에 저장된 줄이 안 맞을 수 있다. 그때 터지면 링크
    하나 때문에 이 자리가 통째로 500 이 된다. 없는 링크로 보고 그 줄만 닫되, 왜 못 읽었는지는
    남긴다. 칸을 추측해 채우지는 않는다. 엉뚱한 글이 박힌 카드는 카톡에서 되돌릴 수 없다.

    봉투가 생기기 전(2026-09-17 이전) 줄은 카드 칸이 그대로 펴져 있다. 그 링크도 30일은
    살아 있어야 해서 옛 모양을 그대로 읽는다.
    """
    try:
        if fields.get("v") == ENVELOPE_VERSION:
            card = ShareCardData(**fields["card"])
            raw_full = fields.get("full")
            full = ShareFullData(**raw_full) if raw_full else None
            return card, full
        return ShareCardData(**fields), None
    except (TypeError, KeyError):
        log.warning(
            "share_card_unreadable",
            extra={
                "event": "share_card_unreadable",
                "share_id": share_id,
                "fields": sorted(fields),
            },
        )
        return None


def get(share_id: str) -> ShareCardData | None:
    """카드만 읽는다. 전체 본문까지 필요하면 `get_full` 을 쓴다."""
    found = get_full(share_id)
    return found[0] if found else None


def get_full(share_id: str) -> tuple[ShareCardData, ShareFullData | None] | None:
    """카드와, 전체 보내기를 고른 링크면 답변 본문까지."""
    _sweep(time.time())
    found = _table().get(share_id)
    return _decode(share_id, found[0]) if found else None


def rendered(share_id: str, kind: str, make: Callable[[ShareCardData], bytes]) -> bytes | None:
    """같은 링크를 여러 번 긁어도 한 번만 그린다. 크롤러가 여러 번 온다."""
    now = time.time()
    _sweep(now)
    found = _table().get(share_id)
    if found is None:
        return None
    fields, created_at = found
    decoded = _decode(share_id, fields)
    if decoded is None:
        return None
    card = decoded[0]
    _, cache = _RENDERED.setdefault(share_id, (created_at, {}))
    if kind not in cache:
        cache[kind] = make(card)
    return cache[kind]
