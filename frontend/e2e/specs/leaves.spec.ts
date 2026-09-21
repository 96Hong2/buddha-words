/**
 * 연꽃.
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
  dismissDraftConfirm,
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

/** 홈에서 연꽃 시트를 연다 */
async function openLeafSheet(page: Page) {
  await dismissEntry(page);
  await page.getByTestId('leaf-chip').click();
  await expect(page.getByTestId('leaf-sheet')).toBeVisible();
}

test('처음 온 사람은 연꽃 한 송이를 들고 시작한다', async ({ page }) => {
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

test('두 번째로 열어도 연꽃을 또 주지 않는다', async ({ page }) => {
  /*
    ⚠ `withLeaves` 로 심으면 안 된다. 그쪽은 `welcomed: true` 를 함께 심어서,
    `grantWelcome` 이 그 표를 저장하지 않는 회귀가 나도 씨앗이 대신 막아 준다.
    재지급 방지를 **한 줄도 안 재는** 테스트가 된다. 표를 통째로 지우고 앱이 스스로
    한 장을 주게 한 뒤, 그 상태로 다시 여는 것을 본다.
  */
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('e2e.leaves', '1');
      if (sessionStorage.getItem('e2e.leaves.wiped') != null) return;
      sessionStorage.setItem('e2e.leaves.wiped', '1');
      localStorage.removeItem('buddha.leaves.v1');
    } catch {
      /* 지울 수 없으면 아래 단언이 알려 준다 */
    }
  });
  await page.goto('/');
  await dismissEntry(page);
  await expect(page.getByTestId('leaf-chip')).toHaveText('1');

  // 다시 열기. 열 때마다 한 장씩 늘면 광고를 볼 이유가 통째로 사라진다
  await page.reload();
  await dismissEntry(page);
  await expect(page.getByTestId('leaf-chip')).toHaveText('1');
  expect(await leafBalance(page)).toBe(1);
});

test('연꽃이 없어도 칩은 0 으로 서 있는다', async ({ page }) => {
  await page.goto('/');
  await dismissEntry(page);

  // 감추면 연꽃이라는 것이 있다는 사실까지 사라진다. 그러면 이어가기 시트에서 처음
  // 만난 사람은 그게 무엇인지 모른 채 고르게 된다
  await expect(page.getByTestId('leaf-chip')).toHaveText('0');
  await shot(page, '11 연꽃 - 잔액이 0 인 홈', { fullPage: true });
});

test('광고를 끝까지 보면 연꽃이 한 송이 는다', async ({ page }) => {
  await withBridge(page, { fullScreenAd: 'ok', fullScreenAdMs: 60 });
  await page.goto('/');
  await openLeafSheet(page);

  await expect(page.getByTestId('leaf-sheet-count')).toHaveText('0송이');
  await shot(page, '11 연꽃 - 모으기 시트');

  await page.getByTestId('leaf-watch').click();

  await expect(page.getByTestId('leaf-earned')).toBeVisible();
  await expect(page.getByTestId('leaf-sheet-count')).toHaveText('1송이');
  expect(await leafBalance(page)).toBe(1);
  await shot(page, '11 연꽃 - 한 장 모았다');

  // 시트는 닫히지 않는다. 여러 장 쌓으려는 사람이 칩을 매번 다시 누르지 않게 한다
  await expect(page.getByTestId('leaf-sheet')).toBeVisible();
  await page.getByTestId('leaf-watch').click();
  await expect(page.getByTestId('leaf-sheet-count')).toHaveText('2송이');
  expect(await leafBalance(page)).toBe(2);
});

test('광고를 중간에 닫으면 연꽃이 늘지 않고 그 이유를 적는다', async ({ page }) => {
  await withBridge(page, { fullScreenAd: 'dismissed', fullScreenAdMs: 60 });
  await page.goto('/');
  await openLeafSheet(page);

  await page.getByTestId('leaf-watch').click();

  // 끝까지 본 사람에게만 준다. 닫은 사람에게 주면 보상형 규칙에 어긋난다
  await expect(page.getByText('광고를 끝까지 봐야 연꽃이 생겨요')).toBeVisible();
  await expect(page.getByTestId('leaf-sheet-count')).toHaveText('0송이');
  // 성공 문구 자리는 늘 DOM 에 있다(라이브 리전이라 그래야 읽힌다). 비어 있는지를 본다
  await expect(page.getByTestId('leaf-earned')).toHaveText('');
  expect(await leafBalance(page)).toBe(0);
});

test('광고가 한 편도 안 오면 사람 탓으로 적지 않는다', async ({ page }) => {
  await withBridge(page, { fullScreenAd: 'noFill' });
  await page.goto('/');
  await openLeafSheet(page);

  await page.getByTestId('leaf-watch').click();

  // `noFill` 은 우리 쪽 사정이다. 「끝까지 봐야」는 사람이 닫았을 때만 하는 말이다
  await expect(page.getByText('광고를 끝까지 봐야 연꽃이 생겨요')).toHaveCount(0);
  await expect(page.getByTestId('leaf-sheet-count')).toHaveText('0송이');
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
  await expect(page.getByTestId('leaf-sheet-count')).toHaveText('2송이');
  await shot(page, '11 연꽃 - 모을 수 없는 기기');
});

test('연꽃으로 이야기를 이어가면 광고가 뜨지 않고 한 장이 준다', async ({ page }) => {
  await withLeaves(page, 2);
  await page.goto('/');

  // 오늘 첫 이야기. 여기는 원래 광고가 없다
  await askOnce(page);
  await dismissNudge(page);
  await page.goBack();

  // 두 번째부터 문이 선다. 연꽃이 있으므로 연꽃 버튼이 주 버튼이다
  await dismissEntry(page);
  await dismissDraftConfirm(page);
  await page.getByTestId('concern-field').fill('회사에서 실수를 했는데 계속 생각나요.');
  await page.getByTestId('submit').click();

  const sheet = page.getByTestId('continue-sheet');
  await expect(sheet).toBeVisible();
  const useLeaf = page.getByTestId('leaf-spend-continue');
  await expect(useLeaf).toBeVisible();
  await expect(useLeaf).toContainText('1송이 남아요');
  await shot(page, '11 연꽃 - 이어가기에서 연꽃이 주 버튼이다');

  await useLeaf.click();

  // 제목이 말하는 「광고가 뜨지 않고」를 실제로 본다. 목 광고는 덮개를 붙였다 떼는데,
  // 답변이 보이는 것만으로는 그 덮개가 떴다 사라진 판과 구분되지 않는다
  await expect(page.getByTestId('mock-fullscreen-ad')).toHaveCount(0);
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
  await dismissDraftConfirm(page);
  await page.getByTestId('concern-field').fill('요즘 잠을 잘 못 자요.');
  await page.getByTestId('submit').click();

  // 「0송이 남아요」보다 먼저 읽힌다. 마지막인 줄 모르고 썼다가 다음에 광고를 만나면
  // 그때서야 알게 된다
  await expect(page.getByTestId('leaf-spend-continue')).toContainText('마지막 한 송이');
});

test('연꽃이 없으면 이어가기는 예전처럼 광고 버튼 하나다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);
  await dismissNudge(page);
  await page.goBack();

  await dismissEntry(page);
  await dismissDraftConfirm(page);
  await page.getByTestId('concern-field').fill('부모님과 자꾸 부딪혀요.');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('continue-sheet')).toBeVisible();
  await expect(page.getByTestId('leaf-spend-continue')).toHaveCount(0);
  await expect(page.getByTestId('continue-watch')).toBeVisible();
});

test('연꽃으로 말씀을 간직하면 광고가 뜨지 않고 한 장이 준다', async ({ page }) => {
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
  await expect(useLeaf).toContainText('마지막 한 송이');
  await shot(page, '11 연꽃 - 간직하기에서 연꽃이 주 버튼이다');

  await useLeaf.click();

  await expect(page.getByTestId('mock-fullscreen-ad')).toHaveCount(0);
  await expect(page.getByTestId('save-done')).toBeVisible();
  expect(await leafBalance(page)).toBe(0);
});

test('연꽃을 다 쓰고 나면 다음 간직하기는 광고로 돌아간다', async ({ page }) => {
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

  // 새 이야기를 하나 더. 이번에는 연꽃이 없으니 간직 시트가 광고만 세운다
  await page.getByTestId('save-done-stay').click();
  await page.goBack();
  await dismissEntry(page);
  await dismissDraftConfirm(page);
  await page.getByTestId('concern-field').fill('새로 맡은 일이 버거워요.');
  await page.getByTestId('submit').click();
  const gate = page.getByTestId('continue-sheet');
  // `isVisible({timeout})` 은 무시된다(Playwright 가 deprecated 로 박아 뒀다). 시트가
  // 아직 안 그려졌으면 광고 클릭을 건너뛰고 엉뚱한 자리에서 실패한다
  await gate.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
  if (await gate.isVisible().catch(() => false)) {
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

test('간직에 실패하면 연꽃은 그대로 남는다', async ({ page }) => {
  await withLeaves(page, 1);
  await page.goto('/');

  /*
    담는 자리(localStorage)를 막는다. **앱이 쓰는 다른 키는 그대로 둔다.**
    통째로 막으면 연꽃도 못 읽어 재는 대상 자체가 사라진다.

    연꽃을 먼저 빼고 담았다면 여기서 한 장이 증발한다. 담긴 것도 없고 값은 치른 상태다.
  */
  await page.evaluate(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key.startsWith('buddha.archive')) throw new Error('e2e: 저장소가 가득 찼어요');
      return real.call(this, key, value);
    };
  });

  await askOnce(page);
  await dismissNudge(page);
  await revealBottomBar(page);

  await page.getByTestId('save-button').click();
  await page.getByTestId('leaf-spend-save').click();

  // 담기지 못했다고 말하고, 연꽃은 그대로다
  await expect(page.getByText('지금은 간직하지 못했어요', { exact: false })).toBeVisible();
  await expect(page.getByTestId('save-done')).toHaveCount(0);
  expect(await leafBalance(page)).toBe(1);
});

test('광고를 못 띄우는 기기에서는 연꽃을 쓰지 않고 그냥 지나간다', async ({ page }) => {
  await withBridge(page, { fullScreenAd: 'unsupported' });
  await withLeaves(page, 1);
  await page.goto('/');

  await askOnce(page);
  await dismissNudge(page);

  // 간직: 시트 자체가 안 선다. 광고도 연꽃도 없이 담긴다
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('save-gate')).toHaveCount(0);
  await expect(page.getByTestId('save-done')).toBeVisible();
  await page.getByTestId('save-done-stay').click();

  // 이어가기: 시트가 열려도 스스로 비켜 준다
  await page.goBack();
  await dismissEntry(page);
  await dismissDraftConfirm(page);
  await page.getByTestId('concern-field').fill('내일 발표가 걱정돼요.');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });

  // 두 문을 다 지났는데 잔액은 그대로다. 안 써도 되는 자리에서 뺏지 않는다
  expect(await leafBalance(page)).toBe(1);
});
