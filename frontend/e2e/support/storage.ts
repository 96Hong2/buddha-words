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

/** 제품 코드의 milestones 와 같은 키다 */
export const MILESTONES_KEY = 'buddha.milestones.v2';

/**
 * 이미 답을 여러 번 받아 본 사람. 온보딩과 같은 이유로 **기본 출발점**이다.
 *
 * 첫 답에는 둘이 달라진다. 광고를 띄우지 않고, 권유 카드가 한 장 뜬다. 그대로 두면
 * 광고 시트를 보는 spec 이 전부 「시트가 안 뜬다」로 깨지고, 답변 아래를 재는 spec 은
 * 권유 카드에 걸린다. 둘 다 그 spec 이 재려는 것이 아니다.
 *
 * 첫 사용 자체를 재는 spec 은 `asNewcomer(page)` 로 이 표를 지우고 시작한다.
 */
export const SEEDED_MILESTONES = JSON.stringify({
  answers: 9,
  homeAddShown: 2,
  homeAddDone: true,
  appShareDone: true,
  notifyDone: true,
});

/** 제품 코드의 leaves 와 같은 키다 */
export const LEAVES_KEY = 'buddha.leaves.v1';

/**
 * 연꽃을 **다 쓴** 사람. 온보딩·답 횟수와 같은 이유로 기본 출발점이다.
 *
 * 첫 연꽃 한 장을 그냥 주므로, 그대로 두면 이어가기 시트와 간직 시트가 광고 버튼 대신
 * 연꽃 버튼을 주 버튼으로 세운다. 광고를 재는 spec 이 전부 거기에 걸린다. 그 spec 들이
 * 재려는 것은 광고지 연꽃이 아니다.
 *
 * `welcomed: true` 가 핵심이다. 이것이 없으면 앱이 열릴 때 한 장을 다시 준다.
 *
 * 연꽃 자체를 재는 spec 은 `withLeaves(page, n)` 으로 원하는 잔액을 심고 시작한다.
 */
export const SEEDED_LEAVES = JSON.stringify({
  count: 0,
  welcomed: true,
  earned: 1,
  spent: 1,
});

/** 제품 코드의 review 와 같은 키다 */
export const REVIEW_KEY = 'buddha.review.v1';

/**
 * 리뷰를 **이미 청한** 사람. 기본 출발점이다.
 *
 * 기본 출발점이 답을 아홉 번 받아 본 사람이라, 그대로 두면 리뷰 카드가 모든 spec 의
 * 홈 맨 앞에 선다. 카드 하나가 화면을 밀어 내려 입력칸 자리를 재는 spec 들이 깨진다.
 *
 * 리뷰 카드를 재는 spec 은 `asReviewCandidate(page)` 로 이 표를 지우고 시작한다.
 */
export const SEEDED_REVIEW = JSON.stringify({ asked: true, snoozedAt: 0 });

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
      localStorage: [
        { name: ONBOARDING_KEY, value: 'done' },
        { name: MILESTONES_KEY, value: SEEDED_MILESTONES },
        { name: LEAVES_KEY, value: SEEDED_LEAVES },
        { name: REVIEW_KEY, value: SEEDED_REVIEW },
      ],
    })),
  };
}
