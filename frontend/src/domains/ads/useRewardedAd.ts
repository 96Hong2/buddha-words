/**
 * 전면을 덮는 광고 한 번. 종류는 자리가 정한다(`AD_KIND`). 이어가기만 전면형이고 나머지는 보상형이다.
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
import { elapsedBucket, immediateBucket, useAnalytics } from '../../shared/analytics';
import { readAdOptOut } from '../../shared/lib/adOptOut';
import type { FullScreenAdHooks } from '../../shared/toss';

import { AD_KIND, adGroupId, type AdPlacement } from './placement';

/**
 * 지금 전면 광고가 화면을 덮고 있나.
 *
 * 훅 하나에 매인 값이 아니라 앱 전체에 하나다. 광고를 **다른 화면에서 틀어 놓고** 넘어오는
 * 길이 있기 때문이다(이어가기 시트가 광고를 틀고 대기 화면으로 보낸다). 전면 광고가 뜨면
 * WebView 가 숨겨지는데, 그것을 「앱을 떠났다」로 세면 이탈 지표가 통째로 망가진다.
 */
let covering = 0;

export function adIsCovering(): boolean {
  return covering > 0;
}

/**
 * 광고를 끝까지 본 뒤 곧바로 앱을 떠났나.
 *
 * **수익만 보면 안 되는 자리다.** 광고가 가장 많이 도는 위치가 사람이 가장 많이 나가는
 * 위치이기도 하면, 그 자리는 옮겨야 한다. 그 판단에 필요한 유일한 신호가 이것이다.
 *
 * 듣는 자리가 화면 밖에 있다. 이어가기 광고는 **다 돌기 전에 화면이 넘어가서**, 광고를 띄운
 * 컴포넌트에 리스너를 두면 광고가 끝나기도 전에 리스너가 사라진다. 그러면 그 자리의 이탈
 * 지표가 영원히 0으로 읽힌다.
 */
let watchedAt = 0;
let watchedPlacement: AdPlacement | null = null;
let watchedAnswer: string | undefined;
let listening = false;

function markWatched(placement: AdPlacement, answerId: string | undefined): void {
  watchedAt = Date.now();
  watchedPlacement = placement;
  watchedAnswer = answerId;
}

/** 이탈을 듣기 시작한다. 훅이 처음 붙을 때 한 번이면 된다 */
function listenForExit(log: (since: number, placement: AdPlacement, answerId?: string) => void) {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (watchedAt === 0 || watchedPlacement === null) return;
    const since = Date.now() - watchedAt;
    // 한참 뒤에 닫은 것은 광고와 무관하다
    if (since > 60_000) return;
    const placement = watchedPlacement;
    const answerId = watchedAnswer;
    watchedAt = 0;
    log(since, placement, answerId);
  });
}

/**
 * 광고를 부른 결과.
 *
 * `noFill` 은 **우리 쪽 사정**이다. 사람은 누르기까지 했는데 광고가 오지 않았다.
 * 그때까지 하던 일을 막으면 광고를 못 받는 기기에서 기능이 통째로 막힌다.
 * `dismissed` 는 사람이 보기 싫다고 닫은 것이라 뜻이 정반대다.
 */
export type AdOutcome = 'watched' | 'dismissed' | 'noFill';

export interface RewardedAd {
  /** 이 기기에서 이 자리 광고를 띄울 수 있나 */
  supported: boolean;
  /** 지원 여부 판정이 끝났나 */
  ready: boolean;
  /** 광고가 떠 있는 동안 true. 버튼을 두 번 누르는 것을 막는다 */
  showing: boolean;
  /**
   * 보상은 `watched` 하나뿐이다. 전면형은 보상이 없어 `dismissed` 로 끝난다.
   * `onShown` 은 광고가 실제로 화면에 뜬 순간이다. 누른 순간과 다르다.
   */
  show(answerId?: string, hooks?: FullScreenAdHooks): Promise<AdOutcome>;
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

  // 이탈 리스너는 앱 전체에 하나다. 광고를 띄운 화면이 사라진 뒤에도 살아 있어야 한다
  useEffect(() => {
    listenForExit((since, exitPlacement, answerId) => {
      analytics.log('post_ad_exit', {
        placement: exitPlacement,
        answer_id: answerId,
        within_bucket_s: immediateBucket(since),
      });
    });
  }, [analytics]);

  /**
   * 띄울 수 있는 상태가 됐다. 제안을 **본 것**(deep_extension_view · second_question_start)보다 앞이다.
   * 둘을 갈라야 「자격은 됐는데 제안이 안 보였다」와 「보고도 안 눌렀다」가 구분된다.
   */
  useEffect(() => {
    if (!ready || !supported) return;
    analytics.log(
      'ad_eligible',
      { placement, answer_id: undefined },
      { once: `ad_eligible:${placement}` },
    );
  }, [analytics, placement, ready, supported]);

  const show = useCallback(
    async (answerId?: string, hooks?: FullScreenAdHooks): Promise<AdOutcome> => {
      if (!supported) {
        analytics.log('rewarded_ad_fail', { placement, reason: 'unsupported' });
        return 'noFill';
      }

      // 위에서 걸렀지만 한 번 더 본다. 지어낸 id 로 광고를 부르지 않는다
      const group = adGroupId(placement);
      if (group === null) {
        analytics.log('rewarded_ad_fail', { placement, reason: 'no_group' });
        return 'noFill';
      }

      analytics.log('rewarded_ad_start', { placement, answer_id: answerId }, { kind: 'click' });
      setShowing(true);
      covering += 1;
      let outcome: AdOutcome = 'noFill';
      let shownAt = 0;
      try {
        outcome = await bridge.ads.showFullScreen(group, {
          onShown: () => {
            shownAt = Date.now();
            hooks?.onShown?.();
          },
        });
      } catch {
        // 브릿지가 던져도 여기서 끝낸다. 부르는 쪽이 광고 하나 때문에 멈추면 안 된다
        outcome = 'noFill';
      } finally {
        covering -= 1;
        setShowing(false);
      }

      /*
        광고가 실제로 몇 초 떠 있었나. 불러오는 시간은 빼고 뜬 순간부터 잰다.
        보상형은 보상을 받은 순간까지(끝까지 본 길이), 전면형은 사람이 닫은 순간까지다.
        전면형 쪽은 광고 길이가 아니라 사람이 얼마나 참았는지에 가깝다.
      */
      if (outcome !== 'noFill' && shownAt > 0) {
        analytics.log('ad_close', {
          placement,
          shown_bucket_ms: elapsedBucket(Date.now() - shownAt),
        });
      }

      /*
        전면형은 보상이 없어서 언제나 닫힘으로 끝난다. 그것이 정상 종료다. 실패로 세면
        이어가기 광고가 전부 실패로 읽힌다. 전면형 자리는 광고와 무관하게 하던 일을 잇는다.
      */
      if (AD_KIND[placement] === 'interstitial' && outcome === 'dismissed') {
        markWatched(placement, answerId);
        return 'dismissed';
      }

      if (outcome !== 'watched') {
        // 사람이 닫은 것과 광고가 안 온 것을 가른다. 대책이 서로 다르다
        analytics.log('rewarded_ad_fail', {
          placement,
          reason: outcome === 'dismissed' ? 'dismissed' : 'no_fill',
        });
        return outcome;
      }

      analytics.log('rewarded_ad_complete', {
        placement,
        answer_id: answerId,
        reward_granted: true,
      });
      // 보상을 받고 하던 일을 이어갔다. 아래 이탈 신호와 짝이 되는 값이다
      markWatched(placement, answerId);
      analytics.log('post_ad_continue', { placement, answer_id: answerId });
      return 'watched';
    },
    [analytics, bridge, placement, supported],
  );

  return { supported, ready, showing, show };
}
