"""경전 임베딩을 미리 계산해 파일로 남긴다.

런타임에 400구절을 다시 부르지 않는다. 씨앗이 바뀌면 해시가 달라져 다시 만들라고 알린다.

  uv run python tools/build_embeddings.py
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

# 모델 이름과 차원은 쿼리 쪽 한 곳에만 둔다. 두 벌로 두면 한쪽만 바뀌어도 아무도 모른다
from app.integrations.embedding.client import DIMS, MODEL  # noqa: E402

SEED = ROOT / "data" / "scriptures" / "seed.json"
OUT = ROOT / "data" / "scriptures" / "embeddings.json"

# 소수 자리를 잘라 파일을 줄인다. 4자리까지 잘라도 26개 고민의 회수율이 글자 하나 안 바뀌었다
# (R@5 0.396 · R@20 0.691 · MRR 0.860 그대로). 한 자리 여유를 두고 5로 둔다. 11.8MB → 5.5MB.
ROUND = 5
BATCH = 128
URL = "https://api.openai.com/v1/embeddings"


def embed_text(s: dict) -> str:
    """무엇을 임베딩하는가.

    retrieval_text 는 「이럴 때 읽는 구절인가」를 적어 둔 문장이라 고민 글과 가장 가깝다.
    modern_gloss 와 본문을 덧붙여 구절이 실제로 무슨 말을 하는지도 함께 담는다.
    출처(citation)는 넣지 않는다. 「법구경 3장」 같은 말은 고민 글에 나오지 않는다.
    """
    return "\n".join(
        [
            s.get("retrieval_text", ""),
            s.get("modern_gloss", ""),
            s.get("text", ""),
        ]
    ).strip()


def seed_digest(items: list[dict]) -> str:
    h = hashlib.sha256()
    for s in items:
        h.update(s["id"].encode())
        h.update(embed_text(s).encode())
    return h.hexdigest()


def fetch(client: httpx.Client, key: str, texts: list[str]) -> list[list[float]]:
    for attempt in range(3):
        try:
            r = client.post(
                URL,
                headers={"Authorization": f"Bearer {key}"},
                json={"model": MODEL, "input": texts, "dimensions": DIMS},
                timeout=60.0,
            )
            r.raise_for_status()
            data = r.json()
            return [d["embedding"] for d in sorted(data["data"], key=lambda x: x["index"])]
        except httpx.HTTPError as e:
            if attempt == 2:
                raise
            print(f"  재시도 {attempt + 1}: {e}", file=sys.stderr)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("도달할 수 없음")


def main() -> int:
    key = os.environ.get("LLM_API_KEY", "").strip()
    if not key:
        print("LLM_API_KEY 가 없어요. backend/.env 를 읽어 주세요.", file=sys.stderr)
        return 1

    items = json.loads(SEED.read_text(encoding="utf-8"))["items"]
    texts = [embed_text(s) for s in items]
    print(f"구절 {len(items)}개, 평균 {sum(len(t) for t in texts) // len(texts)}자")

    vectors: list[list[float]] = []
    with httpx.Client() as client:
        for i in range(0, len(texts), BATCH):
            chunk = texts[i : i + BATCH]
            vectors.extend(fetch(client, key, chunk))
            print(f"  {min(i + BATCH, len(texts))}/{len(texts)}")

    OUT.write_text(
        json.dumps(
            {
                "model": MODEL,
                "dims": DIMS,
                "seed_digest": seed_digest(items),
                "vectors": {
                    s["id"]: [round(x, ROUND) for x in v]
                    for s, v in zip(items, vectors, strict=True)
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    size_mb = OUT.stat().st_size / 1024 / 1024
    tokens = sum(len(t) for t in texts) // 3
    print(f"{OUT.name} {size_mb:.1f}MB · 대략 {tokens:,}토큰 · 약 ${tokens * 0.02 / 1_000_000:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
