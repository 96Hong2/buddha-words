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

import { DEV_STACK_URLS } from './env';
import type { StubDial } from '../../src/shared/api/stubData';

import {
  LEAVES_KEY,
  MILESTONES_KEY,
  ONBOARDING_KEY,
  REVIEW_KEY,
  SEEDED_LEAVES,
  SEEDED_MILESTONES,
  SEEDED_REVIEW,
} from './storage';

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

    // 온보딩은 홈 대신 그려진다. 재지 않는 spec 에서는 본 것으로 두고 시작한다.
    // 답 횟수도 같은 이유로 지나온 것으로 둔다. 첫 답에는 광고가 없고 권유가 한 장 떠서,
    // 그 둘이 대상이 아닌 spec 이 전부 거기에 걸린다. 자세한 이유는 support/storage.ts
    await page.addInitScript(
      ([key, milestonesKey, milestones, leavesKey, leaves, reviewKey, review]) => {
        try {
          localStorage.setItem(key, 'done');
          // `asNewcomer` 를 부른 spec 에서는 심지 않는다. 이 스크립트는 화면을 옮길 때마다
          // 다시 도는데, 그때마다 다시 심으면 첫 답 뒤에 쌓인 횟수가 매번 9 로 되돌아간다
          if (sessionStorage.getItem('e2e.newcomer') == null) {
            localStorage.setItem(milestonesKey, milestones);
          }
          /*
            연꽃과 리뷰도 같다. 잔액이 있으면 광고 시트가 연꽃 버튼을 주 버튼으로 세우고,
            리뷰를 안 청한 사람이면 홈 맨 앞에 카드가 서서 아래가 통째로 밀린다.
            둘 다 그 spec 들이 재려는 것이 아니다. 잰다면 각자 표를 지우고 시작한다.
          */
          if (sessionStorage.getItem('e2e.leaves') == null) {
            localStorage.setItem(leavesKey, leaves);
          }
          if (sessionStorage.getItem('e2e.review') == null) {
            localStorage.setItem(reviewKey, review);
          }
        } catch {
          // 저장소가 막힌 판에서는 온보딩이 뜬다. 그 spec 이 알아서 지나간다
        }
      },
      [
        ONBOARDING_KEY,
        MILESTONES_KEY,
        SEEDED_MILESTONES,
        LEAVES_KEY,
        SEEDED_LEAVES,
        REVIEW_KEY,
        SEEDED_REVIEW,
      ] as const,
    );

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      // 글꼴 CDN 실패를 눈감아 주던 자리가 여기 있었다. 이제 바깥에서 받는 글꼴이 없고,
      // 누가 되살리면 specs/fonts.spec.ts 가 잡는다. 눈감는 규칙을 남겨 두면 그 404 를 또 놓친다
      errors.push(msg.text());
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
