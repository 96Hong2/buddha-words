"""검증 실패 응답에 고민 원문이 실리지 않는다.

진짜 앱을 띄워 진짜 요청을 넣고 돌아온 본문을 읽는다. FastAPI 기본 핸들러는
`detail[].input` 에 받은 값을 그대로 싣기 때문에, 5000자 제한을 넘긴 글 하나로
원문 전체가 422 본문에 돌아온 적이 있다. 그 자리를 지킨다.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

CONCERN = "남편이 다른 사람을 만나는 것 같아요. 이혼해야 할까요?"
HEADERS = {"X-Anon-Key": "a" * 32}


@pytest.fixture(name="client")
def _client() -> TestClient:
    return TestClient(create_app(), raise_server_exceptions=False)


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/concern", {"text": CONCERN * 200}),
        ("/concern", {"text": {"속마음": CONCERN}}),
        ("/concern/continue", {"text": CONCERN * 200}),
        ("/concern/pass2", {"answerId": CONCERN * 10}),
        ("/concern/extension", {"answerId": CONCERN * 10}),
    ],
)
def test_validation_error_hides_what_was_sent(client: TestClient, path: str, body: dict) -> None:
    response = client.post(path, json=body, headers=HEADERS)
    assert response.status_code == 422
    assert CONCERN not in response.text
    detail = response.json()["detail"]
    assert detail
    for row in detail:
        assert set(row) == {"type", "loc"}


def test_too_large_body_is_cut_without_echo(client: TestClient) -> None:
    response = client.post("/concern", json={"text": CONCERN * 2000}, headers=HEADERS)
    assert response.status_code == 400
    assert CONCERN not in response.text
