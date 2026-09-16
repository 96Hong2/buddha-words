"""공유 카드. 실제로 PNG 를 만들어 보고 확인한다.

목으로 격리하지 않는다. 글꼴·배경 그림·색 토큰 모두 진짜 파일을 읽고, 라우트는 실제로 부른다.
기대값은 개발 계획 M5 산출물 절과 `design/foundations/_tokens.css` 에서 왔다.
실행 출력에서 베끼지 않았다.

가장 중요한 단언은 하나다. **카드에 고민 원문이 들어갈 길이 없다.**
"""

from __future__ import annotations

import io
import time
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.domains.answer import compose
from app.domains.quota import usage
from app.domains.share import card as card_mod
from app.domains.share import fonts, store, tokens
from app.domains.share.card import (
    CARD_SIZE,
    OG_SIZE,
    ShareCardData,
    one_line_gloss,
    render_card,
    render_og,
)
from app.domains.share.text import wrap
from app.main import app

# 라우터 픽스처에 있는 글. 이 문장이 카드 어디에도 남으면 안 된다
DEEP_CONCERN = (
    "회사에서 같이 입사한 동기가 먼저 팀장이 됐어요. 축하한다고 말은 했는데 집에 오는 길에 "
    "계속 마음이 가라앉았어요.\n그 친구가 잘된 게 싫은 건 아닌데, 나만 제자리인 것 같고 "
    "부모님한테도 뭐라고 말해야 할지 모르겠어요.\n이직을 알아봐야 하는지, 아니면 지금 팀에서 "
    "좀 더 버텨야 하는지 결정을 못 하겠어요."
)

SHORT = ShareCardData(
    scripture_text="자기에게 온 것을 가볍게 여기지 말고, 남의 것을 부러워하며 살지 마라.",
    scripture_attribution="법구경 25장 365게",
    gloss_line=(
        "부러워하지 말라는 명령이라기보다, 남을 계속 보고 있으면 "
        "정작 내 것에 마음이 머물지 못한다는 관찰이에요."
    ),
)
# 60자를 훌쩍 넘는 경전. 줄바꿈이 무너지는지 보는 자리다
LONG = ShareCardData(
    scripture_text=(
        "마음은 붙잡기 어렵고 가벼워 제멋대로 내려앉는다. 그 마음을 다스리는 것은 좋은 일이니, "
        "잘 다스려진 마음이 안락을 가져온다. 활 만드는 이가 화살을 곧게 하듯 지혜로운 이는 "
        "자기 마음을 곧게 한다."
    ),
    scripture_attribution="법구경 3장 마음의 장 35~36게",
    gloss_line=(
        "마음이 자꾸 흔들리는 것을 잘못이라고 하지 않고, "
        "원래 그런 것이라고 먼저 인정하는 구절이에요."
    ),
)


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


# ────────────────────────────────────────────────────────────────────────────
# 고민 원문은 카드에 들어갈 수 없다
# ────────────────────────────────────────────────────────────────────────────


def test_card_has_no_field_for_concern_text() -> None:
    """글이 실리는 칸이 셋뿐이다. 네 번째 글칸을 만들면 이 단언이 먼저 깨진다.

    마음 태그와 「오늘의 부처의 말」이 여기서 빠졌다. 원문 문자열은 아니었지만 그 고민을
    읽고 나온 값이라, 카드를 받은 사람이 그 두 줄로 상황을 읽었다(`card.py` 머리말).
    `reviewed` 는 참거짓 깃발이라 어떤 문장도 실어 나르지 못한다.
    """
    assert card_mod.ALLOWED_FIELDS == {
        "scripture_text",
        "scripture_attribution",
        "gloss_line",
        "reviewed",
    }


def test_card_rejects_concern_text_argument() -> None:
    """원문을 끼워 넣으려는 시도는 그릴 기회조차 없이 TypeError 로 막힌다."""
    with pytest.raises(TypeError):
        ShareCardData(  # type: ignore[call-arg]
            scripture_text="마음은 붙잡기 어렵다.",
            scripture_attribution="법구경 3장",
            gloss_line="짧은 풀이예요.",
            concern_text=DEEP_CONCERN,
        )


class _Spy:
    """감싼 것의 속성 읽기를 전부 기록한다. 카드가 무엇을 봤는지 나중에 물어본다."""

    def __init__(self, inner: Any) -> None:
        object.__setattr__(self, "_inner", inner)
        object.__setattr__(self, "seen", [])

    def __getattr__(self, name: str) -> Any:
        object.__getattribute__(self, "seen").append(name)
        return getattr(object.__getattribute__(self, "_inner"), name)


def test_card_never_reads_the_concern_text(client: TestClient, headers: dict[str, str]) -> None:
    """실제 답변 행을 감싸 두고, 카드가 원문 칸을 한 번도 건드리지 않는지 본다."""
    answer_id = _ask_deep(client, headers)
    row = compose.get_pending(answer_id, headers["X-Anon-Key"])
    assert row is not None and row.text, "pending 행에 원문이 실제로 들어 있어야 시험이 성립한다"

    from app.domains.scripture import repo

    scripture = repo.by_id(row.scripture_ids[0])
    assert scripture is not None

    spy = _Spy(row)
    data = store.card_from_row(spy, scripture)  # type: ignore[arg-type]

    assert "text" not in spy.seen, f"카드가 원문 칸을 읽었어요: {spy.seen}"
    assert set(spy.seen) <= set(store.ROW_FIELDS_READ)

    # 카드에 실린 세 조각 어디에도 원문 조각이 없다
    for piece in (
        data.scripture_text,
        data.scripture_attribution,
        data.gloss_line,
    ):
        for window in _windows(row.text, 6):
            assert window not in piece


def _windows(text: str, size: int) -> list[str]:
    body = "".join(text.split())
    return [body[i : i + size] for i in range(0, max(1, len(body) - size), size)]


# ────────────────────────────────────────────────────────────────────────────
# 실제로 그린다
# ────────────────────────────────────────────────────────────────────────────


def test_fonts_have_hangul() -> None:
    """글꼴이 없거나 한글이 빠진 판이면 여기서 터진다. 두부로 그려진 카드를 내보내지 않는다."""
    fonts.verify()


@pytest.mark.parametrize("data", [SHORT, LONG], ids=["short", "long"])
def test_card_png_is_the_planned_size(data: ShareCardData) -> None:
    image = Image.open(io.BytesIO(render_card(data)))
    assert image.size == CARD_SIZE == (1080, 1620)
    assert image.format == "PNG"


@pytest.mark.parametrize("data", [SHORT, LONG], ids=["short", "long"])
def test_og_png_is_the_planned_size(data: ShareCardData) -> None:
    image = Image.open(io.BytesIO(render_og(data)))
    assert image.size == OG_SIZE == (1200, 600)


@pytest.mark.parametrize("data", [SHORT, LONG], ids=["short", "long"])
def test_body_never_runs_into_the_bottom_block(data: ShareCardData) -> None:
    """짧은 경전이든 긴 경전이든 워드마크·CTA 줄을 밀지 않는다.

    워드마크와 CTA 는 바닥에 못 박혀 있어서, 본문이 넘치면 그 위에 겹쳐 그려진다.
    겹치는지를 픽셀로 보기 어려우니 자리 계산으로 본다.
    """
    body = card_mod._fit_body(data)
    room = (
        CARD_SIZE[1]
        - card_mod._bottom_height()
        - card_mod.GAP_TAIL
        - card_mod.GAP_HERO
        - card_mod.HERO_MIN
    )
    assert body.height <= room


@pytest.mark.parametrize("data", [SHORT, LONG], ids=["short", "long"])
def test_lines_stay_inside_the_card(data: ShareCardData) -> None:
    """어느 줄도 좌우 여백을 넘지 않는다. 넘으면 글자가 카드 밖으로 잘린다."""
    body = card_mod._fit_body(data)
    inner = CARD_SIZE[0] - 2 * card_mod.PAD_X
    quote_inner = inner - 2 * card_mod.QUOTE_PAD
    for row in body.gloss_rows:
        assert row.width <= inner
    for row in body.qlab_rows + body.script_rows + body.cite_rows:
        assert row.width <= quote_inner


def test_card_is_not_a_blank_sheet() -> None:
    """종이 색만 남은 판이 나오는 것을 막는다. 글자와 그림이 실제로 찍혔는지 본다."""
    image = Image.open(io.BytesIO(render_card(SHORT))).convert("RGB")
    assert len(image.getcolors(maxcolors=200_000) or []) > 1000

    # 본문 글자색이 실제로 찍혀 있다. 글꼴이 안 그려지면 이 색이 한 점도 없다
    ink = tokens.rgb("text")
    pixels = image.load()
    found = any(
        pixels[x, y] == ink
        for y in range(round(card_mod.HERO_MIN), CARD_SIZE[1], 3)
        for x in range(0, CARD_SIZE[0], 3)
    )
    assert found, "본문 글자색이 한 점도 없어요. 글자가 안 그려졌습니다."


def test_wrap_keeps_words_whole() -> None:
    """한글은 어절 단위로 꺾는다. 「부러워하며」가 반으로 갈리면 안 된다."""
    face = fonts.font("serif", 40)
    source = "자기에게 온 것을 가볍게 여기지 말고, 남의 것을 부러워하며 살지 마라."
    rows = wrap(source, face, 400)
    assert len(rows) > 1
    for row in rows:
        assert not row.text.startswith(" ") and not row.text.endswith(" ")
    joined = " ".join(r.text for r in rows)
    assert "부러워하며" in joined


def test_gloss_is_the_first_sentence_capped_at_96() -> None:
    assert one_line_gloss("첫 문장이에요. 둘째 문장은 카드에 안 올라가요.") == "첫 문장이에요."
    long = "가" * 200 + "."
    assert len(one_line_gloss(long)) == 96
    assert one_line_gloss(long).endswith("…")


def test_colors_come_from_the_token_file() -> None:
    """새 색을 만들지 않았다. 값이 정본 CSS 에서 온다."""
    assert tokens.rgb("text") == (0x36, 0x2C, 0x25)
    assert tokens.rgb("surface-scripture") == (0xF2, 0xE3, 0xC4)
    with pytest.raises(KeyError):
        tokens.rgb("no-such-token")


# ────────────────────────────────────────────────────────────────────────────
# 링크 한 바퀴
# ────────────────────────────────────────────────────────────────────────────


def _ask_deep(client: TestClient, headers: dict[str, str]) -> str:
    res = client.post(
        "/concern",
        json={"text": DEEP_CONCERN, "idempotencyKey": uuid.uuid4().hex},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["responseType"] == "answer"
    res = client.post(
        "/concern/pass2",
        json={"answerId": body["answerId"], "idempotencyKey": uuid.uuid4().hex},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    return str(body["answerId"])


def test_share_link_round_trip(client: TestClient, headers: dict[str, str]) -> None:
    answer_id = _ask_deep(client, headers)

    res = client.post("/share", json={"answerId": answer_id}, headers=headers)
    assert res.status_code == 200, res.text
    link = res.json()
    share_id = link["shareId"]
    assert link["cardUrl"] == f"/share/{share_id}/card.png"

    # 링크를 받은 사람은 익명키가 없다. 헤더 없이 열린다
    for url, size in ((link["cardUrl"], CARD_SIZE), (link["ogUrl"], OG_SIZE)):
        got = client.get(url)
        assert got.status_code == 200, got.text
        assert got.headers["content-type"] == "image/png"
        assert Image.open(io.BytesIO(got.content)).size == size


def test_share_link_of_someone_else_is_not_found(
    client: TestClient, headers: dict[str, str]
) -> None:
    answer_id = _ask_deep(client, headers)
    other = {"X-Anon-Key": f"anon-{uuid.uuid4().hex}", "X-Timezone": "Asia/Seoul"}
    res = client.post("/share", json={"answerId": answer_id}, headers=other)
    assert res.status_code == 404


def test_unknown_share_id_is_not_found(client: TestClient) -> None:
    assert client.get("/share/nope/card.png").status_code == 404
    assert client.get(f"/share/{'a' * 22}/card.png").status_code == 404


def test_card_is_drawn_once_per_link(client: TestClient, headers: dict[str, str]) -> None:
    """크롤러가 여러 번 긁는다. 그때마다 다시 그리면 서버가 놀란다."""
    answer_id = _ask_deep(client, headers)
    share_id = client.post("/share", json={"answerId": answer_id}, headers=headers).json()[
        "shareId"
    ]

    first_started = time.perf_counter()
    first = client.get(f"/share/{share_id}/card.png")
    first_took = time.perf_counter() - first_started

    second_started = time.perf_counter()
    second = client.get(f"/share/{share_id}/card.png")
    second_took = time.perf_counter() - second_started

    assert first.content == second.content
    assert second_took < first_took


# ────────────────────────────────────────────────────────────────────────────
# 감수 표기. 감수를 통과한 구절에만 감수했다고 적는다
# ────────────────────────────────────────────────────────────────────────────


def test_only_a_reviewed_scripture_gets_the_review_stamp() -> None:
    """초안 구절 카드에는 「감수」라는 도장이 어떤 모양으로도 남지 않는다."""
    for note in (card_mod.ai_note(True), card_mod.og_note(True)):
        assert "사람이 감수했어요" in note
    for note in (card_mod.ai_note(False), card_mod.og_note(False)):
        assert "감수했" not in note, f"초안 구절에 감수 도장이 찍혔어요: {note}"
        assert note.startswith(card_mod.DRAFT_HEAD)


def test_the_draft_wording_is_the_one_the_scripture_repo_uses() -> None:
    """제품 안에서 기준이 갈리지 않게, 저장소가 쓰는 말을 그대로 쓴다."""
    from app.domains.scripture import repo

    assert repo._REVIEW_PENDING.startswith(card_mod.DRAFT_HEAD)


def _card_for(scripture: Any) -> ShareCardData:
    return ShareCardData(
        scripture_text=scripture.text,
        scripture_attribution=scripture.display_attribution,
        gloss_line="한 줄 풀이예요.",
    )


def test_review_status_comes_from_the_seed_when_nobody_says() -> None:
    """감수 여부를 안 넘겨 준 카드는 시드에서 그 구절을 찾아 상태를 읽는다.

    v2 전수 감수 뒤 시드에는 미감수 구절이 없다. 그래서 반대쪽은 **찾아보는 목록 자체를
    비워** 잰다. 도장이 카드가 아니라 시드 조회에서 나온다는 것을 그대로 보여 준다.
    """
    from app.domains.scripture import repo

    approved = next(s for s in repo.load_seed() if s.reviewed)
    card = _card_for(approved)
    assert card_mod.is_reviewed(card) is True

    real = card_mod._approved_texts
    card_mod._approved_texts = frozenset  # type: ignore[assignment]
    try:
        assert card_mod.is_reviewed(card) is False
    finally:
        card_mod._approved_texts = real  # type: ignore[assignment]


def test_an_unknown_scripture_does_not_get_the_stamp() -> None:
    """시드에 없는 문장에는 감수했다고 적지 않는다. 증거가 없을 때 도장을 찍는 쪽이 사고다."""
    assert card_mod.is_reviewed(SHORT) is False


@pytest.mark.parametrize("mode", ["draft", "approved"], ids=["draft", "approved"])
def test_the_real_share_card_follows_the_seed(
    client: TestClient, headers: dict[str, str], switch_pool: Any, mode: str
) -> None:
    """실제 답변에서 만든 카드가 그 구절의 감수 상태를 그대로 따라간다."""
    switch_pool(mode)
    answer_id = _ask_deep(client, headers)
    row = compose.get_pending(answer_id, headers["X-Anon-Key"])
    assert row is not None

    from app.domains.scripture import repo

    scripture = repo.by_id(row.scripture_ids[0])
    assert scripture is not None
    if mode == "draft":
        # v1 때는 초안 풀에서 미감수 구절이 떨어졌다. v2 전수 감수 뒤에는 두 풀이 같아서
        # 어느 쪽을 골라도 감수 통과분이 온다. 초안 풀 스위치 자체는 그대로 살아 있다
        assert scripture.reviewed

    data = store.card_from_row(row, scripture)
    assert card_mod.is_reviewed(data) is scripture.reviewed
    note = card_mod.ai_note(card_mod.is_reviewed(data))
    assert ("사람이 감수했어요" in note) is scripture.reviewed


def test_the_note_fits_the_card_without_wrapping() -> None:
    """소표기는 한 줄로 그린다. 꺾이지 않으니 폭을 넘으면 카드 밖으로 나간다."""
    face = fonts.font("sans_semibold", card_mod.AI_FS)
    inner = CARD_SIZE[0] - 2 * card_mod.PAD_X
    for reviewed in (True, False):
        width = face.getlength(card_mod.ai_note(reviewed))
        assert width <= inner, f"소표기가 카드 폭을 넘었어요: {width:.0f} > {inner:.0f}"


def test_the_review_status_actually_reaches_the_pixels() -> None:
    """같은 구절이라도 감수 여부가 다르면 다른 그림이 나온다. 배선이 끊기면 같아진다."""
    stamped = ShareCardData(
        scripture_text=SHORT.scripture_text,
        scripture_attribution=SHORT.scripture_attribution,
        gloss_line=SHORT.gloss_line,
        reviewed=True,
    )
    draft = ShareCardData(
        scripture_text=SHORT.scripture_text,
        scripture_attribution=SHORT.scripture_attribution,
        gloss_line=SHORT.gloss_line,
        reviewed=False,
    )
    assert render_card(stamped) != render_card(draft)
    assert render_og(stamped) != render_og(draft)


def test_the_og_preview_draws_the_draft_wording() -> None:
    """미리보기에 실제로 실리는 줄을 본다. 상수를 그대로 그리면 여기서 걸린다."""
    left = card_mod.OG_ART + card_mod.OG_PAD - 40
    inner = OG_SIZE[0] - left - card_mod.OG_PAD
    brand_top = OG_SIZE[1] - card_mod.OG_PAD - card_mod.OG_BRAND_BOX

    body = card_mod._og_body(SHORT, inner, brand_top - card_mod.OG_BRAND_GAP - _og_top())
    drawn = " ".join(row.text for row in body.note_rows)
    assert drawn == card_mod.og_note(False)


# ────────────────────────────────────────────────────────────────────────────
# 두부(네모) 금지. 글꼴에 없는 글자는 카드에 실리지 않는다
# ────────────────────────────────────────────────────────────────────────────

# 두 글꼴 다 한자를 담고 있지 않다. 감수를 통과한 대승·선 구절이 한문 병기를 달고 들어오면
# 카드가 통째로 네모가 된다. 그 사고는 링크가 카톡에 퍼진 뒤에야 드러난다
HANJA = ShareCardData(
    scripture_text="응무소주이생기심(應無所住而生其心)이라 하였다.",
    scripture_attribution="금강반야바라밀경 제십 장엄정토분",
    gloss_line="어디에도 붙들어 매지 않은 채 마음을 내라는 뜻입니다.",
)


def test_missing_finds_only_the_glyphs_that_are_absent() -> None:
    assert fonts.missing("serif", "온 세계가 한 송이 꽃이다.") == ""
    assert fonts.missing("serif", "應無") == "應無"
    # 같은 글자가 여러 번 나와도 한 번만 센다
    assert fonts.missing("serif", "應應應") == "應"


def test_card_with_hanja_is_refused_instead_of_drawing_squares() -> None:
    with pytest.raises(card_mod.UnrenderableTextError) as caught:
        render_card(HANJA)
    message = str(caught.value)
    # 어느 글꼴에서 몇 자가 빠졌는지와 코드포인트만 남긴다. 글자 자체는 담지 않는다
    assert "U+61C9" in message
    assert "應" not in message
    with pytest.raises(card_mod.UnrenderableTextError):
        render_og(HANJA)


def test_share_endpoint_refuses_a_card_it_cannot_draw(
    client: TestClient, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """링크를 만들기 전에 막는다. 그려 놓고 나서 알면 이미 늦다."""
    answer_id = _ask_deep(client, headers)
    # 라우트는 패키지 이름(app.domains.share)을 통해 부른다. 그 자리를 바꿔야 한다
    monkeypatch.setattr("app.domains.share.card_from_row", lambda row, scripture: HANJA)
    res = client.post("/share", json={"answerId": answer_id}, headers=headers)
    assert res.status_code == 409, res.text


def test_every_seeded_scripture_can_actually_be_drawn() -> None:
    """감수 게이트. 카드에 못 그리는 글자를 단 구절이 시드에 들어오면 여기가 먼저 빨간불이 된다."""
    from app.domains.scripture import repo

    broken: list[str] = []
    for scripture in repo.load_seed():
        # 카드가 실제로 그리는 두 줄이다. 아래 줄은 출처가 아니라 귀속이다
        gone = fonts.missing("serif", scripture.text) + fonts.missing(
            "sans_semibold", scripture.display_attribution
        )
        if gone:
            points = " ".join(f"U+{ord(c):04X}" for c in dict.fromkeys(gone))
            broken.append(f"{scripture.id} {points}")
    assert not broken, "글꼴에 없는 글자를 단 구절이 있어요: " + " · ".join(broken[:10])


# ────────────────────────────────────────────────────────────────────────────
# OG 1200×600. 미리보기는 잘려 보이는 자리라 넘침이 더 크게 드러난다
# ────────────────────────────────────────────────────────────────────────────

# 경전은 시드 최장이 199자다(법화경 신해품). 감수 중 더 길어질 수 있어 260자까지 태워 본다.
# 귀속은 시드 최장이 57자인데 역시 더 길어질 수 있어 101자까지 태워 본다
OG_EDGE = (
    SHORT,
    LONG,
    ShareCardData(
        scripture_text="누구나 자주 돌아보아야 할 것이 다섯 있다.",
        scripture_attribution=(
            "앙굿따라 니까야 다섯의 모음 57경 자주 돌아보아야 할 것, 젊음과 건강과 삶에 취함이 "
            "옅어지는 뒷대목, 그리고 같은 경의 앞부분에서 다섯 가지를 차례로 세는 단락까지 "
            "함께 옮긴 것"
        ),
        gloss_line="지금을 소홀히 하지 말라는 뜻이에요.",
    ),
    ShareCardData(
        scripture_text=(
            "그때 가난한 아들은 품팔이를 전전하다 아버지의 집에 이르러 문 곁에 섰다. 멀리 "
            "아버지가 큰 위세를 지닌 것을 보고 두려워하며 급히 달아났다. 부유한 장자는 아들을 "
            "보자 곧 알아보았으나, 아들이 두려움에 쓰러지자 사람들에게 이 사람을 억지로 "
            "데려오지 말라고 했다. 아버지는 아들이 스스로 돌아올 때를 기다렸다."
        ),
        scripture_attribution="— 부처의 제자들, 법화경 신해품 제4",
        gloss_line="지금 이 자리에서 할 수 있는 것만 보라는 말입니다.",
    ),
)
OG_EDGE_IDS = ["short", "long", "short-verse-long-attribution", "longest-verse"]


@pytest.mark.parametrize("data", OG_EDGE, ids=OG_EDGE_IDS)
def test_og_text_stops_above_the_wordmark(data: ShareCardData) -> None:
    """워드마크와 CTA 는 바닥에 못 박혀 있다. 글이 그 위로 내려오면 겹쳐 그려진다."""
    left = card_mod.OG_ART + card_mod.OG_PAD - 40
    inner = OG_SIZE[0] - left - card_mod.OG_PAD
    top = _og_top()
    brand_top = OG_SIZE[1] - card_mod.OG_PAD - card_mod.OG_BRAND_BOX

    body = card_mod._og_body(data, inner, brand_top - card_mod.OG_BRAND_GAP - top)
    cite_font = fonts.font("sans_semibold", card_mod.OG_CITE_FS)
    note_font = fonts.font("sans_semibold", card_mod.OG_NOTE_FS)
    used = (
        card_mod.block_height(len(body.verse_rows), body.verse_font, card_mod.OG_LINE_LH)
        + card_mod.OG_CITE_GAP
        + card_mod.block_height(len(body.cite_rows), cite_font, card_mod.OG_CITE_LH)
        + card_mod.OG_NOTE_GAP
        + card_mod.block_height(len(body.note_rows), note_font, card_mod.OG_NOTE_LH)
    )
    assert top + used <= brand_top, "미리보기 글이 워드마크 자리를 침범했어요."


@pytest.mark.parametrize("data", OG_EDGE, ids=OG_EDGE_IDS)
def test_og_lines_stay_inside_the_right_margin(data: ShareCardData) -> None:
    """출처가 길면 오른쪽으로 흘러 잘린다. 꺾이는지 본다."""
    left = card_mod.OG_ART + card_mod.OG_PAD - 40
    inner = OG_SIZE[0] - left - card_mod.OG_PAD
    brand_top = OG_SIZE[1] - card_mod.OG_PAD - card_mod.OG_BRAND_BOX
    body = card_mod._og_body(data, inner, brand_top - card_mod.OG_BRAND_GAP - card_mod.OG_PAD)
    for row in body.verse_rows + body.cite_rows + body.note_rows:
        assert row.width <= inner, f"오른쪽 여백을 넘었어요: {row.width:.0f} > {inner:.0f}"


@pytest.mark.parametrize("data", OG_EDGE, ids=OG_EDGE_IDS)
def test_og_png_is_the_planned_size_on_edges(data: ShareCardData) -> None:
    assert Image.open(io.BytesIO(render_og(data))).size == OG_SIZE == (1200, 600)


@pytest.mark.parametrize("data", OG_EDGE, ids=OG_EDGE_IDS)
def test_card_png_is_the_planned_size_on_edges(data: ShareCardData) -> None:
    assert Image.open(io.BytesIO(render_card(data))).size == CARD_SIZE == (1080, 1620)


def _og_top() -> float:
    """OG 에서 글이 시작하는 높이. 「경전 원문」 머리가 먼저 선다."""
    qlab = fonts.font("sans_bold", card_mod.OG_QLAB_FS)
    return (
        float(card_mod.OG_PAD)
        + card_mod.line_height(qlab, card_mod.OG_QLAB_LH)
        + card_mod.OG_QLAB_GAP
    )


@pytest.mark.parametrize("data", OG_EDGE, ids=OG_EDGE_IDS)
def test_og_keeps_the_whole_scripture(data: ShareCardData) -> None:
    """감수 원문은 미리보기에서도 자르지 않는다. 자리가 모자라면 글자 크기를 낮춰 담는다.

    겹침 검사만으로는 모자란다. 넘치는 줄을 잘라 내도 겹침은 사라지기 때문이다.
    `_clamp_rows` 는 겹침을 막는 마지막 안전판으로 남겨 두고, 실제로 그 자리까지 가는
    구절이 있는지는 여기서 잰다. 시드가 길어져 여기가 빨간불이 되면 그때 판을 다시 짠다.
    """
    left = card_mod.OG_ART + card_mod.OG_PAD - 40
    inner = OG_SIZE[0] - left - card_mod.OG_PAD
    brand_top = OG_SIZE[1] - card_mod.OG_PAD - card_mod.OG_BRAND_BOX

    body = card_mod._og_body(data, inner, brand_top - card_mod.OG_BRAND_GAP - _og_top())
    drawn = "".join(row.text for row in body.verse_rows).replace(" ", "")
    assert "…" not in drawn, "경전이 말줄임으로 잘렸어요."
    assert drawn == data.scripture_text.replace(" ", "").replace("\n", "")


def test_every_approved_scripture_fits_the_og_preview() -> None:
    """감수를 통과한 구절 전부가 미리보기에서 잘리지 않는지 실제 시드로 잰다."""
    from app.domains.scripture import repo

    left = card_mod.OG_ART + card_mod.OG_PAD - 40
    inner = OG_SIZE[0] - left - card_mod.OG_PAD
    brand_top = OG_SIZE[1] - card_mod.OG_PAD - card_mod.OG_BRAND_BOX

    cut: list[str] = []
    for scripture in repo.load_seed():
        if not scripture.reviewed:
            continue
        data = ShareCardData(
            scripture_text=scripture.text,
            scripture_attribution=scripture.display_attribution,
            gloss_line="한 줄 풀이예요.",
        )
        body = card_mod._og_body(data, inner, brand_top - card_mod.OG_BRAND_GAP - _og_top())
        if any("…" in row.text for row in body.verse_rows):
            cut.append(scripture.id)
    assert not cut, "미리보기에서 잘리는 구절이 있어요: " + " · ".join(cut)
