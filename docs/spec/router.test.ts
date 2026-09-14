/**
 * 라우터 픽스처 실행기. 의존성 없음.
 *   node --experimental-strip-types docs/spec/router.test.ts
 * 실패하면 종료 코드 1. 기대값을 실제 출력에서 베끼지 않는다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { routeByRules, merge, needsClassifier, depthIndicator, escalateToSolace, type RouteDecision, type ClassifierVerdict } from './router.ts';

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

// 인디케이터 세 단계가 실제로 갈리는지 한 번만 본다
const ind = ['', '회사 가기 싫어요', '너무 힘들어요\n잠도 안 와요\n어떡하죠 정말 모르겠어요 매일 이래요'].map(depthIndicator);
console.log('indicator:', ind.map((i) => `${i.dots}·${i.label}`).join(' | '));
if (!(ind[0].dots === 1 && ind[1].dots === 2 && ind[2].dots === 3)) { console.error('인디케이터 단계가 갈리지 않는다'); failed++; }

process.exit(failed ? 1 : 0);
