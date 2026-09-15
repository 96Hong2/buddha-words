"""판정할 후보 풀을 만든다.

사람이 읽고 정답을 고르는 목록이다. 한 가지 방식의 결과만 보고 정답을 정하면 그 방식에
유리한 자가 되므로 세 곳에서 끌어와 합친다.

  · 어휘 상위 10   `repo._score`. 낱말이 겹치는 순서다
  · 벡터 상위 10   미리 계산해 둔 구절 임베딩(data/scriptures/embeddings.json)과의 거리
  · 제품 후보      `compose.candidate_pool`. 어휘+벡터 RRF 에 안전 규칙까지 지난 목록으로,
                   1차 패스 모델이 실제로 읽는 바로 그 20개다

제품 후보를 함께 넣는 이유가 있다. 제품이 화면에 올리는 구절을 판정자가 보지 못하면 그
구절은 판정 자리에 오르지도 못한 채 늘 오답으로 셈된다. 자가 제품을 과소평가하게 된다.
실제로 2026-09-16 에 세 곳을 합쳐 보니 26개 고민에서 699개가 모였고, 그중 227개는 지금
relevance.json 을 판정할 때 쓴 풀(489개)에 없던 구절이었다.

점수식과 후보를 여기서 다시 구현하지 않는다. 저장소 코드를 그대로 부른다.

기본 출력은 tools/eval/pool.json 이고, **그 파일이 이미 있으면 덮어쓰지 않고 멈춘다.**
판정을 마친 풀은 사람이 무엇을 보고 정답을 골랐는지의 기록이라 지우면 다시 만들 수 없다
(정답 자체는 tools/eval/relevance.json 에 따로 있다). 새 풀이 필요하면 다른 경로를 준다.

  uv run --project backend python tools/eval/make_pool.py [출력경로]
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import SCRIPTURE_POOL_ENV, get_settings  # noqa: E402
from app.domains.answer import compose  # noqa: E402
from app.domains.routing import rules  # noqa: E402
from app.domains.scripture import repo, safety  # noqa: E402
from app.integrations.embedding import client  # noqa: E402

TOP = 10
EVAL = ROOT / "tools" / "eval"
EMB = ROOT / "data" / "scriptures" / "embeddings.json"
QUERIES = EVAL / "queries.json"
CACHE = EVAL / "query_vectors.json"
OUT = EVAL / "pool.json"
EMBED_URL = "https://api.openai.com/v1/embeddings"
# 판정은 초안까지 포함한 풀로 한다. 감수 통과 16구절만 보면 정답이 될 구절이 아예 없다
POOL = "draft"


def query_vectors(texts: list[str]) -> list[list[float]]:
    """measure.py 와 같은 캐시를 쓴다. 같은 글에 같은 벡터여야 두 자가 어긋나지 않는다."""
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    missing = [t for t in texts if t not in cache]
    if missing:
        r = httpx.post(
            EMBED_URL,
            headers={"Authorization": f"Bearer {os.environ['LLM_API_KEY']}"},
            json={"model": client.MODEL, "input": missing, "dimensions": client.DIMS},
            timeout=60.0,
        )
        r.raise_for_status()
        for t, d in zip(missing, sorted(r.json()["data"], key=lambda x: x["index"]), strict=True):
            cache[t] = d["embedding"]
        CACHE.write_text(json.dumps(cache), encoding="utf-8")
    return [cache[t] for t in texts]


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def main() -> int:
    out_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else OUT
    if len(sys.argv) == 1 and out_path.exists():
        # 판정을 마친 풀을 말없이 덮어쓰지 않는다. git 밖에 있어 되돌릴 길이 없다
        print(f"{out_path} 가 이미 있어서 멈춥니다. 새로 만들려면 다른 경로를 인자로 주세요.")
        return 1
    os.environ.setdefault(SCRIPTURE_POOL_ENV, POOL)
    get_settings.cache_clear()

    queries = json.loads(QUERIES.read_text(encoding="utf-8"))["queries"]
    emb = json.loads(EMB.read_text(encoding="utf-8"))["vectors"]
    pool = repo.retrieval_pool()
    items = {s.id: s for s in pool}
    corpus = repo._corpus()
    ids = list(corpus)

    qvecs = query_vectors([q["text"] for q in queries])
    out = []
    for q, qv in zip(queries, qvecs, strict=True):
        words = repo._words(q["text"])
        lex = sorted(ids, key=lambda i: (-repo._score(words, i, corpus), i))[:TOP]
        vec = sorted((i for i in ids if i in emb), key=lambda i: -cosine(qv, emb[i]))[:TOP]
        decision = rules.route_by_rules(q["text"])
        contexts = safety.contexts_of(
            q["text"], abuse=decision.flags.abuse, minor=decision.flags.minor
        )
        product = [s.id for s in compose.candidate_pool(q["text"], qv, contexts)]

        marks: dict[str, set[str]] = {}
        for name, group in (("어휘", lex), ("벡터", vec), ("제품", product)):
            for i in group:
                marks.setdefault(i, set()).add(name)
        out.append(
            {
                "id": q["id"],
                "text": q["text"],
                "pool": [
                    {
                        "id": i,
                        # 어느 방식이 올린 구절인가. 판정할 때 한쪽에 쏠리지 않게 보라고 남긴다
                        "from": "·".join(n for n in ("어휘", "벡터", "제품") if n in m),
                        "text": items[i].text[:110],
                        "gloss": items[i].modern_gloss[:90],
                    }
                    for i, m in marks.items()
                ],
            }
        )
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    sizes = [len(o["pool"]) for o in out]
    print(f"후보 풀 {repo.pool_mode()} {len(pool)}구절")
    print(f"고민 {len(out)}개 · 풀 평균 {sum(sizes) / len(sizes):.1f}개 · 합계 {sum(sizes)}")
    print(f"→ {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
