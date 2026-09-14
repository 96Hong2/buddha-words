/**
 * 보상형 광고 한 번.
 *
 * 광고를 못 띄우는 기기(구버전 · SDK 없음 · 이 기기 광고 끄기)에서는 `supported` 가 false 다.
 * 그때 화면은 CTA 를 감추거나 시트 없이 그냥 진행한다. **광고 때문에 기능을 막지 않는다.**
 * `ready` 는 그 판정이 끝났다는 뜻이다. 판정 전에 CTA 가 떴다 사라지는 깜빡임을 막는다.
 */

import { useCallback, useEffect, useState } from 'react';

import { useBridge } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { readAdOptOut } from '../../shared/lib/adOptOut';

import { AD_GROUP_ID, type AdPlacement } from './placement';

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

    if (!bridge.supports('fullScreenAd')) {
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
  }, [bridge]);

  const show = useCallback(
    async (answerId?: string): Promise<boolean> => {
      if (!supported) {
        analytics.log('rewarded_ad_fail', { placement, reason: 'unsupported' });
        return false;
      }

      analytics.log('rewarded_ad_start', { placement, answer_id: answerId }, { kind: 'click' });
      setShowing(true);
      let watched = false;
      try {
        watched = (await bridge.ads.showFullScreen(AD_GROUP_ID[placement])) === 'watched';
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
