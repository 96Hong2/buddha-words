/**
 * 답변을 받은 뒤 화면 위로 올라오는 권유 한 장.
 *
 * ── 왜 화면 위인가 ───────────────────────────────────────────────────────
 *
 * 처음에는 답변 맨 아래 문서 흐름 안에 카드로 두었다. 읽기를 가리지 않는 대신 **스크롤을
 * 끝까지 내린 사람만 만났다.** 실기기에서 「너무 아래에 있다」는 말이 나왔고, 실제로 답변은
 * 2,000자가 넘어 거기까지 내려오는 사람이 많지 않다.
 *
 * 그래서 화면에 붙여 띄운다. 대신 **덮개(dim)를 쓰지 않는다.** 뒤 본문은 그대로 읽히고
 * 스크롤도 막지 않는다. 자리는 공유·간직 바 위다. 답을 받으러 온 사람이 하려던 일을
 * 가리지 않으면서, 스크롤 위치와 상관없이 한 번은 보이게 하는 선이 여기다.
 *
 * ── 왜 하나만 뜨나 ───────────────────────────────────────────────────────
 *
 * 홈 추가 · 앱 알리기 · 알림은 셋 다 사용자가 부탁하지 않은 말이다. 한 화면에 둘이 겹치면
 * 답변이 아니라 부탁이 화면의 주인이 된다. 몇 번째 답에서 무엇을 말할지는
 * `shared/prefs/milestones` 의 시간표 한 곳이 정하고, 이 컴포넌트는 받은 하나만 그린다.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useAnalytics } from '../../shared/analytics';
import {
  markAppShareDone,
  markHomeAddDone,
  markHomeAddShown,
  markNotifyDone,
  type Nudge,
} from '../../shared/prefs/milestones';
import { readNotify, writeNotify } from '../../shared/prefs/notify';
import { TEST_IDS, testId } from '../../shared/testIds';

import './growth.css';

/**
 * 앱을 권할 때 나가는 글.
 *
 * 앱 이름과 무엇을 해 주는지, 그리고 주소. 고민도 답도 여기에 없다. 이건 그 사람의
 * 이야기를 나누는 자리가 아니라 앱을 알리는 자리다.
 */
export function appShareMessage(url: string): string {
  return ['마음에 걸리는 일을 적으면 경전에서 답을 찾아 줘요', '', '부처의 말', url].join('\n');
}

export interface NudgeOverlayProps {
  /** 무엇을 권할까. 고르는 일은 milestones 시간표가 한다 */
  nudge: Nudge;
  /** 지금까지 받은 답의 수. 로그에 싣는다 */
  answersTotal: number;
  /** 앱 첫 화면으로 가는 주소. 앱 알리기에만 쓴다 */
  appUrl: string;
  /** 네이티브 공유 시트를 연다. 주지 않으면 주소를 복사한다 */
  onSendMessage?: (message: string) => Promise<'sent' | 'dismissed' | 'unsupported'>;
  /** 알림 동의를 묻는다. 이 기기에서 못 쓰면 null 을 준다 */
  onAskNotify?: () => Promise<'granted' | 'denied' | 'unsupported'>;
  /** 닫혔다. 화면에서 치우는 일은 부르는 쪽이 한다 */
  onDone: () => void;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function NudgeOverlay({
  nudge,
  answersTotal,
  appUrl,
  onSendMessage,
  onAskNotify,
  onDone,
}: NudgeOverlayProps) {
  const analytics = useAnalytics();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /**
   * 띄운 순간 「했다」로 적는다.
   *
   * 거절도 대답이다. 닫았다고 다시 묻지 않는다. 홈 추가만 두 번인데, 그 두 번째는
   * 시간표가 정하는 것이라 여기서는 「몇 번 띄웠나」만 센다.
   *
   * **한 번만 돈다.** StrictMode 는 개발에서 효과를 두 번 돌리는데, 그대로 두면 한 번
   * 띄우고 두 번 센 것이 되어 네 번째 자리의 홈 추가가 통째로 사라진다. 노출 로그도 두 번 찍힌다.
   */
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;

    if (nudge === 'home_add') {
      analytics.log(
        'home_add_view',
        { from: 'nudge', answers_total: answersTotal },
        { kind: 'impression' },
      );
      markHomeAddShown();
      return;
    }
    if (nudge === 'app_share') {
      analytics.log('app_share_view', { answers_total: answersTotal }, { kind: 'impression' });
      markAppShareDone();
      return;
    }
    analytics.log(
      'notification_prompt_view',
      { surface: 'nudge_card' },
      { kind: 'impression' },
    );
    markNotifyDone();
  }, [analytics, answersTotal, nudge]);

  useEffect(() => {
    if (toast == null) return;
    const timer = setTimeout(() => {
      setToast(null);
      onDone();
    }, 1800);
    return () => clearTimeout(timer);
  }, [toast, onDone]);

  function close(how: 'close' | 'later' | 'already'): void {
    if (nudge === 'home_add') {
      analytics.log('home_add_dismiss', { how }, { kind: 'click' });
      // 「이미 추가했어요」를 누른 사람에게는 네 번째 자리에서도 다시 묻지 않는다
      if (how === 'already') markHomeAddDone();
    } else if (nudge === 'notify') {
      analytics.log('notification_prompt_decline', { surface: 'nudge_card' }, { kind: 'click' });
    }
    onDone();
  }

  async function share(): Promise<void> {
    if (busy) return;
    const message = appShareMessage(appUrl);

    if (onSendMessage != null) {
      setBusy(true);
      let result: 'sent' | 'dismissed' | 'unsupported';
      try {
        result = await onSendMessage(message);
      } catch {
        result = 'unsupported';
      }
      setBusy(false);
      if (result === 'sent') {
        analytics.log('app_share_complete', { method: 'system' });
        onDone();
        return;
      }
      // 스스로 닫은 것은 실패가 아니다. 카드를 그대로 두고 아무 말도 하지 않는다
      if (result === 'dismissed') return;
    }

    try {
      await navigator.clipboard.writeText(message);
      analytics.log('app_share_complete', { method: 'copy' });
      setToast('링크가 복사됐어요');
    } catch {
      setToast('지금은 보내지 못했어요');
    }
  }

  async function askNotify(): Promise<void> {
    if (busy || onAskNotify == null) return;
    setBusy(true);
    analytics.log('notification_prompt_accept', { surface: 'nudge_card' }, { kind: 'click' });
    let result: 'granted' | 'denied' | 'unsupported';
    try {
      result = await onAskNotify();
    } catch {
      result = 'unsupported';
    }
    setBusy(false);
    analytics.log('notification_permission', { result });
    writeNotify(result === 'granted' ? 'on' : result === 'denied' ? 'declined' : 'unsupported');
    if (result === 'granted') {
      setToast('내일 이 시간에 알려드릴게요');
      return;
    }
    onDone();
  }

  const body = (() => {
    if (nudge === 'home_add') {
      return {
        testId: TEST_IDS.homeAdd,
        title: '토스 홈에 두고 바로 열 수 있어요',
        how: (
          <>
            화면 맨 위{' '}
            <span className="gr-dots" aria-label="더보기">
              <i />
              <i />
              <i />
            </span>{' '}
            를 누르고 <b>홈 화면에 추가하기</b>
          </>
        ),
        cta: null,
        later: { label: '이미 추가했어요', how: 'already' as const },
      };
    }
    if (nudge === 'app_share') {
      return {
        testId: TEST_IDS.appShare,
        title: '비슷한 마음인 사람이 떠오르나요?',
        how: <>앱만 건네줄 수 있어요. 지금까지 나눈 이야기는 함께 가지 않아요.</>,
        cta: {
          label: busy ? '여는 중이에요' : '친구에게 앱 알려주기',
          testId: TEST_IDS.appShareSend,
          run: share,
        },
        later: { label: '다음에 할게요', how: 'later' as const },
      };
    }
    return {
      testId: TEST_IDS.notifyNudge,
      title: '매일 하루를 돌아봐요',
      how: <>하루 한 번, 마음을 들여다볼 시간을 알려드려요. 언제든 설정에서 끌 수 있어요.</>,
      cta: {
        label: busy ? '여는 중이에요' : '알림 받을게요',
        testId: TEST_IDS.notifyNudgeAccept,
        run: askNotify,
      },
      later: { label: '괜찮아요', how: 'later' as const },
    };
  })();

  return createPortal(
    <>
      <div className="gr-nudge" role="region" aria-label="안내" {...testId(body.testId)}>
        <div className="gr-card__top">
          <p className="gr-card__title">{body.title}</p>
          <button
            type="button"
            className="gr-card__x"
            aria-label="닫기"
            onClick={() => close('close')}
            {...testId(TEST_IDS.nudgeClose)}
          >
            <CloseIcon />
          </button>
        </div>

        <p className="gr-card__how">{body.how}</p>

        {body.cta != null && (
          <button
            type="button"
            className="gr-card__cta"
            disabled={busy}
            onClick={() => void body.cta.run()}
            {...testId(body.cta.testId)}
          >
            {body.cta.label}
          </button>
        )}

        <button
          type="button"
          className="gr-card__later"
          onClick={() => close(body.later.how)}
        >
          {body.later.label}
        </button>
      </div>

      {toast != null ? (
        <div className="gr-toast" role="status">
          {toast}
        </div>
      ) : null}
    </>,
    document.body,
  );
}

/** 알림을 이미 받기로 한 사람에게는 그 권유를 띄우지 않는다 */
export function notifyAlreadySettled(): boolean {
  const state = readNotify();
  return state === 'on' || state === 'unsupported';
}
