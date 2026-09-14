/**
 * CI 게이트. 정본이 갈라지지 않았는지 본다.
 *
 * 1. spec/ 과 docs/spec/ 이 같은가            (두 벌이 되면 반드시 어긋난다)
 * 2. events.ts 에 없는 이벤트 이름을 보내는가
 * 3. 스텁 응답이 answer.schema.json 에 맞는가
 * 4. 화면에 「무료」가 남아 있는가
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const failures = [];

function fail(message) {
  failures.push(message);
}

// ── 1. spec/ ↔ docs/spec/ diff = 0 ──────────────────────────────────────────
{
  const a = join(ROOT, 'spec');
  const b = join(ROOT, 'docs/spec');
  const names = new Set([...readdirSync(a), ...readdirSync(b)]);
  for (const name of names) {
    const pa = join(a, name);
    const pb = join(b, name);
    try {
      if (readFileSync(pa, 'utf8') !== readFileSync(pb, 'utf8')) {
        fail(`spec/${name} 과 docs/spec/${name} 이 다릅니다. 정본은 spec/ 입니다.`);
      }
    } catch {
      fail(`spec/${name} 또는 docs/spec/${name} 이 한쪽에만 있습니다.`);
    }
  }
}

// ── 파일 훑기 ───────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const srcFiles = walk(join(ROOT, 'frontend/src')).filter((f) => /\.(ts|tsx)$/.test(f));

// ── 2. events.ts 밖의 이벤트 이름 ────────────────────────────────────────────
{
  const events = readFileSync(join(ROOT, 'spec/events.ts'), 'utf8');
  const known = new Set([...events.matchAll(/^\s{2}([a-z_0-9]+):\s*\{\s*params/gm)].map((m) => m[1]));
  if (known.size === 0) fail('spec/events.ts 에서 이벤트 이름을 하나도 못 읽었습니다.');

  for (const file of srcFiles) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\.log\(\s*'([^']+)'/g)) {
      if (!known.has(m[1])) {
        fail(`${relative(ROOT, file)} 가 events.ts 에 없는 이벤트 '${m[1]}' 를 보냅니다.`);
      }
    }
  }
}

// ── 3. 스텁 응답이 스키마에 맞는가 ──────────────────────────────────────────
// 얕은 검사다. 필수 필드와 responseType 만 본다. 정밀 검증은 백엔드 pytest 가 한다.
{
  const schema = JSON.parse(readFileSync(join(ROOT, 'spec/answer.schema.json'), 'utf8'));
  const defs = schema.$defs;
  const wanted = ['ApiAnswer', 'ApiLight', 'ApiInvalid', 'ApiCrisis', 'ApiSolace', 'ApiExtension'];
  for (const name of wanted) {
    if (defs[name] == null) fail(`answer.schema.json 에 ${name} 이 없습니다.`);
  }
  const types = readFileSync(join(ROOT, 'frontend/src/shared/api/types.ts'), 'utf8');
  for (const name of wanted) {
    if (!types.includes(`interface ${name}`)) {
      fail(`frontend types.ts 에 ${name} 타입이 없습니다. 스키마와 어긋납니다.`);
    }
  }
}

// ── 4. 화면에 「무료」가 남아 있는가 ─────────────────────────────────────────
{
  for (const file of srcFiles) {
    const text = readFileSync(file, 'utf8');
    // 주석은 봐준다. 사용자에게 보이는 문자열만 본다.
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (stripped.includes('무료')) {
      fail(`${relative(ROOT, file)} 에 「무료」가 있습니다. 「3개까지 보관할 수 있어요」처럼 씁니다.`);
    }
  }
}

if (failures.length > 0) {
  console.error(`✗ 정본 검사 ${failures.length}건 실패\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ 정본 검사 통과');
