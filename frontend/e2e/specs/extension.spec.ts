/**
 * 「조금 더 깊게 보고 싶다면」. 광고를 끝까지 본 사람에게만 붙는 한 덩이.
 *
 * 여기서 지키는 것 넷이다.
 *   1. 누르기 전에는 아무 광고도 없고, 「광고」라는 글자는 버튼 안 배지 하나까지다
 *   2. 끝까지 보면 새 경전 · 다른 관점 · 행동 하나가 붙고, 앞에 쓴 경전이 다시 나오지 않는다
 *   3. 중간에 닫으면 아무것도 붙지 않고, 안 본 사람에게 실패라고 말하지 않는다
 *   4. 광고를 띄울 수 없는 기기에서는 카드 자체가 없다. 눌러 봐야 안 되는 버튼을 두지 않는다
 */

import { test, expect, type Page } from '../support/fixtures';
import { askOnce } from '../support/flow';
import { shot } from '../support/shots';
import type { MockScenario } from '../../src/shared/toss/mockBridge';

async function withBridge(page: Page, scenario: MockScenario) {
  await page.addInitScript((value) => {
    window.__buddhaBridge = value;
  }, scenario);
}

/** 답변 끝의 Extension 카드까지 내려간다 */
async function scrollToExtension(page: Page) {
  const card = page.getByTestId('extension-card');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  return card;
}

test('누르기 전에는 광고가 없고, 「광고」는 버튼 안 배지 하나까지다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);

  const card = await scrollToExtension(page);
  await expect(card).toContainText('다른 경전과 다른 관점');
  await expect(page.getByTestId('extension-cta')).toBeEnabled();
  await expect(page.getByTestId('extension-result')).toHaveCount(0);

  // 누르지 않았으니 광고가 떠 있으면 안 된다
  await expect(page.getByTestId('mock-fullscreen-ad')).toHaveCount(0);
  // 화면 전체에서 「광고」는 배지 하나뿐이다
  const adWords = await page
    .locator('body')
    .evaluate((el) => (el.textContent ?? '').split('광고').length - 1);
  expect(adWords).toBeLessThanOrEqual(2);
  await expect(page.getByTestId('ad-badge')).toHaveCount(1);

  await shot(page, '16 한 번 더 보기 - 광고 보고 다른 관점 받기 카드');
});

test('광고를 끝까지 보면 다른 경전과 다른 관점이 붙는다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);

  // 본문에 이미 쓴 경전. 이것이 다시 나오면 「한 번 더」가 아니다
  const usedText = (await page.getByTestId('scripture-text').first().innerText()).trim();

  await scrollToExtension(page);
  await page.getByTestId('extension-cta').click();

  // 실광고처럼 화면을 통째로 덮었다가 끝난다
  await expect(page.getByTestId('mock-fullscreen-ad')).toBeHidden({ timeout: 10_000 });

  const result = page.getByTestId('extension-result');
  await expect(result).toBeVisible({ timeout: 20_000 });
  await result.scrollIntoViewIfNeeded();

  // 새 경전 · 다른 관점 · 행동 하나
  await expect(result).toContainText('다른 쪽에서 보면');
  await expect(result.locator('.scripture .text')).not.toBeEmpty();
  await expect(result.locator('ol.acts > li')).toHaveCount(1);

  const addedText = (await result.locator('.scripture .text').innerText()).trim();
  expect(addedText).not.toBe(usedText);

  // 다 받은 뒤에는 다시 보라고 부추기지 않는다
  await expect(page.getByTestId('extension-cta')).toHaveCount(0);

  // 답변 전체는 1만 픽셀이 넘어 통째로 찍으면 아무것도 안 읽힌다. 붙은 자리만 찍는다
  await shot(page, '17 한 번 더 보기 - 다른 관점이 붙은 뒤');
});

test('광고를 중간에 닫으면 아무 일도 일어나지 않는다', async ({ page }) => {
  // 광고가 뜨다 말았다. 사용자가 스스로 닫은 것과 같은 자리다
  await withBridge(page, { fullScreenAd: 'failed' });
  await page.goto('/');
  await askOnce(page);

  await scrollToExtension(page);
  await page.getByTestId('extension-cta').click();

  // 붙지 않는다. 그러나 안 본 사람을 탓하지도 않는다
  await expect(page.getByTestId('extension-result')).toHaveCount(0);
  await expect(page.getByTestId('extension-cta')).toBeEnabled();
  await expect(page.getByTestId('extension-card')).not.toContainText('못 가져왔어요');
  await expect(page.getByTestId('extension-card')).not.toContainText('실패');

  await shot(page, '18 한 번 더 보기 - 광고를 끝까지 보지 않았을 때');
});

test('광고를 띄울 수 없는 기기에는 카드를 아예 두지 않는다', async ({ page }) => {
  await withBridge(page, { fullScreenAd: 'unsupported' });
  await page.goto('/');
  await askOnce(page);

  await page.getByTestId('closing').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('extension-card')).toHaveCount(0);
  await expect(page.getByTestId('extension-cta')).toHaveCount(0);
  // 답변 자체는 그대로다. 광고가 없다고 기능을 깎지 않는다
  await expect(page.getByTestId('analysis')).toBeVisible();
  await expect(page.getByTestId('closing')).toBeVisible();

  // 마지막 한마디 아래에 광고 카드가 없다는 것이 이 그림의 요지다
  await shot(page, '19 한 번 더 보기 - 광고를 띄울 수 없는 기기');
});

test('설정에서 이 기기 광고를 끄면 답변에 광고 자리가 사라진다', async ({ page }) => {
  await page.goto('/settings/app');
  const toggle = page.getByTestId('ad-opt-out');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await page.goto('/');
  await askOnce(page);
  await page.getByTestId('closing').scrollIntoViewIfNeeded();

  await expect(page.getByTestId('extension-card')).toHaveCount(0);
  await expect(page.getByTestId('ad-badge')).toHaveCount(0);
});
