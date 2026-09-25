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
import type { MockScenario } from '../../src/shared/toss/mockBridge';

/** 전화 앱도 메일 앱도 없는 기기로 만든다 */
async function withNoLinkApps(page: Page) {
  const scenario: MockScenario = { openUrl: 'fail' };
  await page.addInitScript((value) => {
    window.__buddhaBridge = { ...window.__buddhaBridge, ...value };
  }, scenario);
}

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

test('위기 창구: 전화를 못 걸면 번호를 글자로 남긴다', async ({ page }) => {
  await withNoLinkApps(page);
  await page.goto('/');
  await page.getByTestId('entry-card-cta').click();
  await page.getByTestId('concern-field').fill('어떻게 하면 죽을 수 있나요');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('crisis')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('channel-failed')).toHaveCount(0);

  await page.getByTestId('crisis-channel').first().click();

  const note = page.getByTestId('channel-failed');
  await expect(note).toBeVisible();
  // 사람이 손으로 걸 수 있는 번호가 남아야 한다. `tel:` 이 붙은 채로는 못 읽는다
  await expect(note).toContainText('109');
  await expect(note).not.toContainText('tel:');
});

test('도움받을 곳: 전화를 못 걸면 그 줄의 번호가 남는다', async ({ page }) => {
  await withNoLinkApps(page);
  await page.goto('/settings/help');
  await expect(page.getByTestId('help-lines')).toBeVisible();

  const first = page.getByTestId('help-lines').locator('a[href^="tel:"]').first();
  const href = (await first.getAttribute('href')) ?? '';
  await first.click();

  const note = page.getByTestId('channel-failed');
  await expect(note).toBeVisible();
  await expect(note).toContainText(href.slice(4));
});

test('설정 문의: 메일 앱이 없으면 주소를 남긴다', async ({ page }) => {
  await withNoLinkApps(page);
  await page.goto('/settings');
  await expect(page.getByTestId('settings')).toBeVisible();

  await page.getByTestId('settings').locator('a[href^="mailto:"]').click();

  const note = page.getByTestId('channel-failed');
  await expect(note).toBeVisible();
  await expect(note).toContainText('pocket.app.official@gmail.com');
  await expect(note).not.toContainText('mailto:');
});

/*
  ⚠ **토스 앱 웹뷰는 임의 웹사이트를 못 연다.** 2026-09-25 실기기에서 두 번 확인했다:
  운영 기관 홈페이지도, 공식 카카오톡 채널 주소도 눌러도 아무 일이 없었다.
  같은 화면의 `tel:` 과 `mailto:` 는 열린다. **기기 앱이 받는 스킴만 열린다**는 뜻이다.

  그래서 이 앱은 `https://` 링크를 걸지 않는다. 아래 자리가 그 약속을 지킨다.
*/

test('앱 밖으로 나가는 링크에 웹 주소가 없다', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('entry-card-cta').click();
  await page
    .getByTestId('concern-field')
    .fill('요즘 정말 죽고 싶어요. 아무것도 하기 싫고 매일이 버거워요.');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('crisis')).toBeVisible({ timeout: 15_000 });

  // 위기 화면
  await expect(page.locator('a[href^="http"]')).toHaveCount(0);

  // 위로 답변의 띠
  await page.getByTestId('crisis-continue').click();
  await expect(page.getByTestId('solace')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('a[href^="http"]')).toHaveCount(0);

  // 설정 쪽 둘도 같다
  await page.goto('/settings');
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.locator('a[href^="http"]')).toHaveCount(0);

  await page.goto('/settings/help');
  await expect(page.getByTestId('help-lines')).toBeVisible();
  await expect(page.locator('a[href^="http"]')).toHaveCount(0);
});

test('마들랜: 누를 것을 두지 않고 찾아가는 방법을 적는다', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('entry-card-cta').click();
  await page.getByTestId('concern-field').fill('어떻게 하면 죽을 수 있나요');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('crisis')).toBeVisible({ timeout: 15_000 });

  const mad = page.getByTestId('crisis-channel').filter({ hasText: '마들랜' });
  await expect(mad).toHaveCount(1);

  /*
    ⚠ **누를 것이 없어야 한다.** 이 앱에서 마들랜을 여는 데 세 번 실패했다
    (기관 홈페이지 · 카카오톡 채널 · `sms:109`). 눌러도 안 열리는 버튼은 위기 화면에서
    막다른 길이고, 그것이 안내가 없는 것보다 나쁘다.
  */
  expect(await mad.evaluate((el) => el.tagName)).not.toBe('A');
  await expect(mad).not.toHaveAttribute('href', /.*/);

  // 대신 찾아가는 방법이 글로 있어야 한다
  await expect(mad).toContainText('카카오톡');
  await expect(mad).toContainText('마들랜');
  await expect(mad).toContainText('109');

  // 눌러도 아무 주소로도 나가지 않는다
  await mad.click();
  expect(await openedUrls(page)).toEqual([]);
});

test('위로 답변의 띠에도 마들랜은 누를 것이 없다', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('entry-card-cta').click();
  await page
    .getByTestId('concern-field')
    .fill('요즘 정말 죽고 싶어요. 아무것도 하기 싫고 매일이 버거워요.');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('crisis')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('crisis-continue').click();
  await expect(page.getByTestId('solace')).toBeVisible({ timeout: 15_000 });

  const mad = page.getByTestId('crisis-channel').filter({ hasText: '마들랜' }).first();
  expect(await mad.evaluate((el) => el.tagName)).not.toBe('A');
  // 전화 창구는 그대로 눌린다
  await expect(page.locator('[data-testid="crisis-channel"][href^="tel:"]').first()).toBeVisible();
});

test('도움받을 곳의 마들랜도 위기 화면과 같은 말을 한다', async ({ page }) => {
  await page.goto('/settings/help');
  await expect(page.getByTestId('help-lines')).toBeVisible();

  const mad = page.getByTestId('help-lines').locator('.set-line', { hasText: '마들랜' });
  await expect(mad).toHaveCount(1);

  /*
    ⚠ 이 화면이 같은 창구를 **따로 적어 두고 있었다.** 위기 화면만 고치니 여기는 옛
    문구(「문자 · 카카오톡」)가 남아, 어떻게 이야기하는지 알 수 없는 카드가 됐다.
    두 화면이 한 정본을 쓰는지 여기서 지킨다.
  */
  await expect(mad).toContainText('카카오톡에서 「마들랜」 검색');
  await expect(mad).not.toContainText('문자 · 카카오톡');

  // 누를 것이 없다. 이 앱에서 마들랜을 여는 길이 없다
  expect(await mad.evaluate((el) => el.tagName)).not.toBe('A');
});
