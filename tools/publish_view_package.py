#!/usr/bin/env python3
"""워크트리의 산출물을 「사람이 보는 묶음」으로 내린다.

⚠ 2026-09-26 부터 기본으로 멈춘다. 보는 자리를 손으로 다시 짜서 아래 표들이 개발 전(09-15) 구조를 가리킨다.

    python3 tools/inline_assets.py        # 먼저 이걸 돌려 design-inline/ 을 새로 만든다
    python3 tools/publish_view_package.py # 그다음 이것

내리는 곳: ~/MAIN 작업!!!/부가업무/부처의 말
파일 이름만 보고도 뭔지 알게 붙이고, 갤러리의 카드 링크를 새 이름으로 다시 건다.

워크트리가 고치는 자리이고 저쪽은 보는 자리다. 저쪽에서 직접 고치면 다음에 내릴 때 덮인다.
그래서 이 스크립트가 있다. 손으로 복사하면 두 벌이 조용히 갈라진다.

지우는 것은 이 스크립트가 만든 폴더·파일뿐이다. 사람이 저쪽에 따로 둔 것(예: 04 아래 「고해상도 에셋」)은 건드리지 않는다.
"""
import os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.expanduser("~/MAIN 작업!!!/부가업무/부처의 말")
INLINE = os.path.join(ROOT, "design-inline")

# 화면 시안: design-inline 안 경로 → 내릴 이름. 이름 앞의 S·O 는 정본 화면 번호다(00 문서 1.2절).
SCREENS = [
    ("screens/s0-splash-onboarding.html", "01 스플래시와 첫 진입 (S0).html"),
    ("screens/s1-home.html",              "02 홈 · 고민 입력 · 홈 카드 둘 (S1 · 승부처 A).html"),
    ("screens/s2-loading.html",           "03 답변 생성 대기 · 4단계 문구 (S2).html"),
    ("screens/s3-answer.html",            "04 답변 화면 · 7블록 v0.3 · Deep Extension (S2 · 승부처 B).html"),
    ("screens/s4-safety-errors.html",     "05 위기 안내 · 가벼운 입력 · 실패 화면 (S2 · S8).html"),
    ("screens/s5-archive-settings.html",  "06 보관함 · 이어가기 시트 · Paywall · 설정 (S4 · S5 · S6 · O4 · O5).html"),
    ("screens/s6-share.html",             "07 공유 카드와 랜딩 · 입력창 (O3 · S9).html"),
]
FOUNDATIONS = [
    ("foundations/colors.html",       "01 색과 타이포 정본 (대비 계산표).html"),
    ("components/kit.html",           "02 컴포넌트 키트 13묶음.html"),
    ("components/illustrations.html", "03 일러스트 판정과 재제작 발주서.html"),
]
PLANS = [
    ("01-앱인토스-제약-감사.md", "01 앱인토스 제약 감사.md"),
    ("02-경전-데이터와-RAG.md",  "02 경전 데이터와 RAG.md"),
    ("03-LLM-라우팅과-안전.md",  "03 LLM 라우팅과 안전.md"),
    ("04-아키텍처와-재사용.md",   "04 아키텍처와 재사용.md"),
    ("05-비주얼-디자인-언어.md",  "05 비주얼 디자인 언어.md"),
    ("06-화면-IA와-카피.md",     "06 화면 IA와 카피.md"),
]
SPECS = [
    ("router.ts",            "01 입력 라우터 5분류 (router.ts).ts"),
    ("router.fixtures.json", "02 라우터 픽스처 20건 (router.fixtures.json).json"),
    ("router.test.ts",       "03 라우터 픽스처 실행기 (router.test.ts).ts"),
    ("answer.schema.json",   "04 답변 스키마 v0.3 (answer.schema.json).json"),
    ("events.ts",            "05 행동 로그 이벤트와 KPI (events.ts).ts"),
    ("visual-theme.ts",      "06 부처 이미지 매핑 · 자세 6 × 시간대 4 (visual-theme.ts).ts"),
]
ASSET_GROUPS = {
    "01 부처 일러스트 8종 (저해상 · 시안 참고용 · production 제외)": {
        "buddha_anxiety": "불안", "buddha_anger": "분노", "buddha_loss": "상실",
        "buddha_comparison": "비교", "buddha_choice": "선택", "buddha_sleep": "불면",
        "buddha_relationship": "관계", "buddha_growth": "성장",
    },
    "02 화면 배경 (글자가 픽셀로 박혀 있음 · 재제작 대상)": {
        "splash_screen": "스플래시", "onboarding_screen": "첫 진입", "input_screen": "고민 입력",
        "loading_screen": "답변 대기", "empty_state": "빈 상태", "share_card": "공유 카드",
        "premium_banner": "프리미엄 배너 (안 씀)",
    },
    "03 장식 패턴 4종 (구분선 · 카드 머리)": {
        "pattern_lotus": "연꽃", "pattern_leaves": "잎",
        "pattern_petals": "꽃잎", "pattern_ripple": "물결",
    },
    "04 아이콘과 로고 (규격 미달 · 재제작 대상)": {
        "app_icon": "앱 아이콘", "logo_lockup": "로고 락업",
    },
}

DIR_PRD    = "01 PRD와 개발 계획"
DIR_ORIG   = os.path.join(DIR_PRD, "05 축별 원안 6종 (폐기됨 · 참고용)")
DIR_SCREEN = "02 화면 디자인 시안"
DIR_TOKEN  = "03 디자인 토큰과 컴포넌트"
DIR_ASSET  = "04 일러스트와 에셋"
DIR_RAW    = os.path.join(DIR_ASSET, "05 받은 원본 패키지 전체 (webp · 매니페스트 · HTML 예시)")
DIR_SPEC   = "05 코드 스펙과 저장소 씨앗 (개발 착수 때 그대로 쓴다)"
DIR_SEED   = os.path.join(DIR_SPEC, "07 저장소 씨앗 (CLAUDE.md · AGENTS.md · rules)")
DIR_SUTRA  = "06 경전 감수본 (400구절 · 감수 대상)"


def px(path):
    """이미지 크기를 파일 이름에 붙인다. 지금 해상도로는 못 쓴다는 걸 이름만 봐도 알게."""
    try:
        from PIL import Image
        w, h = Image.open(path).size
        return f" {w}x{h}"
    except Exception:
        return ""


def clear(rel):
    """이 스크립트가 만든 폴더만 지운다."""
    p = os.path.join(DST, rel)
    if os.path.isdir(p):
        shutil.rmtree(p)


def main():
    # 2026-09-26 에 보는 자리를 손으로 다시 짰다. 이 표들은 그 전(09-15) 구조라 돌리면 옛 폴더가 새 구조 옆에 다시 생긴다
    if os.environ.get("BUDDHA_PUBLISH_LEGACY") != "1":
        sys.exit("이 스크립트는 개발 전(2026-09-15) 구조로 내린다. 보는 자리는 2026-09-26 에 새로 짰으니 돌리지 않는다.\n"
                 f"지도: {DST}/00 먼저 읽기/폴더 안내.md  (옛 구조가 꼭 필요하면 BUDDHA_PUBLISH_LEGACY=1)")
    if not os.path.isdir(INLINE):
        sys.exit("design-inline/ 이 없다. python3 tools/inline_assets.py 를 먼저 돌린다.")

    # 내가 만든 것만 지운다. 04 는 통째로 지우지 않는다(사람이 「고해상도 에셋」을 따로 둔다).
    for d in [DIR_PRD, DIR_SCREEN, DIR_TOKEN, DIR_SPEC, DIR_SUTRA]:
        clear(d)
    for g in list(ASSET_GROUPS) + [os.path.basename(DIR_RAW)]:
        clear(os.path.join(DIR_ASSET, g))
    for d in [DIR_PRD, DIR_ORIG, DIR_SCREEN, DIR_TOKEN, DIR_ASSET, DIR_RAW, DIR_SPEC, DIR_SEED, DIR_SUTRA]:
        os.makedirs(os.path.join(DST, d), exist_ok=True)

    cp, n = shutil.copy2, 0

    # 01 PRD와 개발 계획
    cp(f"{INLINE}/docs/PRD v0.3 (수익화·라우터 개편·라이브목업).html",
       f"{DST}/{DIR_PRD}/01 PRD v0.3 (제품 정본 · 눌러 보는 목업 · 2026-09-14).html")
    cp(f"{ROOT}/docs/plan/00-통합-개발-계획.md",
       f"{DST}/{DIR_PRD}/02 통합 개발 계획 v0.3 (최종 판정 · 충돌하면 이게 이김).md")
    cp(f"{INLINE}/docs/PRD v0.2 (통합·라이브목업).html",
       f"{DST}/{DIR_PRD}/03 PRD v0.2 (오래된 정본 · 2026-09-13).html")
    cp(f"{ROOT}/docs/PRD-v0.1.md", f"{DST}/{DIR_PRD}/04 PRD v0.1 (맨 처음 원문).md")
    for a, b in PLANS:
        cp(f"{ROOT}/docs/plan/{a}", f"{DST}/{DIR_ORIG}/{b}")
    cp(f"{ROOT}/docs/plan/archive/00-통합-개발-계획-v0.2 (2026-09-13 판).md",
       f"{DST}/{DIR_PRD}/06 통합 개발 계획 v0.2 (보존본 · 2026-09-13).md")
    n += 5 + len(PLANS)

    # 02 화면 디자인 시안 · 03 토큰과 컴포넌트
    for src, name in SCREENS:
        cp(f"{INLINE}/{src}", f"{DST}/{DIR_SCREEN}/{name}")
    for src, name in FOUNDATIONS:
        cp(f"{INLINE}/{src}", f"{DST}/{DIR_TOKEN}/{name}")
    cp(f"{ROOT}/design/foundations/_tokens.css",
       f"{DST}/{DIR_TOKEN}/04 디자인 토큰 v1.1 (코드에 그대로 쓰는 값).css")
    n += len(SCREENS) + len(FOUNDATIONS) + 1

    # 갤러리: 카드가 여는 경로를 새 이름으로 다시 건다
    g = open(f"{INLINE}/index.html", encoding="utf-8").read()
    remap = dict(SCREENS)
    remap.update({s: f"../{DIR_TOKEN}/{name}" for s, name in FOUNDATIONS})
    for old, new in remap.items():
        tag = f'data-open="{old}"'
        if tag not in g:
            sys.exit(f"갤러리에 없는 링크: {old}. SCREENS/FOUNDATIONS 표를 맞춘다.")
        g = g.replace(tag, f'data-open="{new}"')
    open(f"{DST}/{DIR_SCREEN}/00 시안 갤러리 (여기부터 연다).html", "w", encoding="utf-8").write(g)
    n += 1

    # 04 일러스트와 에셋 (사람이 둔 「고해상도 에셋」 폴더는 그대로 둔다)
    img = f"{ROOT}/assets/buddha_words_app_assets/images"
    for folder, items in ASSET_GROUPS.items():
        d = os.path.join(DST, DIR_ASSET, folder)
        os.makedirs(d, exist_ok=True)
        for stem, ko in items.items():
            src = f"{img}/{stem}.png"
            cp(src, f"{d}/{ko} ({stem}){px(src)}.png")
            n += 1
    shutil.copytree(f"{ROOT}/assets/buddha_words_app_assets",
                    os.path.join(DST, DIR_RAW), dirs_exist_ok=True)

    # 05 코드 스펙과 저장소 씨앗
    for src, name in SPECS:
        cp(f"{ROOT}/docs/spec/{src}", f"{DST}/{DIR_SPEC}/{name}")
    seed = f"{ROOT}/docs/repo-seed"
    cp(f"{seed}/CLAUDE.md", f"{DST}/{DIR_SEED}/CLAUDE.md")
    cp(f"{seed}/AGENTS.md", f"{DST}/{DIR_SEED}/AGENTS.md")
    rules_dst = os.path.join(DST, DIR_SEED, "rules (.claude 폴더에 넣는다)")
    shutil.copytree(f"{seed}/.claude/rules", rules_dst, dirs_exist_ok=True)
    n += len(SPECS) + 2

    # 06 경전 감수본
    cp(f"{ROOT}/data/scriptures/경전 감수본 (초안).md",
       f"{DST}/{DIR_SUTRA}/경전 감수본 400구절 (초안).md")
    # 2026-09-16 전수 감수본. 400구절 전부에 판정이 붙은 정본이다
    cp(f"{ROOT}/data/scriptures/경전 감수본 (감수후 v2).md",
       f"{DST}/{DIR_SUTRA}/경전_감수후_수정본_400구절_v2.md")
    draft = f"{ROOT}/data/scriptures/_draft"
    if os.path.isdir(draft):
        shutil.copytree(draft, os.path.join(DST, DIR_SUTRA, "초안 원본 (JSON · 감수 뒤 다시 조립할 때 쓴다)"),
                        dirs_exist_ok=True)
    n += 2

    # 갤러리 링크가 실제 파일을 가리키는지 확인한다
    base = os.path.join(DST, DIR_SCREEN)
    broken = [l for l in re.findall(r'data-open="([^"]*)"', g)
              if not os.path.isfile(os.path.normpath(os.path.join(base, l)))]
    print(f"내림: {DST}")
    print(f"  파일 {n}개 + 원본 패키지 한 벌 + rules 폴더")
    print(f"  갤러리 깨진 링크 {len(broken)}개" + (f" {broken}" if broken else " ✓"))
    print("  ※ '00 먼저 읽기.md' 와 '04/고해상도 에셋' 은 손으로 두는 것이라 이 스크립트가 건드리지 않는다.")


if __name__ == "__main__":
    main()
