"""마루 부리를 상용 한글만 남겨 `BuddhaSerif` 라는 이름으로 번들에 넣는다.

왜 자체 호스팅인가. 전에는 네이버 웹폰트 주소에서 세 굵기를 그대로 받았는데,
한 굵기가 441KB 이고 서브셋이 없다. 홈 화면 한 장을 그리는 데만 441KB 가 외부
호스트에서 내려왔고, 여기에 Pretendard CSS 와 서브셋 230KB 가 더 붙었다.
미니앱 첫 접속 시간이 20초를 넘어 심사에서 반려된 가장 큰 이유다.

무엇을 남기나. KS X 1001 상용 한글 2,350자 + 라틴 + 문장부호다. 현대 한국어 글은
사실상 전부 이 안에 든다. 남긴 뒤 한 굵기가 441KB → 약 165~180KB 가 된다.

**왜 이름을 바꾸나.** 마루 부리는 SIL Open Font License 1.1 이고 `MaruBuri` 가
**예약 글꼴 이름(Reserved Font Name)** 으로 지정돼 있다. OFL 3항은 수정본이 그 이름을
쓰는 것을 금지하고, OFL FAQ 2.6 은 **서브셋을 수정으로 본다.** 글자 수를 줄였으니
원래 이름을 그대로 달면 위반이다. 그래서 `BuddhaSerif` 로 새 이름을 붙인다.
글자 모양은 손대지 않았고 저작권 표기(nameID 0)는 원본 그대로 둔다.

라이선스 전문은 frontend/public/fonts/OFL.txt, 무엇을 어떻게 바꿨는지는
frontend/public/fonts/LICENSE.txt 에 적었다.

    python3 tools/build_fonts.py
"""

from __future__ import annotations

import subprocess
import sys
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont

SOURCE = "https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri"
WEIGHTS = {"Regular": 400, "Bold": 700}

# 우리가 붙이는 이름. 원본의 예약 글꼴 이름(MaruBuri)을 쓸 수 없어서 새로 짓는다.
# CSS 의 --font-serif 와 index.html 의 @font-face 가 이 이름을 부른다.
FAMILY = "BuddhaSerif"
OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "fonts"

# 라틴·숫자·문장부호·한글 자모·전각기호. 본문에 늘 섞여 나온다
BASE = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
    "U+2000-206F,U+2070-209F,U+20A0-20BF,U+2100-214F,U+2190-21FF,U+2200-22FF,"
    "U+2460-24FF,U+25A0-25FF,U+2600-27BF,U+3000-303F,U+3130-318F,U+FF00-FFEF"
)


def common_hangul() -> str:
    """KS X 1001 상용 한글 2,350자.

    완성형 두 바이트가 모두 0xA1 이상인 영역이 그것이다. cp949 확장(8,822자)은
    옛말·의성어에나 쓰여 빼도 현대 글에서는 티가 나지 않는다.
    """
    kept = [cp for cp in range(0xAC00, 0xD7A4) if _is_ksx1001(chr(cp))]
    return _as_ranges(kept)


def _is_ksx1001(ch: str) -> bool:
    raw = ch.encode("euc_kr")
    return len(raw) == 2 and raw[0] >= 0xA1 and raw[1] >= 0xA1


def _as_ranges(points: list[int]) -> str:
    spans: list[tuple[int, int]] = []
    start = prev = points[0]
    for cp in points[1:]:
        if cp == prev + 1:
            prev = cp
            continue
        spans.append((start, prev))
        start = prev = cp
    spans.append((start, prev))
    return ",".join(
        f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}" for a, b in spans
    )


def _rename(path: Path, weight: str) -> None:
    """새 이름을 달고 굵기를 한 집안으로 묶는다.

    이름을 바꾸는 것은 취향이 아니라 라이선스다. 서브셋은 OFL 이 말하는 수정본이고,
    수정본은 예약 글꼴 이름(MaruBuri)을 쓸 수 없다(OFL 3항 · FAQ 2.6).

    묶는 것은 따로 얻는 이득이다. 네이버 원본은 굵기마다 집안 이름이 다른데
    (MaruBuri · MaruBuriBold) 그대로 두면 CSS 가 font-weight 로 굵기를 고르지 못하고
    가짜 굵기를 만든다. 한 이름에 묶고 굵기는 subfamily 로 넘긴다.

    저작권(nameID 0)은 건드리지 않는다. OFL 2항이 사본마다 원본 저작권 표기를
    그대로 두라고 한다. 라이선스 칸(13·14)은 비어 있어 여기서 채운다.
    """
    font = TTFont(path)
    labels = {
        1: FAMILY,
        2: weight,
        4: f"{FAMILY} {weight}",
        6: f"{FAMILY}-{weight}",
        13: (
            "This Font Software is licensed under the SIL Open Font License, "
            "Version 1.1. Subset of MaruBuri by NAVER Corp., renamed as required "
            "by OFL clause 3. Full license: see OFL.txt next to this file."
        ),
        14: "https://openfontlicense.org",
        16: FAMILY,
        17: weight,
    }
    names = font["name"]
    for name_id, text in labels.items():
        # 원본에 없는 칸(13·14)도 만들어 넣어야 해서 setName 을 쓴다
        names.setName(text, name_id, 3, 1, 0x409)
        names.setName(text, name_id, 1, 0, 0)
    font.flavor = "woff2"
    font.save(path)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    unicodes = f"{BASE},{common_hangul()}"

    for name in WEIGHTS:
        src = OUT / f"_MaruBuri-{name}.original.woff2"
        if not src.exists():
            print(f"받는 중 {name}")
            urllib.request.urlretrieve(f"{SOURCE}/MaruBuri-{name}.woff2", src)

        dst = OUT / f"{FAMILY}-{name}.woff2"
        subprocess.run(
            [
                sys.executable, "-m", "fontTools.subset", str(src),
                f"--unicodes={unicodes}",
                "--flavor=woff2",
                # 한글 본문에 합자·커닝이 필요 없다. 테이블을 빼면 그만큼 작아진다
                "--layout-features=",
                "--no-hinting",
                "--desubroutinize",
                "--drop-tables+=GSUB,GPOS,GDEF",
                f"--output-file={dst}",
            ],
            check=True,
        )
        _rename(dst, name)

        before = src.stat().st_size / 1024
        after = dst.stat().st_size / 1024
        print(f"{name:8s} {before:7.1f} KB → {after:7.1f} KB")
        src.unlink()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
