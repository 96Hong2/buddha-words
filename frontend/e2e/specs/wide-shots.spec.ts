/**
 * 넓은 화면 증거.
 *
 * `wide-viewport.spec.ts` 가 치수를 재서 판정하고, 이 스펙은 **같은 것을 눈으로 볼 수 있게**
 * 남긴다. 숫자만 남기면 「기둥 안에 있다」가 실제로 어떻게 보이는지 아무도 모른다.
 * 그림만 남겨도 안 되므로 찍기 전에 기둥 폭과 가운데 정렬을 같이 잰다.
 */

import { test, expect, type Page } from '../support/fixtures';
import { askOnce, dismissEntry, revealBottomBar } from '../support/flow';
import { wideShot } from '../support/shots';

/** index.css 의 --app-max 와 같은 값 */
const APP_MAX = 430;
const SLACK = 1;
const WIDE = [768, 1280, 1920] as const;

/** 기둥이 실기기 폭을 넘지 않고 화면 가운데에 선다 */
async function expectColumn(page: Page) {
  const box = await page.locator('.app').boundingBox();
  expect(box, '앱 기둥을 찾지 못했어요').not.toBeNull();
  const app = box as { x: number; width: number };
  const size = page.viewportSize();
  expect(size).not.toBeNull();
  const width = (size as { width: number }).width;

  expect(app.width).toBeLessThanOrEqual(APP_MAX + SLACK);
  expect(Math.abs(app.x + app.width / 2 - width / 2)).toBeLessThanOrEqual(SLACK);
}

test('넓은 화면에서 홈이 가운데 기둥 안에 선다', async ({ page }) => {
  for (const width of WIDE) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await dismissEntry(page);
    await expect(page.getByTestId('home')).toBeVisible();
    await expectColumn(page);
    await wideShot(page, `${width}px - 홈`);
  }
});

test('넓은 화면에서 답변과 하단 바가 가운데 기둥 안에 든다', async ({ page, stub }) => {
  await stub({ pass1Ms: 150, pass2Ms: 200 });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await askOnce(page);

  for (const width of WIDE) {
    await page.setViewportSize({ width, height: 900 });
    await expectColumn(page);
    await page.getByTestId('closing').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('bottom-bar')).toBeVisible();
    await wideShot(page, `${width}px - 답변과 하단 바`);
  }
});

test('넓은 화면에서 보관함과 이용권 시트가 가운데 기둥 안에 든다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'buddha.archive.v1',
      JSON.stringify({
        version: 1,
        items: [1, 2, 3].map((n) => ({
          answerId: `seed-${n}`,
          savedAt: Date.now() - n * 60_000,
          line: `마음에 남은 말 ${n}`,
          tags: ['anxiety'],
          visualTheme: 'choice',
        })),
      }),
    );
  });

  for (const width of WIDE) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/archive');
    await expect(page.getByTestId('archive')).toBeVisible();
    await expectColumn(page);
    await wideShot(page, `${width}px - 보관함`);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/archive');
  // 파는 자리가 보관함에서 간직 시트로 옮겨 갔다. 답변을 받아 그리로 간다
  await page.goto('/');
  await askOnce(page);
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();
  await page.getByTestId('save-gate-buy').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
  await expectColumn(page);
  await wideShot(page, '1280px - 이용권 시트');
});
