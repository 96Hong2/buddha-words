/**
 * 흐름 증명. 화면 하나가 아니라 **누르면 이어지는 길**을 본다.
 *
 * 오늘의 한마디 · 공유 · 간직과 Paywall · 같은 날 두 번째 고민 · 보관함 · 설정.
 * 단언이 판정이고 스크린샷은 증거다.
 */

import { test, expect, type Page } from '../support/fixtures';
import { shot } from '../support/shots';
import { saveAnswerFromScreen } from '../support/flow';

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

/**
 * 시스템 뒤로가기를 누른다.
 *
 * 브라우저 뒤로가기(`page.goBack()`)로는 이걸 잴 수 없다. 앱이 처음 페이지로 떠나 버려서
 * 시트가 닫혀서가 아니라 화면이 통째로 사라져서 「안 보인다」가 통과한다.
 * 실기기의 뒤로가기는 브릿지가 가로채므로, 여기서도 브릿지를 직접 눌러 BackHandler 를 지나가게 한다.
 */
async function pressSystemBack(page: Page) {
  const pressed = await page.evaluate(() => {
    const bridge = window.__buddhaBridgeInstance;
    if (bridge == null) return false;
    bridge.pressBack();
    return true;
  });
  expect(pressed, '목 브릿지가 창에 없어 시스템 뒤로가기를 누르지 못했어요').toBe(true);
}

/** 미니앱이 닫혔는지(브릿지의 closeApp 이 불렸는지) 본다 */
async function appClosed(page: Page): Promise<boolean> {
  const closed = await page.evaluate(() => window.__buddhaBridgeInstance?.isClosed ?? null);
  expect(closed, '목 브릿지가 창에 없어 닫힘 여부를 볼 수 없어요').not.toBeNull();
  return closed === true;
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
  await shot(page, '06 홈 - 오늘의 한마디 시트');

  // 닫는 방법 셋: 닫기 버튼 · 바깥 · 뒤로가기
  await page.getByTestId('sheet-close').first().click();
  await expect(sheet).toBeHidden();

  await card.click();
  await expect(sheet).toBeVisible();
  await page
    .getByTestId('sheet-dim')
    .first()
    .click({ position: { x: 10, y: 10 } });
  await expect(sheet).toBeHidden();

  await card.click();
  await expect(sheet).toBeVisible();
  await pressSystemBack(page);
  await expect(sheet).toBeHidden();
  // 시트만 닫힌 것이다. 앱은 그대로 떠 있고 닫히지도 않았다
  await expect(page.getByTestId('home')).toBeVisible();
  expect(await appClosed(page)).toBe(false);

  // 열린 것이 없는 홈에서 한 번 더 누르면 그때 미니앱이 닫힌다
  await pressSystemBack(page);
  expect(await appClosed(page)).toBe(true);
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

  // 카드에 들어가야 하는 것: 경전 원문 · 귀속 · 한 줄 풀이 · AI 소표기 · 워드마크 · CTA
  const scripture = (await page.getByTestId('scripture-text').first().innerText()).replace(
    /\s+/g,
    ' ',
  );
  expect(text).toContain(scripture.slice(0, 20));
  expect(text).toContain('경전 원문');
  expect(text).toContain('부처의 말');
  expect(text).toContain('나도 내 고민에 맞는 말을 받아보기');

  // 고민 원문은 어떤 조각도 들어가지 않는다
  expect(text).not.toContain('팀장님');
  expect(text).not.toContain('그만둘까');

  await shot(page, '38 공유 시트');
  await expect(page.getByTestId('share-link')).toBeVisible();
});

/**
 * 「공유하기」를 실제로 끝까지 누른다.
 *
 * 이 버튼은 토스 네이티브 공유 시트를 연다. 받는 앱(카톡·메시지·메일)은 기기가 고른다.
 * 예전에는 이 자리가 조용히 주소만 복사하고 시트를 닫아서, 누른 사람은 아무 일도
 * 일어나지 않았다고 느꼈다. 실제로 그 신고를 받았다.
 *
 * 시트를 못 여는 기기에서는 주소를 복사하고 **복사했다고 말한다.** 말없이 복사하지 않는다.
 * 복사마저 막히면 막혔다고 알리고 그 글을 화면에 내놓는다.
 */
test('공유하기: 네이티브 시트로 나가고, 그 글에 고민 원문이 없다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);

  await revealBottomBar(page);
  await page.getByTestId('share-button').click();
  await expect(page.getByTestId('share-sheet')).toBeVisible();

  const linkButton = page.getByTestId('share-link');
  await expect(linkButton).toHaveAttribute('data-share-url', /\/s\/.+/);
  const url = await linkButton.getAttribute('data-share-url');

  await linkButton.click();
  // 보냈으면 시트가 닫힌다. 복사 안내가 뜨지 않는다
  await expect(page.getByTestId('share-sheet')).toHaveCount(0);
  await expect(page.getByText('복사가 막혀 있어요')).toHaveCount(0);

  // 실제로 나간 글. 앱 밖으로 글이 나가는 유일한 길이라 여기를 본다
  const sent = await page.evaluate(() => window.__buddhaShares ?? []);
  expect(sent).toHaveLength(1);
  const message = sent[0];
  expect(message).toContain(url ?? '');

  const scripture = (await page.getByTestId('scripture-text').first().innerText()).trim();
  expect(message.replace(/\s+/g, ' ')).toContain(scripture.replace(/\s+/g, ' '));

  // 오늘 받은 한마디도, 적은 글도 나가지 않는다
  const line = (
    await page.getByTestId('buddha-message').locator('blockquote').innerText()
  ).replace(/\s+/g, ' ');
  expect(message).not.toContain(line.slice(0, 12));
  expect(message).not.toContain('팀장님');
  expect(message).not.toContain('그만둘까');
});

/**
 * 공유 시트를 못 여는 기기.
 *
 * 그때는 주소를 복사하고 **복사했다고 말한다.** 복사마저 막히면(브라우저 기본값) 막혔다고
 * 알리고 그 글을 화면에 내놓는다. 조용히 지나가면 사용자는 복사된 줄 알고 빈 클립보드를
 * 붙여 넣는다.
 */
test('공유 시트를 못 열면 복사하고 복사했다고 말한다', async ({ page, context }) => {
  await page.addInitScript(() => {
    window.__buddhaBridge = { ...window.__buddhaBridge, share: 'unsupported' };
  });
  await page.goto('/');
  await askOnce(page);

  await revealBottomBar(page);
  await page.getByTestId('share-button').click();
  const linkButton = page.getByTestId('share-link');
  await expect(linkButton).toHaveAttribute('data-share-url', /\/s\/.+/);
  const url = await linkButton.getAttribute('data-share-url');

  // 복사가 막힌 채로 한 번: 조용히 지나가지 않고 막힌 이유와 주소를 내놓는다
  await linkButton.click();
  await expect(page.getByText('복사가 막혀 있어요')).toBeVisible();
  await expect(page.getByText(url ?? '', { exact: false })).toBeVisible();
  await shot(page, '39 공유 - 복사가 막혔을 때');

  // 풀어 주고 다시: 복사됐다고 말한다
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '다시 복사하기' }).click();
  await expect(page.getByText('링크가 복사됐어요')).toBeVisible();
});

/**
 * 「링크 복사하기」는 주소만 가져간다. 붙여 넣을 곳을 이미 아는 사람을 위한 자리다.
 *
 * 예전 이 자리에는 「이미지로 저장하기」가 있었는데 앨범에 저장할 길이 없어서 누구든 누르면
 * 안내 하나만 만났다. 그다음에는 「글로 복사하기」였는데 나가는 글이 버튼마다 달라
 * 형식이 제멋대로였다. 지금은 나가는 글을 한 곳에서 만들고(shareText.ts) 이 자리는
 * 주소만 맡는다.
 */
test('링크 복사하기는 주소만 가져가고 복사했다고 말한다', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await askOnce(page);

  await revealBottomBar(page);
  await page.getByTestId('share-button').click();
  await expect(page.getByTestId('share-sheet')).toBeVisible();

  // 되지 않는 버튼은 아예 서 있지 않다
  await expect(page.getByTestId('share-image')).toHaveCount(0);

  const linkUrl = await page.getByTestId('share-link').getAttribute('data-share-url');
  await page.getByTestId('share-copy').click();

  await expect(page.getByText('링크가 복사됐어요')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(linkUrl);
});

test('간직: 몇 개를 담아도 막히지 않는다', async ({ page, stub }) => {
  /*
   * 예전에는 셋까지 담기고 네 번째에 이용권 시트가 길을 막았다. 그 제한을 없앴다.
   * 네 번을 담아도 파는 화면이 뜨지 않아야 한다.
   */
  test.setTimeout(120_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.goto('/');

  for (let i = 1; i <= 4; i += 1) {
    await askOnce(page, `${CONCERN}\n(${i}번째 이야기예요)`);
    await saveAnswerFromScreen(page);
    await expect(page.getByTestId('paywall')).toHaveCount(0);
    await page.goto('/');
  }

  await page.goto('/archive');
  await expect(page.getByTestId('archive')).toBeVisible();
  await expect(page.getByTestId('archive-item')).toHaveCount(4);
  await shot(page, '28 보관함 - 간직한 말씀 네 개', { fullPage: true });
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
  await shot(page, '25 이어가기 시트');

  // 베푼 것을 세는 문장을 쓰지 않는다
  await expect(sheet).not.toContainText('광고없이');
  await expect(sheet).not.toContainText('광고 없이');
  await expect(sheet).not.toContainText('무료');

  await page.getByTestId('continue-watch').click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
});

/** 오늘 몫을 다 쓴 상태를 기기에 적어 둔다. 다섯 번을 실제로 보내려면 광고를 네 번 봐야 한다 */
async function fillUpToday(page: Page) {
  await page.addInitScript(() => {
    const now = new Date();
    const day = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
    localStorage.setItem(
      'buddha.quota.v1',
      JSON.stringify({ day, firstUsed: true, continuesUsed: 4, lightUsed: 0 }),
    );
  });
}

test('오늘 많이 이어간 사람도 광고를 보면 계속 이어간다', async ({ page }) => {
  /*
   * **하루 천장을 없앴다** (2026-09-20). 광고를 보는 사람을 막고 있었기 때문이다.
   * 예전에는 이어가기 4회를 쓰면 「오늘은 여기까지예요」가 떴다. 그 화면은 이제 없다.
   * 막는 일은 서버만 한다(분당 제한 · 전역 예산 문).
   */
  await fillUpToday(page);
  await page.goto('/');
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(CONCERN);
  await page.getByTestId('submit').click();

  // 천장 안내가 아니라 이어가기 시트다
  const sheet = page.getByTestId('continue-sheet');
  await expect(sheet).toBeVisible();
  // 남은 횟수를 세어 보여 주지 않는다. 셀 것이 없다
  await expect(sheet).not.toContainText('번 더');
  await expect(sheet).toContainText('계속 이어갈 수 있어요');
  await shot(page, '26 이어가기 - 오늘 많이 쓴 뒤에도 열린다');

  // 광고를 끝까지 보면 답이 온다
  await sheet.getByTestId('continue-watch').click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
});

test('설정: 홈에서 앱 정보·처리방침까지 간다', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('settings')).toBeVisible();
  // 설정은 앱을 쓰는 데 필요한 안내만 담는다. 도움받을 곳은 여기 없다
  await expect(page.getByTestId('settings')).not.toContainText('도움받을 곳');
  /*
    ⚠ **문의 주소는 주인이 실제로 읽는 자리여야 한다.** 없는 주소(`help@buddhawords.kr`)가
    출시 직전까지 남아 있었다. 1호 제품과 같은 계정을 쓰고, 여기와 개인정보 안내 두 곳이
    같은 주소를 가리키는지 함께 본다. 갈리면 한쪽이 낡는다.
  */
  const mail = page.getByTestId('settings').locator('a[href^="mailto:"]');
  await expect(mail).toHaveCount(1);
  await expect(mail).toHaveAttribute('href', 'mailto:pocket.app.official@gmail.com');
  await expect(mail).not.toContainText('buddhawords.kr');
  await shot(page, '41 설정', { fullPage: true });

  await page.goto('/settings/app');
  await expect(page.getByTestId('app-info')).toBeVisible();
  await shot(page, '42 앱 정보', { fullPage: true });

  await page.goto('/settings/privacy');
  await expect(page.getByTestId('privacy')).toBeVisible();
  await expect(page.getByTestId('privacy')).toContainText('pocket.app.official@gmail.com');
  await shot(page, '43 처리방침', { fullPage: true });
});

test('이용약관을 누르면 약관 절이 화면 안에 선다', async ({ page }) => {
  /*
   * 개인정보 안내와 이용약관이 한 문서다. 예전에는 약관을 눌렀는데 「개인정보 안내」라는
   * 제목만 뜨고 약관은 다섯 화면 아래에 있어서, 누른 것이 열렸는지 알 수 없었다.
   */
  await page.goto('/settings');
  await page.getByRole('button', { name: '이용약관' }).click();

  const doc = page.getByTestId('privacy');
  await expect(doc).toBeVisible();
  // 제목이 두 문서를 다 말한다
  await expect(doc.getByRole('heading', { level: 1 })).toContainText('이용약관');

  // 약관 절이 첫 화면 안에 들어와 있다
  const terms = page.locator('#terms');
  await expect(terms).toBeInViewport();
  await shot(page, '43-1 이용약관으로 들어왔을 때');
});

test('도움받을 곳: 답변 맨 아래 고지에서 들어간다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);

  await page.getByRole('link', { name: '많이 힘들다면 도움받을 곳을 봐 주세요' }).click();
  await expect(page.getByTestId('help-lines')).toBeVisible();
  // 위기 문구는 여기에만 둔다
  await expect(page.getByTestId('help-lines')).toContainText('109');
  await shot(page, '44 도움받을 곳', { fullPage: true });
});

test('공유 링크로 들어오면 첫 화면에 카드와 입력창이 있다', async ({ page }) => {
  // 먼저 진짜 공유를 한 번 해서 링크를 얻는다. 지어낸 토큰으로 열면 만료 화면이 맞다.
  await page.goto('/');
  await askOnce(page);
  await revealBottomBar(page);
  await page.getByTestId('share-button').click();
  await expect(page.getByTestId('share-sheet')).toBeVisible();

  // 주소는 서버가 토큰을 내준 뒤에 붙는다. 붙기 전에 읽으면 늘 만료 화면으로 간다
  const linkButton = page.getByTestId('share-link');
  await expect(linkButton).toHaveAttribute('data-share-url', /\/s\/.+/);
  const link = await linkButton.getAttribute('data-share-url');
  await page.goto(link ?? '/s/none');
  await expect(page.getByTestId('landing')).toBeVisible();
  await expect(page.getByTestId('concern-field')).toBeVisible();
  // 받은 사람이 처음 보는 화면이다. 바로 위 askOnce 가 홈에서 적은 글이 남아 있는데도
  // 빈 칸이어야 한다. 남의 말씀 밑에 내가 쓰다 만 고민이 떠 있으면 안 된다
  await expect(page.getByTestId('concern-field')).toHaveValue('');
  await shot(page, '40 공유 링크로 들어온 첫 화면', { fullPage: true });

  await page.getByTestId('concern-field').fill(CONCERN);
  await page.getByTestId('submit').click();
  // 홈을 거치지 않고 바로 대기 또는 답변으로 간다
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
});
