/**
 * 보상형 광고 한 번.
 *
 * 광고를 못 띄우는 기기(구버전 · SDK 없음 · 이 기기 광고 끄기)에서는 `supported` 가 false 다.
 * 그때 화면은 CTA 를 감추거나 시트 없이 그냥 진행한다. **광고 때문에 기능을 막지 않는다.**
 * `ready` 는 그 판정이 끝났다는 뜻이다. 판정 전에 CTA 가 떴다 사라지는 깜빡임을 막는다.
 *
 * **광고 그룹 id 가 없는 것도 「못 띄우는」 쪽이다.** 콘솔이 발급하기 전에는 운영 번들에
 * 값이 없다. 그 판에서 CTA 만 띄우면 눌러도 아무 일이 없거나, 지어낸 id 로 부르게 된다.
 */

import { useCallback, useEffect, useState } from 'react';

import { useBridge } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { readAdOptOut } from '../../shared/lib/adOptOut';

import { adGroupId, type AdPlacement } from './placement';

export interface RewardedAd {
  /** 이 기기에서 보상형 광고를 띄울 수 있나 */
  supported: boolean;
  /** 지원 여부 판정이 끝났나 */
  ready: boolean;
  /** 광고가 떠 있는 동안 true. 버튼을 두 번 누르는 것을 막는다 */
  showing: boolean;
  /** 끝까지 봤으면 true. 중간에 닫았거나 못 띄웠으면 false 이고 보상은 없다 */
  show(answerId?: string): Promise<boolean>;
}

export function useRewardedAd(placement: AdPlacement): RewardedAd {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState(false);
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!bridge.supports('fullScreenAd') || adGroupId(placement) === null) {
      setSupported(false);
      setReady(true);
      return;
    }

    void readAdOptOut(bridge.storage).then((optOut) => {
      if (cancelled) return;
      setSupported(!optOut);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [bridge, placement]);

  const show = useCallback(
    async (answerId?: string): Promise<boolean> => {
      if (!supported) {
        analytics.log('rewarded_ad_fail', { placement, reason: 'unsupported' });
        return false;
      }

      // 위에서 걸렀지만 한 번 더 본다. 지어낸 id 로 광고를 부르지 않는다
      const group = adGroupId(placement);
      if (group === null) {
        analytics.log('rewarded_ad_fail', { placement, reason: 'no_group' });
        return false;
      }

      analytics.log('rewarded_ad_start', { placement, answer_id: answerId }, { kind: 'click' });
      setShowing(true);
      let watched = false;
      try {
        watched = (await bridge.ads.showFullScreen(group)) === 'watched';
      } finally {
        setShowing(false);
      }

      if (!watched) {
        analytics.log('rewarded_ad_fail', { placement, reason: 'error' });
        return false;
      }

      analytics.log('rewarded_ad_complete', {
        placement,
        answer_id: answerId,
        reward_granted: true,
      });
      return true;
    },
    [analytics, bridge, placement, supported],
  );

  return { supported, ready, showing, show };
}
