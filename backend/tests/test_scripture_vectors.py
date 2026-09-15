"""구절 벡터 읽기. 진짜 파일을 만들어 읽히고, 어긋난 판을 쓰지 않는지 본다.

씨앗 글자가 그대로면 씨앗 해시도 그대로다. 그래서 모델만 갈아 끼운 판은 해시로 안 잡힌다.
어긋난 좌표계로 매긴 순위는 그럴싸해 보여서 더 위험하다. 조용히 쓰지 않는 것을 여기서 못 박는다.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.domains.scripture import vectors
from app.integrations.embedding import client


@pytest.fixture(autouse=True)
def _clean_cache():
    """앞뒤로 캐시를 비운다. 임시 파일을 읽힌 판이 다음 테스트에 남지 않게."""
    vectors.store.cache_clear()
    vectors._norms.cache_clear()
    yield
    vectors.store.cache_clear()
    vectors._norms.cache_clear()


def _write(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, raw: dict) -> None:
    path = tmp_path / "embeddings.json"
    path.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(vectors, "STORE", path)
    vectors.store.cache_clear()
    vectors._norms.cache_clear()


def _raw(**over: object) -> dict:
    ids = [s.id for s in vectors.load_seed()]
    raw: dict = {
        "model": client.MODEL,
        "dims": client.DIMS,
        "seed_digest": vectors.seed_digest(),
        "vectors": {i: [0.1] * client.DIMS for i in ids},
    }
    raw.update(over)
    return raw


def test_real_store_loads_without_warning(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level("WARNING"):
        loaded = vectors.store()
    assert len(loaded) == len(vectors.load_seed())
    assert caplog.records == []


def test_other_model_is_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _write(tmp_path, monkeypatch, _raw(model="text-embedding-ada-002"))
    assert vectors.store() == {}


def test_other_dims_is_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _write(tmp_path, monkeypatch, _raw(dims=3072))
    assert vectors.store() == {}


def test_truncated_vectors_are_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    raw = _raw()
    raw["vectors"] = {i: v[:512] for i, v in raw["vectors"].items()}
    _write(tmp_path, monkeypatch, raw)
    assert vectors.store() == {}


def test_query_of_other_length_raises() -> None:
    first = next(iter(vectors.store()))
    with pytest.raises(ValueError):
        vectors.similarity([0.1] * 512, first)
