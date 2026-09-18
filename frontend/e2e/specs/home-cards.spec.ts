/**
 * 홈에 붙는 조각들과 빈 보관함.
 *
 * 예시 칩과 회고 카드는 「처음 온 사람」과 「어제 왔던 사람」이 각각 보는 화면이라
 * 기본 진입만 찍어서는 한 번도 나오지 않는다. 보관함도 마찬가지로 채워진 화면만 찍으면
 * 정작 대부분의 사람이 처음 보는 빈 화면을 아무도 확인하지 않는다.
 */

import { test, expect, type Page } from '../support/fixtures';
import { todayISO } from '../support/flow';
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
  // 일주일 전에 적어 드린 것을 「어제」라고 물으면 그날 일을 기억하는 사람에게 거짓말이 된다
  await expect(card).not.toContainText('어제');
  await expect(card).toContainText('지난 이야기');
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
