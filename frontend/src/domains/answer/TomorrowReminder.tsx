/**
 * 「지금 할 수 있는 것」 아래 한 줄.
 *
 * ── 무엇이 바뀌었나 ──────────────────────────────────────────────────────
 *
 * 전에는 「오늘 이것만 해볼게요」였다. 누르면 화면이 「좋아요」 하고 끝났다. 눌렀다는
 * 사실만 로그에 남을 뿐 **그 뒤로 아무 일도 일어나지 않아서**, 실제로 해 봤는지는
 * 아무도 묻지 않았다. 그리고 회고 카드는 누르지도 않은 사람에게 매일 홈에서 물었다.
 *
 * 지금은 둘을 이어 붙였다. 여기서 누른 사람에게만 다음 날 한 번 묻는다.
 * 안 누르면 홈에는 아무것도 뜨지 않는다.
 *
 * 알림 동의는 여기서 함께 받는다. 동의가 안 되는 기기에서도 남겨는 둔다. 알림이 없으면
 * 다음에 앱을 열 때 묻게 되는데, 아무것도 안 하는 것보다 낫다. 대신 화면에 뭐라고 적을지를
 * 그 결과로 가른다. 오지도 않을 알림을 온다고 말하지 않는다.
 */

import { useEffect, useRef, useState } from 'react';

import { useBridge } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { writeNotify, notifyTemplateCode } from '../../shared/prefs/notify';
import { writeRecall } from '../../shared/prefs/recall';
import { TEST_IDS, testId } from '../../shared/testIds';

/** 눌렀을 때 그 자리에 남는 말. 알림이 실제로 갈 수 있는지에 따라 가른다 */
const DONE_WITH_PUSH = '내일 이 시간에 여쭤볼게요';
const DONE_WITHOUT_PUSH = '내일 앱을 열면 여쭤볼게요';

/** 오늘 날짜 (사용자 시간대). 진입 카드·사용량과 같은 기준이다 */
function todayISO(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export interface TomorrowReminderProps {
  answerId: string;
  /** 오늘 적어 드린 행동 하나의 제목. 내일 이 제목으로 묻는다 */
  actionTitle: string;
}

export function TomorrowReminder({ answerId, actionTitle }: TomorrowReminderProps) {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [note, setNote] = useState(DONE_WITHOUT_PUSH);
  const seen = useRef('');

  useEffect(() => {
    if (seen.current === answerId) return;
    seen.current = answerId;
    analytics.log('tomorrow_ask_view', { answer_id: answerId }, { kind: 'impression' });
  }, [analytics, answerId]);

  async function accept(): Promise<void> {
    if (state !== 'idle') return;
    setState('busy');

    let notify: 'granted' | 'denied' | 'unsupported' = 'unsupported';
    if (bridge.supports('notification')) {
      try {
        const result = await bridge.requestNotificationAgreement(notifyTemplateCode());
        notify = result === 'agreementRejected' ? 'denied' : 'granted';
      } catch {
        // 낡은 앱 버전이거나 템플릿이 없다. 사람에게는 알리지 않고 조용히 접는다
        notify = 'unsupported';
      }
      writeNotify(notify === 'granted' ? 'on' : notify === 'denied' ? 'declined' : 'unsupported');
    }

    // 알림이 안 되어도 남긴다. 다음에 열 때 묻는 길이 남는다
    await writeRecall(bridge.storage, {
      answerId,
      date: todayISO(),
      firstActionTitle: actionTitle,
    });

    analytics.log('tomorrow_ask_accept', { answer_id: answerId, notify }, { kind: 'click' });
    setNote(notify === 'granted' ? DONE_WITH_PUSH : DONE_WITHOUT_PUSH);
    setState('done');
  }

  if (state === 'done') return <p className="p-micro">{note}</p>;

  return (
    <button
      type="button"
      className="act-commit-btn"
      disabled={state === 'busy'}
      onClick={() => void accept()}
      {...testId(TEST_IDS.tomorrowAsk)}
    >
      {state === 'busy' ? '맞춰 두는 중이에요' : '내일 했는지 물어봐 주세요'}
    </button>
  );
}
