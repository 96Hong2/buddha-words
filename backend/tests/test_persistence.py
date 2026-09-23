"""서버를 새로 띄워도 공유 링크가 살아 있나.

링크 TTL 은 30일인데 저장 자리가 프로세스 메모리라 배포 한 번에 그 전 링크가 전부 죽었다.
카톡에 붙은 링크를 누른 사람에게 깨진 화면이 갔다. 그래서 링크를 저장 자리로 내렸다.

**저장 자리를 둘 다 돈다.** 로컬 기본값은 SQLite 파일이고 배포는 PostgreSQL 이다
(`core/config.py` 의 `database_url`). 둘은 같은 시험을 통과해야 한다. PostgreSQL 쪽은
`TEST_DATABASE_URL` 을 준 자리에서만 돈다. 안 주면 그 갈래가 skip 으로 **보이게** 남는다.
조용히 빠지면 「PostgreSQL 도 봤다」는 착각이 생긴다. 실제 확인은 도커로 띄운 postgres:18 에
`TEST_DATABASE_URL` 을 주고 돌렸다.

답변 행(`domains/answer/compose.py` 의 pending)은 메모리에 그대로 둔다. 이유는 그 파일의
`_PENDING` 머리 주석에 적어 두었다. 요약하면 답변 본문이 그 고민을 되짚어 쓴 글이라,
「적으신 글과 답변을 서버에 남기지 않거든요」와 어긋난다.

목으로 격리하지 않는다. 실제 라우트를 부르고 실제 저장 자리를 연다. 재기동은 적힌 것을
그대로 둔 채 **프로세스가 들고 있던 것을 전부 버려서** 흉내 낸다. 진짜 프로세스 재기동은
서버를 죽였다 다시 띄워 SQLite·PostgreSQL 양쪽에서 따로 확인했다.

가장 중요한 단언은 하나다. **저장 자리에 고민 원문도 답변 본문도 없다.**
"""

from __future__ import annotations

import dataclasses
import json
import os
import sqlite3
import time
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core import persist
from app.core.config import get_settings
from app.domains.answer import compose
from app.domains.quota import usage
from app.domains.share import card as card_mod
from app.domains.share import store
from app.main import app

# 라우터 픽스처에 있는 글. 이 문장의 조각이 저장 자리 어디에도 남으면 안 된다
DEEP_CONCERN = (
    "회사에서 같이 입사한 동기가 먼저 팀장이 됐어요. 축하한다고 말은 했는데 집에 오는 길에 "
    "계속 마음이 가라앉았어요.\n그 친구가 잘된 게 싫은 건 아닌데, 나만 제자리인 것 같고 "
    "부모님한테도 뭐라고 말해야 할지 모르겠어요.\n이직을 알아봐야 하는지, 아니면 지금 팀에서 "
    "좀 더 버텨야 하는지 결정을 못 하겠어요."
)

# 도커로 띄운 PostgreSQL 주소. 예: postgresql://buddha:buddha@127.0.0.1:55432/buddha_words
POSTGRES_URL = os.environ.get("TEST_DATABASE_URL", "")

_BACKENDS = [
    pytest.param(None, id="sqlite"),
    pytest.param(
        POSTGRES_URL,
        id="postgres",
        marks=pytest.mark.skipif(
            not POSTGRES_URL,
            reason="TEST_DATABASE_URL 이 없어요. 도커로 postgres 를 띄우고 주소를 주면 돕니다",
        ),
    ),
]


@pytest.fixture(params=_BACKENDS, autouse=True)
def _isolate(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """저장 자리를 갈아 끼우고 비운 채로 시작한다. 끝나면 되돌린다."""
    if request.param:
        monkeypatch.setenv("DATABASE_URL", request.param)
    else:
        monkeypatch.delenv("DATABASE_URL", raising=False)
    store.close()
    get_settings.cache_clear()

    usage.reset_all()
    compose.reset_store()
    store.reset_store()
    yield
    store.close()
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def headers() -> dict[str, str]:
    return {"X-Anon-Key": f"anon-{uuid.uuid4().hex}", "X-Timezone": "Asia/Seoul"}


def _restart() -> None:
    """서버를 새로 띄운 것과 같은 자리로 만든다. 적힌 것은 두고 프로세스가 들고 있던 것만 버린다.

    **저장 자리 객체까지 버린다**(`store.close`). 그리지 않으면 저장이 프로세스 메모리로
    되돌아가도 아래 단언이 전부 초록으로 남는다. 실제로 그렇게 지나간 적이 있다.
    """
    compose.reset_store()
    store.close()


def _ask(client: TestClient, headers: dict[str, str]) -> str:
    res = client.post(
        "/concern",
        json={"text": DEEP_CONCERN, "idempotencyKey": uuid.uuid4().hex},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["responseType"] == "answer"
    answer_id = str(body["answerId"])
    res = client.post(
        "/concern/pass2",
        json={"answerId": answer_id, "idempotencyKey": uuid.uuid4().hex},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["pass2"]["status"] == "done"
    return answer_id


def _share(
    client: TestClient,
    headers: dict[str, str],
    answer_id: str,
    scope: str = "scripture",
) -> dict[str, str]:
    res = client.post(
        "/share", json={"answerId": answer_id, "scope": scope}, headers=headers
    )
    assert res.status_code == 200, res.text
    return res.json()


# ────────────────────────────────────────────────────────────────────────────
# 저장 자리에 남는 것은 카드 칸뿐이다
# ────────────────────────────────────────────────────────────────────────────


def _saved() -> list[tuple[str, str, str]]:
    """저장 자리에 실제로 적힌 줄 전부. (테이블, 열쇠, 담긴 글).

    저장 자리를 거치지 않고 DB 를 직접 연다. 무엇이 적히나를 보는 시험이라 DB 가 정본이다.
    테이블이 늘어도 함께 훑는다.
    """
    url = get_settings().database_url
    if url:
        import psycopg

        with psycopg.connect(url) as conn:
            names = [
                name
                for (name,) in conn.execute(
                    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
                )
            ]
            return [
                (name, key, value)
                for name in names
                for key, value in conn.execute(f'SELECT "key", "value" FROM {name}')
            ]

    conn = sqlite3.connect(get_settings().state_db_path)
    try:
        names = [
            name for (name,) in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        ]
        return [
            (name, key, value)
            for name in names
            for key, value in conn.execute(f"SELECT key, value FROM {name}")
        ]
    finally:
        conn.close()


def _written() -> str:
    """저장 자리에 적힌 글자 전부를 한 덩이로."""
    return "\n".join(f"{key} {value}" for _, key, value in _saved())


def _rows() -> dict[str, dict]:
    """공유 링크 줄만. 열쇠 → 담긴 칸."""
    return {key: json.loads(value) for name, key, value in _saved() if name == store.TABLE_NAME}


def _windows(text: str, size: int) -> list[str]:
    body = "".join(text.split())
    return [body[i : i + size] for i in range(0, max(1, len(body) - size), size)]


def test_the_saved_rows_hold_no_piece_of_the_concern(
    client: TestClient, headers: dict[str, str]
) -> None:
    """개인정보 안내가 「고민 글은 파일이나 기록으로 남기지 않아요」라고 적어 두었다."""
    answer_id = _ask(client, headers)
    _share(client, headers, answer_id)

    written = _written()
    assert written, "저장 자리가 비어 있으면 시험이 성립하지 않아요."
    for window in _windows(DEEP_CONCERN, 6):
        assert window not in written, f"고민 원문 조각이 저장 자리에 남았어요: {window}"


def test_the_saved_rows_hold_no_answer_body(client: TestClient, headers: dict[str, str]) -> None:
    """답변 본문은 그 고민을 되짚어 쓴 글이라 저장 자리로 내려가면 안 된다.

    이용권 시트가 결제 전에 「적으신 글과 답변을 서버에 남기지 않거든요」라고 고지한다.
    한마디(modernBuddhaMessage)와 2차 패스 본문이 그 약속의 대상이다.

    한 줄 풀이(gloss_line)는 예외다. 해설의 첫 문장이 카드에 실려 30일 남는다. 그래서
    설정의 개인정보 안내가 공유 카드 줄로 그것을 밝힌다. 여기서는 나머지를 본다.
    """
    answer_id = _ask(client, headers)
    row = compose.get_pending(answer_id, headers["X-Anon-Key"])
    assert row is not None and row.pass2 is not None
    _share(client, headers, answer_id)

    written = _written()
    assert row.modern_message, "한마디가 비면 시험이 성립하지 않아요."
    assert row.modern_message not in written
    for field in ("personalAnalysis", "actions", "closingMessage"):
        assert json.dumps(row.pass2[field], ensure_ascii=False) not in written
    assert row.anon_key not in written, "익명키도 저장 자리에 두지 않아요."


def test_the_saved_rows_hold_only_the_card_fields(
    client: TestClient, headers: dict[str, str]
) -> None:
    """경전 구절만 보낸 링크에는 카드 칸 말고 아무것도 적히지 않는다.

    줄은 봉투로 감싸여 있다(`store.put`). 봉투 안 카드 칸이 정확히 같아야 하고, 전체
    보내기를 고르지 않았으면 `full` 자리 자체가 없어야 한다. 있으면 고르지도 않은 사람의
    답변 본문이 30일 저장되고 있다는 뜻이다.
    """
    answer_id = _ask(client, headers)
    link = _share(client, headers, answer_id)

    saved = _rows()[link["shareId"]]
    assert set(saved) == {"v", "card"}
    assert set(saved["card"]) == card_mod.ALLOWED_FIELDS


def test_full_share_saves_the_answer_but_never_the_concern(
    client: TestClient, headers: dict[str, str]
) -> None:
    """전체 보내기는 답변 본문을 담는다. **고민 원문은 그때도 담기지 않는다.**

    이 자리가 개인정보 약속의 새 경계다. 전체 보내기를 고르면 답변 본문이 30일 남고,
    그 사실은 공유 시트와 개인정보 안내가 사람에게 먼저 알린다. 그래도 사람이 적은 문장
    자체는 어디에도 담길 자리가 없다(`ShareFullData` 에 칸이 없다).
    """
    answer_id = _ask(client, headers)
    row = compose.get_pending(answer_id, headers["X-Anon-Key"])
    assert row is not None and row.pass2 is not None
    link = _share(client, headers, answer_id, scope="full")

    saved = _rows()[link["shareId"]]
    assert set(saved) == {"v", "card", "full"}
    assert set(saved["full"]) == card_mod.FULL_ALLOWED_FIELDS
    # 담기로 한 것은 실제로 담겼다. 빈 칸만 저장해 놓고 통과하면 시험이 아무것도 안 지킨다
    assert saved["full"]["closing"] == row.pass2["closingMessage"]

    written = _written()
    for window in _windows(DEEP_CONCERN, 6):
        assert window not in written, f"고민 원문 조각이 저장 자리에 남았어요: {window}"
    assert row.anon_key not in written, "익명키도 저장 자리에 두지 않아요."


def test_rendered_png_is_not_saved(client: TestClient, headers: dict[str, str]) -> None:
    """한 링크가 카드 804KB + OG 411KB 다. 30일치를 담을 것이 못 된다."""
    answer_id = _ask(client, headers)
    link = _share(client, headers, answer_id)
    assert client.get(link["cardUrl"]).status_code == 200
    assert client.get(link["ogUrl"]).status_code == 200

    # 링크 한 줄은 글자 몇 백 자다. PNG 가 끼어들면 자릿수가 달라진다
    assert len(_written()) < 4096


# ────────────────────────────────────────────────────────────────────────────
# 서버를 새로 띄워도 같은 링크가 같은 카드를 준다
# ────────────────────────────────────────────────────────────────────────────


def test_share_link_still_serves_the_card_after_a_restart(
    client: TestClient, headers: dict[str, str]
) -> None:
    answer_id = _ask(client, headers)
    link = _share(client, headers, answer_id)
    before = client.get(link["cardUrl"])
    assert before.status_code == 200

    _restart()

    # 링크를 받은 사람은 익명키가 없다. 헤더 없이 연다
    after = client.get(link["cardUrl"])
    assert after.status_code == 200, after.text
    assert after.headers["content-type"] == "image/png"
    # 같은 링크는 같은 카드를 준다. 재기동으로 그림이 달라지면 안 된다
    assert after.content == before.content
    assert client.get(link["ogUrl"]).status_code == 200


def test_share_card_keeps_its_text_across_a_restart(
    client: TestClient, headers: dict[str, str]
) -> None:
    """그림뿐 아니라 실린 글자도 그대로다. 저장 자리에서 되살린 값으로 그린다."""
    answer_id = _ask(client, headers)
    link = _share(client, headers, answer_id)
    before = store.get(link["shareId"])
    assert before is not None and before.scripture_text

    _restart()

    assert store.get(link["shareId"]) == before


def test_expired_share_link_is_gone_after_a_restart(
    client: TestClient, headers: dict[str, str]
) -> None:
    """TTL 청소가 재기동을 넘어서도 돈다. 만료분이 저장 자리에서 살아 돌아오면 안 된다."""
    answer_id = _ask(client, headers)
    link = _share(client, headers, answer_id)
    share_id = link["shareId"]

    # 30일을 기다릴 수 없으니 만든 시각만 그만큼 뒤로 민다. 줄은 그대로 남아 있다
    card = store.get(share_id)
    assert card is not None
    store._table().put(share_id, dataclasses.asdict(card), time.time() - store.TTL_SECONDS - 60)

    _restart()

    assert client.get(link["cardUrl"]).status_code == 404
    assert store.get(share_id) is None


def test_a_card_whose_fields_no_longer_match_closes_only_that_link(
    client: TestClient, headers: dict[str, str]
) -> None:
    """카드의 칸이 바뀐 뒤 배포하면 그 전 줄이 안 맞는다.

    그 링크만 닫히고 자리는 살아 있어야 한다. 옛 줄 하나 때문에 500 이 되면 안 된다.
    """
    answer_id = _ask(client, headers)
    stale = _share(client, headers, answer_id)
    found = store._table().get(stale["shareId"])
    assert found is not None
    # 봉투가 아니라 **카드 칸**을 어긋나게 한다. 카드를 되살리지 못하는 줄이 그 대상이다
    broken = {**found[0], "card": {**found[0]["card"], "no_such_field": "옛 판이 남긴 칸"}}
    store._table().put(stale["shareId"], broken, found[1])
    fresh = _share(client, headers, answer_id)

    _restart()

    assert client.get(stale["cardUrl"]).status_code == 404
    assert client.get(fresh["cardUrl"]).status_code == 200


# ────────────────────────────────────────────────────────────────────────────
# 저장 자리를 바꿔도 같은 것을 약속한다
# ────────────────────────────────────────────────────────────────────────────


def test_the_backend_under_test_is_the_one_the_settings_point_at() -> None:
    """이 파일이 실제로 두 자리를 돌았는지 여기서 드러난다.

    `DATABASE_URL` 이 있으면 PostgreSQL, 없으면 파일이다. 갈아 끼우기가 안 먹으면 두 갈래가
    같은 자리를 돌면서 둘 다 초록이 된다. 그것을 여기서 막는다.
    """
    url = get_settings().database_url
    table = store._table()
    if url:
        assert isinstance(table, persist.PostgresTable)
        assert url.startswith("postgres")
    else:
        assert isinstance(table, persist.SqliteTable)


# ────────────────────────────────────────────────────────────────────────────
# 답변 행은 저장 자리로 내리지 않았다. 재기동은 여전히 끊는다
# ────────────────────────────────────────────────────────────────────────────


def test_the_answer_row_does_not_survive_a_restart(
    client: TestClient, headers: dict[str, str]
) -> None:
    """지금은 이것이 약속대로다. 답변 본문을 서버에 남기지 않으므로 재기동 뒤에는 없는 것이 맞다.

    살리기로 정하면 이 단언을 먼저 뒤집고, 그 전에 화면 문구부터 고쳐야 한다.
    """
    answer_id = _ask(client, headers)

    _restart()

    res = client.post(
        "/concern/pass2",
        json={"answerId": answer_id, "idempotencyKey": uuid.uuid4().hex},
        headers=headers,
    )
    assert res.status_code == 404
    assert client.post("/share", json={"answerId": answer_id}, headers=headers).status_code == 404
