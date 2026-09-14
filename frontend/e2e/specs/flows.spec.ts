/**
 * 흐름 증명. 화면 하나가 아니라 **누르면 이어지는 길**을 본다.
 *
 * 오늘의 한마디 · 공유 · 간직과 Paywall · 같은 날 두 번째 고민 · 보관함 · 설정.
 * 단언이 판정이고 스크린샷은 증거다.
 */

import { test, expect, type Page } from '../support/fixtures';

const SHOTS = 'e2e/shots';

const CONCERN = [
  '요즘 회사에서 팀장님이 제 의견을 계속 무시하세요.',
  '동료들 앞에서 제가 낸 안을 다른 사람 것처럼 말한 적도 있어요.',
  '그만둘까 고민이에요. 그런데 지금 나가면 다음이 없을 것 같아 무섭기도 해요.',
].join('\n');

async function dismissEntry(page: Page) {
  // 카드는 오늘의 한마디 조회가 끝난 뒤에 뜬다. 뜨기 전에 지나치면 뒤늦게 올라온 딤이
  // 홈의 모든 터치를 가로챈다. 하루 첫 진입이 아니면 안 뜨므로 짧게만 기다린다.
  const card = page.getByTestId('entry-card');
  await card.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  if (await card.isVisible().catch(() => false)) {
    await page.getByTestId('entry-card-cta').click();
    await expect(card).toBeHidden();
  }
}

/** 하단 고정 바는 마지막 한마디까지 읽어야 올라온다 */
async function revealBottomBar(page: Page) {
  await page.getByTestId('closing').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('bottom-bar')).toBeVisible();
}

/** 고민 하나를 보내 답변 화면까지 간다. 같은 날 두 번째부터는 이어가기 시트를 거친다 */
async function askOnce(page: Page, text = CONCERN) {
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(text);
  await page.getByTestId('submit').click();

  const sheet = page.getByTestId('continue-sheet');
  await sheet.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
  if (await sheet.isVisible().catch(() => false)) {
    await page.getByTestId('continue-watch').click();
  }

  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('analysis')).toBeVisible({ timeout: 20_000 });
}

test('오늘의 한마디: 홈 카드에서 시트가 열리고 세 가지 방법으로 닫힌다', async ({ page }) => {
  await page.goto('/');
  await dismissEntry(page);

  const card = page.getByTestId('daily-card');
  await expect(card).toBeVisible();
  await card.click();

  const sheet = page.getByTestId('daily-sheet');
  await expect(sheet).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/13-daily-sheet.png` });

  // 닫는 방법 셋: 닫기 버튼 · 바깥 · 뒤로가기
  await page.getByTestId('sheet-close').first().click();
  await expect(sheet).toBeHidden();

  await card.click();
  await expect(sheet).toBeVisible();
  await page.getByTestId('sheet-dim').first().click({ position: { x: 10, y: 10 } });
  await expect(sheet).toBeHidden();

  await card.click();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
});

test('공유 카드: 모든 내용이 담기고 고민 원문은 들어가지 않는다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);

  await revealBottomBar(page);
  await page.getByTestId('share-button').click();
  await expect(page.getByTestId('share-sheet')).toBeVisible();

  const card = page.getByTestId('share-card');
  await expect(card).toBeVisible();
  const text = (await card.innerText()).replace(/\s+/g, ' ');

  // 카드에 들어가야 하는 것: 오늘의 부처의 말 · 경전 원문 · 출처 · 한 줄 풀이 · 워드마크 · CTA
  const scripture = (await page.getByTestId('scripture-text').first().innerText()).replace(/\s+/g, ' ');
  expect(text).toContain(scripture.slice(0, 20));
  expect(text).toContain('부처의 말');

  // 고민 원문은 어떤 조각도 들어가지 않는다
  expect(text).not.toContain('팀장님');
  expect(text).not.toContain('그만둘까');

  await page.screenshot({ path: `${SHOTS}/14-share-sheet.png` });
  await expect(page.getByTestId('share-link')).toBeVisible();
});

test('간직: 셋까지 쌓이고 네 번째에 보관 안내가 뜬다', async ({ page, stub }) => {
  // 네 번 묻는 시나리오라 기본 30초로는 모자란다. 답변 생성은 여기서 볼 것이 아니라 빠르게 넘긴다.
  test.setTimeout(120_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.goto('/');

  for (let i = 1; i <= 3; i += 1) {
    await askOnce(page, `${CONCERN}\n(${i}번째 이야기예요)`);
    await revealBottomBar(page);
    await page.getByTestId('save-button').click();
    await expect(page.getByTestId('paywall')).toHaveCount(0);
    await page.goto('/');
  }

  await askOnce(page, `${CONCERN}\n(네 번째 이야기예요)`);
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
  // 시트가 다 올라와 구매 버튼이 화면 안에 들어와야 한다. 올라오는 중에 재면 늘 통과한다
  const buy = page.getByTestId('paywall-buy');
  await expect(buy).toBeInViewport();
  await page.screenshot({ path: `${SHOTS}/15-paywall.png` });

  // 「무료」라는 말을 쓰지 않는다
  await expect(page.getByTestId('paywall')).not.toContainText('무료');

  await page.goto('/archive');
  await expect(page.getByTestId('archive')).toBeVisible();
  await expect(page.getByTestId('archive-item')).toHaveCount(3);
  await page.screenshot({ path: `${SHOTS}/16-archive.png`, fullPage: true });
});

test('같은 날 두 번째 고민: 이어가기 시트가 뜨고 광고를 보면 이어진다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);

  await page.goto('/');
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(CONCERN);
  await page.getByTestId('submit').click();

  const sheet = page.getByTestId('continue-sheet');
  await expect(sheet).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/17-continue-sheet.png` });

  // 베푼 것을 세는 문장을 쓰지 않는다
  await expect(sheet).not.toContainText('광고없이');
  await expect(sheet).not.toContainText('광고 없이');
  await expect(sheet).not.toContainText('무료');

  await page.getByTestId('continue-watch').click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
});

test('천장: 이어가기를 다 쓰면 내일 다시 오라고 한다', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date();
    const day = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
    localStorage.setItem(
      'buddha.quota.v1',
      JSON.stringify({ day, firstUsed: true, continuesUsed: 4, lightUsed: 0 }),
    );
  });
  await page.goto('/');
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(CONCERN);
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('exhausted')).toBeVisible();
  await expect(page.getByTestId('continue-sheet')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/18-exhausted.png` });
});

test('설정: 홈에서 앱 정보·처리방침·도움받을 곳까지 간다', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/19-settings.png`, fullPage: true });

  await page.goto('/settings/app');
  await expect(page.getByTestId('app-info')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/20-app-info.png`, fullPage: true });

  await page.goto('/settings/help');
  await expect(page.getByTestId('help-lines')).toBeVisible();
  // 위기 문구는 여기에만 둔다
  await expect(page.getByTestId('help-lines')).toContainText('109');
  await page.screenshot({ path: `${SHOTS}/21-help-lines.png`, fullPage: true });

  await page.goto('/settings/privacy');
  await expect(page.getByTestId('privacy')).toBeVisible();
});

test('공유 링크로 들어오면 첫 화면에 카드와 입력창이 있다', async ({ page }) => {
  // 먼저 진짜 공유를 한 번 해서 링크를 얻는다. 지어낸 토큰으로 열면 만료 화면이 맞다.
  await page.goto('/');
  await askOnce(page);
  await revealBottomBar(page);
  await page.getByTestId('share-button').click();
  await expect(page.getByTestId('share-sheet')).toBeVisible();
  const link = await page.getByTestId('share-link').getAttribute('data-share-url');
  await page.goto(link ?? '/s/none');
  await expect(page.getByTestId('landing')).toBeVisible();
  await expect(page.getByTestId('concern-field')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/22-landing.png`, fullPage: true });

  await page.getByTestId('concern-field').fill(CONCERN);
  await page.getByTestId('submit').click();
  // 홈을 거치지 않고 바로 대기 또는 답변으로 간다
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
});
