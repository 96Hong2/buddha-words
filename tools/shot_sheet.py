#!/usr/bin/env python3
"""e2e 스크린샷을 한 장으로 모아 시안과 나란히 본다.

`frontend/e2e/shots/*.png` 를 읽어 `frontend/e2e/shots/index.html` 을 만든다.
이미지는 base64 로 박아 넣어 파일 하나만 열면 된다.
"""

from __future__ import annotations

import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "frontend" / "e2e" / "shots"
OUT = SHOTS / "index.html"

CAPTIONS = {
    "01-home-entry-card": "S1 ⓪ 진입 카드 (하루 첫 진입 한 번, 출구 넷)",
    "02-home-empty": "S1 ① 빈 상태",
    "03-home-typing": "S1 ② 입력 중 (점 1개)",
    "04-home-enough": "S1 ③ 충분히 이야기한 상태 (점 3개, 금색)",
    "05-loading": "S2 대기 화면 (광고 없음)",
    "06-answer-pass1": "S3 답변 1차 패스 (태그·오늘의 부처의 말·경전)",
    "07-answer-full": "S3 답변 전체 7블록",
    "08-light": "LIGHT 답변 (경전·간직·공유·광고 없음)",
    "09-invalid": "INVALID (사용량 안 셈)",
    "10-crisis-distress": "S4 위기 distress (이어 듣기 있음)",
    "11-solace": "S4 위로 전용 답변 (창구가 위아래)",
    "12-crisis-acute": "S4 위기 acute (이어 듣기 없음)",
}


def main() -> int:
    if not SHOTS.exists():
        print(f"스크린샷 폴더가 없어요: {SHOTS}", file=sys.stderr)
        return 1

    pngs = sorted(SHOTS.glob("*.png"))
    if not pngs:
        print("찍힌 스크린샷이 없어요. 먼저 npm run e2e 를 돌려 주세요.", file=sys.stderr)
        return 1

    cards = []
    for png in pngs:
        b64 = base64.b64encode(png.read_bytes()).decode()
        key = png.stem
        cards.append(
            f'<figure><img src="data:image/png;base64,{b64}" alt="{key}">'
            f'<figcaption><b>{key}</b><span>{CAPTIONS.get(key, "")}</span></figcaption></figure>'
        )

    OUT.write_text(
        "<!doctype html><meta charset=utf-8><title>부처의 말 화면 증명</title>"
        "<style>"
        "body{margin:0;padding:32px;background:#EDE4D3;color:#362C25;"
        "font-family:'Pretendard Variable',-apple-system,system-ui,sans-serif}"
        "h1{font-size:22px;margin:0 0 4px}p.lead{margin:0 0 28px;color:#6B5C4E;font-size:14px}"
        ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:28px}"
        "figure{margin:0;background:#FFFAF1;border-radius:16px;padding:14px;"
        "box-shadow:0 2px 10px rgba(54,44,37,.08)}"
        "img{width:100%;border-radius:10px;border:1px solid #DCCFB8;display:block}"
        "figcaption{margin-top:10px;font-size:13px;line-height:1.5}"
        "figcaption b{display:block;color:#8E6B26}"
        "figcaption span{color:#6B5C4E}"
        "</style>"
        f"<h1>부처의 말 · 화면 증명 {len(pngs)}장</h1>"
        "<p class=lead>e2e 가 실제로 눌러서 찍은 화면입니다. 시안은 design/screens/ 에 있습니다.</p>"
        f'<div class=grid>{"".join(cards)}</div>',
        encoding="utf-8",
    )
    print(f"{OUT} ({len(pngs)}장)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
