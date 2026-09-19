/**
 * 홈에 붙는 조각들과 빈 보관함.
 *
 * 예시 칩과 회고 카드는 「처음 온 사람」과 「어제 왔던 사람」이 각각 보는 화면이라
 * 기본 진입만 찍어서는 한 번도 나오지 않는다. 보관함도 마찬가지로 채워진 화면만 찍으면
 * 정작 대부분의 사람이 처음 보는 빈 화면을 아무도 확인하지 않는다.
 */

import { test, expect, type Page } from '../support/fixtures';
import { askOnce, dismissEntry, todayISO } from '../support/flow';
import { shot } from '../support/shots';

test('예시 칩을 누르면 그 문장이 입력칸에 들어가고 칩은 물러난다', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('entry-card-cta').click();

  // 둘이다. 셋이면 화면에서 두 줄이 되고 그만큼 입력칸이 밀린다
  const chips = page.getByTestId('example-chip');
  await expect(chips).toHaveCount(2);

  const first = chips.first();
  const label = (await first.innerText()).trim();
  await first.click();

  // 누른 문장이 그대로 들어간다. 「예시를 참고하세요」 같은 안내로 바뀌지 않는다
  await expect(page.getByTestId('concern-field')).toHaveValue(label);
  await shot(page, '03 홈 - 예시 칩을 누르면 그 문장이 입력칸에 들어간다', { fullPage: true });
  // 쓰기 시작하면 칩은 사라진다. 남아 있으면 쓴 글과 예시가 섞여 보인다
  await expect(chips).toHaveCount(0);
  await expect(page.getByTestId('submit')).toBeEnabled();
});

/**
 * 지난번에 「내일 물어봐 주세요」를 누른 기기. 남는 것은 이 세 자리뿐이고
 * 고민 원문도 답변 본문도 여기 없다.
 *
 * 한 번만 심는다. 열 때마다 다시 심으면 앱이 지운 것까지 되살아나, 다시 열어도 시트가
 * 안 뜨는지 확인할 수 없다.
 */
async function seedRecall(page: Page, daysAgo = 1) {
  await page.addInitScript((day) => {
    if (localStorage.getItem('pocket:e2e:recall-seeded') != null) return;
    localStorage.setItem('pocket:e2e:recall-seeded', '1');
    localStorage.setItem(
      'pocket:mock:recall-last',
      JSON.stringify({
        answerId: 'seed-recall-1',
        date: day,
        firstActionTitle: '오늘 자기 전에 이 마음 한 줄만 적어 두기',
      }),
    );
  }, todayISO(-daysAgo));
}

test('어제 물어봐 달라고 했으면 그날 적어 드린 행동을 되묻는다', async ({ page }) => {
  await seedRecall(page);
  await page.goto('/');

  /*
   * 홈 카드였던 것을 시트로 옮겼다. 부탁하지 않은 질문이 매일 홈 첫 줄에 서 있었고,
   * 지금은 답변에서 「내일 물어봐 주세요」를 누른 사람에게만 다음 날 한 번 뜬다.
   */
  const card = page.getByTestId('recall-sheet');
  await expect(card).toBeVisible();
  await expect(card).toContainText('오늘 자기 전에 이 마음 한 줄만 적어 두기');
  // 기기에 원문을 남기지 않으므로 어제 쓴 고민이 이 카드에 나올 수 없다
  await expect(card).not.toContainText('팀장');
  await expect(card.getByRole('button', { name: '해봤어요' })).toBeVisible();
  await expect(card.getByRole('button', { name: '아직이요' })).toBeVisible();

  await shot(page, '07 홈 - 어제 이야기를 되짚는 시트', { fullPage: true });
});

test('며칠 만에 온 사람에게는 어제라고 하지 않는다', async ({ page }) => {
  await seedRecall(page, 7);
  await page.goto('/');

  const card = page.getByTestId('recall-sheet');
  await expect(card).toBeVisible();
  // 일주일 전에 적어 드린 것을 「어제」라고 물으면 그날 일을 기억하는 사람에게 거짓말이 된다.
  // 대신 날짜를 그대로 적는다. 「지난 이야기」 같은 라벨은 없앴다(바로 아래 줄이 같은 말을 했다)
  await expect(card).not.toContainText('어제');
  await expect(card).toContainText('에 적어 드린');
  await expect(card).toContainText('오늘 자기 전에 이 마음 한 줄만 적어 두기');
});

test('한 번만 눌러도 답이 되고 다시 열어도 또 묻지 않는다', async ({ page }) => {
  await seedRecall(page);
  await page.goto('/');

  const card = page.getByTestId('recall-sheet');
  await expect(card).toBeVisible();
  await page.getByTestId('recall-yes').click();

  // 한 번 답하면 오늘은 다시 묻지 않는다
  await expect(card).toHaveCount(0);
  // 「해봤어요」인지 「아직이요」인지까지 남는다. 행동까지 갔는지 재는 유일한 답이다
  const done = await page.evaluate(() =>
    (window.__pocketLogs ?? []).find((log) => log.name === 'recall_card_click'),
  );
  expect((done?.params as Record<string, unknown>).done).toBe(true);
  const names = await page.evaluate(() => (window.__pocketLogs ?? []).map((log) => log.name));
  expect(names).toContain('recall_card_click');

  // 앱을 다시 열어도 마찬가지다. 화면에서만 치우면 기기에 남아 매번 같은 것을 묻는다
  await page.reload();
  await expect(page.getByTestId('concern-field')).toBeVisible();
  await expect(page.getByTestId('recall-sheet')).toHaveCount(0);
});

test('보관함은 아무것도 없을 때 무엇을 하면 되는지 알려 준다', async ({ page }) => {
  await page.goto('/archive');
  await expect(page.getByTestId('archive')).toBeVisible();

  // 빈 화면에 「없음」만 띄우지 않는다. 어디를 눌러야 쌓이는지까지 적는다
  await expect(page.getByText('아직 간직한 말씀이 없어요')).toBeVisible();
  await expect(page.getByText('답변 아래 간직하기를 누르면 여기에 쌓여요')).toBeVisible();
  await expect(page.getByTestId('archive-item')).toHaveCount(0);
  // 빈 자리에 이용권을 팔지 않는다
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  await shot(page, '27 보관함 - 아직 간직한 말씀이 없을 때', { fullPage: true });

  await page.getByRole('button', { name: '이야기하러 가기' }).click();
  await expect(page.getByTestId('concern-field')).toBeVisible();
});

test('쓰던 글을 언제든 통째로 지울 수 있고, 한 번 더 묻는다', async ({ page }) => {
  /*
   * 「지우고 새로 쓰기」는 답을 받고 돌아온 자리에서만 물어봐서, 그 순간을 놓치면 쓴 글을
   * 손으로 지우는 수밖에 없었다. 이 자리는 **언제나** 있다.
   *
   * 대신 쉽게 눌리면 안 된다. 되돌릴 수 없는데 손가락은 전송 버튼 근처를 오간다.
   * 눌러도 바로 지우지 않고 같은 자리에서 한 번 더 묻는다.
   */
  await page.goto('/');
  await page.getByTestId('entry-card-cta').click();

  const field = page.getByTestId('concern-field');
  // 빈 칸에는 지우기가 없다. 지울 것이 없는 버튼을 두지 않는다
  await expect(page.getByTestId('draft-clear')).toHaveCount(0);

  await field.fill('요즘 팀장님과 부딪히는 일이 잦아서 계속 마음이 무겁습니다');
  const clear = page.getByTestId('draft-clear');
  await expect(clear).toBeVisible();

  /*
   * 전송 버튼과 헷갈리지 않아야 한다. 크고 가까우면 「이야기 보내기」를 누르려던 사람이
   * 쓴 글을 날린다. 셋으로 막는다: 훨씬 작게, 손가락이 겹치지 않을 만큼 띄워서,
   * 그리고 눌러도 바로 지우지 않고 한 번 더 물어서.
   */
  const clearBox = await clear.boundingBox();
  const sendBox = await page.getByTestId('submit').boundingBox();
  expect(clearBox!.width, '지우기가 전송 버튼만큼 커요').toBeLessThan(sendBox!.width / 3);
  // 누를 자리(가상 요소로 44px 까지 넓힌 것)와 전송 버튼 사이가 손가락 하나만큼 떨어진다
  const clearHitBottom = clearBox!.y + clearBox!.height / 2 + 22;
  expect(sendBox!.y - clearHitBottom, '지우기와 전송 버튼이 너무 붙어 있어요').toBeGreaterThan(20);

  await clear.click();
  await expect(page.getByText('쓰신 글을 모두 지울까요?')).toBeVisible();
  await shot(page, '04-1 홈 - 쓰던 글을 지울지 한 번 더 묻는다', { fullPage: true });

  // 그대로 두기를 누르면 글이 남는다. 기본은 남기는 쪽이다
  await page.getByTestId('draft-clear-cancel').click();
  await expect(field).toHaveValue(/팀장님/);

  await page.getByTestId('draft-clear').click();
  await page.getByTestId('draft-clear-confirm').click();
  await expect(field).toHaveValue('');
  await expect(page.getByTestId('draft-clear')).toHaveCount(0);

  const names = await page.evaluate(() => (window.__pocketLogs ?? []).map((log) => log.name));
  expect(names).toContain('draft_clear_open');
  expect(names).toContain('draft_clear_confirm');
});

test('입력칸 위에 뜨는 카드가 제목에 달라붙지 않는다', async ({ page, stub }) => {
  /*
   * 「쓰시던 이야기가 남아 있어요」가 「무슨 일이 있었나요?」에 그대로 붙어 있었다.
   * 카드가 없을 때는 입력칸이 첫째라 스스로 여백을 갖고 있었는데, 그 여백이 카드에게
   * 넘어가지 않았다. 여기 서는 카드는 앞으로도 늘 있으므로 자리에 규칙을 걸었다.
   */
  test.setTimeout(90_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.goto('/');
  await askOnce(page);

  // 답을 받고 홈으로 돌아오면 보낸 글이 입력칸에 남아 있어 카드가 선다
  await page.getByTestId('again-button').click();
  const card = page.getByTestId('draft-confirm');
  await expect(card).toBeVisible();

  const hero = await page.getByRole('heading', { name: /무슨 일이 있었나요/ }).boundingBox();
  const cardBox = await card.boundingBox();
  const gap = cardBox!.y - (hero!.y + hero!.height);
  // 16px 한 칸. 0 이면 제목과 한 덩어리로 읽힌다
  expect(gap).toBeGreaterThanOrEqual(12);
  await shot(page, '04-2 홈 - 카드와 제목 사이 여백', { fullPage: true });
});

test('지우는 버튼이 한 화면에 둘 서지 않고, 비운 뒤 새로 써도 「남아 있어요」가 되살아나지 않는다', async ({
  page,
  stub,
}) => {
  /*
   * 두 가지를 함께 본다.
   *
   * ① 「쓰시던 이야기가 남아 있어요」 안에 이미 「지우고 새로 쓰기」가 있다. 그 옆에
   *    「전체 지우기」까지 세우면 같은 일을 하는 버튼이 한 화면에 둘이다.
   * ② 그 카드는 글자 수만 보고 서 있어서, 비운 뒤 새 이야기를 쓰기 시작하면 다시 떴다.
   *    방금 스스로 치운 사람에게 「남아 있어요」라고 되묻는 꼴이다.
   */
  test.setTimeout(90_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.goto('/');
  await askOnce(page);

  await page.getByTestId('again-button').click();
  await expect(page.getByTestId('draft-confirm')).toBeVisible();
  // 묻는 카드가 서 있는 동안에는 전체 지우기를 감춘다
  await expect(page.getByTestId('draft-clear')).toHaveCount(0);

  await page.getByTestId('draft-confirm-clear').click();
  await expect(page.getByTestId('concern-field')).toHaveValue('');
  await expect(page.getByTestId('draft-confirm')).toHaveCount(0);

  await page.getByTestId('concern-field').fill('완전히 새로 쓰는 이야기입니다');
  await expect(page.getByTestId('draft-confirm')).toHaveCount(0);
  // 지우기는 다시 나타난다. 쓴 글이 있으니 치울 것도 있다
  await expect(page.getByTestId('draft-clear')).toBeVisible();

  // 눌러도 바로 지우지 않는다. 한 번 더 묻고, 그대로 두기를 고르면 글이 살아 있다
  await page.getByTestId('draft-clear').click();
  await page.getByTestId('draft-clear-cancel').click();
  await expect(page.getByTestId('concern-field')).toHaveValue('완전히 새로 쓰는 이야기입니다');

  await page.getByTestId('draft-clear').click();
  await page.getByTestId('draft-clear-confirm').click();
  await expect(page.getByTestId('concern-field')).toHaveValue('');
  await expect(page.getByTestId('draft-clear')).toHaveCount(0);
});

test('전체 지우기가 제 줄을 차지하지 않고 깊이 표시 옆에 선다', async ({ page }) => {
  /*
   * 예전에는 입력칸 위에 줄 하나를 통째로 썼다. 오른쪽 끝에 작은 글씨 하나뿐이고 왼쪽이
   * 다 비어서, 화면에 빈 띠가 하나 생긴 것처럼 보였다. 지금은 깊이 표시와 같은 줄이다.
   */
  await page.goto('/');
  await dismissEntry(page);
  await page
    .getByTestId('concern-field')
    .fill('요즘 마음이 자꾸 무너져 내려요. 어떻게 해야 할까요');

  const clear = page.getByTestId('draft-clear');
  await expect(clear).toBeVisible();

  const clearBox = await clear.boundingBox();
  const meterBox = await page.getByTestId('depth-label').boundingBox();
  const fieldBox = await page.getByTestId('concern-field').boundingBox();

  // 같은 줄이다. 두 상자의 세로 중심이 한 줄 높이 안에서 만난다
  const clearMid = clearBox!.y + clearBox!.height / 2;
  const meterMid = meterBox!.y + meterBox!.height / 2;
  expect(Math.abs(clearMid - meterMid), '지우기가 깊이 표시와 다른 줄에 있어요').toBeLessThan(16);

  // 입력칸 아래에 있고 오른쪽 끝에 붙는다
  expect(clearBox!.y).toBeGreaterThan(fieldBox!.y + fieldBox!.height - 4);
  expect(clearBox!.x).toBeGreaterThan(meterBox!.x + meterBox!.width);

  // 보이는 글자는 작아도 누를 자리는 44px 를 채운다
  const tap = await clear.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const before = getComputedStyle(node, '::before');
    return { height: rect.height, hit: parseFloat(before.height) };
  });
  expect(Math.max(tap.height, tap.hit)).toBeGreaterThanOrEqual(44);

  await shot(page, '04-3 홈 - 깊이 표시와 전체 지우기');
});
