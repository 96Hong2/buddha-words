/**
 * 「조금 더 깊게 보고 싶다면」. 광고를 끝까지 본 사람에게만 붙는 한 덩이.
 *
 * 여기서 지키는 것 다섯이다.
 *   1. 누르기 전에는 아무 광고도 없고, 「광고」라는 글자는 버튼 안 배지 하나까지다
 *   2. 보고 나면 새 경전 · 다른 관점 · 행동 하나가 붙고, 앞에 쓴 경전이 다시 나오지 않는다
 *   3. 전면형이라 중간에 닫아도 붙는다. 안 본 사람에게 실패라고 말하지 않는다
 *   4. 광고를 띄울 수 없는 기기에서는 카드 자체가 없다. 눌러 봐야 안 되는 버튼을 두지 않는다
 *   5. **연꽃 한 송이로도 지나간다.** 광고를 못 띄우는 기기에서도 그 길은 열려 있다
 *   6. 연꽃이 없는 사람에게는 **모으러 가는 길**이 광고 버튼 아래에 선다
 */

import { test, expect, type Page } from '../support/fixtures';
import { askOnce, withLeaves } from '../support/flow';
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

test('전면형이라 광고를 중간에 닫아도 다른 관점이 붙는다', async ({ page }) => {
  /*
    **판이 뒤집힌 자리다.** 보상형이던 때는 닫으면 아무것도 붙지 않았다. 전면형에는 보상
    이벤트가 없어 닫는 것이 정상 종료라, 그때도 안 주면 아무도 못 받는다.
  */
  await withBridge(page, { fullScreenAd: 'dismissed' });
  await page.goto('/');
  await askOnce(page);

  await scrollToExtension(page);
  await page.getByTestId('extension-cta').click();

  await expect(page.getByTestId('extension-result')).toBeVisible({ timeout: 20_000 });
  // 닫은 사람을 탓하지 않는다. 그 문구는 보상형 자리(연꽃 모으기)에만 남는다
  await expect(page.getByTestId('extension-card')).not.toContainText('보상을 받기 전에');

  await shot(page, '18 한 번 더 보기 - 짧은 광고를 닫아도 붙는다');
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

test('연꽃 한 송이로도 다른 관점을 본다. 광고는 아래로 내려간다', async ({ page }) => {
  /*
    이어가기 · 간직과 같은 규칙을 이 자리에도 뒀다(2026-09-24 사용자 지시). 연꽃 한 송이는
    미리 치러 둔 광고 한 편이라, 가진 사람 앞에 광고를 또 세우면 미리 모을 이유가 사라진다.
    그래서 **순서가 검증 대상이다**: 연꽃이 주 버튼이고 광고가 아래 보조다.
  */
  await withLeaves(page, 2);
  await page.goto('/');
  await askOnce(page);

  await scrollToExtension(page);

  const leafCta = page.getByTestId('leaf-spend-extension');
  const adCta = page.getByTestId('extension-cta');
  await expect(leafCta).toBeVisible();
  await expect(adCta).toBeVisible();

  // 연꽃이 위, 광고가 아래다. 뒤집히면 이미 값을 치른 사람 앞에 광고가 먼저 선다
  const leafTop = (await leafCta.boundingBox())?.y ?? 0;
  const adTop = (await adCta.boundingBox())?.y ?? 0;
  expect(leafTop, '광고 버튼이 연꽃 버튼보다 위에 있어요').toBeLessThan(adTop);

  // 쓰기 전에 몇 송이 남는지 적는다. 마지막 한 송이를 모른 채 누르지 않게 한다
  await expect(leafCta).toContainText('쓰면 1송이 남아요');
  await shot(page, '18-2 한 번 더 보기 - 연꽃으로도 볼 수 있다');

  await leafCta.click();

  // 광고 없이 붙는다
  await expect(page.getByTestId('extension-result')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('mock-fullscreen-ad')).toHaveCount(0);

  const balance = await page.evaluate(() => {
    const raw = localStorage.getItem('buddha.leaves.v1');
    return raw == null ? null : (JSON.parse(raw) as { count: number }).count;
  });
  expect(balance, '한 번에 한 송이만 나가야 해요').toBe(1);
});

test('광고를 못 띄워도 연꽃이 있으면 다른 관점을 볼 수 있다', async ({ page }) => {
  /*
    한때 이 카드는 `adSupported` 가 false 면 통째로 사라졌다. 연꽃은 **이미 치러 둔**
    광고라, 지금 광고를 못 띄우는 것과 상관없이 쓸 수 있어야 한다. 그때 광고 버튼까지
    함께 세우면 눌러도 아무 일이 없는 버튼이 되므로, 그 줄만 빠진다.
  */
  await withBridge(page, { fullScreenAd: 'unsupported' });
  await withLeaves(page, 1);
  await page.goto('/');
  await askOnce(page);

  await scrollToExtension(page);
  await expect(page.getByTestId('leaf-spend-extension')).toBeVisible();
  await expect(page.getByTestId('extension-cta')).toHaveCount(0);

  await page.getByTestId('leaf-spend-extension').click();
  await expect(page.getByTestId('extension-result')).toBeVisible({ timeout: 20_000 });
});

test('연꽃이 없어도 이 자리에서 모으러 갈 수 있다', async ({ page }) => {
  /*
    연꽃을 쓰는 자리는 셋인데 **모으러 가는 길은 시트 둘에만 있었다**(이어가기 · 간직).
    그래서 연꽃이 없는 사람이 이 카드에서 보는 것은 광고 버튼 하나뿐이었고, 연꽃이라는
    것이 있는 줄도 모른 채 매번 광고를 봤다 (2026-09-25 사용자 지시).
  */
  await withLeaves(page, 0);
  await page.goto('/');
  await askOnce(page);

  const card = await scrollToExtension(page);
  const collect = card.getByTestId('leaf-collect-extension');
  await expect(collect).toBeVisible();
  // 연꽃이 없으니 쓰는 버튼은 없다. 모으러 가는 길만 있다
  await expect(page.getByTestId('leaf-spend-extension')).toHaveCount(0);

  /*
    광고 버튼 **아래**다. 지금 답을 읽고 있는 사람에게 먼저 권할 일이 아니라
    「이번엔 광고를 보고 다음부터는 안 봐도 된다」로 읽혀야 한다.
  */
  const adTop = (await page.getByTestId('extension-cta').boundingBox())?.y ?? 0;
  const collectTop = (await collect.boundingBox())?.y ?? 0;
  expect(collectTop, '모으기 카드가 광고 버튼보다 위에 있어요').toBeGreaterThan(adTop);

  await shot(page, '18-3 한 번 더 보기 - 연꽃이 없으면 모으러 가는 길');

  await collect.click();
  await expect(page.getByTestId('leaf-sheet')).toBeVisible();
});

test('여기서 연 연꽃 모으기를 닫으면 간직 시트가 따라 열리지 않는다', async ({ page }) => {
  /*
    연꽃 모으기는 간직 시트에서도 열린다. 그쪽에서 온 사람은 닫을 때 그 시트로 돌아가야
    하던 일을 잇는다. 그 배선이 **어디서 왔는지 보지 않고** 늘 간직 시트를 열고 있었다.
    답변 본문에서 연 사람에게는 열지도 않은 시트가 튀어나온다.

    ⚠ 「보이지 않는다」로 재지 않는다. `toBeVisible()` 은 가려짐을 보지 않아서, 시트가
    덮고 있어도 아래 카드가 초록으로 잡힌다. **눌러서** 잰다.
  */
  await withLeaves(page, 0);
  await page.goto('/');
  await askOnce(page);

  const card = await scrollToExtension(page);
  await card.getByTestId('leaf-collect-extension').click();
  await expect(page.getByTestId('leaf-sheet')).toBeVisible();

  await page.getByTestId('leaf-sheet').press('Escape');
  await expect(page.getByTestId('leaf-sheet')).toBeHidden();

  await expect(page.getByTestId('save-gate')).toHaveCount(0);
  // 덮고 있는 것이 없어야 이 클릭이 닿는다. 가려져 있으면 여기서 실패한다
  await card.getByTestId('leaf-collect-extension').click();
  await expect(page.getByTestId('leaf-sheet')).toBeVisible();
});

test('연꽃이 날아가는 동안에는 모으러 가는 길이 잠긴다', async ({ page }) => {
  /*
    연꽃 버튼은 꽃이 날아가는 **0.84초 뒤에** 실제 차감을 시작한다. 그 사이에 바로 아래
    모으기 카드를 누르면 연꽃 시트가 열리고, 예약돼 있던 차감이 그 시트 뒤에서 터진다.
    시트는 「0송이」를 보여 주고, 치른 값으로 받은 관점은 시트에 가려 안 보인다.

    시트 둘(이어가기 · 간직)에는 이 구멍이 없다. 모으기를 누르면 그 시트가 통째로
    사라지면서 예약된 타이머까지 걷힌다. **이 카드는 답변 본문에 놓여 있어 살아남는다.**
    모으기 길을 여기 내면서 처음 생긴 조합이라 그 자리를 잰다.
  */
  await withLeaves(page, 1);
  await page.goto('/');
  await askOnce(page);

  const card = await scrollToExtension(page);
  const collect = card.getByTestId('leaf-collect-extension');
  await expect(collect).toBeEnabled();

  await page.getByTestId('leaf-spend-extension').click();
  // 꽃이 아직 날고 있다. 이 순간 다른 길로 빠져나가면 안 된다
  await expect(collect).toBeDisabled();

  // 꽃이 닿으면 하던 일이 시작되고, 카드는 결과 자리로 넘어간다
  await expect(page.getByTestId('extension-result')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('leaf-sheet')).toHaveCount(0);

  const balance = await page.evaluate(() => {
    const raw = localStorage.getItem('buddha.leaves.v1');
    return raw == null ? null : (JSON.parse(raw) as { count: number }).count;
  });
  expect(balance, '한 번에 한 송이만 나가야 해요').toBe(0);
});
