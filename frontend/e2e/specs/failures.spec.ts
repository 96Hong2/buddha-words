/**
 * 답이 나오지 않은 자리.
 *
 * 세 갈래(오래 걸림 · 인터넷 끊김 · 오늘 자리가 닫힘)가 같은 화면을 쓰되 문구만 갈린다.
 * 어느 갈래든 지켜야 하는 것은 같다.
 *   1. 사용자를 탓하지 않고, 무엇이 일어났는지 사람 말로 적는다
 *   2. 쓴 글이 남아 있고 오늘 남은 횟수가 줄지 않았다고 **버튼보다 먼저** 알린다
 *   3. 나가는 길이 둘(다시 해보기 · 닫기) 있고, 닫으면 쓴 글이 그대로 있다
 */

import { test, expect } from '../support/fixtures';
import { dismissEntry, NORMAL_CONCERN } from '../support/flow';
import { shot } from '../support/shots';

const KEPT_NOTE = '쓰신 이야기는 그대로 있어요. 다시 보내도 오늘 남은 횟수는 줄지 않아요';

const CASES = [
  {
    fail: 'timeout' as const,
    name: '45 오류 - 답을 만드는 데 너무 오래 걸렸을 때',
    message: '답을 만드는 데 너무 오래 걸렸어요. 다시 보내 주세요.',
    banner: false,
  },
  {
    fail: 'offline' as const,
    name: '46 오류 - 인터넷이 끊겼을 때',
    message: '지금 인터넷이 닿지 않아요. 연결을 확인하고 다시 보내 주세요.',
    banner: true,
  },
  {
    fail: 'budget' as const,
    name: '47 오류 - 오늘 자리가 닫혔을 때',
    message: '지금은 이야기가 많이 몰려 있어요. 잠시 뒤에 다시 보내 주세요.',
    banner: false,
  },
];

for (const item of CASES) {
  test(`보내지 못했을 때(${item.fail}): 사람이 읽는 문구와 나가는 길 둘`, async ({
    page,
    stub,
  }) => {
    await stub({ failSend: item.fail });
    await page.goto('/');
    await dismissEntry(page);
    await page.getByTestId('concern-field').fill(NORMAL_CONCERN);
    await page.getByTestId('submit').click();

    const state = page.getByTestId('error-state');
    await expect(state).toBeVisible({ timeout: 20_000 });
    await expect(state).toContainText('지금은 답을 만들지 못했어요');
    await expect(state).toContainText(item.message);
    // 가장 먼저 궁금한 것이 「내 횟수 날아갔나」다. 그 답이 버튼보다 위에 있다
    await expect(state).toContainText(KEPT_NOTE);

    if (item.banner) {
      await expect(page.getByText('인터넷이 끊겼어요. 연결되면 이어서 할 수 있어요')).toBeVisible();
    }

    // 서버가 준 문자열이나 개발자용 단어가 새지 않는다
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/Error|undefined|\[object|Failed to fetch/);

    await expect(page.getByTestId('retry')).toBeVisible();
    await expect(page.getByRole('button', { name: '닫기' })).toBeVisible();
    await shot(page, item.name, { fullPage: true });

    // 닫고 돌아가면 쓴 글이 그대로다. 실패가 글을 지우지 않는다
    await page.getByRole('button', { name: '닫기' }).click();
    await expect(page.getByTestId('concern-field')).toHaveValue(NORMAL_CONCERN);
  });
}

test('다시 해보기를 누르면 같은 글로 다시 보내고, 서버가 돌아오면 답이 온다', async ({
  page,
  stub,
}) => {
  await stub({ failSend: 'timeout', pass1Ms: 200, pass2Ms: 200 });
  await page.goto('/');
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(NORMAL_CONCERN);
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('error-state')).toBeVisible({ timeout: 20_000 });

  // 서버가 돌아왔다
  await page.evaluate(() => {
    if (window.__buddhaStub != null) window.__buddhaStub.failSend = undefined;
  });
  await page.getByTestId('retry').click();

  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('buddha-message')).toBeVisible();
});
