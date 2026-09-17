/**
 * CX 계측 증명.
 *
 * 세 가지를 본다. 셋 다 눈으로는 못 보고 코드 리뷰로도 놓치기 쉬운 것이다.
 *
 * 1. **고민 원문이 로그에 새지 않는가.** 이 앱에서 가장 크게 다칠 수 있는 자리다.
 * 2. **깔때기가 순서대로 찍히는가.** 한 칸이라도 빠지면 그 구간을 영영 못 본다.
 * 3. **같은 사실을 두 번 세지 않는가.** 스크롤·리렌더마다 다시 나가면 수치가 부풀어
 *    「70% 읽었다」가 사람 수가 아니라 렌더 횟수가 된다.
 */

import { test, expect, type Page } from '../support/fixtures';
import { revealBottomBar } from '../support/flow';

/** 원문 대조에 쓴다. 이 문장이 로그 어딘가에 통째로 들어가면 실패다 */
const CONCERN = [
  '요즘 팀장님이 제 의견을 계속 무시하시는 것 같아 자꾸 위축돼요.',
  '회의에서 말을 꺼내기가 무서워졌고, 집에 와서도 그 장면이 계속 떠올라요.',
  '이대로 버티는 게 맞는지 모르겠어요.',
].join('\n');

/** 로그에 절대 나오면 안 되는 조각들 */
const SECRETS = ['팀장님', '위축', '회의에서 말을', '버티는 게 맞는지'];

interface Recorded {
  kind: string;
  name: string;
  params: Record<string, unknown>;
}

async function logs(page: Page): Promise<Recorded[]> {
  return page.evaluate(() => (window.__pocketLogs ?? []) as unknown as Recorded[]);
}

async function names(page: Page): Promise<string[]> {
  return (await logs(page)).map((row) => row.name);
}

async function dismissEntry(page: Page) {
  const card = page.getByTestId('entry-card');
  await card.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  if (await card.isVisible().catch(() => false)) {
    await page.getByTestId('entry-card-cta').click();
    await expect(card).toBeHidden();
  }
}

/** 온보딩이 떠 있으면 지나간다. 다른 검사는 온보딩을 재지 않는다 */
async function passOnboarding(page: Page) {
  const ob = page.getByTestId('onboarding');
  if (!(await ob.isVisible().catch(() => false))) return;
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await expect(ob).toBeHidden();
}

async function answerOnce(page: Page) {
  await passOnboarding(page);
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(CONCERN);
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 30_000 });
}

// ────────────────────────────────────────────────────────────────────────────
// 1. 개인정보. 이 검사가 깨지면 다른 것을 다 미루고 이것부터 고친다
// ────────────────────────────────────────────────────────────────────────────

test('고민 원문이 행동 로그에 실리지 않는다', async ({ page }) => {
  await page.goto('/');
  await answerOnce(page);

  const rows = await logs(page);
  expect(rows.length, '로그가 하나도 안 찍혔으면 이 검사가 아무것도 막지 못한다').toBeGreaterThan(5);

  const dump = JSON.stringify(rows);
  for (const piece of SECRETS) {
    expect(dump, `고민 원문 조각이 로그에 실렸다: ${piece}`).not.toContain(piece);
  }

  // 값 하나하나가 짧은지도 본다. 긴 문자열이 있으면 본문이 통째로 실린 것이다
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.params)) {
      if (typeof value !== 'string') continue;
      // variants 는 JSON 이라 길 수 있다. 그 밖의 값은 id·열거값·구간뿐이라 짧다
      if (key === 'variants') continue;
      expect(value.length, `${row.name}.${key} 가 너무 길다. 본문이 실렸는지 본다`).toBeLessThan(80);
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 2. 깔때기. 한 칸이라도 빠지면 그 구간을 못 본다
// ────────────────────────────────────────────────────────────────────────────

test('열고 쓰고 보내고 답을 받기까지가 순서대로 찍힌다', async ({ page }) => {
  await page.goto('/');
  await answerOnce(page);

  const order = await names(page);
  const at = (name: string) => order.indexOf(name);

  for (const name of [
    'app_open',
    'session_start',
    'concern_input_start',
    'concern_input_milestone',
    'concern_submit',
    'answer_generated',
  ]) {
    expect(at(name), `${name} 가 안 찍혔다`).toBeGreaterThanOrEqual(0);
  }

  // 앱을 연 사실이 입력보다 먼저 와야 첫 실행 이탈을 셀 수 있다
  expect(at('app_open')).toBeLessThan(at('concern_input_start'));
  expect(at('concern_input_start')).toBeLessThan(at('concern_submit'));
  expect(at('concern_submit')).toBeLessThan(at('answer_generated'));
});

test('앱을 연 로그에 재방문을 셀 수 있는 값이 실린다', async ({ page }) => {
  await page.goto('/');
  await passOnboarding(page);
  await dismissEntry(page);

  const open = (await logs(page)).find((row) => row.name === 'app_open');
  expect(open, 'app_open 이 없다').toBeDefined();
  // 이 넷이 없으면 D1·D7 을 코호트 질의 없이 셀 수 없다. KPI 가 이 값을 가리킨다
  for (const key of [
    'is_first_open',
    'open_bucket',
    'days_since_first_open',
    'days_since_last_open',
  ]) {
    expect(open?.params, `app_open 에 ${key} 가 없다`).toHaveProperty(key);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 3. 중복. 같은 사실을 두 번 세지 않는다
// ────────────────────────────────────────────────────────────────────────────

test('같은 블록을 여러 번 지나가도 도달은 한 번만 센다', async ({ page }) => {
  await page.goto('/');
  await answerOnce(page);

  // 위아래로 두 번 훑는다. 옵저버가 매번 다시 세면 여기서 드러난다
  for (let turn = 0; turn < 2; turn += 1) {
    await page.mouse.wheel(0, 4000);
    await expect(page.getByTestId('answer')).toBeVisible();
    await page.mouse.wheel(0, -4000);
    await expect(page.getByTestId('answer')).toBeVisible();
  }

  const rows = await logs(page);
  const sections = rows.filter((row) => row.name === 'answer_section_view');
  expect(sections.length, '블록 도달이 하나도 안 찍혔다').toBeGreaterThan(0);

  const seen = sections.map((row) => `${String(row.params.answer_id)}:${String(row.params.section)}`);
  expect(new Set(seen).size, '같은 블록이 두 번 세어졌다').toBe(seen.length);

  // 읽은 비율도 마찬가지다
  const reads = rows.filter((row) => row.name.startsWith('answer_read_')).map((row) => row.name);
  expect(new Set(reads).size, '같은 완독 표시가 두 번 세어졌다').toBe(reads.length);
});

// ────────────────────────────────────────────────────────────────────────────
// 4. 만족도. 버튼이 있는데 아무것도 안 남기던 자리였다
// ────────────────────────────────────────────────────────────────────────────

test('도움이 됐는지 누르면 그 값이 남고 한 번만 센다', async ({ page }) => {
  await page.goto('/');
  await answerOnce(page);

  const up = page.getByTestId('feedback-up');
  await up.scrollIntoViewIfNeeded();
  await up.click();
  await expect(page.getByTestId('feedback-thanks')).toBeVisible();

  const rows = (await logs(page)).filter((row) => row.name === 'answer_feedback');
  expect(rows.length, '만족도가 한 번만 찍혀야 한다').toBe(1);
  expect(rows[0].params.value).toBe('positive');
  // 어느 라우팅의 답이 더 나은지 가르려면 이 둘이 함께 있어야 한다
  expect(rows[0].params).toHaveProperty('route');
  expect(rows[0].params).toHaveProperty('answer_length_bucket');

  // 두 번 눌러도 늘지 않는다
  await page.getByTestId('feedback-down').click({ force: true }).catch(() => {});
  const after = (await logs(page)).filter((row) => row.name === 'answer_feedback');
  expect(after.length).toBe(1);
});

// ────────────────────────────────────────────────────────────────────────────
// 5. 경전 관심도. 이 앱이 「AI 상담」인지 「경전을 읽는 자리」인지 가르는 신호다
// ────────────────────────────────────────────────────────────────────────────

test('원문을 펼치면 경전 관심도가 남는다', async ({ page }) => {
  await page.goto('/');
  await answerOnce(page);

  const open = page.getByRole('button', { name: '원문 보기' }).first();
  await open.scrollIntoViewIfNeeded();
  await open.click();

  const rows = (await logs(page)).filter((row) => row.name === 'scripture_expand');
  expect(rows.length, '원문을 펼친 사실이 안 남았다').toBe(1);
  expect(rows[0].params).toHaveProperty('scripture_id');
});

// ────────────────────────────────────────────────────────────────────────────
// 6. 이번 판에서 늘어난 자리
//
// 간직과 공유는 이 앱이 사람에게 값을 줬는지 재는 두 신호다(코호트 healthy_activated).
// 그 둘의 배선이 바뀌었으므로 실제로 찍히는지 여기서 본다.
// ────────────────────────────────────────────────────────────────────────────

test('간직은 누른 것과 담긴 것을 갈라 남긴다', async ({ page }) => {
  await page.goto('/');
  await answerOnce(page);

  await revealBottomBar(page);
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('save-gate')).toBeVisible();

  // 시트를 본 것까지가 여기다. 아직 담기지 않았다
  let seen = await names(page);
  expect(seen).toContain('save_click');
  expect(seen).toContain('save_gate_view');
  expect(seen, '광고를 보기도 전에 담겼다고 적혔다').not.toContain('save_complete');

  await page.getByTestId('save-gate-watch').click();
  await expect(page.getByText('보관함에 간직했어요. 앱을 닫아도 남아요')).toBeVisible();

  seen = await names(page);
  expect(seen).toContain('save_gate_accept');
  expect(seen).toContain('save_complete');

  // 어느 길로 담겼는지 적는다. 광고가 얼마나 떨구는지는 이 값으로 가른다
  const done = (await logs(page)).find((row) => row.name === 'save_complete');
  expect(done?.params.gate).toBe('ad');
});

test('공유는 무엇을 보내기로 골랐는지 남긴다', async ({ page }) => {
  await page.goto('/');
  await answerOnce(page);

  await revealBottomBar(page);
  await page.getByTestId('share-button').click();
  await expect(page.getByTestId('share-sheet')).toBeVisible();

  await page.getByTestId('share-scope-full').click();
  const picked = (await logs(page)).find((row) => row.name === 'share_scope_select');
  expect(picked?.params.scope).toBe('full');

  await page.getByTestId('share-link').click();
  const done = (await logs(page)).find((row) => row.name === 'share_complete');
  expect(done?.params.method).toBe('system');
  expect(done?.params.card_kind).toBe('full');

  // 여기서도 고민 원문은 어느 값에도 없다
  const dump = JSON.stringify(await logs(page));
  for (const piece of SECRETS) {
    expect(dump, `고민 원문 조각이 로그에 실렸다: ${piece}`).not.toContain(piece);
  }
});
