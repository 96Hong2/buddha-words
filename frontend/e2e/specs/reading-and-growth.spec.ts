/**
 * 읽기 편함과 권유 자리.
 *
 * 이번 판에서 새로 생긴 것 넷을 본다.
 *
 *   글자 크기 네 단      어른이 쓸 수도 있다. 눌러서 실제로 커지는지
 *   답을 만드는 동안 광고  비어 있던 대기 시간을 덮는다. **답이 늦어지지 않는 것**이 핵심
 *   홈에 추가 안내       온보딩을 지난 사람에게 한 번. 입력을 가리지 않는다
 *   앱 권하기           세 번째 답 뒤 한 번. 답을 덮지 않는다
 *
 * 넷 다 사람이 부탁하지 않은 것을 화면에 더한다. 그래서 **무엇을 가리지 않는가**를 함께 본다.
 */

import { expect, test } from '../support/fixtures';
import { DEEP_CONCERN, askOnce, dismissEntry, revealBottomBar } from '../support/flow';
import { shot } from '../support/shots';

/** 본문 글자 크기. 토큰 하나가 화면 전체를 끌고 간다 */
async function bodyPx(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() =>
    parseFloat(getComputedStyle(document.body).fontSize),
  );
}

test('글자 크기를 키우면 화면 전체가 함께 커지고, 다시 열어도 그대로다', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('settings')).toBeVisible();

  const base = await bodyPx(page);
  await shot(page, '42 설정 - 글자 크기 고르기');

  // 「아주 크게」까지 네 단. 칸마다 자기 크기로 「가」를 보여 준다
  const options = page.getByTestId('text-size-option');
  await expect(options).toHaveCount(4);
  await options.nth(3).click();

  const bigger = await bodyPx(page);
  expect(bigger, '글자 크기를 골랐는데 본문이 그대로예요').toBeGreaterThan(base);
  await shot(page, '42-1 설정 - 아주 크게');

  // 답변 화면도 같은 토큰을 쓴다. 설정 화면에서만 커지면 아무 소용이 없다
  await page.goto('/');
  expect(await bodyPx(page)).toBe(bigger);

  // 앱을 새로 띄워도 고른 크기가 남는다
  await page.reload();
  expect(await bodyPx(page)).toBe(bigger);

  // 되돌릴 수도 있다
  await page.goto('/settings');
  await page.getByTestId('text-size-option').nth(1).click();
  expect(await bodyPx(page)).toBe(base);
});

test('답을 만드는 동안 광고가 덮어도 답이 늦어지지 않는다', async ({ page, stub }) => {
  /*
   * 광고를 띄우고 나서 요청을 보내면 기다리는 시간이 광고만큼 길어진다. 그래서 제출은
   * 화면이 뜨는 즉시 나가고 광고는 그 위를 덮는다.
   *
   * 여기서 보는 것은 **답이 제 시간에 도착하는가** 하나다. 목 브릿지의 전면 광고는 잠깐
   * 덮었다가 「봤다」로 끝나므로, 그 사이에도 답변 화면까지 도달해야 한다.
   */
  await stub({ pass1Ms: 300, pass2Ms: 400 });
  await page.goto('/');
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(DEEP_CONCERN);

  const startedAt = Date.now();
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  const elapsed = Date.now() - startedAt;

  // 광고가 요청을 막고 서 있었다면 이 값이 광고 길이만큼 늘어난다
  expect(elapsed, '답이 광고를 기다린 것처럼 늦게 왔어요').toBeLessThan(15_000);

  const names = await page.evaluate(() => (window.__pocketLogs ?? []).map((log) => log.name));
  expect(names).toContain('answer_generated');
  // 광고가 화면을 덮은 것을 앱을 떠난 것으로 세지 않는다. 세면 이탈 지표가 통째로 망가진다
  expect(names).not.toContain('friction_generation_abandon');
});

test('홈에 추가 안내는 한 번만 뜨고 입력칸을 가리지 않는다', async ({ page }) => {
  await page.goto('/');
  await dismissEntry(page);

  const card = page.getByTestId('home-add');
  await expect(card).toBeVisible();
  // API 가 없어 사람이 직접 눌러야 한다. 되지도 않는 버튼 대신 어디를 누르는지 가리킨다
  await expect(card).toContainText('홈 화면에 추가하기');

  // 하려던 일을 가리지 않는다. 입력칸이 안내보다 위에 있고 그대로 쓸 수 있다
  const field = page.getByTestId('concern-field');
  const fieldBox = (await field.boundingBox())!;
  const cardBox = (await card.boundingBox())!;
  expect(cardBox.y, '안내가 입력칸 위를 덮었어요').toBeGreaterThan(fieldBox.y);
  await field.fill('안내가 떠 있어도 글이 써져요');
  await expect(field).toHaveValue('안내가 떠 있어도 글이 써져요');
  await shot(page, '43 홈 - 홈에 추가 안내');

  // 닫으면 다시 뜨지 않는다
  await page.getByTestId('home-add-close').click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await dismissEntry(page);
  await expect(page.getByTestId('home-add')).toHaveCount(0);
});

test('앱 권하기는 세 번째 답 뒤에 한 번, 답을 덮지 않고 아래에 선다', async ({ page, stub }) => {
  test.setTimeout(120_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.goto('/');

  // 첫 번째와 두 번째에는 권하지 않는다. 아직 이 앱이 무엇인지 모르는 사람이다
  for (let i = 1; i <= 2; i += 1) {
    await askOnce(page, `${DEEP_CONCERN}\n(${i}번째 이야기예요)`);
    await expect(page.getByTestId('app-share')).toHaveCount(0);
    await page.goto('/');
  }

  await askOnce(page, `${DEEP_CONCERN}\n(3번째 이야기예요)`);
  const card = page.getByTestId('app-share');
  await expect(card).toBeVisible();

  // 답을 덮지 않는다. 마지막 한마디를 지나온 자리에 선다
  const closing = (await page.getByTestId('closing').boundingBox())!;
  const cardBox = (await card.boundingBox())!;
  expect(cardBox.y, '권유가 답변 본문 위를 덮었어요').toBeGreaterThan(closing.y);

  // 공유·간직 버튼도 그대로 손에 닿는다
  await revealBottomBar(page);
  await expect(page.getByTestId('save-button')).toBeVisible();
  await shot(page, '44 답변 - 세 번째 뒤의 앱 권하기');

  // 실제로 나가는 글에 고민도 답도 없다
  await page.getByTestId('app-share-send').click();
  const sent = await page.evaluate(() => window.__buddhaShares ?? []);
  expect(sent).toHaveLength(1);
  expect(sent[0]).not.toContain('팀장님');
  expect(sent[0]).not.toContain('그만둘까');

  // 네 번째에는 다시 묻지 않는다
  await page.goto('/');
  await askOnce(page, `${DEEP_CONCERN}\n(4번째 이야기예요)`);
  await expect(page.getByTestId('app-share')).toHaveCount(0);
});
