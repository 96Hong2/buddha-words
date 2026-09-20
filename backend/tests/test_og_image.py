"""링크 미리보기 그림을 백엔드가 준다.

전에는 이 그림이 미니앱 번들 안에 있었다. 번들은 앱을 켤 때 통째로 내려받는 zip 이라,
화면이 한 번도 쓰지 않는 402KB 짜리 PNG 가 최초 접속 시간에 그대로 얹혔다. 미니앱
최초 접속이 20초를 넘어 심사에서 반려된 원인 중 가장 큰 덩어리였다.

게다가 그때 og:image 가 가리키던 번들 주소(`*.apps.tossmini.com`)는 토스 밖에서 400 이라
크롤러가 애초에 못 읽었다. 여기로 옮겨 번들도 가벼워지고 미리보기도 실제로 열린다.
"""

from __future__ import annotations

import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app

# 카톡·트위터가 큰 카드로 펼치는 비율. index.html 의 og:image:width/height 와 같은 값이다
OG_SIZE = (1200, 630)


def test_og_image_is_served_and_opens() -> None:
    with TestClient(app) as client:
        res = client.get("/og/default.jpg")

    assert res.status_code == 200
    assert res.headers["content-type"] == "image/jpeg"

    image = Image.open(io.BytesIO(res.content))
    assert image.size == OG_SIZE


def test_og_image_is_small_enough_to_preview() -> None:
    """크롤러는 큰 그림을 기다려 주지 않는다. 번들에 있던 402KB 를 그대로 옮기지 않았는지 본다."""
    with TestClient(app) as client:
        res = client.get("/og/default.jpg")

    assert len(res.content) < 120_000, f"미리보기 그림이 {len(res.content) / 1024:.0f}KB 예요"
