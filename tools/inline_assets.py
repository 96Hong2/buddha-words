#!/usr/bin/env python3
"""design/ 의 HTML 이 참조하는 ../assets/*.webp 를 base64 로 박아 design-inline/ 에 복사한다.

클로드 디자인·Artifact 처럼 상대 경로 이미지를 못 받는 곳에 올릴 때 쓴다.
원본 design/ 은 손대지 않는다.
"""
import base64, mimetypes, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "design")
DST = os.path.join(ROOT, "design-inline")
EXTRA = [os.path.join(ROOT, "docs", "PRD v0.3 (수익화·라우터 개편·라이브목업).html"),
         os.path.join(ROOT, "docs", "PRD v0.2 (통합·라이브목업).html")]

ASSET_RE = re.compile(r'(src|href|url\()\s*=?\s*(["\']?)((?:\.\./|\./)?(?:design/)?assets/([^"\')\s]+))\2')

def data_uri(path):
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    with open(path, "rb") as f:
        return f"data:{mime};base64," + base64.b64encode(f.read()).decode()

def inline(html_path, assets_dir, out_path):
    text = open(html_path, encoding="utf-8").read()
    missing, count = [], 0
    def rep(m):
        nonlocal count
        name = m.group(4)
        p = os.path.join(assets_dir, name)
        if not os.path.isfile(p):
            missing.append(name); return m.group(0)
        count += 1
        q = m.group(2)
        return f"{m.group(1)}={q}{data_uri(p)}{q}" if m.group(1) != "url(" else f"url({q}{data_uri(p)}{q}"
    text = ASSET_RE.sub(rep, text)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    open(out_path, "w", encoding="utf-8").write(text)
    return count, missing

def main():
    if os.path.isdir(DST):
        shutil.rmtree(DST)
    assets = os.path.join(SRC, "assets")
    report = []
    for dp, _, files in os.walk(SRC):
        rel = os.path.relpath(dp, SRC)
        if rel.startswith("assets"):
            continue
        for fn in files:
            src = os.path.join(dp, fn)
            out = os.path.join(DST, rel, fn) if rel != "." else os.path.join(DST, fn)
            if fn.endswith(".html"):
                n, miss = inline(src, assets, out)
                report.append((os.path.relpath(out, ROOT), n, miss))
            else:
                os.makedirs(os.path.dirname(out), exist_ok=True); shutil.copy2(src, out)
    for extra in EXTRA:
        if os.path.isfile(extra):
            out = os.path.join(DST, "docs", os.path.basename(extra))
            n, miss = inline(extra, assets, out)
            report.append((os.path.relpath(out, ROOT), n, miss))
    for path, n, miss in report:
        size = os.path.getsize(os.path.join(ROOT, path)) // 1024
        flag = f"  ⚠ 없는 파일: {miss}" if miss else ""
        print(f"{path}: 이미지 {n}장 인라인, {size}KB{flag}")
    print(f"\n출력: {DST}")

if __name__ == "__main__":
    main()
