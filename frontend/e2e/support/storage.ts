/**
 * 모든 테스트가 **온보딩을 이미 본 사람**으로 시작한다.
 *
 * 온보딩은 첫 실행에 홈 대신 그려진다. 그대로 두면 모든 spec 이 입력창 대신 온보딩을
 * 만난다. 실제로도 검증이 재는 대상은 대부분 「다시 온 사람」이라 이쪽이 맞는 출발점이다.
 *
 * **픽스처가 아니라 프로젝트 설정에 둔다.** spec 중에 `@playwright/test` 의 test 를
 * 그대로 쓰는 것들이 있어(share-link · recordings) 픽스처로는 그쪽을 덮지 못한다.
 * 실제로 그 아홉 건이 온보딩에 막혀 깨졌다.
 *
 * 첫 실행 자체를 재는 spec 은 `firstRun` 픽스처로 이 표를 지우고 시작한다.
 */

import type { BrowserContextOptions } from '@playwright/test';

import { E2E_HTTP_URL, E2E_WEB_URL } from './env';

/** 제품 코드의 onboardingStore 와 같은 키다 */
export const ONBOARDING_KEY = 'buddha.onboarding.v1';

/**
 * 앱이 서는 주소가 둘이다(스텁 판 5183 · 실제 HTTP 클라이언트 판 5186). 같은 spec 이
 * 둘을 오가므로 **둘 다** 적어 둔다. 하나만 적으면 그 spec 만 온보딩에 막힌다.
 */
export function seenOnboarding(
  origins: readonly string[] = [E2E_WEB_URL, E2E_HTTP_URL],
): BrowserContextOptions['storageState'] {
  return {
    cookies: [],
    origins: origins.map((origin) => ({
      origin,
      localStorage: [{ name: ONBOARDING_KEY, value: 'done' }],
    })),
  };
}
