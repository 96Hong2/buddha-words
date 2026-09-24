/**
 * 2026-09-21 회차에서 고친 것들.
 *
 *   광고 문     답을 만드는 화면으로 넘어갔다 돌아오지 않는다. 그 자리에서 시트가 선다
 *   연꽃 알림   썼으면 썼다고 말한다. 조용히 줄어들지 않는다
 *   설정        연꽃을 모을 수 있는 곳이 설정에도 있다
 *   권유 카드   화면 한가운데에 그림과 함께 선다
 *   답변 여백   「오늘의 부처의 말」과 경전 카드가 붙어 있지 않다
 *   공유 링크   메신저 미리보기 그림을 함께 넘긴다
 */

import { test, expect } from '../support/fixtures';
import {
  asNewcomer,
  askOnce,
  dismissDraftConfirm,
  dismissEntry,
  dismissNudge,
  leafBalance,
  revealBottomBar,
  withLeaves,
} from '../support/flow';
import { shot } from '../support/shots';

/** 오늘 첫 이야기를 보내고 홈으로 돌아온다. 두 번째부터 광고 문이 선다 */
async function afterFirstStory(page: import('@playwright/test').Page) {
  await askOnce(page);
  await dismissNudge(page);
  await page.goBack();
  await dismissEntry(page);
  await dismissDraftConfirm(page);
}

test('이야기를 보내면 답 만드는 화면을 거치지 않고 그 자리에서 광고 문이 선다', async ({
  page,
}) => {
  /*
   * 한때 이랬다: 보내기를 누르면 답을 만드는 화면이 뜨고, 3초쯤 뒤에 그 화면이 사라지며
   * 광고 시트가 올라왔다. 만들다 만 것처럼 보이고, 광고를 보기도 전에 답이 만들어지는
   * 줄로 읽힌다. 지금은 홈에 선 채로 시트가 먼저 뜬다.
   *
   * ⚠ 이 spec 은 스텁 판이라 **뒤에서 도는 요청이 없다.** 그 장치(`preflight`)와
   * 「요청이 한 번만 나간다」는 http 판에서 잰다(`api-errors.spec.ts`). 여기서 지키는
   * 것은 스텁 판에서도 같은 길로 간다는 것이다.
   */
  await withLeaves(page, 0);
  await page.goto('/');
  await afterFirstStory(page);

  await page.getByTestId('concern-field').fill('회사에서 실수를 했는데 계속 생각나요.');
  await page.getByTestId('submit').click();

  const sheet = page.getByTestId('continue-sheet');
  await expect(sheet).toBeVisible();
  // 대기 화면이 한 번도 서지 않았다. 주소도 홈 그대로다
  await expect(page.getByTestId('loading')).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/');
  await shot(page, '13 광고 문 - 홈에 선 채로 시트가 먼저 뜬다');

  // 광고를 끝까지 봐야 그때 답을 만들러 간다
  await page.getByTestId('continue-watch').click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
});

test('광고 시트를 닫으면 적은 글이 그대로 남고 답도 만들지 않는다', async ({ page }) => {
  await withLeaves(page, 0);
  await page.goto('/');
  await afterFirstStory(page);

  const text = '요즘 사람 만나는 게 버거워요.';
  await page.getByTestId('concern-field').fill(text);
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('continue-sheet')).toBeVisible();

  // 바깥을 눌러 닫는다
  await page.getByTestId('sheet-dim').first().click();
  await expect(page.getByTestId('continue-sheet')).toBeHidden();

  // 홈에 그대로 있고 쓰던 글도 그대로다. 답은 만들어지지 않았다
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.getByTestId('concern-field')).toHaveValue(text);
  await expect(page.getByTestId('loading')).toHaveCount(0);
});

test('연꽃으로 지나가면 썼다고 알리고 몇 송이 남았는지 말한다', async ({ page }) => {
  /*
   * 연꽃으로 지나가면 광고가 안 뜬다. 그 조용함이 **아무 일도 안 일어난 것**처럼 읽혀서,
   * 모아 둔 것이 줄어든 줄 모른 채 다음에 광고를 만나고 왜 뜨는지 모르게 된다.
   */
  await withLeaves(page, 2);
  await page.goto('/');
  await afterFirstStory(page);

  await page.getByTestId('concern-field').fill('밤마다 생각이 많아져요.');
  await page.getByTestId('submit').click();
  await page.getByTestId('leaf-spend-continue').click();

  const toast = page.getByTestId('leaf-spent-toast');
  await expect(toast).toContainText('연꽃 한 송이로 이어갔어요');
  await expect(toast).toContainText('1송이 남았어요');
  await shot(page, '13 연꽃 - 썼다고 알린다');

  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  expect(await leafBalance(page)).toBe(1);
});

test('마지막 한 송이를 쓰면 남은 것이 없다고 말한다', async ({ page }) => {
  await withLeaves(page, 1);
  await page.goto('/');
  await afterFirstStory(page);

  await page.getByTestId('concern-field').fill('요즘 잠을 잘 못 자요.');
  await page.getByTestId('submit').click();
  await page.getByTestId('leaf-spend-continue').click();

  // 「0송이 남았어요」보다 먼저 읽힌다
  await expect(page.getByTestId('leaf-spent-toast')).toContainText('남은 연꽃이 없어요');
});

test('설정에서도 연꽃을 모을 수 있다', async ({ page }) => {
  /*
   * 홈 위쪽 칩이 유일한 입구였다. 그 칩은 작고, 설정을 열어 앱이 뭘 해 주는지 훑는
   * 사람은 연꽃이라는 것이 있는 줄도 몰랐다.
   */
  await withLeaves(page, 3);
  await page.goto('/settings');

  const row = page.getByTestId('settings-leaf');
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeVisible();
  await expect(row).toContainText('연꽃 모으기');
  await expect(row).toContainText('30초 광고로 2송이씩 모아요');
  // 지금 몇 송이인지도 그 줄에서 읽힌다
  await expect(row).toContainText('3송이');
  await shot(page, '13 설정 - 연꽃 모으기');

  await row.click();
  await expect(page.getByTestId('leaf-sheet')).toBeVisible();
  await expect(page.getByTestId('leaf-sheet-count')).toHaveText('3송이');
});

test('권유 카드는 화면 한가운데에 그림과 함께 선다', async ({ page }) => {
  /*
   * 한때 화면 아래에 덮개 없이 띄웠다. 화면 아래 3분의 1은 버튼이 늘 서 있는 자리라,
   * 거기 얹힌 카드도 버튼 줄의 일부로 읽혔다(「애매한 위치에 애매한 크기」).
   */
  await asNewcomer(page);
  await page.goto('/');
  await askOnce(page);

  const card = page.getByTestId('home-add');
  await expect(card).toBeVisible();
  await expect(card).toContainText('토스 홈에 두고 바로 열 수 있어요');
  // 「이미 추가했어요」까지 그대로다
  await expect(page.getByText('이미 추가했어요')).toBeVisible();
  await shot(page, '13 권유 - 화면 한가운데');

  // 그림 한 장이 제목 위에 선다
  await expect(card.locator('.gr-art svg')).toHaveCount(1);

  // 세로 가운데에 선다. 화면 아래 3분의 1에 눌려 있지 않다
  const box = (await card.boundingBox())!;
  const view = page.viewportSize()!;
  const center = box.y + box.height / 2;
  expect(center).toBeGreaterThan(view.height * 0.25);
  expect(center).toBeLessThan(view.height * 0.75);

  /*
    덮개가 뒤를 **실제로 막는다.** 개수만 세면 안 된다. 한때 덮개가 z 6 이고 답변
    하단 바가 40 이라, 덮개가 떠 있는데도 「간직하기」가 그 위로 나와 눌렸다.
  */
  await expect(page.locator('.gr-scrim')).toHaveCount(1);
  const blocked = await page.evaluate(() => {
    const save = document.querySelector('[data-testid="save-button"]');
    if (save == null) return 'no-button';
    const box = save.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return save.contains(top) ? 'clickable' : 'blocked';
  });
  expect(blocked).toBe('blocked');

  // 뒤 화면 스크롤도 잠긴다
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
});

test('말씀을 간직할 때도 연꽃을 썼다고 알린다', async ({ page }) => {
  // 쓰는 자리가 둘이다. 한쪽만 재면 다른 쪽 문구가 조용히 어긋난다
  await withLeaves(page, 2);
  await page.goto('/');
  await askOnce(page);
  await dismissNudge(page);
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();

  await expect(page.getByTestId('save-gate')).toBeVisible();
  await page.getByTestId('leaf-spend-save').click();

  const toast = page.getByTestId('leaf-spent-toast');
  await expect(toast).toContainText('연꽃 한 송이로 간직했어요');
  await expect(toast).toContainText('1송이 남았어요');
  expect(await leafBalance(page)).toBe(1);
});

test('오늘의 부처의 말과 경전 카드가 붙어 있지 않다', async ({ page }) => {
  /*
   * 경전 카드만 스크롤 계측용 래퍼 한 겹 안에 들어 있어서, 그 안에서 자기가 첫 자식이
   * 되어 「첫 블록은 위 여백 0」 규칙에 걸렸다. 두 덩이가 한 덩이로 읽혔다.
   */
  await page.goto('/');
  await askOnce(page);
  await dismissNudge(page);

  const message = page.getByTestId('buddha-message');
  const scripture = page.getByTestId('scripture-card');
  await expect(message).toBeVisible();
  await expect(scripture).toBeVisible();

  const above = (await message.boundingBox())!;
  const below = (await scripture.boundingBox())!;
  const gap = below.y - (above.y + above.height);
  // 섹션 사이 간격(--gap-section 32px)이 살아 있다. 여유를 두고 24 로 잰다
  expect(gap).toBeGreaterThanOrEqual(24);
  await shot(page, '13 답변 - 한마디와 경전 사이 여백');
});

test('앱을 알리는 링크에는 메신저 미리보기 그림이 함께 간다', async ({ page }) => {
  /*
   * 안 주면 토스 그림이 뜬다. 카톡에 붙은 우리 링크가 토스 로고로 보이던 것이 그 때문이다.
   */
  await page.addInitScript(() => {
    window.__buddhaBridge = {
      ...window.__buddhaBridge,
      share: 'sent',
      appLink: 'https://toss.im/_m/stub-app-link',
    };
  });
  await asNewcomer(page);
  await page.goto('/');
  // 첫 답에는 홈 추가를 권한다. 앱 알리기는 둘째 답 자리다(milestones 시간표)
  await askOnce(page);
  await dismissNudge(page);
  await page.goBack();
  await askOnce(page, '요즘 사람 만나는 게 버거워요.');

  await page.getByTestId('app-share-send').click();

  const og = await page.evaluate(() => window.__buddhaShareOgImage ?? null);
  /*
    번들이 아니라 **백엔드가** 내주는 그림이다. 번들 주소(`*.apps.tossmini.com`)는
    토스 밖에서 400 이라 크롤러가 애초에 못 읽는다. 그래서 경로만 보지 않고 앞자리까지
    본다: 화면이 보는 백엔드 주소와 같아야 한다.
  */
  expect(og).not.toBeNull();
  expect(og).toMatch(/^https?:\/\/[^/]+\/og\/default\.jpg$/);
  expect(og).not.toContain('tossmini.com');
});

test('위기 글은 광고 시트를 거치지 않고 곧장 창구로 간다', async ({ page }) => {
  /*
   * 가장 중요한 자리다. 답을 두 번째로 보내는 길에는 광고 문이 서는데, 죽고 싶다고 적은
   * 사람이 그 문 앞에 서면 안 된다. 서버도 같은 판정으로 광고 문을 건너뛴다
   * (`routes.py` 의 `_rules_saw_crisis`). 화면도 같은 기준을 쓴다.
   */
  await withLeaves(page, 0);
  await page.goto('/');
  await afterFirstStory(page);

  await page.getByTestId('concern-field').fill('요즘 다 그만두고 죽고 싶다는 생각이 들어요.');
  await page.getByTestId('submit').click();

  // 광고 시트가 한 번도 서지 않는다
  await expect(page.getByTestId('continue-sheet')).toHaveCount(0);
  await expect(page.getByTestId('crisis')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('continue-sheet')).toHaveCount(0);
});
