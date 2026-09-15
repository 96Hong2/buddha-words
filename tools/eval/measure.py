"""제품이 실제로 내놓는 후보를 골든셋으로 잰다.

**재는 것은 `compose.candidate_pool()` 이 1차 패스에 싣는 바로 그 목록이다.** 어휘 점수만
따로 부르지 않는다. 제품은 어휘+벡터 RRF 를 거쳐 안전 규칙으로 구절을 빼고 출가 문맥
구절을 맨 앞자리에서 내린 뒤에 후보를 내는데, 그 앞단만 재면 화면에 무엇이 실리는지
알 수 없다. 자가 제품과 다른 것을 재고 있으면 그 수치로는 아무것도 판단하지 못한다.

  · 자   tools/eval/relevance.json. 고민 26개에 정답 135쌍이고, 어휘 상위와 벡터 상위를
         합친 풀에서 사람이 판정했다. 한쪽 방식만 보고 정하면 그 방식에 유리한 자가 된다.
  · 풀   approved(감수 통과분)와 draft(초안까지) 둘 다 잰다. 개발과 운영이 다른 구절로
         도는 자리라 한쪽만 재면 반쪽이다.
  · 벡터 쿼리 임베딩은 캐시에서 읽는다. 같은 글을 다시 임베딩하지 않아 값이 흔들리지 않는다.

Recall@20 과 MRR 은 후보 상한(repo.MAX_CANDIDATES) 안에서 잰 값이다. 상한 밖은 제품이
모델에게 보여 주지 않으므로 여기서도 없는 것으로 센다.

방식별 비교(어휘만 · 벡터만 · 섞는 무게)는 여기서 하지 않는다. tools/eval/variants.py 가 한다.

  uv run --project backend python tools/eval/measure.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import SCRIPTURE_POOL_ENV, get_settings  # noqa: E402
from app.domains.answer import compose  # noqa: E402
from app.domains.routing import rules  # noqa: E402
from app.domains.scripture import repo, safety, vectors  # noqa: E402
from app.integrations.embedding import client  # noqa: E402

EVAL = ROOT / "tools" / "eval"
CACHE = EVAL / "query_vectors.json"
EMBED_URL = "https://api.openai.com/v1/embeddings"
# 개발에서 운영 판을 같이 보려고 둘 다 잰다. 이름은 Settings.scripture_pool 의 값 그대로다
POOLS = ("draft", "approved")


def query_vectors(texts: list[str]) -> list[list[float]]:
    """같은 글을 다시 임베딩하지 않게 캐시한다. 재는 값이 흔들리지 않게도 한다.

    모델과 차원은 제품이 쓰는 것을 그대로 따라간다. 다른 모델로 만들면 좌표계가 달라
    거리가 뜻을 잃는다.
    """
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


def product_candidates(text: str, query_vector: list[float]) -> list[str]:
    """제품이 1차 패스에 싣는 후보 id. compose 가 지나는 길을 그대로 지난다.

    상태 판정(`contexts`)도 제품과 같게 만든다. 1층 rules 가 세운 학대·미성년 깃발을
    받아서 safety 에 넘기는 것까지가 한 벌이다. 이걸 빼면 안전 규칙이 실제보다 덜 문다.
    """
    decision = rules.route_by_rules(text)
    contexts = safety.contexts_of(
        text, abuse=decision.flags.abuse, minor=decision.flags.minor
    )
    return [s.id for s in compose.candidate_pool(text, query_vector, contexts)]


def scores(ranked: list[str], gold: set[str]) -> tuple[float, float, float]:
    r5 = len(gold & set(ranked[:5])) / len(gold)
    r20 = len(gold & set(ranked[:20])) / len(gold)
    rr = next((1 / (pos + 1) for pos, i in enumerate(ranked) if i in gold), 0.0)
    return r5, r20, rr


def run(mode: str, queries: list[dict], qvecs: list[list[float]], gold_all: dict) -> list[dict]:
    """한 풀을 통째로 잰다. 풀은 환경변수 하나로 갈린다."""
    os.environ[SCRIPTURE_POOL_ENV] = mode
    get_settings.cache_clear()
    rows = []
    for q, qv in zip(queries, qvecs, strict=True):
        ranked = product_candidates(q["text"], qv)
        gold = set(gold_all[q["id"]])
        r5, r20, rr = scores(ranked, gold)
        rows.append(
            {
                "id": q["id"],
                "kind": q["kind"],
                "pool": mode,
                # 요약은 이 값을 그대로 평균 낸다. 반올림은 파일로 쓸 때만 한다
                "r5": r5,
                "r20": r20,
                "rr": rr,
                "hit": sorted(gold & set(ranked)),
                "candidates": len(ranked),
            }
        )
    return rows


def summary(rows: list[dict]) -> tuple[float, float, float, int]:
    n = len(rows)
    return (
        sum(r["r5"] for r in rows) / n,
        sum(r["r20"] for r in rows) / n,
        sum(r["rr"] for r in rows) / n,
        sum(1 for r in rows if r["hit"]),
    )


def main() -> int:
    queries = json.loads((EVAL / "queries.json").read_text(encoding="utf-8"))["queries"]
    gold_all = json.loads((EVAL / "relevance.json").read_text(encoding="utf-8"))["relevant"]
    qvecs = query_vectors([q["text"] for q in queries])

    pairs = sum(len(gold_all[q["id"]]) for q in queries)
    has_vectors = "있음" if vectors.available() else "없음"
    print(f"고민 {len(queries)}개 · 정답 {pairs}쌍 · 벡터 {has_vectors}")
    print(f"후보 상한 {repo.MAX_CANDIDATES}개\n")

    all_rows: list[dict] = []
    print(f"{'후보 풀':<20} {'Recall@5':>9} {'Recall@20':>10} {'MRR':>7} {'정답이 든 고민':>14}")
    for mode in POOLS:
        rows = run(mode, queries, qvecs, gold_all)
        all_rows += rows
        label = f"{mode} {len(repo.retrieval_pool())}구절"
        r5, r20, mrr, found = summary(rows)
        print(
            f"{label:<20} {r5:>9.3f} {r20:>10.3f} {mrr:>7.3f}"
            f" {found:>11} / {len(rows)}"
        )

    for mode in POOLS:
        rows = [r for r in all_rows if r["pool"] == mode]
        print(f"\n{mode} · 글 갈래별 Recall@20")
        for kind, label in (("event", "사건을 쓴 글"), ("feeling", "마음을 쓴 글")):
            part = [r for r in rows if r["kind"] == kind]
            value = sum(r["r20"] for r in part) / len(part)
            print(f"  {label} {len(part):>2}건  {value:.3f}")

    draft = sorted((r for r in all_rows if r["pool"] == "draft"), key=lambda r: r["r20"])[:5]
    print("\ndraft 에서 가장 못 찾은 고민")
    for r in draft:
        print(f"  {r['id']}  R@5 {r['r5']:.2f} · R@20 {r['r20']:.2f} · RR {r['rr']:.2f}")

    written = [
        {**r, "r5": round(r["r5"], 3), "r20": round(r["r20"], 3), "rr": round(r["rr"], 3)}
        for r in all_rows
    ]
    (EVAL / "result.json").write_text(
        json.dumps(written, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
