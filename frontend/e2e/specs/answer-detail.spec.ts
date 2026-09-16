/**
 * 답변 화면 안쪽.
 *
 * 전체 스크롤 한 장으로는 안 보이는 자리를 본다. 보통 길이 답변, 경전 원문 시트,
 * 낱말 뜻풀이 시트, 다 읽어야 올라오는 하단 바, 그리고 뒷부분만 못 받았을 때.
 */

import { test, expect } from '../support/fixtures';
import { askOnce, dismissEntry, NORMAL_CONCERN, revealBottomBar } from '../support/flow';
import { shot } from '../support/shots';

/**
 * 낱말 칩이 실제로 뜨는 고민문.
 *
 * 칩은 뜻풀이 본문 안에 그 낱말이 그대로 나와야 붙는다. 어떤 구절이 뽑히는지는 글자에서
 * 나온 해시가 정하므로 아무 글이나 쓰면 칩이 없는 구절로 간다. 이 글은 「인색」이 뜻풀이에
 * 들어 있는 구절(이띠웃따까 26경)로 떨어지도록 골라 둔 것이다. 395구절 가운데 칩이 붙을 수
 * 있는 것은 일곱뿐이라 글자 하나만 달라져도 빗나간다.
 * 경전 시드가 바뀌면 이 테스트가 그 자리에서 실패한다. 그때 글을 다시 고른다.
 */
const TERM_CONCERN = [
  '요즘 계속 불안해요. 사소한 일에도 가슴이 두근거려요.',
  '어떻게 될지 몰라 걱정이 밤까지 이어져요.',
  '이대로 괜찮은 건지 무섭기도 하고, 누구한테 말하기도 어려워요.',
].join('\n');

test('보통 길이 답변은 깊은 답변보다 짧게, 그러나 빠진 자리 없이 온다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page, NORMAL_CONCERN);

  // 일곱 블록은 그대로 다 있다. 짧다고 자리를 빼지 않는다
  await expect(page.getByTestId('buddha-message')).toBeVisible();
  await expect(page.getByTestId('scripture-text')).toBeVisible();
  await expect(page.getByTestId('scripture-citation')).not.toBeEmpty();
  await expect(page.getByTestId('explanation')).toBeVisible();
  await expect(page.getByTestId('closing')).toBeVisible();

  // 깊은 답변(분석 3 · 행동 3)보다 적다
  await expect(page.locator('[data-testid="analysis"] .sub')).toHaveCount(1);
  await expect(page.locator('ol.acts > li')).toHaveCount(2);

  await shot(page, '11 답변 - 보통 길이 답변', { fullPage: true });
});

test('경전 원문 시트가 열리고 세 가지 방법으로 닫힌다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);

  const sheet = page.getByRole('dialog', { name: '경전 원문' });
  const open = page.getByRole('button', { name: '원문 보기' }).first();

  await open.click();
  await expect(sheet).toBeVisible();
  // 카드에 보이던 출처가 시트에도 그대로 있다
  const citation = (await page.getByTestId('scripture-citation').first().innerText()).trim();
  await expect(sheet).toContainText(citation);
  await shot(page, '12 답변 - 경전 원문 시트');

  // ① 닫기 버튼
  await sheet.getByTestId('sheet-close').click();
  await expect(sheet).toBeHidden();

  // ② 바깥 어두운 곳
  await open.click();
  await expect(sheet).toBeVisible();
  await page
    .getByTestId('sheet-dim')
    .first()
    .click({ position: { x: 10, y: 10 } });
  await expect(sheet).toBeHidden();

  // ③ 뒤로가기
  //
  // 실기기에서는 브릿지가 시스템 뒤로가기를 가로채 시트만 닫는다(`BackHandler`).
  // 브라우저에는 그 배선이 없어서 여기서 보는 것은 「브라우저 뒤로가기를 눌러도
  // 시트가 떠 있는 채로 남지 않는다」까지다. 시트만 닫히는지는 이 판으로 증명되지 않는다.
  await open.click();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
});

test('뜻풀이에 나온 낱말을 누르면 그 자리에서 뜻이 열린다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page, TERM_CONCERN);

  const chip = page.getByTestId('term-chip').first();
  await expect(chip).toBeVisible();
  const word = (await chip.innerText()).trim();

  await chip.click();
  const sheet = page.getByTestId('term-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(word);
  await shot(page, '13 답변 - 낱말 뜻풀이 시트');

  await sheet.getByTestId('sheet-close').click();
  await expect(sheet).toBeHidden();
});

test('마지막 한마디까지 읽으면 하단 바가 올라온다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);

  // 다 읽기 전에는 화면을 가리지 않는다.
  // 바는 늘 DOM 에 있고 화면 아래로 밀려나 있는 구조라(translateY) 「숨김」이 아니라
  // 「화면 안에 없음」으로 재야 한다
  await expect(page.getByTestId('bottom-bar')).not.toBeInViewport();

  await revealBottomBar(page);
  const bar = page.getByTestId('bottom-bar');
  await expect(bar).toBeInViewport();
  await expect(page.getByTestId('share-button')).toBeVisible();
  await expect(page.getByTestId('save-button')).toBeVisible();
  await shot(page, '14 답변 - 다 읽으면 올라오는 하단 바');

  // 다시 이야기하기와 불편 신고도 같은 자리에 있다
  await expect(page.getByTestId('again-button')).toBeVisible();
  await expect(page.getByTestId('report-link')).toBeVisible();
});

test('뒷부분만 못 받으면 받은 것을 도로 뺏지 않고, 다시 시도하면 채워진다', async ({
  page,
  stub,
}) => {
  await stub({ pass1Ms: 200, pass2Ms: 200, failPass2: true });
  await page.goto('/');
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(NORMAL_CONCERN);
  await page.getByTestId('submit').click();

  // 앞부분은 이미 받았다. 실패 때문에 경전까지 사라지면 안 된다
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('buddha-message')).toBeVisible();
  await expect(page.getByTestId('scripture-text')).toBeVisible();

  await expect(page.getByText('나머지를 못 불러왔어요')).toBeVisible();
  await expect(page.getByText('다시 시도해도 오늘 남은 횟수는 줄지 않아요')).toBeVisible();
  await expect(page.getByTestId('analysis')).toHaveCount(0);
  await shot(page, '15 답변 - 뒷부분을 못 불러왔을 때', { fullPage: true });

  // 서버가 돌아온 뒤 다시 누르면 나머지가 붙는다
  await page.evaluate(() => {
    if (window.__buddhaStub != null) window.__buddhaStub.failPass2 = false;
  });
  await page.getByTestId('retry').click();

  await expect(page.getByTestId('analysis')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('actions')).toBeVisible();
  await expect(page.getByTestId('closing')).toBeVisible();
  await expect(page.getByText('나머지를 못 불러왔어요')).toHaveCount(0);
});
