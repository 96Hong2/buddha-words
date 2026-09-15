"""전역 일일 예산 문.

계획 00 1.3 「비용 방어」가 정한 동작이다. 경고선($10)을 넘으면 premium 을 cheap 으로 내리고
그 사실을 응답에 `routeNote: downgraded_budget` 으로 밝힌다. 차단선($20)을 넘으면 새 고민을
받지 않는다. 임계값은 `core/config.py` 의 `budget_warn_usd` · `budget_block_usd` 다.

여기는 **세는 자리**다. 한 번 부르는 데 얼마가 드는지는 모델을 아는 provider 가 계산해서
`record` 로 넣는다. 스텁은 부르는 모델이 없으니 아무것도 넣지 않는다.

기준은 사용자마다 다른 사용량과 달리 **서비스 하나의 하루**다. 그래서 사용자 시간대를 보지 않고
운영 시간대(서울) 자정으로 끊는다.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

from app.core.config import get_settings
from app.integrations.llm.port import Tier

# 운영 기준 시간대. 사용량(quota)의 사용자 시간대와 다른 값이고, 다른 이유로 다르다
OPERATING_ZONE = ZoneInfo("Asia/Seoul")

BudgetState = Literal["ok", "warn", "blocked"]

# 여기는 DB 가 붙을 자리다. (날짜) 유니크 행 + 누적 컬럼으로 바뀐다.
# 지금은 프로세스 메모리라 서버를 새로 띄우면 비고, 인스턴스가 둘이면 각자 자기 몫만 센다.
# 인스턴스가 늘면 문턱이 인스턴스 수만큼 느슨해진다는 뜻이라, 나눠 쓰기 전에 DB 로 옮겨야 한다.
_SPENT: dict[str, float] = {}


def _today() -> str:
    return datetime.now(tz=OPERATING_ZONE).date().isoformat()


def record(usd: float) -> None:
    """모델 한 번 부른 값을 더한다. 오늘 것만 들고 어제 것은 버린다."""
    if usd <= 0:
        return
    today = _today()
    stale = [day for day in _SPENT if day != today]
    for day in stale:
        del _SPENT[day]
    _SPENT[today] = _SPENT.get(today, 0.0) + usd


def spent_today() -> float:
    return _SPENT.get(_today(), 0.0)


def state() -> BudgetState:
    settings = get_settings()
    spent = spent_today()
    if spent >= settings.budget_block_usd:
        return "blocked"
    if spent >= settings.budget_warn_usd:
        return "warn"
    return "ok"


def blocked() -> bool:
    """새 고민을 받을 수 있나. 이미 시작한 답변의 뒷부분은 이 문을 지나지 않는다."""
    return state() == "blocked"


def effective_tier(requested: Tier) -> tuple[Tier, bool]:
    """실제로 부를 등급과, 요청한 등급에서 내려왔는지.

    내려왔으면 화면에 `routeNote: downgraded_budget` 으로 밝힌다. 조용히 내리지 않는다.
    """
    if requested == "premium" and state() != "ok":
        return "cheap", True
    return requested, False


def snapshot() -> dict[str, object]:
    """기동 로그와 진단용. 금액과 상태만 담는다."""
    settings = get_settings()
    return {
        "spent_usd": round(spent_today(), 4),
        "warn_usd": settings.budget_warn_usd,
        "block_usd": settings.budget_block_usd,
        "state": state(),
    }


def reset_all() -> None:
    """테스트가 격리하려고 부른다."""
    _SPENT.clear()
