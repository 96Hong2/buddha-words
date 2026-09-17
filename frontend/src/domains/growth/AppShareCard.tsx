/**
 * 세 번째 답을 받은 뒤 한 번 뜨는 「앱 권하기」.
 *
 * 공유하기(답변 공유)와 다르다. 저쪽은 받은 답을 나누는 것이고 이쪽은 **앱 자체**를
 * 권하는 것이다. 링크도 다르다. 저쪽은 그 답으로 가고 이쪽은 앱 첫 화면으로 간다.
 *
 * ── 왜 시트가 아니라 카드인가 ─────────────────────────────────────────
 *
 * 처음에는 시트로 만들어 답이 도착하는 순간 띄웠다. 그랬더니 **답을 읽으러 온 사람 앞을
 * 덮고 섰다.** 자기가 부탁한 적 없는 화면이 답보다 먼저 뜨는 것이고, e2e 에서도 그 시트가
 * 간직 버튼을 가려 테스트가 멈췄다. 화면이 막힌 것을 기계가 먼저 알려 준 셈이다.
 *
 * 그래서 답변 맨 아래, 마지막 한마디를 지나온 자리에 조용히 둔다. 다 읽은 사람만 만나고
 * 읽는 중에는 아무것도 가리지 않는다.
 *
 * ── 왜 세 번째인가 ───────────────────────────────────────────────────
 *
 * 한 번 써 본 사람은 이 앱이 자기에게 맞는지 아직 모른다. 그 사람에게 남한테 권하라고
 * 하면 권할 말이 없다. 세 번쯤 오면 다시 오는 이유가 생긴 것이다. 매번 물으면 답을 받을
 * 때마다 부탁을 받는 앱이 된다.
 */

import { useEffect, useState } from 'react';

import { useAnalytics } from '../../shared/analytics';
import { markAppShareDone } from '../../shared/prefs/milestones';
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

export interface AppShareCardProps {
  /** 앱 첫 화면으로 가는 주소 */
  url: string;
  /** 네이티브 공유 시트를 연다. 주지 않으면 주소를 복사한다 */
  onSendMessage?: (message: string) => Promise<'sent' | 'dismissed' | 'unsupported'>;
  /** 보냈거나 닫았다. 화면에서 치우는 일은 부르는 쪽이 한다 */
  onDone: () => void;
}

export function AppShareCard({ url, onSendMessage, onDone }: AppShareCardProps) {
  const analytics = useAnalytics();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    analytics.log('app_share_view', { answers_total: 3 }, { kind: 'impression' });
    // 띄운 순간 「했다」로 적는다. 거절도 대답이라 다시 묻지 않는다
    markAppShareDone();
  }, [analytics]);

  useEffect(() => {
    if (toast == null) return;
    const timer = setTimeout(() => {
      setToast(null);
      onDone();
    }, 1800);
    return () => clearTimeout(timer);
  }, [toast, onDone]);

  async function send(): Promise<void> {
    if (busy) return;
    const message = appShareMessage(url);

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

  return (
    <>
      <div className="gr-card gr-card--answer" {...testId(TEST_IDS.appShare)}>
        <div className="gr-card__top">
          <p className="gr-card__title">비슷한 마음인 사람이 떠오르나요?</p>
          <button type="button" className="gr-card__x" aria-label="닫기" onClick={onDone}>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <p className="gr-card__how">
          앱만 건네줄 수 있어요. 지금까지 나눈 이야기는 함께 가지 않아요.
        </p>

        <button
          type="button"
          className="gr-card__cta"
          disabled={busy}
          onClick={() => void send()}
          {...testId(TEST_IDS.appShareSend)}
        >
          {busy ? '여는 중이에요' : '앱 알려주기'}
        </button>
      </div>

      {toast != null ? (
        <div className="sh-toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
