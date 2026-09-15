/**
 * AI 가 쓴 말과 사람이 감수한 경전 문장이 화면에서 갈라져 보이는가.
 *
 * 한 화면에 둘이 같이 올라간다. 「오늘의 한마디」와 「오늘의 부처의 말」은 AI 가 오늘의 말로
 * 옮긴 문장이고, 그 아래 금색 면 안의 글만 경전이다. 둘을 나란히 두면서 AI 문장 바로 밑에
 * 출처를 붙이면, 경전에 그 문장이 그대로 적혀 있는 것처럼 읽힌다. 실제로 오늘의 한마디 시트가
 * 그렇게 그리고 있었다.
 *
 * 여기서 보는 것은 셋이다.
 *   1. AI 문장 바로 다음에 그것이 AI 문장이라는 표시가 붙는가
 *   2. 출처(귀속) 줄이 AI 문장이 아니라 경전 원문 쪽에 붙는가
 *   3. 그 표시들이 읽히는 크기인가. 작아서 안 보이면 표시한 뜻이 없다
 */

import { test, expect, type Page } from '../support/fixtures';
import { askOnce, dismissEntry, revealBottomBar, DEEP_CONCERN } from '../support/flow';

/** 출처 캡션 기본값. 귀속 줄은 이보다 작아지면 안 된다 */
const CAPTION_PX = 13;

/**
 * 시드에서 가장 긴 경전 문장(조주의 방하착 문답, 다섯 줄)으로 떨어지는 고민문.
 *
 * 공유 카드는 1080 × 1620 고정 판이라 자리가 늘지 않는다. 표시를 한 줄 더 넣을 때마다
 * 아래에서 말없이 잘려 나간다. 가장 긴 구절로 재 두어야 그 순간 이 검사가 먼저 깨진다.
 * 스텁은 글자 해시로 구절을 고르므로 꼬리 숫자까지가 이 구절을 고르는 값이다.
 * 경전 시드가 바뀌면 여기서 실패한다. 그때 글을 다시 고른다.
 */
const LONGEST_CONCERN = [
  '오래 만난 사람과 이별했어요. 떠났다는 걸 알면서도 아직도 연락처를 못 지우고 있어요.',
  '하루에도 몇 번씩 그때로 돌아가요.',
  '(154)',
].join('\n');

async function fontPx(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => {
      return Number.parseFloat(getComputedStyle(el).fontSize);
    });
}

/** 두 요소 중 어느 쪽이 문서에서 먼저 오는가 */
async function firstComesBefore(page: Page, a: string, b: string): Promise<boolean> {
  return page.evaluate(
    ([one, two]) => {
      const x = document.querySelector(one);
      const y = document.querySelector(two);
      if (x == null || y == null) throw new Error(`요소를 못 찾았어요: ${one} · ${two}`);
      // DOCUMENT_POSITION_FOLLOWING = 4
      return (x.compareDocumentPosition(y) & 4) !== 0;
    },
    [a, b],
  );
}

test('오늘의 한마디는 AI 문장으로 표시되고, 출처는 경전 원문 쪽에 붙는다', async ({ page }) => {
  await page.goto('/');
  await dismissEntry(page);

  // 홈 카드부터 AI 가 풀어쓴 말이라고 적혀 있다. 출처는 카드에 없다
  const card = page.getByTestId('daily-card');
  await expect(card).toContainText('현대적 해석');

  await card.click();
  const sheet = page.getByTestId('daily-sheet');
  await expect(sheet).toBeVisible();

  const line = (await sheet.locator('.daily-sheet__verse').innerText()).trim();
  const origin = (await sheet.locator('.daily-sheet__origin p').innerText()).trim();
  expect(line, '한마디가 경전 원문과 같은 문장이면 풀어쓴 것이 아니에요').not.toBe(origin);

  await expect(sheet.locator('.daily-sheet__ai')).toHaveText(
    '불교의 가르침을 오늘의 언어로 풀었어요',
  );
  await expect(sheet.locator('.daily-sheet__lab')).toHaveText('경전 원문');

  // 순서가 뜻을 만든다. AI 한 줄 → AI 표시 → 경전 원문 → 출처
  expect(
    await firstComesBefore(page, '.daily-sheet__verse', '.daily-sheet__ai'),
    'AI 표시가 한마디 바로 뒤에 와야 해요',
  ).toBe(true);
  expect(
    await firstComesBefore(page, '.daily-sheet__origin', '.daily-sheet__cite'),
    '출처는 한마디가 아니라 경전 원문에 붙어야 해요',
  ).toBe(true);

  expect(await fontPx(page, '.daily-sheet__cite')).toBeGreaterThan(CAPTION_PX);
  expect(await fontPx(page, '.daily-sheet__ai')).toBeGreaterThanOrEqual(CAPTION_PX);
});

test('오늘의 부처의 말 아래 줄이 그 한마디를 부처의 가르침이라고 적지 않는다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page, DEEP_CONCERN);

  const today = page.getByTestId('buddha-message');
  await expect(today).toContainText('이 고민에 맞춰 AI 가 쓴 말이에요');

  /*
   * 감수를 통과한 16구절 중 6구절은 부처의 말이 아니라 원효·승만부인·조주 선사·뿐니까
   * 장로니의 말이다. 화면은 화자를 판정할 값을 받지 않으므로(서버가 주는 것은 완성된 귀속
   * 문구 한 줄뿐이다) 어느 구절이 붙어도 참인 말만 적는다.
   */
  expect(await today.innerText()).not.toContain('부처의 가르침');

  // 8.4px 짜리 표시는 붙어 있어도 안 읽힌다. 캡션 크기 아래로 내려가지 않는다
  expect(await fontPx(page, '[data-testid="buddha-message"] .sub-note')).toBeGreaterThanOrEqual(
    CAPTION_PX,
  );
});

test('마음 태그가 하나를 골라 마음의 중심이라고 단정하지 않는다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page, DEEP_CONCERN);

  const tags = page.getByTestId('answer-tags');
  await expect(tags).toContainText('적어 주신 이야기에서 이런 마음이 읽혔어요');

  /*
   * 전에는 첫 태그를 뽑아 「지금 마음의 중심에는 집착이 있어 보여요」라고 적었다.
   * 모델에게 순위를 물은 적이 없어 첫 태그는 중심이 아니고, 엄마 유품을 못 치우는
   * 사람에게 그 한 줄은 마음의 이름이 아니라 판정으로 읽힌다.
   */
  const shown = await tags.innerText();
  expect(shown).not.toContain('마음의 중심');
  expect(shown).not.toContain('있어 보여요');
});

test('경전 카드의 귀속 줄은 출처 캡션보다 크게 뜬다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page, DEEP_CONCERN);

  await expect(page.getByTestId('scripture-citation')).toBeVisible();
  expect(
    await fontPx(page, '[data-testid="scripture-citation"]'),
    '누가 한 말인지 적는 줄이 작으면 표시한 뜻이 없어요',
  ).toBeGreaterThan(CAPTION_PX);
});

test('공유 카드에는 경전 구절만 실리고, 한마디와 마음 태그는 실리지 않는다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page, DEEP_CONCERN);

  // 답변 화면에 뜬 한마디. 이 문장이 카드로 넘어가면 받는 사람이 상황을 읽는다
  const message = (await page.getByTestId('buddha-message').innerText()).trim();

  await revealBottomBar(page);
  await page.getByTestId('share-button').click();

  const card = page.getByTestId('share-card');
  await expect(card).toBeVisible();

  // 경전은 머리를 단 상자 안에만 있고, 귀속도 그 상자 안에 있다
  await expect(card.locator('.sh-card__quote .sh-card__qlab')).toHaveText('경전 원문');
  await expect(card.locator('.sh-card__quote cite')).not.toHaveText('');

  const shown = (await card.innerText()).trim();
  const verse = (await page.getByTestId('scripture-text').innerText()).trim();
  expect(shown, '경전 구절이 카드에 그대로 실려야 해요').toContain(verse.slice(0, 20));
  // 한마디는 경구체 두 문장이라 앞 열두 자만 맞아도 그 문장이 넘어온 것이다
  expect(shown, '카드에 오늘의 부처의 말이 실렸어요').not.toContain(
    message.split('\n')[0].slice(0, 12),
  );
  expect(await card.locator('.sh-card__chip').count(), '카드에 마음 태그가 실렸어요').toBe(0);

  // 카드에서 AI 가 쓴 것은 한 줄 풀이뿐이다. 소표기가 그것만 가리켜야 한다.
  // 앞머리는 감수 여부에 따라 갈리고, 이 고민문은 초안 구절로 떨어진다.
  // 갈리는 두 갈래 자체는 review-stamp.spec.ts 가 시드를 읽어 따로 본다
  await expect(card.locator('.sh-card__ai')).toHaveText(
    '문헌 감수는 아직 받지 않은 구절이에요 · 한 줄 풀이는 AI 생성',
  );

  // 예전 카드는 이 줄들이 8.4px 이라 사실상 안 보였다
  expect(await fontPx(page, '.sh-card__ai')).toBeGreaterThan(10);
  expect(await fontPx(page, '.sh-card__quote cite')).toBeGreaterThan(10);
});

test('공유 시트의 안심 문구가 카드에 실제로 실리는 것을 말한다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page, DEEP_CONCERN);
  await revealBottomBar(page);
  await page.getByTestId('share-button').click();

  await expect(page.getByTestId('share-sheet')).toContainText(
    '카드에는 경전 구절과 그 뜻만 담겨요. 적으신 이야기도 마음 태그도 들어가지 않아요',
  );
});

test('가장 긴 경전이 실려도 공유 카드에서 글이 잘리지 않는다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page, LONGEST_CONCERN);

  const shown = (await page.getByTestId('scripture-text').innerText()).trim();
  expect(shown, '이 고민문이 더는 가장 긴 구절로 떨어지지 않아요').toContain('내려놓지 못하겠거든');

  await revealBottomBar(page);
  await page.getByTestId('share-button').click();
  await expect(page.getByTestId('share-card')).toBeVisible();

  // 카드 안쪽은 overflow: hidden 이라 넘치면 소리 없이 잘린다. 자른 자리를 눈으로 못 본다
  const { client, scroll } = await page.locator('.sh-card__body').evaluate((el) => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
  }));
  expect(scroll, `공유 카드가 ${scroll - client}px 넘쳐서 아래가 잘렸어요`).toBeLessThanOrEqual(
    client,
  );
});
