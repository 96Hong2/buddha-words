/**
 * 전면 광고 한 편이 어떻게 끝나는지 가르는 규칙.
 *
 * SDK 호출에서 **판정만 떼어 냈다.** 여기서 틀리면 화면이 영영 안 넘어가는데, 그 사고는
 * 실기기에서만 보이고 재현도 어렵다. 순수 함수로 두면 표를 그대로 잴 수 있다.
 *
 * 배선은 `tossBridge.ts` 의 `showFullScreen` 이 한다.
 */

import type { FullScreenAdResult } from './types';

/**
 * 전면 광고를 불러오는 데 주는 시간.
 *
 * 개발자 커뮤니티에 `loaded` 도 `onError` 도 없이 90초를 기다린 사례가 여럿이다.
 * 그동안 버튼이 죽어 있으면 사람은 앱이 멈춘 줄 안다. 이 시간이 지나면 못 띄운 것으로 치고
 * 부르는 쪽이 광고 없이 지나가게 둔다.
 */
export const FULL_SCREEN_LOAD_TIMEOUT_MS = 8_000;

/**
 * 광고가 **뜬 뒤** 끝 신호를 기다리는 최대 시간. 넘기면 못 띄운 것으로 접는다.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────
 *
 * 불러오기 시간 제한은 광고가 뜨는 순간 풀린다. 끝까지 본 사람이 8초가 지났다고 보상을
 * 못 받으면 안 되기 때문이다. 그런데 그 뒤로 **아무 시간 제한도 없었다.** 끝 신호가 한
 * 번도 안 오는 조합이 실제로 있고, 그때 화면은 영원히 기다린다.
 *
 * 2026-09-24 사용자 신고가 그 장면이다: 「5초 후 리워드 제공」이 뜨는 광고가 나왔는데
 * 그대로 멈췄다. 광고는 떴으니 불러오기 제한은 이미 풀려 있었고, 닫힘도 보상도 안 왔다.
 * 아래 `AD_ON_SCREEN` 을 넓힌 것과 이 시간 제한이 그 사고를 막는 두 겹이다.
 *
 * **90초인 이유.** 보상형이 실측 30초이고 끝 화면이 몇 초 더 붙는다. 세 배를 줘도 사람이
 * 그때까지 앱 앞에 앉아 있을 리 없다. 더 짧게 잡으면 광고를 진짜로 보던 사람을 끊는다.
 */
export const FULL_SCREEN_SHOW_TIMEOUT_MS = 90_000;

/**
 * 광고가 닫혀 화면이 다시 보인 뒤, 닫힘 신호를 이만큼 더 기다린다.
 * 보상 이벤트가 화면 복귀보다 조금 늦게 오는 기기가 있어 바로 끊지 않는다.
 */
export const DISMISS_FALLBACK_MS = 2_000;

/**
 * 「광고가 지금 화면에 떠 있다」로 읽는 이벤트.
 *
 * ⚠ **`show` 하나만 보면 안 된다.** 한때 그랬는데, 그러면 `show` 를 안 주고 `impression`
 * 부터 주는 조합에서 닫힘 폴백이 아예 안 걸린다. 그 기기가 `dismissed` 도 안 주는
 * 버전이면(Android 토스앱 5.255.0 이 그렇다) 광고가 닫혀도 화면이 영영 기다린다.
 *
 * 셋 중 무엇이 먼저 오든 뜻은 하나다: 광고가 사람 눈앞에 있다.
 */
const AD_ON_SCREEN = new Set(['show', 'impression', 'clicked']);

export function marksAdOnScreen(type: string): boolean {
  return AD_ON_SCREEN.has(type);
}

/**
 * 이 이벤트로 광고 한 편이 끝나나. 끝나면 결과, 아직이면 null.
 *
 * 보상은 `userEarnedReward` 하나에서만 나온다. 떴다 · 노출됐다 · 눌렸다는 보상이 아니다.
 * 닫힘은 언제나 취소다. 뜨자마자 닫은 사람에게 보상을 주면 무효 트래픽으로 잡혀 광고
 * 계정이 막힌다. 샌드박스 목이 보상 이벤트를 안 준다고 여기서 타협하지 않는다.
 *
 * 전면형은 보상 이벤트가 없어 언제나 `dismissed` 로 끝난다. 그것을 통과로 읽을지는
 * 자리가 정한다(`useRewardedAd` 의 `pass`). 여기서는 무슨 일이 일어났는지만 말한다.
 */
export function adEventResult(type: string): FullScreenAdResult | null {
  if (type === 'userEarnedReward') return 'watched';
  if (type === 'dismissed') return 'dismissed';
  if (type === 'failedToShow') return 'noFill';
  return null;
}
