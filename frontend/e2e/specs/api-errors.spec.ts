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

/** 「다른 관점」 한 벌. 모양이 어긋나면 클라이언트가 답변인 척 넘기지 않고 던진다 */
const EXTENSION = {
  responseType: 'extension',
  answerId: ANSWER.answerId,
  scripture: SCRIPTURE,
  alternativeAnalysis: { heading: '다르게 보면', body: '이렇게도 읽힙니다.' },
  action: { title: '오늘 한 가지', why: null },
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

/**
 * 화면이 실제로 지나간 길을 적어 둔다.
 *
 * 「대기 화면을 거치지 않는다」는 나중에 `toHaveCount(0)` 로 재면 거짓이 된다. 거쳤다가
 * 돌아온 판과 한 번도 안 간 판이 그 시점에는 똑같이 보인다. 그래서 라우터가 주소를
 * 바꾸는 순간을 전부 받아 적는다.
 */
async function trackRoutes(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [location.pathname];
    (window as unknown as { __routes: string[] }).__routes = seen;
    for (const name of ['pushState', 'replaceState'] as const) {
      const original = history[name].bind(history);
      history[name] = function patched(data: unknown, unused: string, url?: string | URL | null) {
        original(data, unused, url);
        seen.push(location.pathname);
      };
    }
  });
}

function visited(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __routes?: string[] }).__routes ?? []);
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
  await expect(card).toContainText('광고를 다시 보지 않아도 돼요');
  await expect(page.getByTestId('extension-cta')).toHaveCount(0);
  await shot(page, '50 한 번 더 보기 - 서버가 다른 관점을 못 줬을 때');
});

test('연꽃으로 치르고 서버가 못 주면, 화면을 떠났다 와도 연꽃을 또 내지 않는다', async ({
  page,
}) => {
  /*
    **연꽃을 먼저 뺀다.** 뒤에 오는 일이 서버 왕복이라 실패가 잦고, 실패해도 다시 받기는
    공짜라는 전제였다. 그런데 그 「공짜」가 컴포넌트 state 에만 있었다. 보관함에 갔다 오면
    카드가 다시 만들어지면서 처음 화면으로 돌아가고, **연꽃은 이미 빠졌는데 값을 또 내야
    한다**(2026-09-24 리뷰). 치른 사실을 카드 밖에 둬서 막는다.
  */
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'buddha.leaves.v1',
        JSON.stringify({ count: 1, welcomed: true, earned: 1, spent: 0 }),
      );
    } catch {
      /* 못 심으면 아래 단언이 실패로 알려 준다 */
    }
  });
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

  /** 본문 가져오기를 몇 번이나 불렀나. 연꽃을 두 번 내지 않았는지 이 수로도 본다 */
  let extensionCalls = 0;
  let extensionFails = true;
  await page.route(
    (url) => url.pathname === '/concern/extension',
    (route) => {
      extensionCalls += 1;
      if (extensionFails) {
        void route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        return;
      }
      void route.fulfill(json(EXTENSION));
    },
  );

  await page.goto('/');
  await send(page);
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 30_000 });

  const card = page.getByTestId('extension-card');
  await card.scrollIntoViewIfNeeded();
  await page.getByTestId('leaf-spend-extension').click();

  // 치렀고, 서버가 못 줬다. 연꽃으로 온 사람에게는 광고 이야기를 하지 않는다
  await expect(card.getByRole('button', { name: '다시 받아보기' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(card).toContainText('연꽃을 다시 쓰지 않아도 돼요');
  await expect(card).not.toContainText('광고를 다시 보지 않아도 돼요');

  const spent = async () =>
    page.evaluate(() => {
      const raw = localStorage.getItem('buddha.leaves.v1');
      return raw == null ? null : (JSON.parse(raw) as { count: number }).count;
    });
  expect(await spent(), '한 송이만 나가야 해요').toBe(0);

  /*
    답변 화면을 떠났다 온다. **카드가 통째로 다시 만들어지는 길이다.**
    앱 안에서 오가야 한다. 주소로 다시 들어가면 전체를 새로 읽어 답 자체가 사라진다.
  */
  extensionFails = false;
  await page.goBack();
  await expect(page.getByTestId('concern-field')).toBeVisible({ timeout: 15_000 });
  await page.goForward();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 30_000 });

  await card.scrollIntoViewIfNeeded();
  /*
    치른 흔적이 남아 있으니 곧바로 다시 가져온다. **값을 또 청하지 않는다.**
    연꽃 버튼이 다시 서 있으면 잔액 0 인 사람 앞에 낼 수 없는 값이 서는 것이고,
    광고 버튼이 서 있으면 이미 치른 사람에게 값을 두 번 받는 것이다.
  */
  await expect(page.getByTestId('extension-result')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('leaf-spend-extension')).toHaveCount(0);
  await expect(page.getByTestId('extension-cta')).toHaveCount(0);
  expect(await spent(), '연꽃이 또 나갔어요').toBe(0);
  expect(extensionCalls, '가져오기를 부른 횟수가 맞지 않아요').toBe(2);
});

test('광고가 한 장도 안 오면 간직과 다른 관점을 막지 않는다', async ({ page }) => {
  /*
    `noFill` 은 **우리 쪽 사정**이다. 사람은 누르기까지 했는데 광고가 오지 않았다.
    이어가기는 처음부터 그냥 보냈는데, 간직은 「보상을 받기 전에 닫아서」라며 막고 사람을
    탓했고 다른 관점은 아무 말 없이 버튼으로 돌아갔다. 셋이 같은 규칙을 쓴다(2026-09-24 리뷰).
  */
  await page.addInitScript(() => {
    window.__buddhaBridge = { fullScreenAd: 'noFill' };
  });
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
  await page.route(
    (url) => url.pathname === '/concern/extension',
    (route) => route.fulfill(json(EXTENSION)),
  );

  await page.goto('/');
  await send(page);
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 30_000 });

  // 다른 관점: 광고가 안 와도 붙는다
  await page.getByTestId('extension-card').scrollIntoViewIfNeeded();
  await page.getByTestId('extension-cta').click();
  await expect(page.getByTestId('extension-result')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('extension-card')).not.toContainText('보상을 받기 전에');
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
  await expect(sheet).toContainText('짧은 영상이 지나가면 바로 이어 드릴게요');
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

/**
 * 이번 판의 핵심 장치는 **서버가 문을 여는 판에서만** 돈다.
 *
 * 스텁 판에는 뒤에서 도는 요청 자체가 없어서(`serverOpensTheGate()` 가 false) 여기
 * 아니면 한 줄도 지나가지 않는다. 실제로 그랬다: 처음 쓴 spec 여덟 건이 고치기 전
 * 코드로도 전부 초록이었다(2026-09-21 리뷰가 잡았다).
 */
test('광고 문 앞에서 답 만드는 화면을 거치지 않고, 요청도 한 번만 나간다', async ({ page }) => {
  await trackRoutes(page);
  await page.route(
    (url) => url.pathname === '/daily',
    (route) => route.fulfill(json(DAILY)),
  );
  const keys: string[] = [];
  await page.route(
    (url) => url.pathname === '/concern',
    (route) => {
      const body = route.request().postDataJSON();
      keys.push(`${body.idempotencyKey}:${body.adWatched === true}`);
      if (body.adWatched !== true) return route.fulfill(quota429('ad_required', AD_GATE_QUOTA));
      return route.fulfill(json({ ...ANSWER, quota: { ...AD_GATE_QUOTA, adContinuesUsed: 1 } }));
    },
  );
  await page.route(
    (url) => url.pathname === '/concern/pass2',
    (route) => route.fulfill(json({ ...ANSWER, ...PASS2 })),
  );

  await seedQuota(page, true, 1);
  await page.goto('/');
  await send(page);

  await expect(page.getByTestId('continue-sheet')).toBeVisible({ timeout: 30_000 });
  // 시트가 뜰 때까지 화면은 홈 그대로다. 답 만드는 화면을 들렀다 온 것이 아니다
  expect(await visited(page)).not.toContain('/loading');
  await shot(page, '52 광고 문 - 홈에 선 채로 시트가 먼저 뜬다');

  await page.getByTestId('continue-watch').click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 30_000 });

  /*
    요청은 딱 둘이다: 문 앞에서 한 번(광고 전), 광고를 보고 한 번. **같은 멱등키다.**
    키가 갈리면 서버는 두 이야기로 보고 사용량을 두 번 센다. 인스턴스가 여럿이면
    같은 키라도 replay 가 안 걸려 모델이 두 번 도는데, 그래서 횟수 자체를 줄여야 한다.
  */
  expect(keys).toHaveLength(2);
  const [first, second] = keys.map((one) => one.split(':'));
  expect(first[0]).toBe(second[0]);
  expect(first[1]).toBe('false');
  expect(second[1]).toBe('true');
});

test('서버가 보는 동안에는 광고 버튼이 잠긴다', async ({ page }) => {
  /*
   * 규칙층이 못 잡는 위기 표현이 있다(「밤마다 다리 위에 서 있다가 와요」). 그 글은
   * 시트를 거치는데, 그 몇 초 안에 광고를 누를 수 있으면 **위기 상태인 사람이 30초
   * 광고를 다 보고 나서** 창구를 만난다. 계획 1.6 이 「절대 광고를 두지 않는 곳」으로
   * 위기 화면을 적어 둔 자리다.
   */
  await trackRoutes(page);
  await page.route(
    (url) => url.pathname === '/daily',
    (route) => route.fulfill(json(DAILY)),
  );
  // 서버가 천천히 답한다. 그동안 버튼이 잠겨 있어야 한다
  await page.route(
    (url) => url.pathname === '/concern',
    async (route) => {
      await new Promise((done) => setTimeout(done, 1500));
      return route.fulfill(json(CRISIS));
    },
  );

  await seedQuota(page, true, 1);
  await page.goto('/');
  /*
    규칙층 사전에 없는 문장이라야 한다. 「죽고 싶다」처럼 사전에 걸리는 글은 화면이
    시트를 아예 안 세운다(`HomeRoute` 의 가드). 여기서 재려는 것은 그 가드를 지나
    **분류기까지 가야 알 수 있는** 글이다. ADR 0010 이 「규칙층 사전만 넓힌다」를
    버리며 근거로 든 바로 그 모양이다(실측: `routeByRules` 가 light 로 둔다).
  */
  await send(page, '밤마다 다리 위에 서 있다가 와요');

  const sheet = page.getByTestId('continue-sheet');
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  // 광고를 누를 수 없다. 왜 기다리는지도 적는다
  await expect(page.getByTestId('continue-watch')).toBeDisabled();
  await expect(sheet).toContainText('살펴보고 있어요');
  /*
    **잠긴 버튼이 스스로 말해야 한다.** 흐려지기만 하면 사람은 앱이 멈춘 줄로 읽는다
    (2026-09-22 사용자 지적). 버튼 안에 도는 표와 지금 무엇을 하는 중인지가 함께 선다.
  */
  await expect(page.getByTestId('continue-watch')).toContainText('이야기를 살펴보고 있어요');
  await expect(page.getByTestId('continue-watch').locator('.spin')).toBeVisible();
  /*
    ⚠ **그 말 옆에 「광고」 배지를 세우지 않는다.** 「이야기를 살펴보고 있어요 [광고]」는
    지금 광고가 도는 중이라는 말로 읽힌다. 그때 도는 것은 서버 쪽 확인이다
    (2026-09-23 사용자 지적). 규칙이 요구하는 「누르면 무엇이 뜨는지 밝히기」는 그대로다.
    이 버튼은 잠겨 있어 눌리지 않고, 풀리는 순간 배지가 돌아온다.
  */
  await expect(page.getByTestId('continue-watch').getByTestId('ad-badge')).toHaveCount(0);
  await shot(page, '53 광고 문 - 서버가 보는 동안은 잠긴다');

  // 다 보고 나면 시트를 걷고 창구로 데려간다
  await expect(page.getByTestId('crisis')).toBeVisible({ timeout: 30_000 });
  await expect(sheet).toHaveCount(0);
});
