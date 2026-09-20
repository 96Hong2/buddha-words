"""마루 부리를 상용 한글만 남겨 번들에 넣는다.

왜 자체 호스팅인가. 전에는 네이버 웹폰트 주소에서 세 굵기를 그대로 받았는데,
한 굵기가 441KB 이고 서브셋이 없다. 홈 화면 한 장을 그리는 데만 441KB 가 외부
호스트에서 내려왔고, 여기에 Pretendard CSS 와 서브셋 230KB 가 더 붙었다.
미니앱 첫 접속 시간이 20초를 넘어 심사에서 반려된 가장 큰 이유다.

무엇을 남기나. KS X 1001 상용 한글 2,350자 + 라틴 + 문장부호다. 현대 한국어 글은
사실상 전부 이 안에 든다. 남긴 뒤 한 굵기가 441KB → 약 165KB 가 된다.

라이선스. 마루 부리는 네이버가 무료 배포하며 서브셋·임베딩·재배포를 허용한다.
원본 주소와 고지는 frontend/public/fonts/LICENSE.txt 에 함께 둔다.

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


def _name_as_one_family(path: Path, weight: str) -> None:
    """굵기를 한 집안 이름으로 묶는다.

    네이버 원본은 굵기마다 집안 이름이 다르다(MaruBuri · MaruBuriBold). 그대로 두면
    CSS 가 font-weight 로 굵기를 고르지 못하고 가짜 굵기를 만든다. 이름을 MaruBuri 하나로
    맞추고 굵기는 subfamily 로 넘긴다. 브라우저가 보고하는 글꼴 이름도 이 값이라,
    e2e 가 「경전이 마루 부리로 그려졌나」를 이 이름으로 확인한다.
    """
    font = TTFont(path)
    labels = {
        1: "MaruBuri",
        2: weight,
        4: f"MaruBuri {weight}",
        6: f"MaruBuri-{weight}",
        16: "MaruBuri",
        17: weight,
    }
    for record in font["name"].names:
        text = labels.get(record.nameID)
        if text is not None:
            record.string = text.encode("utf-16-be") if record.isUnicode() else text.encode()
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

        dst = OUT / f"MaruBuri-{name}.subset.woff2"
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
        _name_as_one_family(dst, name)

        before = src.stat().st_size / 1024
        after = dst.stat().st_size / 1024
        print(f"{name:8s} {before:7.1f} KB → {after:7.1f} KB")
        src.unlink()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
