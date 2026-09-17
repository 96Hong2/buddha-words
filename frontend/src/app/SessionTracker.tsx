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

import { useAnalytics } from '../shared/analytics';
import { recordVisit } from '../shared/lib/visitLog';

import { useBridge } from './providers';
import { ROUTES } from './router';

/** 어디로 들어왔나. 값은 `spec/events.ts` 의 app_open.entry 가 정한다 */
function entryOf(path: string): string {
  if (path.startsWith('/s/')) return 'share_link';
  if (path === ROUTES.home) return 'home';
  if (path === ROUTES.archive) return 'archive';
  return 'other';
}

export function SessionTracker() {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;

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
