#!/usr/bin/env python3
"""초안 JSON 묶음들을 감수용 마크다운 한 장으로 묶는다.

감수자는 이 파일 하나만 본다. 통과 표시와 메모를 여기에 적고 돌려주면
그 표시를 읽어 data/scriptures/reviewed.json 을 만든다.

    python3 tools/build_review_md.py
"""

import json
import pathlib
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
DRAFT = ROOT / "data" / "scriptures" / "_draft"
OUT = ROOT / "data" / "scriptures" / "경전 감수본 (초안).md"

# 문헌 하나가 여러 묶음으로 나뉘어 생성됐다. 감수자에게는 문헌 단위로 보인다.
# (이름, 파일 키들, 그 문헌의 전체 분량)
ORDER = [
    ("법구경 1~13장", ["dhp-a", "dhp-c"], "법구경 전체 423게 중 1~178게"),
    ("법구경 14~26장", ["dhp-b", "dhp-d"], "법구경 전체 423게 중 179~423게"),
    ("숫타니파타", ["snp", "snp-2"], "전체 1,149게"),
    ("상윳따 니까야", ["sn", "sn-2"], "전체 2,889경"),
    ("앙굿따라 니까야", ["an", "an-2"], "재가자 생활을 다룬 짧은 경"),
    ("맛지마 · 디가 니까야", ["mn-dn", "mn-dn-2"], "맛지마 152경 · 디가 34경"),
    ("우다나 · 이띠웃따까 · 테라가타", ["misc", "misc-2"], "이띠웃따까 112경 · 테라가타 264편 · 테리가타 73편"),
    ("대승 · 선 · 한국 불교", ["mahayana", "mahayana-2"], "금강경 · 반야심경 · 유마경 · 법화경 · 화엄경 · 육조단경 · 원효 · 지눌 · 서산 · 선어록"),
]

TAG_KO = {
    "anxiety": "불안",
    "anger": "분노",
    "loss": "이별·상실",
    "comparison": "비교·열등감",
    "relationship": "관계 갈등",
    "uncertainty": "미래·진로",
    "money": "돈·생계",
    "apathy": "무기력·번아웃",
    "indecision": "선택·결정",
    "regret": "자책·후회",
}

DOT = {"high": "🟢", "medium": "🟡", "low": "🔴"}


def load():
    """문헌 하나를 이루는 묶음들을 합쳐 (이름, 고른 근거들, 구절들) 로 돌려준다."""
    groups = []
    for name, keys, scale in ORDER:
        items, notes = [], []
        for key in keys:
            path = DRAFT / f"batch-{key}.json"
            if not path.exists():
                print(f"없음: {path.name}", file=sys.stderr)
                continue
            data = json.loads(path.read_text(encoding="utf-8"))
            items += data["items"]
            note = (data.get("source_note") or "").replace("\n", " ").strip()
            if note:
                notes.append(note)
        if items:
            groups.append((name, scale, notes, items))
    return groups


def block(no, it):
    """구절 하나를 감수자가 읽는 블록으로."""
    conf = it.get("confidence", "medium")
    tags = " · ".join(TAG_KO.get(t, t) for t in it.get("tags_primary", []))
    lines = []
    lines.append(f"### {no:03d}. `{it['id']}` · {it['citation_ko']}")
    lines.append("")

    meta = [f"{DOT.get(conf, '⚪')} 확신도 **{conf}**", f"태그 {tags}", f"난이도 {it.get('difficulty', '?')}"]
    if it.get("license_status") == "needs_check":
        meta.append("⚠ **라이선스 확인 필요**")
    lines.append(" | ".join(meta))
    lines.append("")

    if conf != "high" and it.get("confidence_note"):
        lines.append(f"> 🔴 **출처를 먼저 봐주세요.** {it['confidence_note']}")
        lines.append("")

    lines.append("**경전 번역문** (화면에 나가는 유일한 문장)")
    lines.append("")
    lines.append(f"> {it['ko_text']}")
    lines.append("")

    lines.append(f"**현대적 풀이** {it.get('modern_gloss', '')}")
    lines.append("")
    lines.append(f"**닿는 상황** (검색이 읽는 문장) {it.get('retrieval_text', '')}")
    lines.append("")

    if it.get("daily_ok"):
        lines.append(f"**오늘의 한마디** 「{it.get('daily_line', '')}」")
        lines.append("")

    if it.get("terms"):
        terms = " · ".join(f"**{t['word']}**: {t['gloss']}" for t in it["terms"])
        lines.append(f"**용어 풀이** {terms}")
        lines.append("")

    if it.get("cautions"):
        for c in it["cautions"]:
            lines.append(f"⚠ **이렇게 읽힐 수 있어요** {c}")
        lines.append("")

    lines.append(f"<details><summary>옮긴 근거 (기준본 대조용)</summary>\n\n{it.get('base_note', '')}\n\n</details>")
    lines.append("")
    lines.append("**감수** ☐ 통과 ☐ 고쳐야 함 ☐ 빼야 함")
    lines.append("")
    lines.append("메모: ")
    lines.append("")
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def norm(s):
    """문장 비교용. 공백과 문장부호를 지워 같은 게송을 다르게 적은 것을 잡는다."""
    return "".join(ch for ch in (s or "") if ch.isalnum())[:60]


def main():
    groups = load()
    if not groups:
        sys.exit("초안 파일이 하나도 없다")

    all_items = [it for _, _, _, items in groups for it in items]
    total = len(all_items)

    tag_count = Counter(t for it in all_items for t in it.get("tags_primary", []))
    conf_count = Counter(it.get("confidence", "medium") for it in all_items)
    daily = sum(1 for it in all_items if it.get("daily_ok"))
    needs_check = [it for it in all_items if it.get("license_status") == "needs_check"]
    suspect = [it for it in all_items if it.get("confidence") != "high"]

    ids = [it["id"] for it in all_items]
    dup = [i for i, n in Counter(ids).items() if n > 1]

    # 같은 문장을 다른 id 로 적은 것도 중복이다
    seen, dup_text = {}, []
    for it in all_items:
        k = norm(it.get("ko_text"))
        if k in seen:
            dup_text.append(f"{seen[k]} ↔ {it['id']}")
        else:
            seen[k] = it["id"]

    out = []
    w = out.append

    w(f"# 부처의 말 · 경전 {total}구절 감수본 (초안)")
    w("")
    w("> **이 파일은 AI 가 만든 초안입니다.** 사람이 감수해 통과시킨 구절만 앱에 들어갑니다.")
    w("> 지금 앱 화면에 뜨는 12구절은 개발용 씨앗이고 이 감수본이 오면 버립니다.")
    w("")
    w("## 왜 이 규모인가")
    w("")
    w("처음 계획은 **법구경만 120구절**이었습니다. 감수가 사람 손을 타는 유일한 일이라 규모를 줄여 잡은 것입니다.")
    w("그런데 법구경은 전체 **423게**이고, 한 권만 쓰면 어조가 반복됩니다. 감정 태그 열 종을 고르게 채우지도 못합니다.")
    w("초안을 쓰는 비용은 구절 수에 거의 비례하지 않으므로, **초안은 400구절을 한 번에 만들어 두고**")
    w("감수를 통과한 만큼만 앱에 싣기로 했습니다.")
    w("")
    w("| | |")
    w("| --- | --- |")
    w("| 초안 | 400구절 (이 파일) |")
    w("| 출시에 필요한 하한 | **감수 통과 200구절.** 태그당 12구절씩 열 종을 채우는 최소선입니다 |")
    w("| 나머지 | 출시 후 배치로 넣습니다. 출시를 감수 완료에 묶지 않습니다 |")
    w("| 감수 시간 | 하루 3시간 기준으로 200구절에 7~8일, 400구절 전부면 11~22일 |")
    w("")
    w("## 중복을 어떻게 막았나")
    w("")
    w("같은 구절이 두 번 들어가면 감수 시간이 그만큼 낭비되고, 앱에서는 같은 카드가 반복됩니다. 세 겹으로 막았습니다.")
    w("")
    w("1. 구절을 고르는 단계에서 **이미 쓴 id 전체**를 넘겨 그것을 피해 고르게 했습니다")
    w("2. 다른 눈이 파일을 다시 읽어 겹친 것을 같은 성격의 다른 구절로 갈아끼웠습니다")
    w("3. 이 파일을 만들 때 코드가 **id 와 번역문 자체**를 둘 다 대조합니다. 같은 게송을 다른 번호로")
    w("   적은 것도 잡힙니다. 결과는 아래 「한눈에」의 중복 두 줄에 있습니다")
    w("")
    w("## 감수 결과를 어떻게 돌려주나")
    w("")
    w("이 파일에 그대로 표시하고 저장해서 주시면 됩니다. 구절마다 맨 아래에 **감수** 줄과 **메모** 줄이 있습니다.")
    w("표시를 읽어 `data/scriptures/reviewed.json` 을 만들고, 통과한 구절만 빌드에 들어갑니다.")
    w("고쳐야 할 문장은 메모 줄에 고친 문장을 그대로 적어 주시면 그것을 씁니다.")
    w("")
    w("## 감수하는 법")
    w("")
    w("구절마다 아래 다섯 개를 봐주세요. 다 보고 맨 아래 **감수** 줄에 표시하고 메모를 답니다.")
    w("")
    w("| 보는 것 | 무엇을 확인하나 | 틀리면 생기는 일 |")
    w("| --- | --- | --- |")
    w("| ① 출처 | 장·게송 번호가 그 문장의 실제 출처인가 | 앱이 없는 경전을 인용합니다 |")
    w("| ② 번역문 | 뜻이 맞는가. 시판 번역서 문장을 그대로 옮기지 않았는가 | 교리가 틀리거나 저작권 문제가 됩니다 |")
    w("| ③ 현대적 풀이 | 경전이 하지 않은 말을 얹지 않았는가 | AI 가 이 범위를 넘어 답을 씁니다 |")
    w("| ④ 닿는 상황 | 이 구절을 이런 고민에 붙여도 되는가 | 엉뚱한 고민에 엉뚱한 구절이 붙습니다 |")
    w("| ⑤ 오늘의 한마디 | 맥락 없이 혼자 읽어도 뜻이 통하는가 | 홈 화면에 무슨 말인지 모를 문장이 뜹니다 |")
    w("")
    w("🔴 표시가 붙은 구절부터 봐주세요. **출처가 불확실하다고 AI 가 스스로 표시한 것들**입니다.")
    w("")

    w("## 한눈에")
    w("")
    w("| | |")
    w("| --- | --- |")
    w(f"| 전체 | **{total}구절** |")
    w(f"| 출처 확신 | 🟢 high {conf_count.get('high', 0)} · 🟡 medium {conf_count.get('medium', 0)} · 🔴 low {conf_count.get('low', 0)} |")
    w(f"| 오늘의 한마디 쓸 수 있는 것 | {daily}구절 (빌드 게이트 하한 30) |")
    w(f"| 라이선스 확인 필요 | {len(needs_check)}구절 |")
    w(f"| 같은 id 중복 | {len(dup)}건{(' · ' + ', '.join(dup)) if dup else ' (없음)'} |")
    w(f"| 같은 문장 중복 | {len(dup_text)}건{(' · ' + ', '.join(dup_text)) if dup_text else ' (없음)'} |")
    w("")

    w("### 문헌별")
    w("")
    w("고른 근거는 각 문헌 절 첫머리에 접어 두었습니다.")
    w("")
    w("| 문헌 | 구절 | 🟢 | 🟡🔴 | 한마디 | 고른 범위 |")
    w("| --- | ---: | ---: | ---: | ---: | --- |")
    for name, scale, notes, items in groups:
        hi = sum(1 for it in items if it.get("confidence") == "high")
        lo = len(items) - hi
        dl = sum(1 for it in items if it.get("daily_ok"))
        w(f"| {name} | {len(items)} | {hi} | {lo} | {dl} | {scale} |")
    w(f"| **합계** | **{total}** | | | | |")
    w("")

    w("### 감정 태그별")
    w("")
    w("태그 하나에 최소 12구절이 있어야 같은 구절이 반복되지 않습니다(쿨다운 10 + 여유 2).")
    w("")
    w("| 태그 | 구절 | 하한 12 |")
    w("| --- | ---: | :---: |")
    for tag, ko in TAG_KO.items():
        n = tag_count.get(tag, 0)
        w(f"| {ko} `{tag}` | {n} | {'✅' if n >= 12 else '❌ 모자람'} |")
    w("")

    if suspect:
        w(f"## 먼저 볼 것: 출처가 불확실한 {len(suspect)}구절")
        w("")
        w("AI 가 스스로 확신이 없다고 표시한 것들입니다. 여기부터 보면 가장 큰 오류를 먼저 걷어냅니다.")
        w("")
        w("| id | 출처 | 왜 불확실한가 |")
        w("| --- | --- | --- |")
        for it in suspect:
            w(f"| `{it['id']}` | {it['citation_ko']} | {it.get('confidence_note', '') or '(메모 없음)'} |")
        w("")

    if needs_check:
        w(f"## 라이선스를 확인해야 하는 {len(needs_check)}구절")
        w("")
        w("팔리 문헌은 CC0 영역본을 기준본으로 삼을 수 있지만 대승 문헌은 그런 기준본이 없습니다.")
        w("한문 원전 자체에는 저작권이 없으나 **어느 판본에서 옮겼는지**가 확인 대상입니다.")
        w("이 확인이 끝나지 않으면 이 구절들은 빌드에서 빠지고 팔리 문헌만으로 출시합니다.")
        w("")
        w("| id | 출처 |")
        w("| --- | --- |")
        for it in needs_check:
            w(f"| `{it['id']}` | {it['citation_ko']} |")
        w("")

    w("---")
    w("")

    no = 0
    for i, (name, scale, notes, items) in enumerate(groups, 1):
        w(f"## {i}. {name} ({len(items)}구절)")
        w("")
        if notes:
            w("<details><summary>이 문헌에서 구절을 어떻게 골랐나</summary>")
            w("")
            for n in notes:
                w(n)
                w("")
            w("</details>")
            w("")
        for it in items:
            no += 1
            w(block(no, it))

    OUT.write_text("\n".join(out), encoding="utf-8")
    print(f"{OUT.name} · {total}구절 · {len(OUT.read_text(encoding='utf-8').splitlines())}줄")
    if dup:
        print(f"⚠ id 중복 {len(dup)}건: {', '.join(dup)}")
    if dup_text:
        print(f"⚠ 같은 문장 중복 {len(dup_text)}건: {', '.join(dup_text)}")
    weak = [TAG_KO[t] for t in TAG_KO if tag_count.get(t, 0) < 12]
    if weak:
        print(f"⚠ 12구절에 못 미치는 태그: {', '.join(weak)}")
    if daily < 30:
        print(f"⚠ 오늘의 한마디 후보 {daily}개로 빌드 게이트 하한 30 미달")


if __name__ == "__main__":
    main()
