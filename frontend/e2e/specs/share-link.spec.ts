/**
 * 카톡에 붙는 그 주소가 어디를 가리키나.
 *
 * 공유 시트가 내놓는 주소를 앱 주소로 만들면, 카톡·트위터 미리보기 크롤러는 CSR 문서를 긁어
 * 빈 화면을 본다. 그래서 링크에 경전 카드 대신 앱 소개 그림만 떴다. 미리보기를 그리는 자리는
 * 백엔드 `/s/{token}` 이고, 링크는 거기를 가리켜야 한다.
 *
 * 스텁 판에는 넘길 백엔드가 없어 이 갈림을 볼 수 없다. 그래서 이 스펙만 **실제 HTTP
 * 클라이언트로 띄운 판**(5186)을 열고, 백엔드 응답은 Playwright 가 가로채 고른다.
 * `api-errors` 스펙과 같은 방식이다.
 */

import { expect, test, type Page } from '@playwright/test';

import { E2E_HTTP_API_URL, E2E_HTTP_URL } from '../support/env';

const CONCERN = '남편이 요즘 저를 피하는 것 같아요. 이야기를 꺼내야 할지 모르겠어요.';

/** 서버가 내는 토큰 모양 그대로. 화면이 모양이 다른 토큰은 받지 않는다 */
const SHARE_ID = 'Yk3n_Qb7Tz-1aA9dCe4f2g';

const SCRIPTURE = {
  id: 'dhp.1',
  citation: '법구경 1게',
  text: '모든 것은 마음이 앞서 가고, 마음이 짓고, 마음으로 이루어진다.',
};

const ANSWER = {
  responseType: 'answer',
  answerId: 'srv-answer-share-1',
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
    ],
    closingMessage: '오늘 하루를 잘 넘긴 것만으로도 충분히 하신 거예요.',
  },
};

const DAILY = {
  date: '2026-09-16',
  line: '오늘 하루는 오늘 것만 들고 가요.',
  scripture: SCRIPTURE,
};

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

/** 백엔드가 있는 자리를 Playwright 가 맡는다. 진짜 서버는 띄우지 않는다 */
async function fakeBackend(page: Page): Promise<void> {
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
  await shareReturns(page, `${E2E_HTTP_API_URL}/s/${SHARE_ID}`);
}

/** 서버가 내는 공유 응답. 붙여 넣을 주소(`landingUrl`)도 서버가 짓는다 */
async function shareReturns(page: Page, landingUrl: string): Promise<void> {
  await page.route(
    (url) => url.pathname === '/share',
    (route) =>
      route.fulfill(
        json({
          shareId: SHARE_ID,
          landingUrl,
          cardUrl: `/share/${SHARE_ID}/card.png`,
          ogUrl: `/share/${SHARE_ID}/og.png`,
        }),
      ),
  );
}

/** 홈에서 고민을 적고 답변까지 간다 */
async function answerFor(page: Page): Promise<void> {
  await page.goto(`${E2E_HTTP_URL}/`);
  const entry = page.getByTestId('entry-card');
  await entry.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  if (await entry.isVisible().catch(() => false)) {
    await page.getByTestId('entry-card-cta').click();
  }
  await page.getByTestId('concern-field').fill(CONCERN);
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('analysis')).toBeVisible({ timeout: 20_000 });
}

/** 공유 시트를 열고 거기 적힌 주소를 읽는다 */
async function shareUrlOf(page: Page): Promise<string | null> {
  await page.getByTestId('closing').scrollIntoViewIfNeeded();
  await page.getByTestId('share-button').click();
  await expect(page.getByTestId('share-sheet')).toBeVisible();
  const link = page.getByTestId('share-link');
  await expect(link).toHaveAttribute('data-share-url', /\S/);
  return link.getAttribute('data-share-url');
}

test('공유 링크는 미리보기를 그리는 백엔드를 가리킨다', async ({ page }) => {
  await fakeBackend(page);
  await answerFor(page);

  const url = await shareUrlOf(page);
  expect(url).toBe(`${E2E_HTTP_API_URL}/s/${SHARE_ID}`);

  // 앱 주소로 돌아가면 카톡 미리보기가 다시 빈 문서를 긁는다. 그 자리를 못 박아 둔다
  expect(url?.startsWith(E2E_HTTP_URL), '공유 주소가 앱 주소로 돌아갔어요').toBe(false);
});

/**
 * 서버가 준 주소를 화면이 **그대로** 쓰는지.
 *
 * 앞 테스트만으로는 못 본다. 거기서는 서버가 준 주소와 화면이 `VITE_API_BASE_URL` 로 다시
 * 조립한 주소가 우연히 같아서, 화면이 조립해도 초록이 난다. 그래서 여기서는 서버가 다른
 * 호스트를 내려 준다. 화면이 조립하면 이 단언이 문다.
 *
 * 실제로 갈리는 자리다. 공유 카드를 그리는 서버와 앱이 부르는 API 게이트웨이가 같은 주소로
 * 설 이유가 없고, 배포마다 달라진다.
 */
test('붙여 넣을 주소는 서버가 준 값 그대로다. 화면이 다시 조립하지 않는다', async ({ page }) => {
  await fakeBackend(page);
  const given = `https://share.buddha-words.test/s/${SHARE_ID}`;
  await shareReturns(page, given);
  await answerFor(page);

  expect(await shareUrlOf(page)).toBe(given);
});
