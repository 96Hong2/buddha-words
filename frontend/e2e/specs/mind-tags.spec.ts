/**
 * 마음 태그 칩과 상단 AI 표시가 사람을 판정하지 않는가.
 *
 * 칩은 답변 화면 맨 위에 서서 본문보다 먼저 읽힌다. 그 자리에 마음의 이름이 아니라 그 사람의
 * 문제 이름이 서면 한 칸이 판정이 된다. 실제 모델로 재 보니 이별한 사람에게는 늘, 사별한
 * 사람에게도 「#집착」이 떴다. 같은 화면 본문은 「정리가 늦어서 생긴 잘못이 아니에요」로
 * 다독이는데 맨 위 칩이 먼저 판정을 내리고 있었다. 서버는 이미 사별한 사람에게 「집착이
 * 문제였다」로 읽히는 구절을 후보에서 거르는데(domains/scripture/safety.py) 화면 칩만 그
 * 기준 밖에 있었다.
 *
 * 상단 배지도 같은 종류의 어긋남이었다. sticky 라 경전 원문 카드 위에까지 따라오는데
 * 「AI 생성」 한 마디라 경전까지 모델이 지어낸 것처럼 읽혔다.
 *
 * 여기서 보는 것은 셋이다.
 *   1. 칩에 판정으로 읽히는 말이 없는가
 *   2. 답변 화면과 보관함이 같은 마음에 같은 이름을 붙이는가
 *   3. 상단 배지가 무엇이 AI 이고 무엇이 아닌지 갈라 말하는가
 */

import { expect, test, type Page } from '../support/fixtures';
import { askOnce, saveAnswerFromScreen } from '../support/flow';

/**
 * 「아직 남은 마음(attachment)」이 붙는 고민.
 *
 * 스텁은 낱말로 태그를 고른다(shared/api/stubData.ts 의 THEME_WORDS). 「아직도」가 그 자리를
 * 고르는 말이고, 그보다 앞줄에 있는 낱말(이별·헤어·잠·화가 …)은 일부러 하나도 넣지 않았다.
 * 스텁 사전이 바뀌면 여기서 먼저 깨진다. 그때 글을 다시 고른다.
 */
const HOLDING_ON = [
  '그 사람 연락처를 아직도 못 지우고 있어요.',
  '하루에도 몇 번씩 그 사람 계정을 들여다보고, 그러고 나면 하루가 무너져요.',
  '이제 그만해야 한다는 걸 알면서도 잘 안 돼요.',
].join('\n');

/**
 * 그 상태의 사람이 자기 화면에서 보면 판정으로 읽히는 말.
 *
 * 「집착」·「미련」은 불교에서 허물의 이름이고, 「인정욕구」·「열등감」은 사람의 결함을 부르는
 * 이름이다. 마음의 이름이 아니라 진단서라서 칩 자리에 설 수 없다.
 */
const VERDICT_WORDS = ['집착', '미련', '인정욕구', '열등감'];

/** 마음 태그 열한 가지 전부. 하나라도 판정으로 읽히면 안 된다 */
const ALL_TAGS = [
  'anxiety',
  'confusion',
  'comparison',
  'approval',
  'attachment',
  'loneliness',
  'anger',
  'regret',
  'emptiness',
  'fatigue',
  'other',
];

/** 칩 하나하나를 문자열로. 순서까지 그대로 본다 */
async function chips(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).allInnerTexts();
}

test('놓지 못하는 마음에 붙는 칩이 「집착」이 아니다', async ({ page, stub }) => {
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.goto('/');
  await askOnce(page, HOLDING_ON);

  const tags = page.getByTestId('answer-tags');
  await expect(tags).toContainText('적어 주신 이야기에서 이런 마음이 읽혔어요');

  const shown = await chips(page, '.ans .tags .tag');
  expect(shown, '이 고민이 더는 「아직 남은 마음」 자리로 떨어지지 않아요').toContain(
    '#아직 남은 마음',
  );

  const line = shown.join(' ');
  for (const word of VERDICT_WORDS) {
    expect(line, `칩에 「${word}」이 떴어요. 마음의 이름이 아니라 판정이에요`).not.toContain(word);
  }
});

test('마음 태그 열한 가지 어디에도 판정으로 읽히는 말이 없다', async ({ page }) => {
  await page.addInitScript((tags) => {
    localStorage.setItem(
      'buddha.archive.v1',
      JSON.stringify({
        version: 1,
        items: [
          {
            answerId: 'seed-all-tags',
            savedAt: Date.now(),
            line: '가까울수록 사이를 두어라. 나무도 붙어 자라면 함께 시든다.',
            tags,
            visualTheme: 'relationship',
          },
        ],
      }),
    );
  }, ALL_TAGS);

  await page.goto('/archive');
  await expect(page.getByTestId('archive')).toBeVisible();

  const shown = await chips(page, '.arch-tag');
  expect(shown, '열한 가지가 다 뜨지 않았어요').toHaveLength(ALL_TAGS.length);

  const line = shown.join(' ');
  for (const word of VERDICT_WORDS) {
    expect(line, `보관함 칩에 「${word}」이 떴어요`).not.toContain(word);
  }
  // 「지침」은 指針으로도 읽혀 무슨 말인지 갈린다. 답변 화면의 「지친 마음」과도 갈라져 있었다
  expect(line, '「지침」은 지쳤다는 뜻으로 읽히지 않아요').not.toContain('#지침');
});

test('같은 마음에 답변 화면과 보관함이 같은 이름을 붙인다', async ({ page, stub }) => {
  test.setTimeout(90_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.goto('/');
  await askOnce(page, HOLDING_ON);

  const onAnswer = await chips(page, '.ans .tags .tag');

  await saveAnswerFromScreen(page);

  await page.goto('/archive');
  await expect(page.getByTestId('archive-item')).toHaveCount(1);

  const onArchive = await chips(page, '.arch-tag');
  // 몇 달 뒤에 다시 열어 보는 자리다. 여기서만 이름이 달라지면 같은 답변이 두 이름을 갖는다
  expect(onArchive, '보관함이 답변 화면과 다른 이름을 붙였어요').toEqual(onAnswer);
});

test('상단 배지가 경전까지 AI 가 쓴 것처럼 말하지 않는다', async ({ page, stub }) => {
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.goto('/');
  await askOnce(page, HOLDING_ON);

  const badge = page.locator('.ans .ai-badge');
  await expect(badge).toBeVisible();

  const text = (await badge.innerText()).trim();
  // 고지 의무가 요구하는 말이다. 예외를 덧붙이면서 이 넉 자를 잃으면 안 된다
  expect(text, '「AI 생성」 표시가 사라졌어요').toContain('AI 생성');
  // 그리고 그 말이 무엇까지 가리키는지 같은 줄에서 갈라 준다
  expect(text, '배지가 화면 전체를 AI 생성이라고 말하고 있어요').toContain('경전');

  // 배지는 sticky 다. 경전 원문 카드 위에 실제로 올라선 동안에도 같은 말을 해야 한다.
  // 화면 안에 들어왔는지만 보면 스크롤이 0 이어도 통과하므로, 두 사각형이 겹치는지를 본다
  await page.evaluate(() => {
    const card = document.querySelector('[data-testid="scripture-card"]');
    if (card == null) throw new Error('경전 카드를 못 찾았어요');
    window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY + 8);
  });
  const overlap = await page.evaluate(() => {
    const b = document.querySelector('.ans .ai-badge')!.getBoundingClientRect();
    const c = document.querySelector('[data-testid="scripture-card"]')!.getBoundingClientRect();
    return b.bottom > c.top && b.top < c.bottom;
  });
  expect(overlap, '배지가 경전 카드 위에 서는 자리를 못 만들었어요').toBe(true);
  await expect(badge).toBeInViewport();
  expect((await badge.innerText()).trim(), '경전 카드 위에서 배지 말이 달라졌어요').toBe(text);

  /*
   * 화면을 다 읽고 나가는 자리.
   *
   * 무엇이 AI 이고 무엇이 아닌가는 위 배지가 이미 말했다. 같은 말을 여기서 세 번째로
   * 하지 않고, 이 자리에서만 할 수 있는 말(어디서 확인하나 · 의학 조언이 아니다)을 한다.
   */
  const notice = page.locator('.ans .notice p').first();
  await expect(notice).toContainText('「원문 보기」에 적어 두었어요');
  await expect(notice).toContainText('의학·법률 조언이 아니에요');
  // 감수 도장은 근거가 있는 자리에서만 찍는다. 후보 풀에는 감수 전 구절이 함께 들어 있어
  // 이 줄은 어느 구절이 붙었는지 모른 채 「사람이 감수했다」고 적을 수 없다
  expect(
    (await notice.innerText()).includes('사람이 감수'),
    '어느 구절이 붙었는지 모르는 자리에 감수 도장이 찍혔어요',
  ).toBe(false);
});
