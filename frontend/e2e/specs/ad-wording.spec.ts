/**
 * 「광고」라는 말은 한 화면에 한 번이다.
 *
 * ── 왜 이걸 재나 ──────────────────────────────────────────────────────
 *
 * 광고를 켜면 그 말이 화면 곳곳에 번진다. 버튼이 한 번 말하고, 그 아래 안내가 또 말하고,
 * 부제가 「광고 없이」로 한 번 더 말한다. 줄마다 쓴 사람은 각자 친절을 베푼 것인데,
 * 읽는 사람에게는 **광고가 이 앱의 주인공처럼** 보인다. 실기기에서 그대로 나왔다
 * (2026-09-23: 「광고를 왜 이렇게 강조해서 사용자가 인식하게 만드는거야」).
 *
 * 한 번은 필요하다. 누르면 무엇이 뜨는지 밝히지 않으면 앱인토스 심사 규칙에 닿는다.
 * 그래서 없애는 것이 아니라 **한 번으로 묶는다.** 그 한 번은 광고를 여는 버튼이 쓴다.
 *
 * ── 왜 수를 세나 ──────────────────────────────────────────────────────
 *
 * 문구 하나씩 단언하면 다음 사람이 새 줄을 더할 때 아무것도 안 걸린다. 수를 세면
 * 어느 줄에 무엇을 적든 총량이 지켜진다. 여기가 이 규칙의 유일한 자물쇠다.
 */

import { test, expect, type Page } from '../support/fixtures';
import {
  askOnce,
  dismissDraftConfirm,
  dismissEntry,
  dismissNudge,
  revealBottomBar,
  withLeaves,
} from '../support/flow';
import { shot } from '../support/shots';

/** 이 요소 안에 「광고」라는 글자가 몇 번 보이나. 숨은 것은 안 센다 */
async function adWordCount(page: Page, testid: string): Promise<number> {
  return page
    .getByTestId(testid)
    .evaluate((el) => ((el as HTMLElement).innerText ?? '').split('광고').length - 1);
}

/** 오늘 첫 이야기를 보내고 홈으로 돌아온다. 두 번째부터 광고 문이 선다 */
async function afterFirstStory(page: Page) {
  await askOnce(page);
  await dismissNudge(page);
  await page.goBack();
  await dismissEntry(page);
  await dismissDraftConfirm(page);
}

test('이어가기 시트에서 「광고」는 버튼 배지 하나까지다', async ({ page }) => {
  await withLeaves(page, 0);
  await page.goto('/');
  await afterFirstStory(page);

  await page.getByTestId('concern-field').fill('회사에서 실수를 했는데 계속 생각나요.');
  await page.getByTestId('submit').click();

  const sheet = page.getByTestId('continue-sheet');
  await expect(sheet).toBeVisible();

  expect(await adWordCount(page, 'continue-sheet'), '이어가기 시트가 광고를 여러 번 말한다').toBe(
    1,
  );
  // 그 한 번은 버튼 안 배지다. 누르면 무엇이 뜨는지 그 자리에서 밝혀야 한다
  await expect(page.getByTestId('continue-watch').getByTestId('ad-badge')).toBeVisible();
  await shot(page, '01 이어가기 시트 - 광고는 배지 하나까지');
});

test('연꽃을 가진 사람이 보는 이어가기 시트에서도 「광고」는 한 번이다', async ({ page }) => {
  await withLeaves(page, 2);
  await page.goto('/');
  await afterFirstStory(page);

  await page.getByTestId('concern-field').fill('회사에서 실수를 했는데 계속 생각나요.');
  await page.getByTestId('submit').click();

  const sheet = page.getByTestId('continue-sheet');
  await expect(sheet).toBeVisible();
  // 연꽃 버튼이 주가 되고 광고 버튼이 아래로 내려가는 판이다. 줄이 하나 더 서는 자리라
  // 여기서 새는 일이 가장 잦다
  expect(await adWordCount(page, 'continue-sheet')).toBe(1);
});

test('간직 시트에서 「광고」는 버튼 하나까지다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await askOnce(page);
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();

  await expect(page.getByTestId('save-gate')).toBeVisible();
  expect(await adWordCount(page, 'save-gate'), '간직 시트가 광고를 여러 번 말한다').toBe(1);
  await shot(page, '02 간직 시트 - 광고는 한 번');
});

test('연꽃 모으기 시트에서 「광고」는 버튼 배지 하나까지다', async ({ page }) => {
  await page.goto('/');
  await dismissEntry(page);
  await page.getByTestId('leaf-chip').click();

  await expect(page.getByTestId('leaf-sheet')).toBeVisible();
  expect(await adWordCount(page, 'leaf-sheet'), '모으기 시트가 광고를 여러 번 말한다').toBe(1);
  await expect(page.getByTestId('leaf-watch').getByTestId('ad-badge')).toBeVisible();
  await shot(page, '03 연꽃 모으기 시트 - 광고는 배지 하나까지');
});

test('설정 화면에서 「광고」는 연꽃 줄 하나까지다', async ({ page }) => {
  await withLeaves(page, 1);
  await page.goto('/settings');

  await expect(page.getByTestId('settings')).toBeVisible();
  /*
   * 설정은 줄이 가장 많은 화면이라 한 줄씩 늘다 보면 셋·넷이 되기 쉽다. 실제로
   * 이용권 줄이 「광고 없이 간직할 수 있어요」로 한 번 더 말하고 있었다.
   */
  expect(await adWordCount(page, 'settings'), '설정이 광고를 여러 번 말한다').toBe(1);
  await shot(page, '04 설정 - 광고는 연꽃 줄 하나까지');
});

test('설정에서 홈 추가 바로 아래로 앱을 알릴 수 있다', async ({ page }) => {
  /*
   * 알릴 길이 둘 있었는데 둘 다 스스로 찾아갈 수 없었다. 답변 화면 권유는 두 번째 답에서
   * 한 번 뜨고 지나가고, 보관함 카드는 첫 간직 직후에만 뜬다. 지나친 사람이 나중에
   * 알리고 싶어져도 갈 곳이 없었다(2026-09-23 사용자 지시).
   */
  await page.goto('/settings');

  const homeAdd = page.getByTestId('settings-home-add');
  const share = page.getByTestId('settings-app-share');
  await expect(share).toBeVisible();
  await expect(share).toContainText('친구에게 앱 알리기');
  // 무엇이 가는지 먼저 말한다. 적은 이야기가 갈까 봐 안 누르는 쪽이 더 흔하다
  await expect(share).toContainText('적으신 이야기는 함께 가지 않아요');

  // 홈 추가 **바로 아래**다. 둘 다 이 앱으로 다시 오는 길을 만드는 줄이라 붙여 둔다
  const homeAddBox = await homeAdd.boundingBox();
  const shareBox = await share.boundingBox();
  expect(homeAddBox && shareBox).toBeTruthy();
  expect(shareBox!.y).toBeGreaterThan(homeAddBox!.y);

  const leaf = page.getByTestId('settings-leaf');
  if (await leaf.isVisible()) {
    const leafBox = await leaf.boundingBox();
    expect(shareBox!.y, '연꽃 줄보다 아래로 내려갔다').toBeLessThan(leafBox!.y);
  }
  await shot(page, '05 설정 - 홈 추가 아래 앱 알리기');
});

test('설정에서 앱을 알리면 적은 이야기가 함께 가지 않는다', async ({ page }) => {
  // 먼저 이야기를 하나 남겨 둔다. 그래야 「안 갔다」가 빈말이 아니다
  await page.goto('/');
  await askOnce(page, '회사에서 실수를 했는데 계속 생각나요.');
  await page.goto('/settings');

  await page.getByTestId('settings-app-share').click();

  const sent = await page.evaluate(() => window.__buddhaShares ?? []);
  expect(sent.length, '아무것도 보내지 않았다').toBe(1);
  expect(sent[0]).toContain('부처의 말');
  // 앱을 알리는 자리다. 그 사람의 이야기도 받은 답도 여기에 실리지 않는다
  expect(sent[0]).not.toContain('회사에서 실수');
});

test('앱 정보 화면에서 「광고」는 끄기 줄 하나까지다', async ({ page }) => {
  /*
   * 설정 > 안내 > 앱 정보. 누구나 들어갈 수 있는 자리인데 한때 제목과 설명이 각각
   * 말해서 둘이었다. 「이 기기에서 광고 끄기」는 기능 이름이라 그 말이 꼭 있어야 하고,
   * 그러면 설명은 다른 말을 해야 한다.
   */
  await page.goto('/settings/app');

  const screen = page.getByTestId('app-info');
  await expect(screen).toBeVisible();
  expect(await adWordCount(page, 'app-info'), '앱 정보가 광고를 여러 번 말한다').toBe(1);
});
