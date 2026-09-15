"""공유 링크를 카톡에 붙였을 때 미리보기가 뜨는가.

카톡·트위터 크롤러는 자바스크립트를 돌리지 않는다. 그래서 프론트가 CSR 로 그리는 화면은
그들에게 빈 문서다. 여기서는 **자바스크립트 없이 받은 HTML 원문만** 보고 판정한다.
요청은 실제로 보내고, 그림도 실제로 받아 크기를 잰다. 목으로 격리하지 않는다.

가장 중요한 단언은 카드와 같다. **미리보기 글에 고민 원문도 마음 태그도 들어가지 않는다.**
"""

from __future__ import annotations

import io
import logging
import re
import uuid

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api import routes
from app.api.routes import APP_SCHEME, WEB_CTA
from app.core.config import WEB_ORIGIN_ENV, Settings, _guard, get_settings
from app.domains.answer import compose
from app.domains.quota import usage
from app.domains.share import store
from app.domains.share.card import OG_SIZE, ShareCardData
from app.main import app

# 보낸 사람이 적은 글. 이 문장의 어느 조각도 미리보기에 남으면 안 된다
CONCERN = (
    "회사에서 같이 입사한 동기가 먼저 팀장이 됐어요. 축하한다고 말은 했는데 집에 오는 길에 "
    "계속 마음이 가라앉았어요. 부모님한테도 뭐라고 말해야 할지 모르겠어요."
)

_META = re.compile(
    r"""<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"\s*/>""",
)


def metas(html: str) -> dict[str, str]:
    """받은 HTML 원문에서 메타를 긁는다. 브라우저를 거치지 않는다."""
    return {name: content for name, content in _META.findall(html)}


@pytest.fixture(autouse=True)
def _isolate() -> None:
    usage.reset_all()
    compose.reset_store()
    store.reset_store()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def headers() -> dict[str, str]:
    return {"X-Anon-Key": f"anon-{uuid.uuid4().hex}", "X-Timezone": "Asia/Seoul"}


def _shared(client: TestClient, headers: dict[str, str]) -> tuple[str, dict]:
    """고민 하나를 실제로 돌려 공유 링크를 연다. 돌려주는 것은 토큰과 답변 본문이다."""
    res = client.post(
        "/concern",
        json={"text": CONCERN, "idempotencyKey": uuid.uuid4().hex},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    answer = res.json()
    assert answer["responseType"] == "answer"

    res = client.post(
        "/concern/pass2",
        json={"answerId": answer["answerId"], "idempotencyKey": uuid.uuid4().hex},
        headers=headers,
    )
    assert res.status_code == 200, res.text

    res = client.post("/share", json={"answerId": answer["answerId"]}, headers=headers)
    assert res.status_code == 200, res.text
    return str(res.json()["shareId"]), answer


def test_landing_gives_a_crawler_the_preview_tags(
    client: TestClient, headers: dict[str, str]
) -> None:
    """카톡이 미리보기를 그리는 데 필요한 것이 다 있나."""
    token, _ = _shared(client, headers)

    res = client.get(f"/s/{token}")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("text/html")

    tag = metas(res.text)
    assert tag["og:title"].endswith("부처의 말")
    assert tag["og:type"] == "website"
    assert tag["twitter:card"] == "summary_large_image"
    assert tag["og:url"].endswith(f"/s/{token}")
    # 상대 주소로 두면 크롤러가 그림을 못 찾는다
    assert tag["og:image"] == f"http://testserver/share/{token}/og.png"
    assert tag["og:image:width"] == str(OG_SIZE[0])
    assert tag["og:image:height"] == str(OG_SIZE[1])
    # 미리보기 글이 비어 있으면 카톡은 제목만 그린다
    assert len(tag["og:description"]) > 10
    assert tag["description"] == tag["og:description"]


def test_preview_text_is_the_scripture_and_who_said_it(
    client: TestClient, headers: dict[str, str]
) -> None:
    """미리보기 글은 경전 구절과 귀속까지다. 서버가 카드에 쓴 그 값과 같아야 한다."""
    token, _ = _shared(client, headers)
    card = store.get(token)
    assert card is not None

    described = metas(client.get(f"/s/{token}").text)["og:description"]
    # 긴 구절은 뒤가 잘리므로 앞 20자로 본다. 짧은 귀속은 통째로 들어간다
    assert card.scripture_text[:20] in described
    assert card.scripture_attribution in described


def test_a_long_scripture_still_says_who_said_it(client: TestClient) -> None:
    """긴 구절이 와도 누구의 말인지는 남는다.

    구절과 귀속을 이어 붙인 뒤 길이로 자르면 뒤에 선 귀속이 먼저 없어진다. 초안 후보
    399구절 중 70개가 그렇게 나갔고, 몇 개는 출처 이름 한가운데서 끊겼다.
    아래 구절은 실제 초안에 있는 것이다.
    """
    text = (
        "부처님이 나무 조각에 발을 다쳐 몹시 아팠다. 그러나 마음을 챙겨 흔들리지 않고 견뎠다. "
        "옷을 네 겹으로 접어 깔고 오른쪽으로 누웠다. 그때 마라가 다가와 말했다. 힘이 없어 "
        "누웠는가. 할 일을 다 못 해 놓고 무슨 잠인가. 부처님이 답했다. 힘이 없어 누운 것이 "
        "아니다. 가슴에 화살이 박힌 사람도 잠을 잔다."
    )
    attribution = "상윳따 니까야 4:13 나무 조각 경, 누워 있는 부처님을 마라가 조롱하는 대목"
    token = store.put(
        ShareCardData(
            scripture_text=text,
            scripture_attribution=attribution,
            gloss_line="아픔 가운데서도 마음까지 같이 무너지지는 않아요.",
        )
    )

    described = metas(client.get(f"/s/{token}").text)["og:description"]
    assert described.startswith(text[:20])
    assert described.endswith(attribution)
    assert len(described) <= routes.OG_TEXT_CHARS


def test_preview_never_carries_the_concern_or_the_mood_tags(
    client: TestClient, headers: dict[str, str]
) -> None:
    """공유 카드의 규칙이 미리보기에도 그대로 산다.

    카드에 고민 원문이 안 들어가도 미리보기 글로 새면 같은 사고다. 마음 태그와
    「오늘의 부처의 말」도 그 고민을 읽고 나온 값이라 링크를 받은 사람에게 상황을 비춘다.
    """
    token, answer = _shared(client, headers)
    page = client.get(f"/s/{token}").text

    for sentence in CONCERN.split("."):
        piece = sentence.strip()
        if len(piece) >= 6:
            assert piece not in page

    for tag in answer["emotionTags"]:
        assert tag not in page
    assert answer["modernBuddhaMessage"] not in page
    # 한 줄 풀이도 싣지 않는다. 그림이 진다
    card = store.get(token)
    assert card is not None
    if card.gloss_line:
        assert card.gloss_line not in page


def test_preview_image_is_the_og_card_the_server_drew(
    client: TestClient, headers: dict[str, str]
) -> None:
    """og:image 주소를 그대로 따라가 본다. 200 이 아니면 미리보기는 글만 뜬다."""
    token, _ = _shared(client, headers)
    address = metas(client.get(f"/s/{token}").text)["og:image"]

    got = client.get(address.replace("http://testserver", ""))
    assert got.status_code == 200, got.text
    assert got.headers["content-type"] == "image/png"
    assert Image.open(io.BytesIO(got.content)).size == OG_SIZE


def test_person_who_opens_it_sees_the_card_and_a_way_in(
    client: TestClient, headers: dict[str, str]
) -> None:
    """사람이 열면 막다른 곳이 아니라 카드 한 장과 들어올 길을 본다."""
    token, _ = _shared(client, headers)
    page = client.get(f"/s/{token}").text

    assert f'src="/share/{token}/card.png"' in page
    assert f'href="{APP_SCHEME}/s/{token}"' in page
    assert "보낸 사람의 고민 내용은 담기지 않아요" in page


def test_dead_link_says_so_and_still_offers_a_way_in(client: TestClient) -> None:
    """없는 링크는 404 다. 토큰이 난수라 「없다」는 말로 새는 것이 없다.

    그래도 사람이 열었을 때 빈 화면을 주지 않는다. 미리보기 그림은 걸지 않는다.
    없어진 링크에 카드가 뜨면 아직 살아 있는 것처럼 보인다.
    """
    res = client.get(f"/s/{'a' * 22}")
    assert res.status_code == 404
    assert res.headers["content-type"].startswith("text/html")
    assert res.headers["cache-control"] == "no-store"
    assert "og:image" not in res.text
    assert "이 말씀은 더 볼 수 없어요" in res.text
    assert f'href="{APP_SCHEME}"' in res.text


def test_token_of_the_wrong_shape_is_not_found(client: TestClient) -> None:
    assert client.get("/s/nope").status_code == 404
    assert client.get("/s/" + "a" * 200).status_code == 404


def test_preview_address_keeps_https_behind_a_proxy(
    client: TestClient, headers: dict[str, str]
) -> None:
    """운영은 프록시 뒤에 선다. 그림 주소가 http 로 나가면 카톡이 그림을 버린다."""
    token, _ = _shared(client, headers)

    res = client.get(
        f"/s/{token}",
        headers={"X-Forwarded-Proto": "https", "X-Forwarded-Host": "api.example.com"},
    )
    tag = metas(res.text)
    assert tag["og:image"] == f"https://api.example.com/share/{token}/og.png"
    assert tag["og:url"] == f"https://api.example.com/s/{token}"


# ────────────────────────────────────────────────────────────────────────────
# 링크를 받은 사람이 어디에 서는가
#
# 서버가 내려주는 이 문서에는 입력창이 없다. 사람이 여기 머물면 계획이 요구하는
# 「링크 → 전송 2탭」이 안 나온다. 그래서 크롤러에게는 메타를 주고 사람은 SPA 로 넘긴다.
# ────────────────────────────────────────────────────────────────────────────

# 테스트가 쓰는 SPA 주소. 실제 값은 배포마다 다르고 서버는 환경변수로 받는다
WEB = "https://app.example.com"

# 카톡이 미리보기를 긁을 때 쓰는 이름
KAKAO_CRAWLER = "facebookexternalhit/1.1;kakaotalk-scrap/1.0;+https://devtalk.kakao.com"
# 사람이 카톡 안에서 링크를 눌렀을 때. UA 에 KAKAOTALK 이 그냥 들어 있어 크롤러와 헷갈리기 쉽다
KAKAO_INAPP = (
    "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.4.5"
)


@pytest.fixture(autouse=True)
def _spa_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    """SPA 주소를 못 박는다. 안 박으면 기계마다 다른 `.env` 값에 단언이 묶인다."""
    monkeypatch.setattr(get_settings(), "web_origin", WEB)


def test_share_response_hands_back_the_link_to_paste(
    client: TestClient, headers: dict[str, str]
) -> None:
    """응답이 붙여 넣을 주소를 그대로 준다. 화면이 조립하면 배포마다 어긋난다."""
    _, answer = _shared(client, headers)

    link = client.post("/share", json={"answerId": answer["answerId"]}, headers=headers).json()
    assert link["landingUrl"] == f"http://testserver/s/{link['shareId']}"

    # 프록시 뒤에서도 바깥에서 보이는 주소로 나간다
    link = client.post(
        "/share",
        json={"answerId": answer["answerId"]},
        headers={**headers, "X-Forwarded-Proto": "https", "X-Forwarded-Host": "api.example.com"},
    ).json()
    assert link["landingUrl"] == f"https://api.example.com/s/{link['shareId']}"


def test_person_is_handed_over_to_the_app_landing(
    client: TestClient, headers: dict[str, str]
) -> None:
    """사람이 열면 입력창이 있는 SPA 랜딩으로 넘어간다. 토큰 자리는 그대로다."""
    token, _ = _shared(client, headers)
    page = client.get(f"/s/{token}", headers={"User-Agent": KAKAO_INAPP}).text

    assert f'location.replace("{WEB}/s/{token}")' in page
    # 스크립트가 안 도는 사람도 갈 데가 있다. 딥링크만 두면 PC 와 토스 미설치가 막힌다
    assert f'href="{WEB}/s/{token}"' in page
    assert WEB_CTA in page


def test_the_landing_says_it_differs_by_who_asked(
    client: TestClient, headers: dict[str, str]
) -> None:
    """같은 주소인데 크롤러와 사람에게 다른 문서가 나간다. 캐시가 둘을 섞으면 안 된다."""
    token, _ = _shared(client, headers)
    res = client.get(f"/s/{token}", headers={"User-Agent": KAKAO_INAPP})

    assert res.headers["cache-control"].startswith("public")
    assert res.headers.get("vary") == "User-Agent"


def test_crawler_reads_the_preview_and_is_not_handed_over(
    client: TestClient, headers: dict[str, str]
) -> None:
    """크롤러를 넘기면 미리보기를 빈 SPA 문서에서 긁는다. 메타가 통째로 사라진다."""
    token, _ = _shared(client, headers)
    res = client.get(f"/s/{token}", headers={"User-Agent": KAKAO_CRAWLER})

    assert "location.replace" not in res.text
    tag = metas(res.text)
    assert tag["og:image"] == f"http://testserver/share/{token}/og.png"
    assert len(tag["og:description"]) > 10


def test_handover_address_carries_only_the_token(
    client: TestClient, headers: dict[str, str]
) -> None:
    """넘기는 주소에 실리는 것은 토큰뿐이다. 마음 태그도 한마디도 붙지 않는다."""
    token, answer = _shared(client, headers)
    page = client.get(f"/s/{token}", headers={"User-Agent": KAKAO_INAPP}).text

    handover = re.search(r'location\.replace\("([^"]+)"\)', page)
    assert handover is not None
    assert handover.group(1) == f"{WEB}/s/{token}"


def test_dead_link_is_not_a_dead_end_either(client: TestClient) -> None:
    """만료된 링크도 마찬가지다. SPA 가 만료 화면과 「나도 이야기해보기」를 그린다."""
    token = "a" * 22
    res = client.get(f"/s/{token}", headers={"User-Agent": KAKAO_INAPP})

    assert res.status_code == 404
    assert f'location.replace("{WEB}/s/{token}")' in res.text
    assert f'href="{WEB}/s/{token}"' in res.text


def test_it_never_hands_over_to_itself(
    client: TestClient, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """SPA 주소를 이 서버로 잘못 적으면 넘김이 무한히 돈다. 그때는 넘기지 않는다."""
    monkeypatch.setattr(get_settings(), "web_origin", "http://testserver")

    token, _ = _shared(client, headers)
    page = client.get(f"/s/{token}", headers={"User-Agent": KAKAO_INAPP}).text

    assert "location.replace" not in page
    assert f'href="{APP_SCHEME}/s/{token}"' in page


@pytest.mark.parametrize(
    "same_place",
    [
        # 호스트에 대문자가 섞였다. 브라우저는 소문자로 고쳐 다시 오므로 영영 안 맞는다
        "http://TESTSERVER",
        # 프록시가 X-Forwarded-Proto 를 안 보내는 배포. 이쪽은 http 로 보이는데 설정은 https 다
        "https://testserver",
        # 기본 포트를 적었다. 사람 눈에는 같은 주소다
        "http://testserver:80",
        # 끝에 슬래시. `_web_origin` 이 떼지만 떼지 못했을 때도 가드가 물어야 한다
        "http://testserver/",
    ],
)
def test_the_self_handover_guard_survives_a_differently_spelled_address(
    client: TestClient, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch, same_place: str
) -> None:
    """같은 자리를 다른 글자로 적어도 넘기지 않는다.

    글자 그대로 비교하면 대소문자 하나에 가드가 샌다. 그러면 문서가 자기 자신을 다시 열고
    그 문서가 또 같은 줄을 돌린다. 실제 브라우저에서 6초에 3904번 돌았다. 아무 말도 없다.
    """
    monkeypatch.setattr(get_settings(), "web_origin", same_place)

    token, _ = _shared(client, headers)
    page = client.get(f"/s/{token}", headers={"User-Agent": KAKAO_INAPP}).text

    assert "location.replace" not in page
    assert f'href="{APP_SCHEME}/s/{token}"' in page


def test_a_web_origin_under_its_own_host_still_hands_over(
    client: TestClient, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """같은 호스트라도 경로가 다르면 다른 자리다. 여기까지 막으면 한 도메인 배포가 죽는다."""
    monkeypatch.setattr(get_settings(), "web_origin", "http://testserver/app")

    token, _ = _shared(client, headers)
    page = client.get(f"/s/{token}", headers={"User-Agent": KAKAO_INAPP}).text

    assert f'location.replace("http://testserver/app/s/{token}")' in page


def test_without_a_configured_spa_it_stays_put(
    client: TestClient, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """주소를 모르면 지어내지 않는다. 카드 한 장과 딥링크가 있는 지금 문서에 머문다.

    **CORS 목록을 그대로 둔 채로 잰다.** 예전에는 값이 없으면 그 목록의 첫 https 주소로
    떨어졌고, 그 값이 토스 미니앱 WebView 주소였다. 카톡에서 링크를 누른 사람이 그리로
    말없이 넘어가면 백엔드 랜딩의 웹 버튼도 딥링크도 보지 못한다.
    """
    monkeypatch.setattr(get_settings(), "web_origin", None)

    # 이 단언이 깨지면 아래 검사가 아무것도 막지 않는다. 그때는 이 목록부터 다시 본다
    miniapp = [o for o in get_settings().cors_origins if o.startswith("https://")]
    assert miniapp, "CORS 목록에 https 주소가 없으면 예전 폴백을 재현하지 못한다"

    token, _ = _shared(client, headers)
    page = client.get(f"/s/{token}", headers={"User-Agent": KAKAO_INAPP}).text

    assert "location.replace" not in page
    for origin in miniapp:
        assert origin not in page
    assert f'href="{APP_SCHEME}/s/{token}"' in page
    assert WEB_CTA not in page


# ────────────────────────────────────────────────────────────────────────────
# 값이 없거나 틀렸을 때 배포한 사람이 알게 되는가
# ────────────────────────────────────────────────────────────────────────────


def _settings(**over: object) -> Settings:
    """기동 가드에 넣을 설정 한 벌. 지금 재려는 칸 말고는 전부 통과하는 값으로 채운다."""
    return Settings(
        environment="local",
        llm_provider="stub",
        llm_api_key=None,
        database_url=None,
        **over,
    )


def test_a_web_origin_that_is_not_an_address_stops_the_start() -> None:
    """주소 꼴이 아니면 뜨지 않는다. 오타는 링크를 누가 눌러 보기 전에는 드러나지 않는다."""
    for wrong in ("app.example.com", "buddha-words.example.com/s", "/s"):
        with pytest.raises(RuntimeError, match=WEB_ORIGIN_ENV):
            _guard(_settings(web_origin=wrong))


def test_a_proper_web_origin_passes_the_start() -> None:
    _guard(_settings(web_origin="https://app.example.com"))
    _guard(_settings(web_origin="http://localhost:5173"))


def test_a_missing_web_origin_is_said_out_loud_at_startup(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """값이 없는 것은 막지 않는다. 대신 기동 로그에 남겨 배포한 사람이 고칠 수 있게 한다."""
    with caplog.at_level(logging.WARNING):
        _guard(_settings(web_origin=None))

    assert "web_origin_missing" in caplog.text
    record = next(r for r in caplog.records if r.getMessage() == "web_origin_missing")
    assert record.levelno == logging.WARNING
    assert record.env == WEB_ORIGIN_ENV  # type: ignore[attr-defined]
