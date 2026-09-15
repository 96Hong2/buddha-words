/**
 * 모든 spec 이 쓰는 page 다.
 *
 * 가드 둘이 자동으로 붙는다.
 * 1. 콘솔 오류가 나면 테스트를 실패시킨다. 화면이 그려져도 JS 가 죽어 있으면 통과가 아니다
 * 2. 개발 스택(5173)으로 요청이 나가면 실패시킨다
 */

import { test as base, expect, type Page } from '@playwright/test';

import { DEV_STACK_URLS, FONT_CDN } from './env';
import type { StubDial } from '../../src/shared/api/stubData';

export interface Fixtures {
  page: Page;
  /** 스텁 다이얼을 주입한다. 반드시 goto 전에 부른다 */
  stub: (dial: StubDial) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  page: async ({ page }, use, testInfo) => {
    const errors: string[] = [];

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
