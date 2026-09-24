/**
 * 앱을 연 사실과 세션 경계를 긋는다. 화면을 그리지 않는다.
 *
 * **어느 화면으로 들어오든 여기가 먼저 돈다.** 예전에는 홈이 `app_open` 을 찍었는데,
 * 그러면 공유 링크나 보관함으로 바로 들어온 사람은 앱을 연 것으로 세어지지 않았다.
 * 모든 깔때기의 분모가 그만큼 작아지고, 공유로 들어온 사람이 분모에서 빠져
 * K-factor 가 실제보다 커 보인다.
 *
 * 세션 30분 규칙은 `Analytics` 안에 있다. 여기는 브라우저 신호를 그쪽으로 옮기기만 한다.
 *
 * **나가는 길을 붙잡지 않는다.** `beforeunload` 로 동기 요청을 보내지 않는다.
 * 앱이 느리게 닫히는 대가가 세션 하나 놓치는 것보다 크다.
 */

import { useEffect, useRef } from 'react';

import { useWelcomeLeaf } from '../domains/leaf';
import { useAnalytics } from '../shared/analytics';
import { takeStuckAd } from '../shared/lib/stuckAd';
import { recordVisit } from '../shared/lib/visitLog';

import { useBridge } from './providers';
import { ROUTES } from './router';

/** 어디로 들어왔나. 값은 `spec/events.ts` 의 app_open.entry 가 정한다 */
function entryOf(path: string): string {
  if (path.startsWith('/s/')) return 'share_link';
  if (path === ROUTES.home) return 'home';
  if (path === ROUTES.archive) return 'archive';
  if (path === ROUTES.today) return 'today';
  return 'other';
}

export function SessionTracker() {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const opened = useRef(false);

  /*
    첫 연꽃 한 장. **여기서 준다.**

    홈에서 주면 공유 링크나 보관함으로 바로 들어온 사람이 빈손으로 시작한다. 그 사람이
    처음 만나는 광고 문이 「연꽃이 없어서」 서는 것이면, 있지도 않은 것을 잃은 셈이 된다.
    두 번째 이상 여는 사람에게는 아무 일도 일어나지 않는다(저장소가 막는다).
  */
  useWelcomeLeaf();

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;

    /*
      지난번에 광고가 뜬 채로 앱이 끝났나. **그 판은 살아 있는 동안 로그를 못 남긴다.**
      광고가 멈춰 닫기도 안 먹으면 사람은 앱을 끄고 나가고, 우리 시간 제한(90초)이
      `show_timeout` 을 찍기 전에 웹뷰가 죽는다. 그래서 여기서 뒤늦게 센다.

      광고를 닫는 길은 우리에게 없다(SDK 에 그 함수가 없다). 이 수는 고치기 위한 것이
      아니라 **얼마나 자주 나는지 알기 위한 것**이고, 콘솔에 신고할 근거이자 광고 자리를
      줄일지 정하는 근거다.
    */
    void takeStuckAd(bridge.storage).then((placement) => {
      if (placement == null) return;
      analytics.log('ad_stuck_exit', { placement });
    });

    const entry = entryOf(window.location.pathname);
    void recordVisit(bridge.storage, Date.now()).then((visit) => {
      analytics.appOpen('app_open', {
        is_first_open: visit.isFirstOpen,
        open_bucket: visit.openBucket,
        entry,
        days_since_first_open: visit.daysSinceFirstOpen,
        days_since_last_open: visit.daysSinceLastOpen,
      });
    });
  }, [analytics, bridge]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') analytics.endSession('background');
      else analytics.resume();
    }

    function onHide() {
      analytics.endSession('background');
    }

    document.addEventListener('visibilitychange', onVisibility);
    // pagehide 는 iOS 웹뷰가 탭을 얼릴 때 visibilitychange 보다 확실히 온다
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    };
  }, [analytics]);

  return null;
}
