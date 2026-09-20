/**
 * 「지금 할 수 있는 것」 아래 한 줄.
 *
 * ── 무엇을 하는 버튼인가 ────────────────────────────────────────────────
 *
 * 누르면 **내일 알림 한 통**을 예약한다. 「어제 이야기드린 그거, 해 보셨나요?」가 앱 밖에서
 * 온다. 앱 안에서 묻는 것이 아니다. 앱을 열어야 묻는 구조는 이미 온 사람에게만 닿아서,
 * 돌아오게 만드는 힘이 없다.
 *
 * 예약은 **서버에 남긴다.** 알림은 앱이 꺼져 있을 때 가야 하고, 그러려면 보낼 시각에
 * 서버가 대상을 알고 있어야 한다. 담기는 것은 익명키 · 보낼 시각 · 행동 제목 셋뿐이다.
 * 고민 원문과 답변 본문은 올라가지 않는다.
 *
 * 기기에도 한 줄 남긴다(`writeRecall`). 알림을 누르고 들어온 사람에게 무엇을 물을지
 * 화면이 알아야 하고, 알림이 못 가는 기기에서는 이것이 유일한 길이 된다.
 *
 * ── 지킬 수 있는 말만 적는다 ────────────────────────────────────────────
 *
 * 알림을 실제로 보내려면 콘솔 기능성 캠페인과 문구 검수 승인, 서버 mTLS 인증서가 있어야
 * 한다. 셋이 갖춰지기 전에는 **알림을 약속하지 않는다.** 예전에 「내일 이 시간에
 * 여쭤볼게요」라고 적어 두고 아무것도 보내지 않은 적이 있다. 화면이 지킬 수 없는 말을 하면
 * 그 다음부터 화면이 하는 모든 말이 값을 잃는다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useBridge } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { useApiClient } from '../../shared/api';
import { FLAGS } from '../../shared/flags';
import { writeNotify, notifyTemplateCode, notifyUsable } from '../../shared/prefs/notify';
import { readNotifyHour } from '../../shared/prefs/notifyTime';
import { writeRecall } from '../../shared/prefs/recall';
import { TEST_IDS, testId } from '../../shared/testIds';

/** 오늘 날짜 (사용자 시간대). 진입 카드·사용량과 같은 기준이다 */
function todayISO(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** '오후 9시'. 설정에서 고른 시각을 사람이 읽는 말로 */
export function hourLabel(hour: number): string {
  if (hour === 12) return '낮 12시';
  return hour < 12 ? `오전 ${hour}시` : `오후 ${hour - 12}시`;
}

/**
 * 내일 그 시각의 절대 시각(epoch 초).
 *
 * **기기가 계산한다.** 사람이 고른 시각과 기기 시간대를 아는 쪽이 여기다. 서버가 시간대를
 * 다시 계산하면 기기와 어긋난 시각에 알림이 가고, 그 어긋남은 사람이 알아채기 어렵다.
 */
export function tomorrowAt(hour: number, now: Date = new Date()): number {
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, 0, 0, 0);
  return Math.floor(due.getTime() / 1000);
}

export interface TomorrowReminderProps {
  answerId: string;
  /** 오늘 적어 드린 행동 하나의 제목. 내일 이 제목으로 묻는다 */
  actionTitle: string;
  /** 어느 화면에서 눌렀나. 답변인지 보관함인지 로그로 가른다 */
  surface?: 'answer' | 'archive';
}

export function TomorrowReminder({
  answerId,
  actionTitle,
  surface = 'answer',
}: TomorrowReminderProps) {
  const bridge = useBridge();
  const api = useApiClient();
  const analytics = useAnalytics();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const seen = useRef('');

  const hour = readNotifyHour();

  /**
   * 알림을 약속해도 되나.
   *
   * 플래그 하나로 가른다. 콘솔 캠페인 · 문구 검수 · mTLS 인증서가 다 갖춰진 빌드에서만 켠다.
   * 꺼져 있으면 예약은 그대로 하되 **화면은 알림을 말하지 않는다.** 나중에 켜면 같은 예약이
   * 그대로 알림으로 나간다.
   */
  const promisesPush = FLAGS.reminderPush && notifyUsable(bridge.supports('notification'));

  useEffect(() => {
    if (seen.current === answerId) return;
    seen.current = answerId;
    analytics.log('tomorrow_ask_view', { answer_id: answerId, surface }, { kind: 'impression' });
  }, [analytics, answerId, surface]);

  const accept = useCallback(async (): Promise<void> => {
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

    // 알림을 누르고 들어온 사람에게 무엇을 물을지 화면이 알아야 한다
    await writeRecall(bridge.storage, {
      answerId,
      date: todayISO(),
      firstActionTitle: actionTitle,
    });

    /*
      서버 예약은 **동의를 받은 사람만** 한다.

      공식 문서: 「기능성 메시지를 발송하려면, 사용자에게 미리 그 목적으로 발송하겠다는
      알림 동의를 받아야 해요.」 거절(`denied`)은 물론이고 **못 물은 경우(`unsupported`)도
      동의가 아니다.** 동의 화면이 뜨지 않는 기기(구버전 토스 · 템플릿 코드 없음)에서
      예약을 올리면, 한 번도 동의한 적 없는 사람에게 알림이 나간다.

      올리지 않아도 기기 쪽 한 줄은 남아 있어서 다음에 열면 묻는 길이 산다.
    */
    let reserved = false;
    if (notify === 'granted') {
      try {
        await api.reserveReminder({ dueAt: tomorrowAt(hour), actionTitle });
        reserved = true;
      } catch {
        // 알림 하나 때문에 답변 화면을 멈추지 않는다
      }
    }

    analytics.log(
      'tomorrow_ask_accept',
      { answer_id: answerId, notify, reserved, hour, surface },
      { kind: 'click' },
    );
    setState('done');
  }, [actionTitle, analytics, answerId, api, bridge, hour, state, surface]);

  if (state === 'done') {
    return (
      <p className="p-micro" {...testId(TEST_IDS.tomorrowAskDone)}>
        {promisesPush
          ? `내일 ${hourLabel(hour)}에 알림으로 여쭤볼게요`
          : '다음에 앱을 열면 여쭤볼게요'}
      </p>
    );
  }

  return (
    <div className="act-commit__ask">
      <button
        type="button"
        className="act-commit-btn"
        disabled={state === 'busy'}
        onClick={() => void accept()}
        {...testId(TEST_IDS.tomorrowAsk)}
      >
        {state === 'busy'
          ? '준비하고 있어요'
          : promisesPush
            ? '잊지 않게 내일 알려주세요'
            : '내일 했는지 여쭤봐 주세요'}
      </button>
      <p className="act-commit__why">
        {promisesPush
          ? `까먹지 않게 내일 ${hourLabel(hour)}에 딱 한 번 알림을 보내 드려요`
          : '딱 한 번만 여쭤봐요. 해냈는지 스스로 확인하는 자리예요'}
      </p>
    </div>
  );
}
