/**
 * 답변을 받은 뒤 화면 한가운데 서는 권유 한 장.
 *
 * ── 자리를 두 번 옮겼다 ─────────────────────────────────────────────────
 *
 * 처음에는 답변 맨 아래 문서 흐름 안에 카드로 두었다. 읽기를 가리지 않는 대신 **스크롤을
 * 끝까지 내린 사람만 만났다.** 답변이 2,000자가 넘어 거기까지 내려오는 사람이 많지 않다.
 *
 * 그다음에는 화면 아래에 붙여 띄웠다. 덮개 없이, 공유·간직 바 위에. 하려던 일을 가리지
 * 않으려는 선이었는데 **너무 조용해서 안 읽혔다.** 실기기에서 「애매한 위치에 애매한
 * 크기」라는 말을 들었다(2026-09-21). 화면 아래 3분의 1은 버튼이 늘 서 있는 자리라,
 * 거기 또 하나가 얹히면 그 카드도 버튼 줄의 일부로 읽힌다.
 *
 * 지금은 **화면 한가운데, 덮개 위에** 선다. 부탁은 한 사람에게 한 번뿐이라(시간표가
 * 그렇게 짠다) 그 한 번은 확실히 보이는 편이 맞다. 대신 닫는 길을 셋 둔다: X · 아래
 * 글자 버튼 · 덮개. 그리고 위에 그림을 한 장 얹어 무슨 이야기인지 읽기 전에 알게 한다.
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

/*
  카드 위에 서는 그림 셋.

  사진이나 일러스트를 쓰지 않는다. 번들은 통째로 내려받는 zip 이라 그림 한 장이 첫 접속
  시간을 그만큼 늘린다(최초 접속 20초 초과로 한 번 반려당한 자리다). 선으로 그린 도형은
  글자와 같이 실려 오고 글자 크기를 키운 사람에게도 같이 커진다.

  말투도 앱과 맞춘다: 금색 선 한 겹, 면은 모래빛, 강조 하나. 색은 `currentColor` 를
  따라가므로 감싼 원이 정한다.
*/

/** 홈 타일 위에 앉은 연꽃. 오른쪽 아래에 더하기 표가 붙는다 */
function HomeAddArt() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {/* 토스 홈에 놓이는 타일 한 칸 */}
      <rect x="14" y="12" width="36" height="36" rx="10" stroke="currentColor" strokeWidth="2.2" />
      {/* 그 안의 연꽃. 아이콘과 같은 다섯 장이되 선으로만 */}
      <g stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round">
        <path d="M32 21.5c2.1 2.7 3.1 5 3.1 7.1 0 2-1 3.8-3.1 5.4-2.1-1.6-3.1-3.4-3.1-5.4 0-2.1 1-4.4 3.1-7.1z" />
        <path d="M23.4 24.6c2.5 1 4.2 2.3 5.1 4.1.7 1.5.6 3.2-.3 5-2.5-.7-4.2-1.8-5.1-3.3-1.1-2-1-3.9.3-5.8z" />
        <path d="M40.6 24.6c1.3 1.9 1.4 3.8.3 5.8-.9 1.5-2.6 2.6-5.1 3.3-.9-1.8-1-3.5-.3-5 .9-1.8 2.6-3.1 5.1-4.1z" />
      </g>
      {/* 여기에 더해진다는 표 */}
      <circle cx="47" cy="45" r="9" fill="var(--surface-illust)" stroke="currentColor" strokeWidth="2.2" />
      <path d="M47 41v8M43 45h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** 말풍선 둘. 한쪽에서 다른 쪽으로 건너간다 */
function AppShareArt() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M11 22.5a5 5 0 0 1 5-5h17a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5h-9l-7 5.5v-5.5h-1a5 5 0 0 1-5-5z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M53 33.5a5 5 0 0 0-5-5h-4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M53 33.5v8a5 5 0 0 1-5 5h-3l-6 5v-5h-1"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* 건네는 것은 말 한마디다. 점 셋으로 적는다 */}
      <g fill="currentColor">
        <circle cx="20" cy="27" r="1.9" />
        <circle cx="26.5" cy="27" r="1.9" />
        <circle cx="33" cy="27" r="1.9" />
      </g>
    </svg>
  );
}

/** 종 하나. 아래에 하루가 지나는 선 */
function NotifyArt() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M32 15a11 11 0 0 1 11 11v7.5l3 5.5H18l3-5.5V26a11 11 0 0 1 11-11z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M32 11.5V15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M27.5 43.5a4.5 4.5 0 0 0 9 0"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* 하루 한 번이라는 결. 종 옆으로 지나가는 두 줄 */}
      <path
        d="M49 22.5c1.6 1.8 2.5 4 2.5 6.5M15 22.5A9.6 9.6 0 0 0 12.5 29"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
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
    /*
      주소를 만드는 것도 브릿지를 한 번 다녀오는 일이다. 그 사이에 버튼이 멀쩡해 보이면
      사람이 한 번 더 누르고, 공유 시트가 두 번 열린다. 누른 순간부터 잠근다.
    */
    setBusy(true);
    const message = appShareMessage(await appShareUrl(bridge));

    if (onSendMessage != null) {
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

    setBusy(false);
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
        art: <HomeAddArt />,
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
        art: <AppShareArt />,
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
      art: <NotifyArt />,
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
      {/* 덮개. 누르면 닫힌다. 다른 시트들과 나가는 길을 맞춘다 */}
      <div
        className="gr-scrim"
        onClick={() => close('close')}
        {...testId(TEST_IDS.sheetDim)}
      />
      <div className="gr-nudge-wrap">
        <div
          className="gr-nudge"
          role="dialog"
          aria-modal="true"
          aria-label="안내"
          {...testId(body.testId)}
        >
          <button
            type="button"
            className="gr-card__x"
            aria-label="닫기"
            onClick={() => close('close')}
            {...testId(TEST_IDS.nudgeClose)}
          >
            <CloseIcon />
          </button>

          {/* 읽기 전에 무슨 이야기인지 알게 하는 그림 한 장 */}
          <div className="gr-art" aria-hidden="true">
            {body.art}
          </div>

          <p className="gr-card__title">{body.title}</p>
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
