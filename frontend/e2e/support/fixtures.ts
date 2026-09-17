/**
 * 모든 spec 이 쓰는 page 다.
 *
 * 가드 둘이 자동으로 붙는다.
 * 1. 콘솔 오류가 나면 테스트를 실패시킨다. 화면이 그려져도 JS 가 죽어 있으면 통과가 아니다
 * 2. 개발 스택(5173)으로 요청이 나가면 실패시킨다
 *
 * 그리고 **첫 실행 온보딩을 본 것으로 적어 둔다.** 온보딩은 홈 대신 그려지므로, 안 적어
 * 두면 모든 spec 이 입력창 대신 온보딩을 만난다. 온보딩 자체를 재는 spec 은
 * `firstRun` 픽스처로 이 표를 지우고 시작한다.
 */

import { test as base, expect, type Page } from '@playwright/test';

import { DEV_STACK_URLS, FONT_CDN } from './env';
import type { StubDial } from '../../src/shared/api/stubData';

/** 온보딩을 본 것으로 적어 두는 표. 제품 코드의 onboardingStore 와 같은 키다 */
const ONBOARDING_KEY = 'buddha.onboarding.v1';

export interface Fixtures {
  page: Page;
  /** 스텁 다이얼을 주입한다. 반드시 goto 전에 부른다 */
  stub: (dial: StubDial) => Promise<void>;
  /** 이 spec 은 첫 실행을 잰다. 온보딩 표를 지우고 시작한다. goto 전에 부른다 */
  firstRun: () => Promise<void>;
}

export const test = base.extend<Fixtures>({
  page: async ({ page }, use, testInfo) => {
    const errors: string[] = [];

    // 온보딩은 홈 대신 그려진다. 재지 않는 spec 에서는 본 것으로 두고 시작한다
    await page.addInitScript((key) => {
      try {
        localStorage.setItem(key, 'done');
      } catch {
        // 저장소가 막힌 판에서는 온보딩이 뜬다. 그 spec 이 알아서 지나간다
      }
    }, ONBOARDING_KEY);

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // 글꼴 CDN 실패는 배치를 바꾸지 않는다.
      // WebKit 은 문구에 주소를 담지 않고 location 에만 남긴다. 둘 다 본다
      if (FONT_CDN.test(text) || FONT_CDN.test(msg.location().url)) return;
      errors.push(text);
    });
    page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));

    page.on('request', (req) => {
      if (DEV_STACK_URLS.some((url) => req.url().startsWith(url))) {
        errors.push(`개발 스택으로 요청이 나갔어요: ${req.url()}`);
      }
    });

    await use(page);

    if (errors.length > 0 && testInfo.status === testInfo.expectedStatus) {
      throw new Error(`콘솔 오류 ${errors.length}건\n${errors.join('\n')}`);
    }
  },

  firstRun: async ({ page }, use) => {
    await use(async () => {
      // addInitScript 는 새로고침마다 다시 돈다. 그대로 두면 「한 번 본 사람에게는 다시
      // 안 뜬다」를 잴 수 없다. 탭이 사는 동안 한 번만 지우게 sessionStorage 로 표를 남긴다
      await page.addInitScript((key) => {
        try {
          if (sessionStorage.getItem('e2e.firstRun.done') != null) return;
          sessionStorage.setItem('e2e.firstRun.done', '1');
          localStorage.removeItem(key);
        } catch {
          /* 지울 수 없으면 온보딩이 안 뜬다. 그 spec 이 실패로 알려 준다 */
        }
      }, ONBOARDING_KEY);
    });
  },

  stub: async ({ page }, use) => {
    await use(async (dial: StubDial) => {
      await page.addInitScript((d) => {
        (window as unknown as { __buddhaStub: unknown }).__buddhaStub = d;
      }, dial);
    });
  },
});

export { expect };
export type { Page } from '@playwright/test';
