/**
 * 넓은 화면 증명.
 *
 * 이 앱은 토스 앱 WebView(폭 360~430px) 전용이라 화면 CSS 가 좁은 폭만 상정하고 쓰였다.
 * 데스크탑 브라우저에서 폭이 그대로 늘어나면 부처 그림이 가로로 늘어나 얼굴이 잘리고,
 * 연꽃 배경 띠가 여러 번 반복되고, 하단 탭바가 화면 끝까지 벌어진다.
 *
 * 그래서 앱 기둥을 실기기 최대 폭(--app-max)에 묶었다. 여기서 재는 것은 셋이다.
 *   1. 기둥이 그 폭을 넘지 않고 가운데에 서는가
 *   2. position: fixed 요소(탭바·시트·하단 바·토스트)가 기둥 안에 드는가
 *   3. 본문이 가로로 넘치지 않는가
 * 좁은 폭에서는 예전 배치가 그대로여야 하므로 마지막 테스트가 360·390px 을 따로 잰다.
 *
 * 화면 하나를 빠뜨리면 그 화면만 기둥을 새로 벗어난다. 그래서 답변 계열 말고 위기·위로·
 * 가벼운 입력·소진·경전 원문 시트·공유 랜딩까지 걸어 다니며, 이름을 모르는 덮개까지
 * 싸잡아 재는 검사(expectOverlaysInsideColumn)를 화면마다 건다.
 */

import { test, expect, type Page } from '../support/fixtures';
import { askOnce, revealBottomBar } from '../support/flow';

/** index.css 의 --app-max 와 같은 값 */
const APP_MAX = 430;
const WIDE = [768, 1280, 1920] as const;

/** 소수점 자리는 브라우저 반올림이라 1px 까지 눈감는다 */
const SLACK = 1;

const CONCERN = [
  '요즘 회사에서 팀장님이 제 의견을 계속 무시하세요.',
  '동료들 앞에서 제가 낸 안을 다른 사람 것처럼 말한 적도 있어요.',
  '그만둘까 고민이에요. 그런데 지금 나가면 다음이 없을 것 같아 무섭기도 해요.',
].join('\n');

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 앱 기둥. 껍데기라 testid 가 없다 */
async function appBox(page: Page): Promise<Box> {
  const box = await page.locator('.app').boundingBox();
  expect(box, '앱 기둥을 찾지 못했어요').not.toBeNull();
  return box as Box;
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} 를 찾지 못했어요`).not.toBeNull();
  return box as Box;
}

function viewportWidth(page: Page): number {
  const size = page.viewportSize();
  expect(size).not.toBeNull();
  return (size as { width: number }).width;
}

/** 기둥이 실기기 폭을 넘지 않고 화면 가운데에 선다 */
async function expectColumn(page: Page) {
  const app = await appBox(page);
  const width = viewportWidth(page);
  expect(app.width).toBeLessThanOrEqual(APP_MAX + SLACK);
  expect(Math.abs(app.x + app.width / 2 - width / 2)).toBeLessThanOrEqual(SLACK);
}

/** 그 요소가 기둥 좌우 밖으로 나가지 않는다 */
async function expectInsideColumn(page: Page, selector: string) {
  const app = await appBox(page);
  const box = await boxOf(page, selector);
  expect(box.x, `${selector} 가 기둥 왼쪽으로 삐져나왔어요`).toBeGreaterThanOrEqual(app.x - SLACK);
  expect(box.x + box.width, `${selector} 가 기둥 오른쪽으로 삐져나왔어요`).toBeLessThanOrEqual(
    app.x + app.width + SLACK,
  );
}

/** 가로 스크롤이 생기지 않는다 */
async function expectNoSideways(page: Page) {
  const over = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollWidth - document.documentElement.clientWidth;
  });
  expect(over, '본문이 가로로 넘쳤어요').toBeLessThanOrEqual(SLACK);
}

/**
 * 이름을 하나하나 대지 않고, 화면에 떠 있는 판을 전부 훑어 기둥 밖으로 나간 것을 잡는다.
 * 새 시트나 새 바가 생겨도 이 검사에 걸린다.
 */
async function expectOverlaysInsideColumn(page: Page) {
  const strays = await page.evaluate((slack) => {
    const app = document.querySelector('.app')?.getBoundingClientRect();
    if (app == null) return ['앱 기둥을 찾지 못했어요'];

    const viewport = document.documentElement.clientWidth;
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'absolute') continue;

      const box = el.getBoundingClientRect();
      // 아이콘이나 그립 같은 작은 조각은 부모를 따라간다. 판 크기만 본다
      if (box.width < 60 || box.height < 24) continue;

      // 이름이 없으면 무엇이 걸렸는지 알 수 없다. 클래스 → 테스트 id → 태그 순으로 부른다
      const name =
        el.getAttribute('class') ?? el.getAttribute('data-testid') ?? el.tagName.toLowerCase();
      /*
        화면 전체를 덮어도 되는 것 둘.
        ① 딤과 그것을 담는 껍데기. 바깥을 눌러 닫는 동작이 거기에 달려 있다
        ② 전면 광고. 그것은 SDK 가 우리 기둥 위에 통째로 그리는 판이라 우리가 눕힐 수 없다
        넓이로 봐주면 정작 화면 끝까지 늘어난 시트를 눈감게 되므로 이름으로 가른다
      */
      if (/dim|scrim|root|fullscreen-ad/.test(name) && box.width >= viewport - slack) continue;
      if (box.left >= app.left - slack && box.right <= app.right + slack) continue;

      found.push(`${name} (${Math.round(box.left)}~${Math.round(box.right)})`);
    }
    return found;
  }, SLACK);

  expect(strays, '기둥 밖으로 나간 판이 있어요').toEqual([]);
}

/** 넓은 화면에서 이 화면이 지켜야 할 것 셋을 한 번에 본다 */
async function expectWideOk(page: Page) {
  await expectColumn(page);
  await expectNoSideways(page);
  await expectOverlaysInsideColumn(page);
}

async function dismissEntry(page: Page) {
  const card = page.getByTestId('entry-card');
  await card.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  if (await card.isVisible().catch(() => false)) {
    await page.getByTestId('entry-card-cta').click();
    await expect(card).toBeHidden();
  }
}

/** 고민 하나를 보낸다. 같은 날 두 번째부터는 이어가기 시트를 거친다 */
async function send(page: Page, text: string) {
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(text);
  await page.getByTestId('submit').click();

  const sheet = page.getByTestId('continue-sheet');
  await sheet.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
  if (await sheet.isVisible().catch(() => false)) {
    await page.getByTestId('continue-watch').click();
  }
}

test('넓은 화면에서 홈·보관함·설정이 기둥 안에 선다', async ({ page }) => {
  for (const width of WIDE) {
    await page.setViewportSize({ width, height: 900 });

    await page.goto('/');
    await dismissEntry(page);
    await expect(page.getByTestId('home')).toBeVisible();
    await expectColumn(page);
    await expectNoSideways(page);
    // 홈 탭바는 기둥 안에 붙어 있는 자리다
    await expectInsideColumn(page, '.home-screen .tabbar');

    await page.goto('/archive');
    await expect(page.getByTestId('archive')).toBeVisible();
    await expectColumn(page);
    await expectNoSideways(page);
    // 뜬 탭바는 뷰포트 기준이라 기둥을 따라오지 않으면 화면 끝까지 벌어진다
    await expectInsideColumn(page, '.arch-tabbar');

    await page.goto('/settings');
    await expect(page.getByTestId('settings')).toBeVisible();
    await expectColumn(page);
    await expectNoSideways(page);
  }
});

test('넓은 화면에서 답변 화면의 그림·하단 바·시트가 기둥 안에 든다', async ({ page, stub }) => {
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto('/');
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(CONCERN);
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('analysis')).toBeVisible({ timeout: 20_000 });

  for (const width of WIDE) {
    await page.setViewportSize({ width, height: 900 });
    await expectColumn(page);
    await expectNoSideways(page);

    // 부처 그림이 가로로 늘어나면 얼굴이 잘린다. 원본이 정사각이라 폭이 곧 잘림이다
    const illust = await boxOf(page, '.ans .illust img');
    expect(illust.width).toBeLessThanOrEqual(APP_MAX + SLACK);
    await expectInsideColumn(page, '.ans .illust img');

    // 마무리 연꽃 띠도 기둥 안이다
    await expectInsideColumn(page, '.ans .pattern-band');

    // 하단 고정 바는 마지막 한마디까지 읽어야 올라온다
    await page.getByTestId('closing').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('bottom-bar')).toBeVisible();
    await expectInsideColumn(page, '.ans .bottombar');
  }

  // 공유 시트도 기둥 안에서 열린다
  await page.getByTestId('share-button').click();
  await expect(page.getByTestId('share-sheet')).toBeVisible();
  await expectInsideColumn(page, '.sh-sheet');
});

test('넓은 화면에서 바텀시트 판이 기둥 안에서 열린다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await dismissEntry(page);

  await page.getByTestId('daily-card').click();
  await expect(page.getByTestId('daily-sheet')).toBeVisible();
  await expectInsideColumn(page, '.pk-sheet');
  // 딤은 화면 전체를 덮는다. 시트가 좁아졌다고 바깥을 눌러 못 닫으면 안 된다
  const dim = await boxOf(page, '.pk-sheet-dim');
  expect(dim.width).toBeGreaterThanOrEqual(1440 - SLACK);
});

/** 보관함이 비어 있으면 연꽃 띠도 잠긴 자리도 그려지지 않는다 */
async function seedArchive(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'buddha.archive.v1',
      JSON.stringify({
        version: 1,
        items: [
          {
            answerId: 'wide-1',
            savedAt: Date.now(),
            line: '남의 속도를 좇지 마라',
            tags: ['anxiety'],
            visualTheme: 'anxiety',
          },
        ],
      }),
    );
  });
}

test('넓은 화면에서 연꽃 배경 띠가 화면 가득 깔리지 않는다', async ({ page }) => {
  await seedArchive(page);
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/archive');
  await expect(page.getByTestId('archive-item')).toHaveCount(1);

  const band = await boxOf(page, '.arch-pattern');
  expect(band.width).toBeLessThanOrEqual(APP_MAX + SLACK);
  await expectInsideColumn(page, '.arch-pattern');

  // 띠 원본은 두 장을 이어 붙인 그림이라 반복하면 이음매가 세로 선으로 드러난다.
  // 한 장만 놓는지 여기서 잡는다
  const repeat = await page
    .locator('.arch-pattern')
    .evaluate((el) => getComputedStyle(el).backgroundRepeat);
  expect(repeat).toBe('no-repeat');
  expect(band.width, '띠가 원본 한 장보다 넓으면 이음매가 드러난다').toBeLessThanOrEqual(366);
});

test('넓은 화면에서 이용권 시트가 기둥 안에서 열린다', async ({ page }) => {
  await seedArchive(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/archive');
  await expect(page.getByTestId('archive')).toBeVisible();

  // 파는 자리가 보관함에서 간직 시트로 옮겨 갔다. 답변을 받아 그리로 간다
  await page.goto('/');
  await askOnce(page);
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();
  await page.getByTestId('save-gate-buy').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
  await expectInsideColumn(page, '.pw-sheet');
});

test('위기와 위로 화면도 기둥 안에 든다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await send(page, '요즘 정말 죽고 싶어요. 아무것도 하기 싫고 매일이 버거워요.');

  await expect(page.getByTestId('crisis')).toBeVisible({ timeout: 20_000 });
  await expectWideOk(page);
  // 창구 안내와 닫기 바가 화면 끝까지 벌어지면 안 된다
  await expectInsideColumn(page, '[data-testid="crisis-channel"]');

  await page.getByTestId('crisis-continue').click();
  await expect(page.getByTestId('solace')).toBeVisible({ timeout: 20_000 });
  await expectWideOk(page);
});

test('가벼운 입력·잘못 적은 입력·이어가기 시트도 기둥 안에 든다', async ({ page, stub }) => {
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.setViewportSize({ width: 1920, height: 900 });

  await page.goto('/');
  await send(page, 'ㅋㅋㅋㅋㅋㅋㅋㅋ');
  await expect(page.getByTestId('light')).toBeVisible({ timeout: 20_000 });
  await expectWideOk(page);

  await page.goto('/');
  await send(page, 'asdkjh qweoiu zxcvbn');
  await expect(page.getByTestId('invalid')).toBeVisible({ timeout: 20_000 });
  await expectWideOk(page);

  // 오늘 이미 여러 번 이어간 자리. 천장이 없어 광고 시트가 뜬다(2026-09-20 천장 폐지)
  await page.evaluate(() => {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const date = `${now.getDate()}`.padStart(2, '0');
    localStorage.setItem(
      'buddha.quota.v1',
      JSON.stringify({
        day: `${now.getFullYear()}-${month}-${date}`,
        firstUsed: true,
        continuesUsed: 4,
        lightUsed: 0,
      }),
    );
  });
  await page.goto('/');
  await send(page, CONCERN);
  await expect(page.getByTestId('continue-sheet')).toBeVisible();
  await expectWideOk(page);
});

test('경전 원문 시트와 공유 랜딩도 기둥 안에 든다', async ({ page, stub }) => {
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto('/');
  await send(page, CONCERN);
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('analysis')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: '원문 보기' }).click();
  await expect(page.locator('.ans .sheet')).toBeVisible();
  await expectWideOk(page);
  await page.getByTestId('sheet-close').first().click();
  await expect(page.locator('.ans .sheet')).toHaveCount(0);

  // 랜딩은 지어낸 토큰으로 열면 만료 화면이라 진짜 공유 링크를 받아 간다
  await page.getByTestId('closing').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('bottom-bar')).toBeVisible();
  await page.getByTestId('share-button').click();
  await expect(page.getByTestId('share-sheet')).toBeVisible();
  const link = await page.getByTestId('share-link').getAttribute('data-share-url');
  await page.goto(link ?? '/s/none');

  await expect(page.getByTestId('landing')).toBeVisible();
  await expectWideOk(page);
});

test('좁은 화면은 예전 그대로다', async ({ page }) => {
  // 360 은 가장 좁은 실기기, 390 은 시안이 기준으로 삼은 폭이다
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 780 });

    await page.goto('/archive');
    await expect(page.getByTestId('archive')).toBeVisible();
    const app = await appBox(page);
    // 기둥이 화면을 꽉 채운다. 여기서 좁아지면 실기기 화면이 달라진 것이다
    expect(app.x).toBe(0);
    expect(app.width).toBe(width);
    await expectNoSideways(page);

    // 탭바는 예전처럼 좌우 16px 이다
    const tabbar = await boxOf(page, '.arch-tabbar');
    expect(tabbar.x).toBe(16);
    expect(tabbar.width).toBe(width - 32);
  }
});
