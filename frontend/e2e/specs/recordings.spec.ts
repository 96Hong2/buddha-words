/**
 * 동작 영상.
 *
 * 그림 한 장으로는 「눌러서 이어지는 길」이 증명되지 않는다. 네 흐름을 실제로 걸어가며
 * 영상으로 남긴다. 파일 이름은 사용자가 무슨 흐름인지 알아볼 수 있게 한글로 짓는다.
 *
 * 영상은 Playwright 가 컨텍스트마다 남긴다. 그래서 여기서만 기본 `page` 를 쓰지 않고
 * 흐름마다 컨텍스트를 새로 열어, 이름 붙인 파일 하나로 받아 낸다.
 * 중간중간 멈춰 서는 것은 사람이 읽을 시간을 주기 위해서다. 판정은 단언이 한다.
 */

import { join } from 'node:path';

import { test, expect, devices, type Browser, type Page } from '@playwright/test';

import type { StubDial } from '../../src/shared/api/stubData';
import { DEEP_CONCERN, dismissEntry, revealBottomBar } from '../support/flow';
import { videosDir } from '../support/shots';
import { seenOnboarding } from '../support/storage';

/** 읽을 시간. 눌리자마자 다음 장면으로 넘어가면 영상이 무슨 일인지 안 보인다 */
const BEAT = 900;

async function beat(page: Page, times = 1) {
  await page.waitForTimeout(BEAT * times);
}

interface RecordOptions {
  stub?: StubDial;
}

/** 흐름 하나를 영상으로 남긴다. 실패해도 그때까지 찍힌 영상을 남긴다 */
async function record(
  browser: Browser,
  name: string,
  body: (page: Page) => Promise<void>,
  { stub }: RecordOptions = {},
): Promise<void> {
  const dir = videosDir();
  const context = await browser.newContext({
    ...devices['Pixel 8'],
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    recordVideo: { dir: join(dir, '_raw') },
    // 창을 직접 만드는 자리라 프로젝트 설정의 storageState 가 안 걸린다.
    // 영상은 「다시 온 사람」의 화면이라 온보딩을 본 것으로 두고 찍는다
    storageState: seenOnboarding(),
  });
  const page = await context.newPage();

  const crashes: string[] = [];
  page.on('pageerror', (error) => crashes.push(`${error.name}: ${error.message}`));

  if (stub != null) {
    await page.addInitScript((dial) => {
      (window as unknown as { __buddhaStub: unknown }).__buddhaStub = dial;
    }, stub);
  }

  const video = page.video();
  try {
    await body(page);
    await page.waitForTimeout(BEAT);
  } finally {
    await context.close();
    if (video != null) {
      await video.saveAs(join(dir, `${name}.webm`));
      await video.delete();
    }
  }

  if (crashes.length > 0) throw new Error(`화면이 죽었어요\n${crashes.join('\n')}`);
}

test('영상 1: 고민을 쓰고 답변을 받아 읽는다', async ({ browser }) => {
  test.setTimeout(120_000);
  await record(browser, '1. 고민을 쓰고 답변을 받아 읽는다', async (page) => {
    await page.goto('/');
    await beat(page);
    await dismissEntry(page);
    await beat(page);

    // 한 줄씩 적어 깊이 표시가 차오르는 것까지 보이게 한다
    const field = page.getByTestId('concern-field');
    for (const line of DEEP_CONCERN.split('\n')) {
      await field.pressSequentially(`${line}\n`, { delay: 18 });
      await beat(page);
    }
    await expect(page.getByTestId('depth-label')).toContainText('이제 꽤 깊게');

    await page.getByTestId('submit').click();
    await expect(page.getByTestId('loading')).toBeVisible();
    await beat(page, 2);

    await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('scripture-text')).toBeVisible();
    await beat(page);
    await expect(page.getByTestId('analysis')).toBeVisible({ timeout: 20_000 });

    // 천천히 읽어 내려간다
    for (const id of ['explanation', 'analysis', 'actions', 'closing']) {
      await page.getByTestId(id).scrollIntoViewIfNeeded();
      await beat(page);
    }
    await expect(page.getByTestId('bottom-bar')).toBeVisible();
  });
});

test('영상 2: 공유 카드를 만들어 보낸다', async ({ browser }) => {
  test.setTimeout(120_000);
  await record(
    browser,
    '2. 공유 카드를 만들어 보낸다',
    async (page) => {
      await page.goto('/');
      await dismissEntry(page);
      await page.getByTestId('concern-field').fill(DEEP_CONCERN);
      await page.getByTestId('submit').click();
      await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('analysis')).toBeVisible({ timeout: 20_000 });
      await beat(page);

      await revealBottomBar(page);
      await beat(page);
      await page.getByTestId('share-button').click();

      const sheet = page.getByTestId('share-sheet');
      await expect(sheet).toBeVisible();
      await expect(page.getByTestId('share-card')).toBeVisible();
      await beat(page, 2);

      // 카드에 고민 원문이 들어가지 않는다
      const card = (await page.getByTestId('share-card').innerText()).replace(/\s+/g, ' ');
      expect(card).not.toContain('팀장님');
      expect(card).not.toContain('그만둘까');

      const link = page.getByTestId('share-link');
      await expect(link).toHaveAttribute('data-share-url', /\/s\/.+/);
      await link.click();
      // 복사가 막힌 브라우저다. 조용히 지나가지 않고 막혔다고 알린다
      await expect(page.getByText('복사가 막혀 있어요')).toBeVisible();
      await beat(page, 2);
    },
    { stub: { pass1Ms: 300, pass2Ms: 400 } },
  );
});

test('영상 3: 보관함에 간직하고 네 번째에 이용권 안내가 뜬다', async ({ browser }) => {
  test.setTimeout(180_000);
  await record(
    browser,
    '3. 간직은 셋까지, 네 번째에 이용권 안내가 뜬다',
    async (page) => {
      async function ask(text: string) {
        await dismissEntry(page);
        await page.getByTestId('concern-field').fill(text);
        await page.getByTestId('submit').click();

        const cont = page.getByTestId('continue-sheet');
        await cont.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
        if (await cont.isVisible().catch(() => false)) {
          await beat(page);
          await page.getByTestId('continue-watch').click();
        }
        await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId('analysis')).toBeVisible({ timeout: 20_000 });
      }

      await page.goto('/');
      for (let i = 1; i <= 3; i += 1) {
        await ask(`${DEEP_CONCERN}\n(${i}번째 이야기예요)`);
        await revealBottomBar(page);
        await page.getByTestId('save-button').click();
        await expect(page.getByTestId('paywall')).toHaveCount(0);
        await beat(page);
        await page.goto('/');
      }

      await ask(`${DEEP_CONCERN}\n(네 번째 이야기예요)`);
      await revealBottomBar(page);
      await page.getByTestId('save-button').click();

      const paywall = page.getByTestId('paywall');
      await expect(paywall).toBeVisible();
      await expect(page.getByTestId('paywall-buy')).toBeInViewport();
      await beat(page, 2);

      await page.getByTestId('sheet-close').first().click();
      await page.goto('/archive');
      await expect(page.getByTestId('archive-item')).toHaveCount(3);
      await beat(page, 2);
    },
    { stub: { pass1Ms: 150, pass2Ms: 200 } },
  );
});

test('영상 4: 위기 입력은 답변 대신 창구 안내로 간다', async ({ browser }) => {
  test.setTimeout(120_000);
  await record(browser, '4. 위기 입력은 창구 안내로 간다', async (page) => {
    await page.goto('/');
    await dismissEntry(page);
    await beat(page);

    await page
      .getByTestId('concern-field')
      .pressSequentially('요즘 정말 죽고 싶어요. 아무것도 하기 싫고 매일이 버거워요.', {
        delay: 22,
      });
    await beat(page);
    await page.getByTestId('submit').click();

    const crisis = page.getByTestId('crisis');
    await expect(crisis).toBeVisible({ timeout: 20_000 });
    // 경전도 행동 지침도 없다. 창구만 있다
    await expect(page.getByTestId('scripture-card')).toHaveCount(0);
    await expect(page.getByTestId('actions')).toHaveCount(0);
    await expect(page.getByTestId('crisis-channel').first()).toBeVisible();
    await beat(page, 2);

    await page.getByTestId('crisis-continue').click();
    await expect(page.getByTestId('solace')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('solace-opening')).toBeVisible();
    await beat(page);
    await page.getByTestId('solace-closing').scrollIntoViewIfNeeded();
    await beat(page, 2);
  });
});
