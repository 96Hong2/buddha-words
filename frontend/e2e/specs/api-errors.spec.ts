/**
 * 서버 쪽이 무너졌을 때.
 *
 * 다른 스펙은 앱 안의 스텁으로 돈다. 스텁은 네트워크를 지나가지 않아 「서버가 꺼졌다」와
 * 「서버가 엉뚱한 모양으로 답했다」를 흉내조차 못 낸다. 그래서 이 스펙만 실제 HTTP
 * 클라이언트로 띄운 판(`api-errors` 프로젝트)에서 돌고, 응답은 Playwright 가 가로채 고른다.
 *
 * 여기서 지키는 것 셋이다.
 *   1. 서버가 없으면 하얀 화면이 아니라 사람이 읽는 오류 화면이 뜬다
 *   2. 모양이 다른 응답을 답변인 척 넘기지 않는다. 넘기면 없는 자리를 읽다가 앱이 통째로 죽는다
 *   3. 광고를 끝까지 본 사람에게 「광고를 다시 보라」고 하지 않는다
 */

import { test as base, expect, type Page } from '@playwright/test';

import { shot } from '../support/shots';

/**
 * 일부러 실패시키는 스펙이라 콘솔에 네트워크 오류가 남는다. 그것은 이 스펙이 만든 것이다.
 * 다만 **잡히지 않은 JS 예외**는 그대로 실패로 본다. 화면이 죽은 것을 눈감으면 안 된다.
 */
const test = base.extend<{ page: Page }>({
  page: async ({ page }, use, testInfo) => {
    const crashes: string[] = [];
    page.on('pageerror', (error) => crashes.push(`${error.name}: ${error.message}`));
    await use(page);
    if (crashes.length > 0 && testInfo.status === testInfo.expectedStatus) {
      throw new Error(`화면이 죽었어요 ${crashes.length}건\n${crashes.join('\n')}`);
    }
  },
});

const CONCERN = '남편이 요즘 저를 피하는 것 같아요. 이야기를 꺼내야 할지 모르겠어요.';

/** 서버가 내주는 모양 그대로. 한 자리라도 빠지면 화면이 받지 않는다 */
const SCRIPTURE = {
  id: 'dhp.1',
  citation: '법구경 1게',
  text: '모든 것은 마음이 앞서 가고, 마음이 짓고, 마음으로 이루어진다.',
};

const ANSWER = {
  responseType: 'answer',
  answerId: 'srv-answer-1',
  route: 'normal',
  emotionTags: ['anxiety'],
  modernBuddhaMessage: '오지 않은 일을 미리 앓지 마라. 지금 네 발이 닿은 자리만이 네 것이다.',
  scriptures: [SCRIPTURE],
  visualTheme: 'anxiety',
  extensionAvailable: true,
  pass2: { status: 'pending' },
};

const PASS2 = {
  pass2: {
    status: 'done',
    scriptureExplanation:
      '마음이 먼저 간 자리에 몸이 따라가요. 그래서 상황을 고치기 전에 바라보는 자리를 먼저 옮겨 보는 거예요.',
    personalAnalysis: [
      {
        heading: '지금 무엇이 무거운가',
        body: '무엇을 해야 할지 몰라서가 아니라, 지금 느끼는 마음이 괜찮은 것인지 확신이 서지 않아 더 오래 맴돌아요.',
      },
    ],
    actions: [
      {
        title: '오늘 자기 전에 이 마음 한 줄만 적어 두기',
        why: '머리에서 꺼내 놓으면 크기가 실제 크기로 돌아와요',
      },
      {
        title: '이번 주에 하지 않기로 할 것 하나 고르기',
        why: '더할 일보다 뺄 일이 지금은 더 효과가 커요',
      },
    ],
    closingMessage: '오늘 하루를 잘 넘긴 것만으로도 충분히 하신 거예요.',
  },
};

const DAILY = {
  date: '2026-09-15',
  line: '오늘 하루는 오늘 것만 들고 가요.',
  scripture: SCRIPTURE,
};

/**
 * 오늘 많이 이어간 자리. 서버가 답과 429 에 이 모양 그대로 실어 보낸다.
 *
 * `adContinuesMax` 는 null 이다. **하루 천장을 없앴다**(2026-09-20). 광고를 본 만큼 이어간다.
 */
const HEAVY_QUOTA = {
  freeUsed: 1,
  adContinuesUsed: 4,
  adContinuesMax: null,
  resetsAt: '2026-09-16T00:00:00+09:00',
};

/** 무료 한 번만 쓴 자리. 광고 문이 서는 곳이다 */
const AD_GATE_QUOTA = { ...HEAVY_QUOTA, adContinuesUsed: 0 };

/** 위기 응답. 경전도 광고도 없고 창구만 있다 */
const CRISIS = {
  responseType: 'crisis',
  channels: ['109', 'madeleine'],
  crisisLevel: 'distress',
  canContinue: true,
};

/** 규칙층이 normal 로 보던 글. 분류기가 봐야 위기인 줄 안다 */
const VEILED_CRISIS = '이제 그만하고 싶어요. 아무 의미가 없어요';

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

function quota429(reason: string, quota: unknown) {
  return {
    status: 429,
    contentType: 'application/json',
    body: JSON.stringify({ detail: { reason, quota } }),
  };
}

/** 기기 사본에 오늘 몫을 적어 둔다. 화면이 이 값만 보고 막던 자리다 */
async function seedQuota(page: Page, firstUsed: boolean, continuesUsed: number) {
  await page.addInitScript(
    ([used, continues]) => {
      const now = new Date();
      const month = `${now.getMonth() + 1}`.padStart(2, '0');
      const date = `${now.getDate()}`.padStart(2, '0');
      localStorage.setItem(
        'buddha.quota.v1',
        JSON.stringify({
          day: `${now.getFullYear()}-${month}-${date}`,
          firstUsed: used,
          continuesUsed: continues,
          lightUsed: 0,
        }),
      );
    },
    [firstUsed, continuesUsed] as const,
  );
}

/** 고민을 보내고 답을 기다린다. 이어가기 시트가 끼면 지나간다 */
async function send(page: Page, text = CONCERN) {
  const entry = page.getByTestId('entry-card');
  await entry.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  if (await entry.isVisible().catch(() => false)) {
    await page.getByTestId('entry-card-cta').click();
  }
  await page.getByTestId('concern-field').fill(text);
  await page.getByTestId('submit').click();
}

test('서버가 꺼져 있으면 하얀 화면 대신 읽을 수 있는 오류가 뜬다', async ({ page }) => {
  // 연결 자체가 거부된다. 백엔드를 내린 것과 같은 자리다
  await page.route(
    (url) => url.port === '5187',
    (route) => route.abort('connectionrefused'),
  );

  await page.goto('/');
  await send(page);

  const state = page.getByTestId('error-state');
  await expect(state).toBeVisible({ timeout: 30_000 });
  await expect(state).toContainText('지금은 답을 만들지 못했어요');
  await expect(state).toContainText('잠시 문제가 있었어요. 다시 보내 주세요.');
  await expect(state).toContainText('쓰신 이야기는 그대로 있어요');

  // 개발자용 문자열이 새지 않는다
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/Failed to fetch|TypeError|NetworkError|ERR_/);

  await shot(page, '48 오류 - 서버가 꺼져 있을 때', { fullPage: true });

  // 닫으면 쓴 글이 그대로 있다
  await page.getByRole('button', { name: '닫기' }).click();
  await expect(page.getByTestId('concern-field')).toHaveValue(CONCERN);
});

test('서버가 모양이 다른 답을 주면 답변인 척 넘어가지 않는다', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/daily',
    (route) => route.fulfill(json(DAILY)),
  );
  // responseType 만 맞고 화면이 읽어야 할 자리가 비었다. 여기서 끊지 않으면 답변 화면이
  // 없는 값을 읽다가 앱 전체가 죽는다
  await page.route(
    (url) => url.pathname === '/concern',
    (route) => route.fulfill(json({ responseType: 'answer', answerId: 'broken-1' })),
  );

  await page.goto('/');
  await send(page);

  const state = page.getByTestId('error-state');
  await expect(state).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('answer')).toHaveCount(0);
  await expect(state).toContainText('쓰신 이야기는 그대로 있어요');
  await shot(page, '49 오류 - 서버 응답 모양이 다를 때', { fullPage: true });
});

test('한 번 더 보기를 서버가 못 주면, 광고를 다시 보라고 하지 않는다', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/daily',
    (route) => route.fulfill(json(DAILY)),
  );
  await page.route(
    (url) => url.pathname === '/concern',
    (route) => route.fulfill(json(ANSWER)),
  );
  await page.route(
    (url) => url.pathname === '/concern/pass2',
    (route) => route.fulfill(json({ ...ANSWER, ...PASS2 })),
  );
  // 광고는 끝까지 봤는데 본문 가져오기만 실패한다
  await page.route(
    (url) => url.pathname === '/concern/extension',
    (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  );

  await page.goto('/');
  await send(page);

  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('analysis')).toBeVisible({ timeout: 30_000 });

  const card = page.getByTestId('extension-card');
  await card.scrollIntoViewIfNeeded();
  await page.getByTestId('extension-cta').click();

  // 조용히 원래 카드로 돌아가지 않는다. 왜 못 받았는지 적고, 광고 없이 다시 받게 한다
  await expect(card.getByRole('button', { name: '다시 받아보기' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(card).toContainText('광고는 다시 보지 않아도 되니');
  await expect(page.getByTestId('extension-cta')).toHaveCount(0);
  await shot(page, '50 한 번 더 보기 - 서버가 다른 관점을 못 줬을 때');
});

/**
 * 사용량은 서버가 센다.
 *
 * 기기에 남긴 사본만 보고 문을 열면, 저장소를 지우거나 앱을 다시 깐 사람에게는 오늘 횟수가
 * 처음으로 돌아간다. 서버는 같은 익명키의 오늘을 그대로 기억하고 있어 그 요청을 천장에서
 * 막고, 화면은 왜 막혔는지 모른 채 「다시 해보기」만 그린다. 아래 셋이 그 자리를 지킨다.
 */
test('오늘 몫을 다 썼어도 위기 글은 광고가 아니라 창구로 간다', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/daily',
    (route) => route.fulfill(json(DAILY)),
  );
  // 서버는 위기를 사용량보다 먼저 본다. 이 글에는 광고 문을 세우지 않는다
  const asked: string[] = [];
  await page.route(
    (url) => url.pathname === '/concern',
    (route) => {
      asked.push(String(route.request().postDataJSON().text));
      return route.fulfill(json(CRISIS));
    },
  );

  // 오늘 이미 여러 번 이어간 사람이다. 이 결함이 사는 자리가 바로 여기였다
  await seedQuota(page, true, 4);
  await page.goto('/');
  await send(page, VEILED_CRISIS);

  await expect(page.getByTestId('crisis')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('crisis-channel').first()).toContainText('109');
  await expect(page.getByTestId('continue-sheet')).toHaveCount(0);
  // 화면이 기기 사본을 보고 먼저 막았다면 요청 자체가 나가지 않는다
  expect(asked).toEqual([VEILED_CRISIS]);

  await shot(page, '51 위기 - 오늘 몫을 다 쓴 뒤에도 창구가 먼저');
});

test('광고 문은 서버가 연다. 보고 나면 이어서 답이 온다', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/daily',
    (route) => route.fulfill(json(DAILY)),
  );
  const watched: boolean[] = [];
  await page.route(
    (url) => url.pathname === '/concern',
    (route) => {
      const body = route.request().postDataJSON();
      watched.push(body.adWatched === true);
      if (body.adWatched !== true) return route.fulfill(quota429('ad_required', AD_GATE_QUOTA));
      return route.fulfill(json({ ...ANSWER, quota: { ...AD_GATE_QUOTA, adContinuesUsed: 1 } }));
    },
  );
  await page.route(
    (url) => url.pathname === '/concern/pass2',
    (route) => route.fulfill(json({ ...ANSWER, ...PASS2 })),
  );

  await page.goto('/');
  await send(page);

  const sheet = page.getByTestId('continue-sheet');
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await expect(sheet).toContainText('계속 이어갈 수 있어요');
  // 남은 횟수를 세어 보여 주지 않는다. 천장이 없어 셀 것이 없다
  await expect(sheet).not.toContainText('번 더');

  await page.getByTestId('continue-watch').click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 30_000 });
  // 처음부터 광고를 본 표가 실리면 광고 문이 없는 것과 같다
  expect(watched).toEqual([false, true]);
});

test('기기 사본이 많이 썼다고 해도 답을 줄지는 서버가 정한다', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/daily',
    (route) => route.fulfill(json(DAILY)),
  );
  await page.route(
    (url) => url.pathname === '/concern',
    (route) => route.fulfill(json({ ...ANSWER, quota: { ...AD_GATE_QUOTA, adContinuesUsed: 1 } })),
  );
  await page.route(
    (url) => url.pathname === '/concern/pass2',
    (route) => route.fulfill(json({ ...ANSWER, pass2: { status: 'failed' } })),
  );

  // 기기 값은 많이 썼다고 한다. 답을 줄지는 서버가 정한다
  await seedQuota(page, true, 4);
  await page.goto('/');
  await send(page);

  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('continue-sheet')).toHaveCount(0);
});

test('너무 빨리 보내면 오류 화면이 아니라 잠시 뒤에 오라고 한다', async ({ page }) => {
  /*
   * 하루 천장을 없앤 자리에 서는 문이다(2026-09-20). 사람은 30초 광고를 봐야 이어가므로
   * 여기 닿지 않는다. 닿는 것은 광고를 건너뛰고 몰아 보내는 쪽이다.
   * 그래도 **눌러도 소용없는 「다시 해보기」 앞에 세우지 않는다.**
   */
  await page.route(
    (url) => url.pathname === '/daily',
    (route) => route.fulfill(json(DAILY)),
  );
  await page.route(
    (url) => url.pathname === '/concern',
    (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { reason: 'too_fast', quota: HEAVY_QUOTA } }),
      }),
  );

  await page.goto('/');
  await send(page);

  const state = page.getByTestId('error-state');
  await expect(state).toBeVisible({ timeout: 30_000 });
  // 「이야기가 몰려 있어요」가 아니다. 남 탓으로 읽히면 이 사람은 영문을 모른다
  await expect(state).toContainText('조금 빠르게 보내셨어요');
  await expect(state).not.toContainText('많이 몰려 있어요');
  // 쓴 글은 그대로 있다고 말해 준다
  await expect(state).toContainText('쓰신 이야기는 그대로 있어요');
});

test('전역 예산으로 닫힌 429 는 잠시 뒤에 다시 보내라고 한다', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/daily',
    (route) => route.fulfill(json(DAILY)),
  );
  await page.route(
    (url) => url.pathname === '/concern',
    (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { reason: 'budget_blocked', quota: HEAVY_QUOTA } }),
      }),
  );

  await page.goto('/');
  await send(page);

  const state = page.getByTestId('error-state');
  await expect(state).toBeVisible({ timeout: 30_000 });
  await expect(state).toContainText('지금은 이야기가 많이 몰려 있어요');
  // 하루 천장이 아니다. 천장 안내를 잘못 띄우면 오늘 더 못 하는 줄 알고 나간다
  await expect(page.getByTestId('exhausted')).toHaveCount(0);
});
