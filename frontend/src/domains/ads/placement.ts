/**
 * 광고를 놓는 자리. 둘뿐이다.
 *
 * 자리를 늘리려면 `docs/plan/00-통합-개발-계획.md` 1.6 절을 먼저 고친다.
 * 고민 작성 중 · 첫 제출 직후 · 답변 블록 사이 · 대기 · 위기 · 위로 · 진입 카드 · INVALID
 * 에는 광고가 없다.
 */

export const AD_PLACEMENT = {
  /** 답변 7블록 아래. 다른 경전 하나 · 다른 관점 하나 · 행동 하나 */
  extension: 'extension',
  /** 같은 날 두 번째 고민. 이야기 이어가기 */
  continue: 'continue',
} as const;

export type AdPlacement = (typeof AD_PLACEMENT)[keyof typeof AD_PLACEMENT];

/**
 * 콘솔 광고 그룹 id.
 *
 * 실광고 그룹(`rewarded_extension` · `rewarded_continue`)은 아직 발급 전이라 두 자리 모두
 * 개발·QA 테스트 id 를 본다. 실광고 id 로 테스트하면 정책 위반이다.
 */
export const AD_GROUP_ID: Record<AdPlacement, string> = {
  extension: 'ait-ad-test-rewarded-id',
  continue: 'ait-ad-test-rewarded-id',
};
