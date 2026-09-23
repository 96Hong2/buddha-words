"""사용량.

**사람마다 첫 NORMAL·DEEP 한 번만 그냥 나간다. 그다음부터는 광고를 본 만큼 이어간다.**
LIGHT 는 하루 10회 소프트 상한이라 막지 않고 표시만 한다.
INVALID·CRISIS·SOLACE 는 세지 않는다.

⚠ **무료는 「하루 한 번」이었다. 2026-09-22 에 「익명키마다 평생 한 번」으로 좁혔다.**
날마다 열리니 광고도 연꽃도 없이 답을 받는 날이 매일 있었다. 그래서 무료 칸만 날짜
바구니 밖에 둔다(`free_once`, 저장 자리에 남아 배포를 넘는다). 나머지(이어가기 수·LIGHT)는
그대로 날짜별이고 아직 프로세스 메모리다.

⚠ **하루 천장이 있었다(이어가기 4회, 합쳐 5회). 2026-09-20 에 없앴다.**
광고를 보는 사람을 막고 있었기 때문이다. 한 편이 벌어 오는 값이 답 한 건 원가보다 크므로
천장은 수익을 깎는 쪽이었고, 사람에게는 「광고를 봤는데도 안 된다」로 읽혔다.
남용은 두 가지로 막는다: 사람마다 **분당 요청 수**(아래 `MAX_PER_MINUTE`)와
**전역 일일 예산 문**(`integrations/llm/budget.py`). 둘 다 천장과 달리 정상 사용자를 안 막는다.

기준 시각은 **사용자 시간대 자정**이다. 서버 시간대가 아니다.
그 시간대는 익명키마다 처음 본 것으로 고정한다. 요청 헤더를 매번 그대로 믿지 않는다.
세는 것은 성공한 생성뿐이라 예약(reserve) 뒤 실패하면 되돌린다(release).

멱등은 「다시 세지 않기」가 아니라 「같은 답 돌려주기」다. 같은 멱등키가 다시 오면 그때 만든
답을 그대로 돌려주고(replay), 아직 만드는 중이면 막는다(in_progress). 세지 않으면서 새로
만들기까지 하면 그 키 하나로 하루 천장이 사라진다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.domains.quota import free_once

# 사람마다 한 번. 이름의 PER_DAY 는 2026-09-22 에 사라졌다
FREE_ONCE = 1
# 하루 천장은 없다. 스키마의 `adContinuesMax` 가 이 값을 그대로 내보내고, null 이 「상한 없음」이다
AD_CONTINUES_MAX: int | None = None
LIGHT_SOFT_CAP = 10

# 사람 한 명이 1분에 보낼 수 있는 생성 요청 수.
#
# 이어가기는 30초 광고를 끝까지 봐야 열리므로 사람은 분당 두 번을 넘기 어렵다. 여유를 둬서
# 재시도·멱등 재전송이 걸리지 않게 하고, 그 위를 넘는 것만 막는다. 광고를 건너뛰는 자동화가
# 노리는 자리라 **천장을 없앤 대신 여기가 선다.**
MAX_PER_MINUTE = 6
DEFAULT_TIMEZONE = "Asia/Seoul"

# 세는 갈래. 나머지(invalid · crisis · solace)는 사용량을 건드리지 않는다
COUNTED_ROUTES = frozenset({"normal", "deep"})

Gate = Literal["free", "ad_continue", "light", "light_soft_cap", "uncounted"]


@dataclass
class Seen:
    """멱등키 하나가 잡은 자리. answer 가 비어 있으면 아직 만드는 중이다."""

    gate: Gate
    answer: dict[str, Any] | None = None


@dataclass
class DayUsage:
    # 무료 한 번은 날짜와 무관해서 여기 없다. `free_once` 가 들고 있다
    ad_continues_used: int = 0
    light_used: int = 0
    # 멱등키 → 그 키가 잡은 자리와 만들어 둔 답
    seen: dict[str, Seen] = field(default_factory=dict)


@dataclass(frozen=True)
class Outcome:
    allowed: bool
    gate: Gate
    quota: dict[str, Any]
    # 같은 멱등키가 이미 만들어 둔 답. 있으면 모델을 부르지 않고 이것을 그대로 돌려준다
    replay: dict[str, Any] | None = None
    # 같은 멱등키가 아직 답을 만드는 중이다. 여기서 또 만들면 천장 밖의 생성이 된다
    in_progress: bool = False


# 여기는 DB 가 붙을 자리다. (anon_key, 사용자 시간대 날짜) 유니크 행 + 멱등키 테이블로 바뀐다.
# 지금은 프로세스 메모리라 서버를 새로 띄우면 비고, 인스턴스가 둘이면 서로 못 본다.
_USAGE: dict[tuple[str, str], DayUsage] = {}

# 익명키 → 하루 칸을 세는 시간대 이름. DB 가 붙으면 users.timezone 컬럼이 이 자리다.
_ZONES: dict[str, str] = {}

# 첫 이야기를 이미 쓴 사람은 `free_once` 가 들고 있다. **날짜 바구니 밖이고 저장 자리에
# 남아 배포를 넘긴다.** 프로세스 메모리였을 때는 배포마다 비어서, 기기 값이 없는 사람에게
# 무료가 다시 열렸다(2026-09-23 실기기 신고).

# 사람마다 최근 1분의 요청 시각. 날짜 칸과 따로 둔다. 자정이 걸쳐도 창이 끊기면 안 된다
_RECENT: dict[str, list[datetime]] = {}


def resolve_zone(name: str | None) -> ZoneInfo:
    """알 수 없는 시간대 이름이면 기본값으로 떨어진다. 400 을 내지 않는다."""
    try:
        return ZoneInfo(name) if name else ZoneInfo(DEFAULT_TIMEZONE)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo(DEFAULT_TIMEZONE)


def _now(zone: ZoneInfo, now: datetime | None = None) -> datetime:
    return (now or datetime.now(tz=zone)).astimezone(zone)


def today_in(zone: ZoneInfo, now: datetime | None = None) -> date:
    return _now(zone, now).date()


def resets_at(zone: ZoneInfo, now: datetime | None = None) -> str:
    """다음 자정. 사용자 시간대 기준이다."""
    tomorrow = today_in(zone, now) + timedelta(days=1)
    return datetime.combine(tomorrow, time.min, tzinfo=zone).isoformat()


def counting_zone(anon_key: str, requested: ZoneInfo) -> ZoneInfo:
    """하루 칸을 세는 시간대. 익명키마다 처음 본 것으로 고정한다.

    요청 헤더를 그대로 날짜 열쇠로 쓰면 시간대만 갈아 끼워 빈 칸을 열 수 있다.
    어느 순간에나 지구상 날짜는 셋이라 한 익명키가 하루 세 칸(15회)을 쓰게 된다.
    """
    pinned = _ZONES.setdefault(anon_key, str(requested))
    return requested if pinned == str(requested) else resolve_zone(pinned)


def _day(anon_key: str, zone: ZoneInfo, now: datetime | None = None) -> DayUsage:
    key = (anon_key, today_in(counting_zone(anon_key, zone), now).isoformat())
    return _USAGE.setdefault(key, DayUsage())


def too_fast(anon_key: str, now: datetime | None = None) -> bool:
    """이 사람이 1분에 보낼 수 있는 수를 넘었나. **넘었으면 그 요청은 세지 않는다.**

    하루 천장을 없앤 자리에 서는 문이다. 사람은 30초 광고를 봐야 이어갈 수 있어 여기 닿지
    않는다. 닿는 것은 광고를 건너뛰고 몰아 보내는 쪽이다.

    되돌아보는 창이 1분이라 자정이 걸쳐도 끊기지 않는다(날짜 칸과 따로 둔 이유다).
    프로세스 메모리에 있으므로 서버가 여럿이면 각자 센다. 그래도 전역 예산 문이 뒤에 있다.
    """
    at = now or datetime.now(tz=UTC)
    window = _RECENT.setdefault(anon_key, [])
    cutoff = at - timedelta(minutes=1)
    window[:] = [t for t in window if t > cutoff]
    if len(window) >= MAX_PER_MINUTE:
        return True
    window.append(at)
    return False


def snapshot(anon_key: str, zone: ZoneInfo, now: datetime | None = None) -> dict[str, Any]:
    """spec/answer.schema.json 의 Quota. camelCase 그대로 낸다.

    resetsAt 도 고정된 시간대로 낸다. 칸과 다른 시간대로 내면 언제 풀리는지가 어긋난다.
    """
    zone = counting_zone(anon_key, zone)
    day = _day(anon_key, zone, now)
    return {
        "freeUsed": FREE_ONCE if free_once.used(anon_key) else 0,
        "adContinuesUsed": day.ad_continues_used,
        "adContinuesMax": AD_CONTINUES_MAX,
        "resetsAt": resets_at(zone, now),
    }


def reserve(
    anon_key: str,
    route: str,
    zone: ZoneInfo,
    idempotency_key: str | None = None,
    now: datetime | None = None,
) -> Outcome:
    """생성 전에 자리를 잡는다. 확인이 아니라 예약이다.

    같은 멱등키로 다시 오면 다시 세지 않는다. 그 대신 만들어 둔 답을 replay 로 돌려주거나,
    아직 만드는 중이면 in_progress 로 막는다. 둘 다 아닌 채로 통과시키면 그 키 하나로 몇 번이든
    새 답을 만들 수 있다.
    """
    day = _day(anon_key, zone, now)

    if route not in COUNTED_ROUTES and route != "light":
        return Outcome(True, "uncounted", snapshot(anon_key, zone, now))

    if idempotency_key and idempotency_key in day.seen:
        seen = day.seen[idempotency_key]
        quota = snapshot(anon_key, zone, now)
        if seen.answer is None:
            return Outcome(False, seen.gate, quota, in_progress=True)
        replay = dict(seen.answer)
        if "quota" in replay:
            # 답은 그때 것 그대로 두고 사용량만 지금 것으로 바꾼다
            replay["quota"] = quota
        return Outcome(True, seen.gate, quota, replay=replay)

    if route == "light":
        # 소프트 상한이다. 넘어도 막지 않고 넘었다는 것만 알린다
        gate = "light_soft_cap" if day.light_used >= LIGHT_SOFT_CAP else "light"
        day.light_used += 1
        allowed = True
    elif not free_once.used(anon_key) and free_once.mark(anon_key):
        # 평생 한 번이다. 날짜 바구니가 아니라 저장 자리에 적어 배포를 넘긴다.
        # **적히지 않으면 안 준다.** 적지 못한 무료는 그 사람에게 매번 다시 열린다
        gate = "free"
        allowed = True
    else:
        # 보상형 광고를 본 뒤에만 열리는 자리다. **횟수 제한이 없다.**
        # 보상 토큰 검증은 광고 연동이 붙을 때 여기 앞에 선다
        day.ad_continues_used += 1
        gate = "ad_continue"
        allowed = True

    if idempotency_key:
        # 답은 아직 없다. 이 키가 또 들어오면 만드는 중으로 막힌다
        day.seen[idempotency_key] = Seen(gate)
    return Outcome(allowed, gate, snapshot(anon_key, zone, now))


def remember(
    anon_key: str,
    idempotency_key: str | None,
    answer: dict[str, Any],
    zone: ZoneInfo,
    now: datetime | None = None,
) -> None:
    """생성이 끝났다. 같은 멱등키가 다시 오면 이 답을 그대로 돌려준다.

    reserve 가 잡아 둔 자리에만 채운다. 자리가 없으면(멱등키를 안 보냈거나 되돌려진 뒤)
    아무것도 하지 않는다.
    """
    if not idempotency_key:
        return
    seen = _day(anon_key, zone, now).seen.get(idempotency_key)
    if seen is not None:
        seen.answer = dict(answer)


def release(
    anon_key: str,
    gate: Gate,
    zone: ZoneInfo,
    idempotency_key: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """생성이 실패했거나 셀 갈래가 아니었다. 잡아 둔 자리를 되돌린다."""
    day = _day(anon_key, zone, now)
    if gate == "free":
        # 생성이 실패했으면 그 한 번은 안 쓴 것이다
        free_once.unmark(anon_key)
    elif gate == "ad_continue" and day.ad_continues_used > 0:
        day.ad_continues_used -= 1
    elif gate in ("light", "light_soft_cap") and day.light_used > 0:
        day.light_used -= 1
    if idempotency_key:
        day.seen.pop(idempotency_key, None)
    return snapshot(anon_key, zone, now)


def reset_all() -> None:
    """테스트가 격리하려고 부른다."""
    _USAGE.clear()
    _ZONES.clear()
    _RECENT.clear()
    free_once.reset_all()
