#!/usr/bin/env node
/**
 * 콘솔에 올릴 번들 안을 직접 훑는다.
 *
 * 왜 여기냐면, e2e 는 `npm run dev` 로 띄운 vite 개발 서버를 본다. `import.meta.env.DEV` 가
 * true 이고 번들링·트리셰이킹이 안 걸린 판이라 「운영 번들에 무엇이 실렸나」는 거기서 볼 수
 * 없는 종류의 사실이다. 화면 동작이 아니라 파일 내용이 기준인 요구사항은 이 자리에 둔다.
 *
 * 1호 제품이 테스트 광고 그룹 id 하나 때문에 콘솔 검토에서 반려됐다(2026-09-16).
 * 그 판의 코드는 운영에서 그 가지를 타지도 않았다. 검토가 보는 것은 동작이 아니라 문자열이다.
 *
 * 쓰는 법: node tools/check_bundle.mjs [번들 디렉터리]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'frontend/dist');

/** dist 아래 텍스트 산출물을 전부 모은다. 청크가 갈릴 수 있어 한 파일만 보지 않는다 */
function textFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...textFiles(path));
      continue;
    }
    if (/\.(js|mjs|css|html|json|map)$/.test(name)) out.push(path);
  }
  return out;
}

let files;
try {
  files = textFiles(root);
} catch {
  console.error(`✗ 번들 디렉터리를 열 수 없다: ${root}`);
  console.error('  먼저 npm run build:web 으로 만든다.');
  process.exit(1);
}

if (files.length === 0) {
  console.error(`✗ ${root} 에 훑을 파일이 없다.`);
  process.exit(1);
}

const blob = files.map((f) => readFileSync(f, 'utf8')).join('\n');
const problems = [];

// ── 1. 테스트 광고 그룹 id ────────────────────────────────────────────────
// 운영에서 안 쓰이는 값이어도 번들에 남아 있으면 반려된다.
const testAds = [...new Set(blob.match(/ait-ad-test-[a-z-]+/g) ?? [])];
if (testAds.length > 0) {
  problems.push(
    `테스트 광고 그룹 id 가 번들에 들었다: ${testAds.join(', ')}\n` +
      '    콘솔 검토가 이걸로 반려한다(1호 제품 2026-09-16 실제 반려).\n' +
      "    실행할 때 가르지 말고 `import.meta.env.DEV ? '...' : null` 로 빌드 때 가른다.",
  );
}

// ── 2. 스텁 백엔드 ────────────────────────────────────────────────────────
// 스텁은 경전 문장과 풀이를 앱 안에서 지어낸다. 심사 번들에 그게 있으면 안 된다.
if (/__buddhaStub/.test(blob)) {
  problems.push(
    '스텁 백엔드가 번들에 실렸다(`__buddhaStub`).\n' +
      '    운영 빌드에는 지어낸 경전 문장이 아예 없어야 한다.',
  );
}

// ── 3. 백엔드 주소 ────────────────────────────────────────────────────────
// 주소가 없으면 실기기에서 모든 호출이 설정 오류로 죽는다(운영 번들은 https 만 받는다).
const apiUrls = [...new Set(blob.match(/https:\/\/[a-z0-9.-]*run\.app/g) ?? [])];
if (apiUrls.length === 0) {
  problems.push(
    '백엔드 주소가 번들에 없다.\n' +
      "    VITE_API_MODE=http VITE_API_BASE_URL='https://...' 를 주고 다시 빌드한다.",
  );
}

// ── 4. 준 값이 실제로 박혔나 ──────────────────────────────────────────────
// 빌드가 성공했다고 값이 들어간 것은 아니다. 환경변수 이름을 틀리면 조용히 빠진다.
const AD_GROUP_VARS = [
  'VITE_AD_GROUP_DEFAULT',
  'VITE_AD_GROUP_EXTENSION',
  'VITE_AD_GROUP_CONTINUE',
  'VITE_AD_GROUP_SAVE',
];

for (const name of AD_GROUP_VARS) {
  const given = process.env[name]?.trim();
  if (!given) continue;
  if (!blob.includes(given)) {
    problems.push(
      `${name} 를 줬는데 번들에 없다.\n` +
        '    vite 는 빌드 시점 환경변수만 갈아 끼운다. 빌드 명령 앞에 붙였는지 본다.',
    );
  }
}

const adsGiven = AD_GROUP_VARS.filter((name) => process.env[name]?.trim());

// 이어가기를 전면형으로 돌리는 판에서만 전용 그룹이 있어야 한다. 그 판에서 값을 빠뜨리면
// 두 번째 이야기부터 광고 없이 조용히 지나간다. 공용 그룹은 보상형이라 대신 쓸 수 없다.
const continueKind = process.env.VITE_AD_CONTINUE_KIND?.trim() === 'interstitial'
  ? 'interstitial'
  : 'rewarded';

if (continueKind === 'interstitial' && !process.env.VITE_AD_GROUP_CONTINUE?.trim()) {
  problems.push(
    'VITE_AD_CONTINUE_KIND=interstitial 인데 VITE_AD_GROUP_CONTINUE 가 없다.\n' +
      '    전면형으로 돌리려면 전면형 그룹 id 가 있어야 한다. 공용 그룹은 보상형이라 못 쓴다.',
  );
}

if (problems.length > 0) {
  console.error(`✗ 번들 검사 실패 (${root})\n`);
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}

console.log(`✓ 번들 검사 통과 (${files.length}개 파일, ${root})`);
console.log(`  백엔드 주소: ${apiUrls.join(', ')}`);
console.log(
  adsGiven.length > 0
    ? `  광고 그룹 id: 들어 있다 (${adsGiven.join(', ')})`
    : '  광고 그룹 id: 없다. 이 번들에서는 보상형 광고 자리가 광고 없이 지나간다',
);
console.log(
  continueKind === 'interstitial'
    ? '  이어가기: 전면형. 전용 그룹 id 가 들어 있다'
    : '  이어가기: 보상형(30초, 끝까지 봐야 이어감). 공용 그룹을 쓴다',
);
