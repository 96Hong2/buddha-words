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

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useBridge, useOverlayBackClose } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { markHomeAddDone, type Nudge } from '../../shared/prefs/milestones';
import { readNotify, writeNotify } from '../../shared/prefs/notify';
import { TEST_IDS, testId } from '../../shared/testIds';

import { appShareMessage, appShareUrl } from '../share/shareText';

import './growth.css';

export interface NudgeOverlayProps {
  /** 무엇을 권할까. 고르는 일은 milestones 시간표가 한다 */
  nudge: Nudge;
  /** 지금까지 받은 답의 수. 로그에 싣는다 */
  answersTotal: number;
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
  onSendMessage,
  onAskNotify,
  onDone,
}: NudgeOverlayProps) {
  const analytics = useAnalytics();
  const bridge = useBridge();
  const [busy, setBusy] = useState(false);
  /** 뜨는 말 한 줄. `close` 가 false 면 카드를 그대로 둔다 */
  const [toast, setToast] = useState<{ text: string; close: boolean } | null>(null);

  // 다른 오버레이 아홉과 같은 자리다. 뒤로가기로도 닫힌다
  useOverlayBackClose(true, () => close('close'));

  /**
   * 봤다는 사실만 남긴다. **「띄웠다」로 세는 일은 여기서 하지 않는다.**
   *
   * 이 카드는 공유 시트·간직 시트가 열릴 때 언마운트되고 시트를 닫으면 다시 마운트된다.
   * 여기서 세면 한 번 띄운 것이 둘로 세어져 네 번째 자리의 홈 추가가 통째로 사라진다.
   * 세는 자리는 띄우기로 정한 곳(AnswerRoute)이다. 로그도 같은 이유로 `once` 를 건다.
   */
  useEffect(() => {
    const key = `nudge:${nudge}:${answersTotal}`;
    if (nudge === 'home_add') {
      analytics.log(
        'home_add_view',
        { from: 'nudge', answers_total: answersTotal },
        { kind: 'impression', once: key },
      );
      return;
    }
    if (nudge === 'app_share') {
      analytics.log(
        'app_share_view',
        { answers_total: answersTotal },
        { kind: 'impression', once: key },
      );
      return;
    }
    analytics.log(
      'notification_prompt_view',
      { surface: 'nudge_card' },
      { kind: 'impression', once: key },
    );
  }, [analytics, answersTotal, nudge]);

  useEffect(() => {
    if (toast == null) return;
    const shouldClose = toast.close;
    const timer = setTimeout(() => {
      setToast(null);
      if (shouldClose) onDone();
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
    } else {
      // 보고 그냥 닫은 사람이 분석에서 사라지지 않게 한다
      analytics.log('app_share_dismiss', { how }, { kind: 'click' });
    }
    onDone();
  }

  async function share(): Promise<void> {
    if (busy) return;
    const message = appShareMessage(await appShareUrl(bridge));

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
      setToast({ text: '친구에게 보낼 글을 복사했어요', close: true });
    } catch {
      // 거절과 실패는 다르다. 기술적으로 못 보낸 사람의 기회를 빼앗지 않는다
      setToast({ text: '지금은 보내지 못했어요. 다시 눌러 주세요', close: false });
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
      setToast({ text: '알림을 받기로 했어요', close: true });
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
        title: '요즘 비슷한 마음일 것 같은 사람이 있나요?',
        how: <>앱만 건네줄 수 있어요. 적으신 이야기는 전해지지 않아요.</>,
        cta: {
          label: busy ? '보내는 중이에요' : '친구에게 앱 알려주기',
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
        label: busy ? '묻는 중이에요' : '알림 받을게요',
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
          {toast.text}
        </div>
      ) : null}
    </>,
    document.body,
  );
}

/**
 * 알림을 이미 받기로 했거나 못 쓰는 사람인가.
 *
 * 설정 화면에서 먼저 켠 사람에게 세 번째 답에서 같은 부탁을 또 하지 않는다.
 * 권유는 한 사람에게 한 번뿐이라, 이미 답한 사람에게 쓰면 그 한 번이 없어진다.
 */
export function notifyAlreadySettled(): boolean {
  const state = readNotify();
  return state === 'on' || state === 'unsupported';
}
