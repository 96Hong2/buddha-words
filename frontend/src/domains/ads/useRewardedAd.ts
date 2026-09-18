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

import { useCallback, useEffect, useRef, useState } from 'react';

import { useBridge } from '../../app/providers';
import { immediateBucket, useAnalytics } from '../../shared/analytics';
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

  /**
   * 못 띄우는 이유를 한 번 남긴다.
   *
   * 화면에서는 셋이 똑같이 「광고가 없었다」로 보인다. 기기가 낡은 것인지, 콘솔이 아직
   * 광고 그룹 id 를 안 줘서 번들에 값이 없는 것인지, 사람이 광고를 꺼 둔 것인지.
   * **그 구분이 없어서 광고가 한 건도 안 도는 번들을 올려 놓고 실기기에서야 알았다.**
   * `no_group` 이 남아 있으면 코드가 아니라 콘솔에서 할 일이 남은 것이다.
   */
  useEffect(() => {
    let cancelled = false;

    if (!bridge.supports('fullScreenAd')) {
      setSupported(false);
      setReady(true);
      analytics.log(
        'ad_skipped',
        { placement, reason: 'unsupported' },
        { once: `ad_skipped:${placement}` },
      );
      return;
    }
    if (adGroupId(placement) === null) {
      setSupported(false);
      setReady(true);
      analytics.log(
        'ad_skipped',
        { placement, reason: 'no_group' },
        { once: `ad_skipped:${placement}` },
      );
      return;
    }

    void readAdOptOut(bridge.storage).then((optOut) => {
      if (cancelled) return;
      setSupported(!optOut);
      setReady(true);
      if (optOut) {
        analytics.log(
          'ad_skipped',
          { placement, reason: 'opt_out' },
          { once: `ad_skipped:${placement}` },
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [analytics, bridge, placement]);

  /**
   * 띄울 수 있는 상태가 됐다. 제안을 **본 것**(deep_extension_view · second_question_start)보다 앞이다.
   * 둘을 갈라야 「자격은 됐는데 제안이 안 보였다」와 「보고도 안 눌렀다」가 구분된다.
   */
  useEffect(() => {
    if (!ready || !supported) return;
    analytics.log('ad_eligible', { placement, answer_id: undefined }, { once: `ad_eligible:${placement}` });
  }, [analytics, placement, ready, supported]);

  /**
   * 광고를 끝까지 본 뒤 곧바로 앱을 떠났나.
   *
   * **수익만 보면 안 되는 자리다.** 광고가 가장 많이 도는 위치가 사람이 가장 많이 나가는
   * 위치이기도 하면, 그 자리는 옮겨야 한다. 그 판단에 필요한 유일한 신호가 이것이다.
   * 광고가 끝난 뒤 짧은 시간 안에 화면이 숨겨지면 이탈로 본다.
   */
  const watchedAt = useRef(0);
  const watchedAnswer = useRef<string | undefined>(undefined);

  useEffect(() => {
    function onHide() {
      if (document.visibilityState !== 'hidden') return;
      if (watchedAt.current === 0) return;
      const since = Date.now() - watchedAt.current;
      // 한참 뒤에 닫은 것은 광고와 무관하다
      if (since > 60_000) return;
      watchedAt.current = 0;
      analytics.log('post_ad_exit', {
        placement,
        answer_id: watchedAnswer.current,
        within_bucket_s: immediateBucket(since),
      });
    }
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [analytics, placement]);

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
      // 보상을 받고 하던 일을 이어갔다. 위 이탈 신호와 짝이 되는 값이다
      watchedAt.current = Date.now();
      watchedAnswer.current = answerId;
      analytics.log('post_ad_continue', { placement, answer_id: answerId });
      return true;
    },
    [analytics, bridge, placement, supported],
  );

  return { supported, ready, showing, show };
}
