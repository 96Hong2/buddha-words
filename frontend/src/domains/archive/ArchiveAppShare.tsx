/**
 * 보관함 맨 앞에 서는 앱 알리기 카드.
 *
 * 첫 말씀을 간직한 직후에만 뜬다. 그때가 이 앱이 무엇을 해 주는지 사람이 막 알게 된
 * 순간이라, 남에게 옮길 말이 생긴 유일한 자리다. 답변 화면 권유(NudgeOverlay)와 달리
 * 여기서는 **덮지 않는다.** 보관함은 다시 읽으러 온 자리라 길을 막으면 안 된다.
 *
 * ── 열쇠를 따로 두지 않는다 ────────────────────────────────────────────
 *
 * 처음에는 이 카드만의 localStorage 키를 뒀는데, 그러면 **같은 사람에게 같은 부탁이 두 번**
 * 간다. 답변 화면도 두 번째 답에서 같은 글로 앱을 권하기 때문이다(`NUDGE_AT.appShare`).
 * 여기서 보내거나 닫으면 `markNudgeShown('app_share')` 로 그 자리까지 함께 닫는다.
 * 반대로 답변 화면에서 이미 권했으면 여기는 뜨지 않는다. 부탁하지 않은 말은 한 번이다.
 */

import { useEffect, useState } from 'react';

import { useAnalytics } from '../../shared/analytics';
import { markNudgeShown, readMilestones } from '../../shared/prefs/milestones';
import { TEST_IDS, testId } from '../../shared/testIds';
import { appShareMessage, appShareUrl } from '../share/shareText';

/** 답변 화면에서든 여기서든 이미 앱을 권했나 */
export function archiveShareDone(): boolean {
  return readMilestones().appShareDone;
}

export interface ArchiveAppShareProps {
  /** 네이티브 공유 시트를 연다. 못 열면 주소를 복사한다 */
  onSendMessage: (message: string) => Promise<'sent' | 'dismissed' | 'unsupported'>;
  /** 보내거나 닫았다. 화면에서 치운다 */
  onDone: () => void;
}

export function ArchiveAppShare({ onSendMessage, onDone }: ArchiveAppShareProps) {
  const analytics = useAnalytics();
  const [busy, setBusy] = useState(false);
  /** 보내고 나서 하는 말. 버튼 라벨이 아니라 따로 둔다. 라벨 변화는 보조기기에 상태로 안 읽힌다 */
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    analytics.log('archive_app_share_view', {}, { kind: 'impression', once: 'archive_app_share' });
  }, [analytics]);

  function close() {
    markNudgeShown('app_share');
    analytics.log('archive_app_share_dismiss', { how: 'close' }, { kind: 'click' });
    onDone();
  }

  async function send() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const message = appShareMessage(appShareUrl());

    let sent: 'sent' | 'dismissed' | 'unsupported' = 'unsupported';
    try {
      sent = await onSendMessage(message);
    } catch {
      sent = 'unsupported';
    }

    // 스스로 닫은 것은 실패가 아니다. 카드를 남겨 두고 아무 말도 하지 않는다
    if (sent === 'dismissed') {
      setBusy(false);
      return;
    }

    if (sent === 'sent') {
      markNudgeShown('app_share');
      analytics.log('archive_app_share_complete', { method: 'system' });
      onDone();
      return;
    }

    // 시트를 못 열면 주소를 복사하고 **복사했다고 말한다.** 말없이 복사하지 않는다
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // 복사까지 막혔다. 여기서 조용히 끝내면 눌러도 아무 일이 없는 버튼이 된다
      analytics.log('archive_app_share_fail', { reason: 'copy_blocked' });
      setNote('지금은 보내지 못했어요');
      setBusy(false);
      return;
    }

    markNudgeShown('app_share');
    analytics.log('archive_app_share_complete', { method: 'copy' });
    setNote('보낼 글을 복사했어요');
    // 복사했다는 말을 한 박자 보여 주고 치운다
    window.setTimeout(onDone, 1600);
  }

  return (
    <div className="arch-appshare" {...testId(TEST_IDS.archiveAppShare)}>
      <p className="arch-appshare__title">첫 말씀을 간직하셨어요</p>
      <p className="arch-appshare__desc">
        마음이 무거운 사람에게 이 앱을 알려 줄 수 있어요. 적으신 이야기는 가지 않아요.
      </p>
      <div className="arch-appshare__row">
        <button
          type="button"
          className="arch-btn arch-btn--primary"
          onClick={() => void send()}
          disabled={busy}
          {...testId(TEST_IDS.archiveAppShareSend)}
        >
          앱 알리기
        </button>
        <button
          type="button"
          className="arch-btn arch-btn--plain"
          onClick={close}
          {...testId(TEST_IDS.archiveAppShareClose)}
        >
          괜찮아요
        </button>
      </div>
      {note != null && (
        <p className="arch-appshare__note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
