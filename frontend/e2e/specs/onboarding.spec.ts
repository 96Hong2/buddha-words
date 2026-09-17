/**
 * 첫 실행 온보딩 증명.
 *
 * 온보딩의 목적은 사용법을 가르치는 것이 아니라 **「여기에 내 고민을 써도 되겠구나」**를
 * 알게 하는 것이다. 그래서 여기서 재는 것도 「두 장 안에 입력창까지 닿는가」 하나다.
 *
 * 이 화면을 더한 대가로 기존 흐름이 한 걸음 길어졌다. 그 걸음이 **건너뛸 수 있는지**와
 * **두 번 다시 안 뜨는지**를 같이 잰다. 못 건너뛰는 첫 화면은 다크패턴이다.
 */

import { test, expect, type Page } from '../support/fixtures';

interface Recorded {
  name: string;
  params: Record<string, unknown>;
}

async function logs(page: Page): Promise<Recorded[]> {
  return page.evaluate(() => (window.__pocketLogs ?? []) as unknown as Recorded[]);
}

test('첫 실행에 두 장을 넘기면 바로 입력 화면이다', async ({ page, firstRun }) => {
  await firstRun();
  await page.goto('/');

  const ob = page.getByTestId('onboarding');
  await expect(ob).toBeVisible();
  await expect(page.getByTestId('onboarding-step-1')).toBeVisible();

  await page.getByTestId('onboarding-next').click();
  await expect(page.getByTestId('onboarding-step-2')).toBeVisible();

  await page.getByTestId('onboarding-next').click();
  await expect(ob).toBeHidden();
  // 세 장째가 없다. 두 장 뒤는 곧바로 입력이다
  await expect(page.getByTestId('concern-field')).toBeVisible();

  const names = (await logs(page)).map((row) => row.name);
  expect(names).toContain('onboarding_view');
  expect(names).toContain('onboarding_complete');
  // 앱을 연 사실이 온보딩보다 먼저 와야 첫 실행 이탈을 셀 수 있다
  expect(names.indexOf('app_open')).toBeLessThan(names.indexOf('onboarding_view'));
  // 각 장을 한 번씩만 센다
  const views = (await logs(page)).filter((row) => row.name === 'onboarding_view');
  expect(new Set(views.map((row) => String(row.params.step))).size).toBe(views.length);
});

test('첫 장에서도 건너뛸 수 있다', async ({ page, firstRun }) => {
  await firstRun();
  await page.goto('/');

  await expect(page.getByTestId('onboarding')).toBeVisible();
  await page.getByTestId('onboarding-skip').click();

  await expect(page.getByTestId('onboarding')).toBeHidden();
  await expect(page.getByTestId('concern-field')).toBeVisible();

  const names = (await logs(page)).map((row) => row.name);
  expect(names).toContain('onboarding_skip');
  // 건너뛴 것을 완주로 세지 않는다. 완주율이 부풀면 이탈을 못 본다
  expect(names).not.toContain('onboarding_complete');
});

test('한 번 본 사람에게는 다시 뜨지 않는다', async ({ page, firstRun }) => {
  await firstRun();
  await page.goto('/');
  await page.getByTestId('onboarding-skip').click();
  await expect(page.getByTestId('onboarding')).toBeHidden();

  await page.reload();
  await expect(page.getByTestId('concern-field')).toBeVisible();
  await expect(page.getByTestId('onboarding')).toBeHidden();
});

test('온보딩을 본 실행에서는 오늘의 한마디 카드가 겹쳐 뜨지 않는다', async ({ page, firstRun }) => {
  await firstRun();
  await page.goto('/');

  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await expect(page.getByTestId('onboarding')).toBeHidden();

  // 덮개 두 장으로 앱을 시작하지 않는다. 오늘의 한마디는 홈 카드 자리에 그대로 있다
  await expect(page.getByTestId('concern-field')).toBeVisible();
  await expect(page.getByTestId('entry-card')).toBeHidden();
  await expect(page.getByTestId('daily-card')).toBeVisible();
});
