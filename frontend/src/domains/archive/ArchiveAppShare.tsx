/**
 * 보관함 맨 앞에 서는 앱 알리기 카드.
 *
 * 첫 말씀을 간직한 직후에만 뜬다. 그때가 이 앱이 무엇을 해 주는지 사람이 막 알게 된
 * 순간이라, 남에게 옮길 말이 생긴 유일한 자리다. 답변 화면 권유(NudgeOverlay)와 달리
 * 여기서는 **덮지 않는다.** 보관함은 다시 읽으러 온 자리라 길을 막으면 안 된다.
 *
 * 한 번 보내거나 닫으면 다시 안 뜬다. 부탁하지 않은 말은 한 번이다.
 */

import { useEffect, useState } from 'react';

import { useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';
import { appShareMessage, appShareUrl } from '../share/shareText';

const KEY = 'buddha.archive.appshare.v1';

/** 이미 보내거나 닫았나 */
export function archiveShareDone(): boolean {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
}

function markDone(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // 저장이 막힌 기기에서는 다음에 한 번 더 볼 수 있다. 영영 못 보게 하는 쪽보다 낫다
  }
}

export interface ArchiveAppShareProps {
  /** 네이티브 공유 시트를 연다. 못 열면 주소를 복사한다 */
  onSendMessage?: (message: string) => Promise<'sent' | 'dismissed' | 'unsupported'>;
  /** 보내거나 닫았다. 화면에서 치운다 */
  onDone: () => void;
}

export function ArchiveAppShare({ onSendMessage, onDone }: ArchiveAppShareProps) {
  const analytics = useAnalytics();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    analytics.log('archive_app_share_view', {}, { kind: 'impression', once: 'archive_app_share' });
  }, [analytics]);

  function close() {
    markDone();
    analytics.log('archive_app_share_dismiss', { how: 'close' }, { kind: 'click' });
    onDone();
  }

  async function send() {
    if (busy) return;
    setBusy(true);
    const message = appShareMessage(appShareUrl());
    let method: 'system' | 'copy' = 'system';

    let sent: 'sent' | 'dismissed' | 'unsupported' = 'unsupported';
    if (onSendMessage != null) {
      try {
        sent = await onSendMessage(message);
      } catch {
        sent = 'unsupported';
      }
    }

    // 스스로 닫은 것은 실패가 아니다. 카드를 남겨 두고 아무 말도 하지 않는다
    if (sent === 'dismissed') {
      setBusy(false);
      return;
    }

    if (sent !== 'sent') {
      // 시트를 못 열면 주소를 복사하고 **복사했다고 말한다.** 말없이 복사하지 않는다
      method = 'copy';
      try {
        await navigator.clipboard.writeText(message);
        setCopied(true);
      } catch {
        setBusy(false);
        return;
      }
    }

    markDone();
    analytics.log('archive_app_share_complete', { method });
    // 복사한 경우에는 복사했다는 말을 한 박자 보여 주고 치운다
    if (method === 'copy') {
      window.setTimeout(onDone, 1400);
      return;
    }
    onDone();
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
          {copied ? '주소를 복사했어요' : '앱 알리기'}
        </button>
        <button type="button" className="arch-btn arch-btn--plain" onClick={close}>
          괜찮아요
        </button>
      </div>
    </div>
  );
}
