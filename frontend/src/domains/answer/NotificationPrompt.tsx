/**
 * 「내일 마음을 다시 돌아볼까요?」 한 줄.
 *
 * **첫 실행에 권한을 묻지 않는다.** 답을 한 번 받아 본 사람에게만, 답변 맨 아래에서,
 * 누를지 말지를 사람이 정하게 둔다. 진입하자마자 뜨는 동의 시트는 플랫폼이 다크패턴으로 본다.
 *
 * 누르지 않으면 OS 권한 창은 뜨지도 않는다. 그래서 「보여 준 것」과 「누른 것」과
 * 「허용된 것」 셋을 따로 센다. 어디서 빠지는지 그 셋으로만 알 수 있다.
 *
 * 기본은 꺼져 있다. 콘솔 스마트발송 템플릿 코드가 없으면 실기기에서 동의 화면이 뜨지 않아,
 * 켜 두면 눌러도 아무 일이 없는 버튼이 된다.
 */

import { useEffect, useState } from 'react';

import { useBridge } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { FLAGS } from '../../shared/flags';

/** 콘솔 스마트발송 템플릿 코드. 빌드할 때 준다 */
function templateCode(): string {
  const raw = import.meta.env.VITE_NOTIFICATION_TEMPLATE_CODE;
  return typeof raw === 'string' ? raw.trim() : '';
}

const SURFACE = 'answer_end';

export function NotificationPrompt() {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');

  const usable = FLAGS.notificationPrompt && bridge.supports('notification');

  useEffect(() => {
    if (!usable) return;
    analytics.log(
      'notification_prompt_view',
      { surface: SURFACE },
      { kind: 'impression', once: `notif_prompt:${SURFACE}` },
    );
  }, [analytics, usable]);

  if (!usable || state === 'done') return null;

  async function accept() {
    setState('busy');
    analytics.log('notification_prompt_accept', { surface: SURFACE }, { kind: 'click' });
    try {
      const result = await bridge.requestNotificationAgreement(templateCode());
      // SDK 가 주는 값 셋을 그대로 옮기지 않는다. 우리가 묻는 것은 「켜졌나」 하나다
      analytics.log('notification_permission', {
        result: result === 'agreementRejected' ? 'denied' : 'granted',
      });
    } catch {
      // 낡은 앱 버전이거나 템플릿이 없다. 사람에게는 알리지 않고 조용히 접는다
      analytics.log('notification_permission', { result: 'unsupported' });
    }
    setState('done');
  }

  function decline() {
    analytics.log('notification_prompt_decline', { surface: SURFACE }, { kind: 'click' });
    setState('done');
  }

  return (
    <div className="notif-prompt">
      <p>내일 마음을 다시 돌아볼까요?</p>
      <div className="notif-row">
        <button type="button" className="notif-yes" disabled={state === 'busy'} onClick={accept}>
          알림 받을게요
        </button>
        <button type="button" className="notif-no" onClick={decline}>
          괜찮아요
        </button>
      </div>
    </div>
  );
}
