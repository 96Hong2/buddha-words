/**
 * 연잎.
 *
 * 광고 한 편을 **미리** 치러 두는 표다. 재는 것은 셋이다.
 *
 *   모으기   끝까지 본 사람에게만 한 장. 닫으면 안 준다
 *   쓰기     이어가기·간직하기에서 광고 대신 한 장. 실제로 줄어든다
 *   없을 때  가진 게 없으면 예전 그대로 광고 버튼 하나다
 *
 * 잔액은 기기(localStorage)에만 있다. 그래서 화면이 말하는 숫자와 저장된 숫자를
 * **둘 다** 본다. 화면만 보면 다시 열었을 때 0 으로 돌아가는 것을 못 잡는다.
 */

import { test, expect, type Page } from '../support/fixtures';
import {
  askOnce,
  dismissEntry,
  dismissNudge,
  leafBalance,
  revealBottomBar,
  withLeaves,
} from '../support/flow';
import { shot } from '../support/shots';
import type { MockScenario } from '../../src/shared/toss/mockBridge';

async function withBridge(page: Page, scenario: MockScenario) {
  await page.addInitScript((value) => {
    window.__buddhaBridge = { ...window.__buddhaBridge, ...value };
  }, scenario);
}

/** 홈에서 연잎 시트를 연다 */
async function openLeafSheet(page: Page) {
  await dismissEntry(page);
  await page.getByTestId('leaf-chip').click();
  await expect(page.getByTestId('leaf-sheet')).toBeVisible();
}

test('처음 온 사람은 연잎 한 장을 들고 시작한다', async ({ page }) => {
  // 기본 출발점은 「다 쓴 사람」이라 표를 통째로 지워야 첫 지급이 돈다
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('e2e.leaves', '1');
      localStorage.removeItem('buddha.leaves.v1');
    } catch {
      /* 지울 수 없으면 아래 단언이 알려 준다 */
    }
  });
  await page.goto('/');
  await dismissEntry(page);

  await expect(page.getByTestId('leaf-chip')).toHaveText('1');
  expect(await leafBalance(page)).toBe(1);
});

test('두 번째로 열어도 연잎을 또 주지 않는다', async ({ page }) => {
  await withLeaves(page, 1);
  await page.goto('/');
  await dismissEntry(page);
  await expect(page.getByTestId('leaf-chip')).toHaveText('1');

  // 다시 열기. 열 때마다 한 장씩 늘면 광고를 볼 이유가 통째로 사라진다
  await page.reload();
  await dismissEntry(page);
  await expect(page.getByTestId('leaf-chip')).toHaveText('1');
  expect(await leafBalance(page)).toBe(1);
});

test('연잎이 없어도 칩은 0 으로 서 있는다', async ({ page }) => {
  await page.goto('/');
  await dismissEntry(page);

  // 감추면 연잎이라는 것이 있다는 사실까지 사라진다. 그러면 이어가기 시트에서 처음
  // 만난 사람은 그게 무엇인지 모른 채 고르게 된다
  await expect(page.getByTestId('leaf-chip')).toHaveText('0');
  await shot(page, '11 연잎 - 잔액이 0 인 홈', { fullPage: true });
});

test('광고를 끝까지 보면 연잎이 한 장 는다', async ({ page }) => {
  await withBridge(page, { fullScreenAd: 'ok', fullScreenAdMs: 60 });
  await page.goto('/');
  await openLeafSheet(page);

  await expect(page.getByTestId('leaf-sheet-count')).toHaveText('0장');
  await shot(page, '11 연잎 - 모으기 시트');

  await page.getByTestId('leaf-watch').click();

  await expect(page.getByTestId('leaf-earned')).toBeVisible();
  await expect(page.getByTestId('leaf-sheet-count')).toHaveText('1장');
  expect(await leafBalance(page)).toBe(1);
  await shot(page, '11 연잎 - 한 장 모았다');

  // 시트는 닫히지 않는다. 여러 장 쌓으려는 사람이 칩을 매번 다시 누르지 않게 한다
  await expect(page.getByTestId('leaf-sheet')).toBeVisible();
  await page.getByTestId('leaf-watch').click();
  await expect(page.getByTestId('leaf-sheet-count')).toHaveText('2장');
  expect(await leafBalance(page)).toBe(2);
});

test('광고를 중간에 닫으면 연잎이 늘지 않고 그 이유를 적는다', async ({ page }) => {
  await withBridge(page, { fullScreenAd: 'dismissed', fullScreenAdMs: 60 });
  await page.goto('/');
  await openLeafSheet(page);

  await page.getByTestId('leaf-watch').click();

  // 끝까지 본 사람에게만 준다. 닫은 사람에게 주면 보상형 규칙에 어긋난다
  await expect(page.getByText('광고를 끝까지 봐야 연잎이 생겨요')).toBeVisible();
  await expect(page.getByTestId('leaf-sheet-count')).toHaveText('0장');
  await expect(page.getByTestId('leaf-earned')).toHaveCount(0);
  expect(await leafBalance(page)).toBe(0);
});

test('광고가 한 장도 안 오면 사람 탓으로 적지 않는다', async ({ page }) => {
  await withBridge(page, { fullScreenAd: 'noFill' });
  await page.goto('/');
  await openLeafSheet(page);

  await page.getByTestId('leaf-watch').click();

  // `noFill` 은 우리 쪽 사정이다. 「끝까지 봐야」는 사람이 닫았을 때만 하는 말이다
  await expect(page.getByText('광고를 끝까지 봐야 연잎이 생겨요')).toHaveCount(0);
  await expect(page.getByTestId('leaf-sheet-count')).toHaveText('0장');
  expect(await leafBalance(page)).toBe(0);
});

test('광고를 못 띄우는 기기에서는 왜 못 모으는지 적고 앱을 막지 않는다', async ({ page }) => {
  await withBridge(page, { fullScreenAd: 'unsupported' });
  await withLeaves(page, 2);
  await page.goto('/');
  await openLeafSheet(page);

  await expect(page.getByTestId('leaf-unavailable')).toBeVisible();
  await expect(page.getByTestId('leaf-watch')).toHaveCount(0);
  // 가진 것은 그대로 쓸 수 있어야 한다. 모을 길이 막혔다고 잔액까지 얼리지 않는다
  await expect(page.getByTestId('leaf-sheet-count')).toHaveText('2장');
  await shot(page, '11 연잎 - 모을 수 없는 기기');
});

test('연잎으로 이야기를 이어가면 광고가 뜨지 않고 한 장이 준다', async ({ page }) => {
  await withLeaves(page, 2);
  await page.goto('/');

  // 오늘 첫 이야기. 여기는 원래 광고가 없다
  await askOnce(page);
  await dismissNudge(page);
  await page.goBack();

  // 두 번째부터 문이 선다. 연잎이 있으므로 연잎 버튼이 주 버튼이다
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill('회사에서 실수를 했는데 계속 생각나요.');
  await page.getByTestId('submit').click();

  const sheet = page.getByTestId('continue-sheet');
  await expect(sheet).toBeVisible();
  const useLeaf = page.getByTestId('leaf-spend-continue');
  await expect(useLeaf).toBeVisible();
  await expect(useLeaf).toContainText('1장 남아요');
  await shot(page, '11 연잎 - 이어가기에서 연잎이 주 버튼이다');

  await useLeaf.click();

  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  expect(await leafBalance(page)).toBe(1);
});

test('마지막 한 장을 쓸 때는 숫자 대신 마지막이라고 말한다', async ({ page }) => {
  await withLeaves(page, 1);
  await page.goto('/');
  await askOnce(page);
  await dismissNudge(page);
  await page.goBack();

  await dismissEntry(page);
  await page.getByTestId('concern-field').fill('요즘 잠을 잘 못 자요.');
  await page.getByTestId('submit').click();

  // 「0장 남아요」보다 먼저 읽힌다. 마지막인 줄 모르고 썼다가 다음에 광고를 만나면
  // 그때서야 알게 된다
  await expect(page.getByTestId('leaf-spend-continue')).toContainText('마지막 장');
});

test('연잎이 없으면 이어가기는 예전처럼 광고 버튼 하나다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);
  await dismissNudge(page);
  await page.goBack();

  await dismissEntry(page);
  await page.getByTestId('concern-field').fill('부모님과 자꾸 부딪혀요.');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('continue-sheet')).toBeVisible();
  await expect(page.getByTestId('leaf-spend-continue')).toHaveCount(0);
  await expect(page.getByTestId('continue-watch')).toBeVisible();
});

test('연잎으로 말씀을 간직하면 광고가 뜨지 않고 한 장이 준다', async ({ page }) => {
  await withLeaves(page, 1);
  await page.goto('/');
  await askOnce(page);
  await dismissNudge(page);
  // 간직 버튼은 답변 맨 아래 바에 있다. 끝까지 내려가야 화면에 든다
  await revealBottomBar(page);

  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('save-gate')).toBeVisible();

  const useLeaf = page.getByTestId('leaf-spend-save');
  await expect(useLeaf).toBeVisible();
  await expect(useLeaf).toContainText('마지막 장');
  await shot(page, '11 연잎 - 간직하기에서 연잎이 주 버튼이다');

  await useLeaf.click();

  await expect(page.getByTestId('save-done')).toBeVisible();
  expect(await leafBalance(page)).toBe(0);
});

test('연잎을 다 쓰고 나면 다음 간직하기는 광고로 돌아간다', async ({ page }) => {
  await withLeaves(page, 1);
  await withBridge(page, { fullScreenAd: 'ok', fullScreenAdMs: 60 });
  await page.goto('/');
  await askOnce(page);
  await dismissNudge(page);
  await revealBottomBar(page);

  await page.getByTestId('save-button').click();
  await page.getByTestId('leaf-spend-save').click();
  await expect(page.getByTestId('save-done')).toBeVisible();
  expect(await leafBalance(page)).toBe(0);

  // 새 이야기를 하나 더. 이번에는 연잎이 없으니 간직 시트가 광고만 세운다
  await page.getByTestId('save-done-stay').click();
  await page.goBack();
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill('새로 맡은 일이 버거워요.');
  await page.getByTestId('submit').click();
  const gate = page.getByTestId('continue-sheet');
  if (await gate.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByTestId('continue-watch').click();
  }
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  await dismissNudge(page);
  await revealBottomBar(page);

  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('save-gate')).toBeVisible();
  await expect(page.getByTestId('leaf-spend-save')).toHaveCount(0);
  await expect(page.getByTestId('save-gate-watch')).toBeVisible();
});
