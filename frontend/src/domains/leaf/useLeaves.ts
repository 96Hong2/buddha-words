/**
 * 연잎을 화면에서 쓰는 통로.
 *
 * 저장은 `shared/prefs/leaves` 가 하고, 여기서는 **로그를 붙인다.** 잔액이 움직이는
 * 자리마다 화면이 따로 로그를 적으면 한 곳을 빠뜨렸을 때 수치가 조용히 어긋난다.
 * 움직이는 길이 셋(첫 지급 · 모으기 · 쓰기)뿐이라 셋을 여기 한곳에 모은다.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { useAnalytics } from '../../shared/analytics';
import {
  earnLeaf,
  grantWelcome,
  leafCount,
  spendLeaf,
  subscribeLeaves,
  type LeafSpend,
} from '../../shared/prefs/leaves';

/**
 * 지금 가진 연잎. 잔액이 바뀌면 다시 그린다.
 *
 * `useSyncExternalStore` 라 값이 첫 페인트에 이미 있다. 비동기로 읽으면 잔액이 0 에서
 * 튀어 오르고, 그 사이에 「연잎으로 받기」 버튼이 깜빡 떴다 사라진다.
 */
export function useLeafCount(): number {
  return useSyncExternalStore(subscribeLeaves, leafCount, () => 0);
}

/**
 * 첫 연잎을 준다. 앱을 열 때 한 번 부른다.
 *
 * 이미 받은 사람에게는 아무 일도 일어나지 않는다. 판정은 저장소가 하고 여기서는
 * 이번에 준 경우에만 로그를 남긴다.
 */
export function useWelcomeLeaf(): void {
  const analytics = useAnalytics();
  useEffect(() => {
    if (grantWelcome()) analytics.log('leaf_welcome', {}, { once: 'leaf_welcome' });
  }, [analytics]);
}

export interface LeafWallet {
  /** 지금 가진 연잎 */
  count: number;
  /** 광고를 끝까지 봤다. 한 장 늘리고 새 잔액을 돌려준다 */
  earn: () => number;
  /**
   * 한 장 쓴다. 없으면 false 이고 잔액은 그대로다.
   * **부르는 쪽이 반드시 돌려받은 값을 본다.** 있다고 믿고 진행하면 없는 연잎으로 지나간다.
   */
  spend: (placement: LeafSpend) => boolean;
}

export function useLeafWallet(): LeafWallet {
  const analytics = useAnalytics();
  const count = useLeafCount();

  const earn = useCallback(() => {
    const balance = earnLeaf();
    analytics.log('leaf_earn', { balance });
    return balance;
  }, [analytics]);

  const spend = useCallback(
    (placement: LeafSpend) => {
      if (!spendLeaf()) return false;
      // 쓰고 난 잔액을 싣는다. 쓰기 전 값을 실으면 0 이 되는 순간이 로그에 안 남는다
      analytics.log('leaf_spend', { placement, balance: leafCount() });
      return true;
    },
    [analytics],
  );

  return { count, earn, spend };
}
