/**
 * 라우터 픽스처 실행기. 의존성 없음.
 *   node --experimental-strip-types docs/spec/router.test.ts
 * 실패하면 종료 코드 1. 기대값을 실제 출력에서 베끼지 않는다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { routeByRules, merge, needsClassifier, depthIndicator, escalateToSolace, DEPTH_STEPS, type RouteDecision, type ClassifierVerdict } from './router.ts';

type Case = {
  name: string;
  input: string;
  verdict?: ClassifierVerdict | null;
  expect: { route?: string; rules?: string; final?: string; stage?: string; useRag?: boolean; modelTier?: string; floor?: string; flagsInclude?: string[]; crisisLevel?: string; solace?: 'allowed' | 'blocked'; solaceTier?: string };
  note?: string;
};

const here = dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(readFileSync(join(here, 'router.fixtures.json'), 'utf8')) as { cases: Case[] };

let failed = 0;
const rows: string[] = [];
for (const c of cases) {
  const rules = routeByRules(c.input);
  const final: RouteDecision = c.verdict === undefined ? rules : merge(rules, c.verdict);
  const problems: string[] = [];
  const e = c.expect;
  if (e.route && rules.route !== e.route) problems.push(`route ${rules.route} ≠ ${e.route}`);
  if (e.route && needsClassifier(rules)) problems.push(`rules 만으로 확정돼야 하는데 classifier 가 필요하다 (confidence ${rules.confidence})`);
  if (e.rules && rules.route !== e.rules) problems.push(`rules ${rules.route} ≠ ${e.rules}`);
  if (e.final && final.route !== e.final) problems.push(`final ${final.route} ≠ ${e.final}`);
  if (e.stage && final.stage !== e.stage) problems.push(`stage ${final.stage} ≠ ${e.stage}`);
  if (e.useRag !== undefined && final.useRag !== e.useRag) problems.push(`useRag ${final.useRag} ≠ ${e.useRag}`);
  if (e.modelTier && final.modelTier !== e.modelTier) problems.push(`modelTier ${final.modelTier} ≠ ${e.modelTier}`);
  if (e.floor && rules.floor !== e.floor) problems.push(`floor ${rules.floor} ≠ ${e.floor}`);
  for (const f of e.flagsInclude ?? []) if (!(final.flags as Record<string, boolean>)[f]) problems.push(`flag ${f} 가 서지 않았다`);
  if (e.crisisLevel && final.crisisLevel !== e.crisisLevel) problems.push(`crisisLevel ${final.crisisLevel} ≠ ${e.crisisLevel}`);
  if (e.solace) {
    const up = escalateToSolace(final);
    if (e.solace === 'blocked' && up) problems.push('위로 답변으로 넘어가면 안 되는 글이 통과했다');
    if (e.solace === 'allowed' && !up) problems.push('위로 답변으로 넘어가야 하는 글이 막혔다');
    if (up && e.solaceTier && up.modelTier !== e.solaceTier) problems.push(`solace tier ${up.modelTier} ≠ ${e.solaceTier}`);
    if (up && up.route !== 'solace') problems.push(`승격 결과가 solace 가 아니다 (${up.route})`);
  }
  const mark = problems.length ? '✗' : '✓';
  if (problems.length) failed++;
  rows.push(`${mark} ${c.name.padEnd(28)} rules=${rules.route}(${rules.confidence}) final=${final.route}/${final.stage} tier=${final.modelTier} rag=${final.useRag} chars=${rules.counts.chars} lines=${rules.counts.lines}${problems.length ? '\n    ' + problems.join('; ') : ''}`);
}
console.log(rows.join('\n'));
console.log(`\n${cases.length - failed}/${cases.length} 통과`);

// 인디케이터. 점은 0 → 1 → 2 → 3 으로 한 칸씩 차오른다. 건너뛰는 칸이 있으면 실패다
const 가 = (n: number) => '가'.repeat(n);
const indCases: { name: string; input: string; dots: number }[] = [
  { name: '빈 입력',            input: '',                                              dots: 0 },
  { name: '한 글자',            input: 가(1),                                           dots: 1 },
  { name: '한 칸 마지막 글자',  input: 가(DEPTH_STEPS.two - 1),                         dots: 1 },
  { name: '두 칸 첫 글자',      input: 가(DEPTH_STEPS.two),                             dots: 2 },
  { name: '두 칸 마지막 글자',  input: 가(DEPTH_STEPS.three - 1),                       dots: 2 },
  { name: '세 칸 첫 글자',      input: 가(DEPTH_STEPS.three),                           dots: 3 },
  { name: '세 줄 · 두 칸 분량', input: [가(9), 가(9), 가(9)].join('\n'),                dots: 2 },
  { name: '세 줄 · 한 칸 분량', input: [가(8), 가(8), 가(8)].join('\n'),                dots: 1 },
  // 줄을 나눠 쓴 사람이 세 칸째를 받는 자리. 그 한 글자 앞은 아직 두 칸이어야 한다
  { name: '세 줄 · 세 칸 직전', input: [가(13), 가(13), 가(13)].join('\n'),             dots: 2 },
  { name: '세 줄 · 세 칸 첫 글자', input: [가(14), 가(13), 가(13)].join('\n'),          dots: 3 },
  { name: '「응」 세 줄',       input: ['응', '응', '응'].join('\n'),                    dots: 1 },
  { name: '「응」 여덟 줄',     input: Array(8).fill('응').join('\n'),                   dots: 1 },
  // 시안 s1-home 의 네 상태를 문장 그대로 옮긴 것
  { name: '시안 ① 빈 상태',    input: '',                                              dots: 0 },
  { name: '시안 ② 짧은 고민',  input: '오늘 친구랑 크게 다퉜어요. 먼저 연락해야 할지 모르겠어요', dots: 1 },
  { name: '시안 ④ 초안 복구',  input: '엄마랑 또 같은 일로 부딪혔어요. 나쁜 뜻이 아닌 걸 아는데도 그 말투만 들으면 자꾸 날이 서요', dots: 2 },
  { name: '시안 ③ 충분히 씀',  input: '요즘 회사에서 같은 실수를 자꾸 반복해요. 어제는 보고서 숫자를 잘못 적어서 지적을 받았는데, 그 자리에선 괜찮은 척했지만 집에 오는 내내 그 장면만 떠올랐어요. 다들 나를 일 못하는 사람으로 볼까 봐 무서워요. 이런 마음이 든 지 벌써 몇 달째예요', dots: 3 },
];
const indRows: string[] = [];
const seen = new Set<number>();
for (const c of indCases) {
  const got = depthIndicator(c.input);
  const ok = got.dots === c.dots;
  if (!ok) failed++;
  seen.add(got.dots);
  indRows.push(`${ok ? '✓' : '✗'} ${c.name.padEnd(16)} dots=${got.dots}${ok ? '' : ` ≠ ${c.dots}`} ${got.label}`);
}
console.log('\n인디케이터\n' + indRows.join('\n'));
for (const step of [0, 1, 2, 3]) {
  if (!seen.has(step)) { console.error(`${step}칸이 되는 입력이 하나도 없다`); failed++; }
}

// 케이스 몇 개로는 건너뛰는 자리를 놓친다. 줄 수를 고정한 채 한 글자씩 늘려 전 구간을 훑는다.
// 한 글자 더 썼는데 점이 두 칸 이상 차오르거나 거꾸로 줄어들면 실패다.
const sweepRows: string[] = [];
for (const 줄수 of [1, 2, 3, 5]) {
  let prev = 0;
  const jumps: string[] = [];
  const marks: string[] = [];
  for (let n = 줄수; n <= DEPTH_STEPS.three + 20; n += 1) {
    const 몫 = Math.floor(n / 줄수);
    const 나머지 = n % 줄수;
    const text = Array.from({ length: 줄수 }, (_, i) => 가(몫 + (i < 나머지 ? 1 : 0))).join('\n');
    const dots = depthIndicator(text).dots;
    if (dots !== prev) {
      if (dots - prev !== 1) jumps.push(`${n}자에서 ${prev}칸 → ${dots}칸`);
      else marks.push(`${n}자→${dots}칸`);
      prev = dots;
    }
  }
  if (jumps.length) { failed++; sweepRows.push(`✗ ${줄수}줄  ${jumps.join(', ')}`); }
  else sweepRows.push(`✓ ${줄수}줄  ${marks.join(' · ')}`);
}
console.log('\n한 글자씩 훑기 (한 칸씩만 차올라야 한다)\n' + sweepRows.join('\n'));

process.exit(failed ? 1 : 0);
