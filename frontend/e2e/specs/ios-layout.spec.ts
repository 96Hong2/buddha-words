/**
 * iOS 배치 증명.
 *
 * 토스 미니앱은 안드로이드에서 Chrome 계열 WebView 로, iOS 에서 WKWebView 로 돈다.
 * 같은 CSS 라도 글자 상자 높이, 자동으로 자라는 입력칸의 scrollHeight, 화면 아래에 붙는
 * 고정 바의 위치가 엔진마다 다르게 잡힌다. Pixel 8 한쪽만 재면 iPhone 에서 넘치는 것을
 * 못 본다. 그래서 이 스펙만 iPhone 14(390x664, WebKit)에서 돈다.
 *
 * 여기서 재는 것은 넷이다.
 *   1. 고민 입력칸이 같은 상한까지만 자라고, 그 뒤로는 칸 안에서 스크롤한다
 *   2. 화면 아래 고정 바가 화면 안에 다 들어오고 버튼이 잘리지 않는다
 *   3. 노치 기기의 하단 인셋을 주면 버튼이 그만큼 올라온다
 *   4. 바텀시트가 화면 높이를 넘지 않고 닫기 버튼이 화면 안에 있다
 */

import type { Locator } from '@playwright/test';

import { test, expect, type Page } from '../support/fixtures';
import { askOnce, dismissEntry, revealBottomBar } from '../support/flow';

/** 소수점 자리는 브라우저 반올림이라 1px 까지 눈감는다 */
const SLACK = 1;

/** iPhone 홈 인디케이터 자리. 실기기 인셋과 같은 값이다 */
const HOME_INDICATOR = 34;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(page: Page, testId: string): Promise<Box> {
  const box = await page.getByTestId(testId).first().boundingBox();
  expect(box, `${testId} 를 찾지 못했어요`).not.toBeNull();
  return box as Box;
}

/**
 * 하단 바를 올리고 다 올라올 때까지 기다린다.
 *
 * 바는 늘 DOM 에 있고 translateY(110%) 로 화면 밖에 밀려나 있다. 「보인다」는 올라오기 전에도
 * 참이라 그 순간 자리를 재면 화면 아래로 84px 벗어난 값이 나온다. 다 들어온 것을 보고 잰다.
 */
async function settledBottomBar(page: Page): Promise<Box> {
  await revealBottomBar(page);
  await expect(page.getByTestId('bottom-bar')).toBeInViewport({ ratio: 1 });
  return boxOf(page, 'bottom-bar');
}

/**
 * 시트 판의 자리. 올라오는 애니메이션이 끝난 뒤에 잰다.
 *
 * 시트는 translateY(102%) 에서 0 으로 올라온다. 「보인다」는 올라오는 도중에도 참이라
 * 그 순간 재면 화면 아래에 걸쳐 있는 값이 나온다.
 */
async function panelBox(locator: Locator): Promise<Box> {
  await locator.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const box = await locator.boundingBox();
  expect(box, '시트 판을 찾지 못했어요').not.toBeNull();
  return box as Box;
}

function viewport(page: Page): { width: number; height: number } {
  const size = page.viewportSize();
  expect(size, '뷰포트 크기를 읽지 못했어요').not.toBeNull();
  return size as { width: number; height: number };
}

/** 가로로 넘치지 않는다. 좁은 폭에서 한 줄이라도 삐져나오면 여기서 걸린다 */
async function expectNoSideways(page: Page) {
  const over = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollWidth - document.documentElement.clientWidth;
  });
  expect(over, '본문이 가로로 넘쳤어요').toBeLessThanOrEqual(SLACK);
}

test('입력칸이 iPhone 폭에서도 같은 상한까지만 자란다', async ({ page }) => {
  await page.goto('/');
  await dismissEntry(page);

  const field = page.getByTestId('concern-field');
  await field.fill('한 줄');
  const small = (await field.boundingBox())?.height ?? 0;
  expect(small).toBeGreaterThan(0);

  await field.fill(Array.from({ length: 12 }, (_, i) => `${i + 1}번째 줄입니다`).join('\n'));
  const grown = (await field.boundingBox())?.height ?? 0;

  // Chromium 판(screens.spec.ts 「입력칸이 자란다」)과 같은 상한이다.
  // WKWebView 가 줄 높이를 다르게 잡아도 이 선을 넘으면 전송 버튼이 화면 밖으로 밀린다
  expect(grown).toBeGreaterThan(small);
  expect(grown).toBeLessThanOrEqual(304);

  const scrollable = await field.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(scrollable, '상한에 닿았는데 칸 안에서 스크롤되지 않아요').toBe(true);

  // 자란 칸 아래의 전송 버튼이 화면 안에 남아 있다
  await expect(page.getByTestId('submit')).toBeInViewport();
  await expectNoSideways(page);
});

test('하단 바가 화면 아래에 붙고 버튼이 잘리지 않는다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);

  const size = viewport(page);
  const bar = await settledBottomBar(page);

  // 화면 아래에 딱 붙는다. 아래로 삐져나가면 버튼 아랫부분이 잘린다
  expect(
    Math.abs(bar.y + bar.height - size.height),
    '하단 바가 화면 아래에 붙지 않았어요',
  ).toBeLessThanOrEqual(SLACK);
  expect(bar.x).toBeGreaterThanOrEqual(-SLACK);
  expect(bar.x + bar.width).toBeLessThanOrEqual(size.width + SLACK);

  // 바 안의 버튼이 모두 바 안에 든다. 좁은 폭에서 하나가 다음 줄로 접히거나 잘리면 걸린다
  for (const id of ['share-button', 'save-button']) {
    const button = await boxOf(page, id);
    expect(button.y, `${id} 가 바 위로 삐져나왔어요`).toBeGreaterThanOrEqual(bar.y - SLACK);
    expect(button.y + button.height, `${id} 가 바 아래로 삐져나왔어요`).toBeLessThanOrEqual(
      bar.y + bar.height + SLACK,
    );
    expect(button.x, `${id} 가 바 왼쪽으로 삐져나왔어요`).toBeGreaterThanOrEqual(bar.x - SLACK);
    expect(button.x + button.width, `${id} 가 바 오른쪽으로 삐져나왔어요`).toBeLessThanOrEqual(
      bar.x + bar.width + SLACK,
    );
    await expect(page.getByTestId(id)).toBeInViewport();
  }

  await expectNoSideways(page);
});

test('하단 인셋을 주면 하단 바 버튼이 홈 인디케이터 위로 올라온다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);
  await settledBottomBar(page);

  const size = viewport(page);
  const before = await boxOf(page, 'save-button');
  const gapBefore = size.height - (before.y + before.height);

  // 노치 기기에서 브릿지가 내리는 값을 그대로 넣는다(SafeAreaProvider 가 쓰는 변수와 같다)
  await page.evaluate((inset) => {
    document.documentElement.style.setProperty('--safe-bottom', `${inset}px`);
  }, HOME_INDICATOR);

  const after = await boxOf(page, 'save-button');
  const gapAfter = size.height - (after.y + after.height);

  expect(gapAfter - gapBefore, '인셋을 줬는데 버튼이 올라오지 않았어요').toBeGreaterThanOrEqual(
    HOME_INDICATOR - SLACK,
  );
  // 바는 여전히 화면 아래에 붙어 있다. 인셋만큼 통째로 떠오르면 틈이 생긴다
  const bar = await boxOf(page, 'bottom-bar');
  expect(Math.abs(bar.y + bar.height - size.height)).toBeLessThanOrEqual(SLACK);
});

test('바텀시트가 화면 높이를 넘지 않고 닫기 버튼이 화면 안에 있다', async ({ page }) => {
  await page.goto('/');
  await dismissEntry(page);

  const size = viewport(page);

  // ① 홈의 오늘의 한마디 시트.
  // 재는 것은 testid 가 붙은 안쪽 내용이 아니라 높이를 가두는 판(role=dialog)이다.
  // 안쪽 내용은 판보다 길고 판 안에서 스크롤한다
  await page.getByTestId('daily-card').click();
  await expect(page.getByTestId('daily-sheet')).toBeVisible();

  const daily = await panelBox(page.getByRole('dialog').first());
  expect(daily.y, '시트 윗머리가 화면 위로 잘렸어요').toBeGreaterThanOrEqual(-SLACK);
  expect(daily.height, '시트가 화면 높이를 넘었어요').toBeLessThanOrEqual(size.height + SLACK);
  expect(Math.abs(daily.y + daily.height - size.height)).toBeLessThanOrEqual(SLACK);
  await expect(page.getByTestId('sheet-close').first()).toBeInViewport();

  await page.getByTestId('sheet-close').first().click();
  await expect(page.getByTestId('daily-sheet')).toBeHidden();

  // ② 답변의 경전 원문 시트. 본문이 길어 화면 높이에 부딪히는 자리다
  await askOnce(page);
  await page.getByRole('button', { name: '원문 보기' }).first().click();

  const scripture = page.getByRole('dialog', { name: '경전 원문' });
  await expect(scripture).toBeVisible();
  const sheet = await panelBox(scripture);

  expect(sheet.y, '경전 원문 시트가 화면 위로 잘렸어요').toBeGreaterThanOrEqual(-SLACK);
  expect(sheet.height).toBeLessThanOrEqual(size.height + SLACK);
  expect(Math.abs(sheet.y + sheet.height - size.height)).toBeLessThanOrEqual(SLACK);
  await expect(page.getByTestId('sheet-close').first()).toBeInViewport();

  await expectNoSideways(page);
});
