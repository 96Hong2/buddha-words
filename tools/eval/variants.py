"""무엇을 임베딩하고 어떻게 합칠지를 실제로 재서 고른다.

여기는 **일부러 방식을 갈라 잰다.** 제품 경로 하나를 통째로 재는 자는 tools/eval/measure.py 고,
이 파일이 답할 질문은 다른 것이다. 구절의 어느 글을 임베딩해야 하나, 어휘와 벡터를 어떤
무게로 섞어야 하나. 두 방식을 갈라 놓지 않으면 어느 쪽이 무엇을 벌었는지 보이지 않는다.

그래서 여기 수치는 제품이 내놓는 후보와 같지 않다. 빠진 것이 둘이다.

  · 안전 규칙(safety.filter_pool)으로 구절을 빼지 않는다
  · 출가 문맥 구절을 맨 앞자리에서 내리지 않는다(safety.demote_monastic)

둘 다 어느 방식에나 똑같이 걸리는 것이라 방식끼리 견주는 데는 빼도 순위가 뒤집히지 않는다.
대신 여기 수치를 화면 성능으로 읽으면 안 된다. 그 값은 measure.py 쪽을 본다.

어휘 점수는 제품이 쓰는 `repo._score` 를 그대로 부른다. idf 를 내는 말뭉치도 제품과 같은
후보 풀이다. 점수식을 여기 다시 구현하면 제품이 아닌 것을 재게 된다.

  uv run --project backend python tools/eval/variants.py
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
from app.domains.scripture import repo  # noqa: E402
from app.integrations.embedding import client  # noqa: E402

EVAL = ROOT / "tools" / "eval"
EMBED_URL = "https://api.openai.com/v1/embeddings"
# 초안까지 넣은 399구절로 잰다. 감수 통과 16구절로는 방식 차이가 드러나지 않는다
POOL = "draft"

# 무엇을 임베딩할지 후보. 「합본」이 지금 제품이 쓰는 것이다(vectors.embed_source)
BUILDS = {
    "합본": lambda s: "\n".join([s.retrieval_text, s.modern_gloss, s.text]),
    "상황만": lambda s: s.retrieval_text,
    "상황+풀이": lambda s: s.retrieval_text + "\n" + s.modern_gloss,
}


def embed(texts: list[str], cache_path: Path) -> dict[str, list[float]]:
    """캐시에 없는 것만 부른다. 캐시가 다 차 있으면 키도 필요 없다."""
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    missing = [t for t in texts if t not in cache]
    for i in range(0, len(missing), 128):
        chunk = missing[i : i + 128]
        r = httpx.post(
            EMBED_URL,
            headers={"Authorization": f"Bearer {os.environ['LLM_API_KEY']}"},
            json={"model": client.MODEL, "input": chunk, "dimensions": client.DIMS},
            timeout=90.0,
        )
        r.raise_for_status()
        for t, d in zip(chunk, sorted(r.json()["data"], key=lambda x: x["index"]), strict=True):
            cache[t] = d["embedding"]
    if missing:
        cache_path.write_text(json.dumps(cache), encoding="utf-8")
    return {t: cache[t] for t in texts}


def cosine(a, b):
    return sum(x * y for x, y in zip(a, b, strict=True)) / (
        math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    )


def rrf(rankings: list[tuple[list[str], float]], k: int = repo._RRF_K) -> list[str]:
    score: dict[str, float] = {}
    for ranked, w in rankings:
        for pos, i in enumerate(ranked):
            score[i] = score.get(i, 0.0) + w / (k + pos + 1)
    return sorted(score, key=lambda i: -score[i])


def scores(ranked: list[str], gold: set[str]) -> tuple[float, float, float]:
    r5 = len(gold & set(ranked[:5])) / len(gold)
    r20 = len(gold & set(ranked[:20])) / len(gold)
    rr = next((1 / (p + 1) for p, i in enumerate(ranked) if i in gold), 0.0)
    return r5, r20, rr


def main() -> int:
    os.environ.setdefault(SCRIPTURE_POOL_ENV, POOL)
    get_settings.cache_clear()
    pool = repo.retrieval_pool()
    corpus = repo._corpus()
    ids = list(corpus)

    queries = json.loads((EVAL / "queries.json").read_text(encoding="utf-8"))["queries"]
    gold_all = json.loads((EVAL / "relevance.json").read_text(encoding="utf-8"))["relevant"]
    n = len(queries)

    qtexts = [q["text"] for q in queries]
    qvec = embed(qtexts, EVAL / "query_vectors.json")

    lex_ranks = {
        q["id"]: sorted(ids, key=lambda i: (-repo._score(repo._words(q["text"]), i, corpus), i))
        for q in queries
    }

    print(f"후보 풀 {repo.pool_mode()} {len(pool)}구절 · 고민 {n}개\n")
    print(f"{'설정':<26} {'R@5':>6} {'R@20':>7} {'MRR':>7}")
    base = [scores(lex_ranks[q["id"]], set(gold_all[q["id"]])) for q in queries]
    print(
        f"{'어휘만 (기준선)':<26} {sum(b[0] for b in base) / n:>6.3f} "
        f"{sum(b[1] for b in base) / n:>7.3f} {sum(b[2] for b in base) / n:>7.3f}"
    )

    best = None
    for build_name, build in BUILDS.items():
        doc_texts = [build(s) for s in pool]
        vecs = embed(doc_texts, EVAL / f"doc_vectors_{build_name}.json")
        by_id = {s.id: vecs[t] for s, t in zip(pool, doc_texts, strict=True)}
        vec_ranks = {
            q["id"]: sorted(ids, key=lambda i: -cosine(qvec[q["text"]], by_id[i])) for q in queries
        }
        for label, mix in (
            ("벡터만", None),
            ("어휘1 벡터1", (1.0, 1.0)),
            ("어휘2 벡터1", (2.0, 1.0)),
            ("어휘1 벡터2", (1.0, 2.0)),
        ):
            rows = []
            for q in queries:
                gold = set(gold_all[q["id"]])
                if mix is None:
                    ranked = vec_ranks[q["id"]]
                else:
                    wl, wv = mix
                    ranked = rrf([(lex_ranks[q["id"]], wl), (vec_ranks[q["id"]], wv)])
                rows.append(scores(ranked, gold))
            r5 = sum(x[0] for x in rows) / n
            r20 = sum(x[1] for x in rows) / n
            mrr = sum(x[2] for x in rows) / n
            print(f"{build_name + ' · ' + label:<26} {r5:>6.3f} {r20:>7.3f} {mrr:>7.3f}")
            if best is None or r20 > best[0]:
                best = (r20, build_name, label, r5, mrr)
    print(f"\nR@20 가장 높은 설정: {best[1]} · {best[2]}  (R@5 {best[3]:.3f} · MRR {best[4]:.3f})")
    print(f"제품이 지금 쓰는 것: 합본 · 어휘{repo._W_LEXICAL:.0f} 벡터{repo._W_VECTOR:.0f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
