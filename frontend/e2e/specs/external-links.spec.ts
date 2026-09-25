/**
 * 앱 밖으로 나가는 주소가 실제로 열리는가.
 *
 * ⚠ **2026-09-25 심사 반려 사유가 이것이다**: 「서비스 이용을 위한 외부 링크가 정상적으로
 * 열리지 않아요」. 주소는 맞게 적혀 있었다. 누르면 아무 일도 없었을 뿐이다.
 *
 * 미니앱은 토스 앱의 웹뷰 안에서 돈다. 웹뷰는 `tel:` · `mailto:` 처럼 자기가 모르는 스킴을
 * 조용히 버린다. 그래서 `<a href>` 만으로는 안 되고 `Device.openURL` 로 넘겨야 한다.
 *
 * **그래서 여기서 재는 것은 `href` 속성이 아니다.** 속성은 반려된 판에서도 맞았다.
 * 누른 뒤 브릿지가 **무슨 주소를 받았는지**를 잰다. 그것만이 실제로 열렸다는 증거다.
 */

import { test, expect, type Page } from '../support/fixtures';

/** 앱이 밖으로 열려 한 주소 전부. 목 브릿지가 창에 쌓아 둔다 */
async function openedUrls(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as { __buddhaOpenedUrls?: string[] }).__buddhaOpenedUrls ?? [],
  );
}

test('설정 문의: 눌렀을 때 메일 주소가 실제로 열린다', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('settings')).toBeVisible();

  const mail = page.getByTestId('settings').locator('a[href^="mailto:"]');
  await expect(mail).toHaveCount(1);
  await mail.click();

  expect(await openedUrls(page)).toEqual(['mailto:pocket.app.official@gmail.com']);
});

test('도움받을 곳: 전화 줄을 누르면 그 번호로 건다', async ({ page }) => {
  await page.goto('/settings/help');
  await expect(page.getByTestId('help-lines')).toBeVisible();

  const lines = page.getByTestId('help-lines').locator('a[href^="tel:"]');
  const count = await lines.count();
  expect(count).toBeGreaterThan(0);

  await lines.first().click();

  const opened = await openedUrls(page);
  expect(opened).toHaveLength(1);
  // 번호를 여기 박아 두지 않는다. 화면이 말하는 번호와 연 번호가 같은지만 본다
  expect(opened[0]).toBe(await lines.first().getAttribute('href'));
});

test('위기 창구: 가장 먼저 걸어야 할 곳이 눌리면 전화가 걸린다', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('entry-card-cta').click();
  await page.getByTestId('concern-field').fill('어떻게 하면 죽을 수 있나요');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('crisis')).toBeVisible({ timeout: 15_000 });

  const first = page.getByTestId('crisis-channel').first();
  const href = await first.getAttribute('href');
  await first.click();

  expect(await openedUrls(page)).toEqual([href]);
});

test('위로 답변의 띠: 웹페이지 창구도 같은 길로 나간다', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('entry-card-cta').click();
  await page.getByTestId('concern-field').fill('요즘 정말 죽고 싶어요. 아무것도 하기 싫고 매일이 버거워요.');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('crisis')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('crisis-continue').click();
  await expect(page.getByTestId('solace')).toBeVisible({ timeout: 15_000 });

  /*
    띠에는 전화와 웹페이지가 섞여 있다. 웹페이지 쪽을 굳이 고르는 이유: 이 자리만
    `target="_blank"` 를 달고 있었고, 웹뷰에서 새 창은 전화보다 더 잘 막힌다.
  */
  const link = page.locator('[data-testid="crisis-channel"][href^="https://"]').first();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^https:\/\//);

  await link.click();
  expect(await openedUrls(page)).toEqual([href]);
});
