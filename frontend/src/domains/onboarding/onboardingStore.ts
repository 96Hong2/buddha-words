/**
 * 온보딩을 이미 봤나.
 *
 * `localStorage` 로 동기 판정한다. 비동기로 읽으면 첫 프레임에 입력 화면이 번쩍 떴다가
 * 온보딩이 덮는다. 첫인상을 그렇게 시작하지 않는다.
 *
 * 저장소가 막혀 있으면 **안 본 것으로 본다.** 온보딩은 두 장이고 건너뛸 수 있어서,
 * 한 번 더 보는 쪽이 못 보고 빈 입력창 앞에 서는 쪽보다 낫다.
 */

const KEY = 'buddha.onboarding.v1';

export function onboardingPending(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'done';
  } catch {
    return true;
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(KEY, 'done');
  } catch {
    // 못 남겨도 화면은 그대로 돈다. 다음에 한 번 더 보일 뿐이다.
  }
}
