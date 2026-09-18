/**
 * 「어제 적어 드린 그거, 해 보셨나요?」 한 장.
 *
 * ── 왜 홈 카드가 아니라 시트인가 ──────────────────────────────────────────
 *
 * 전에는 홈 맨 위의 카드였고, 답을 받을 때마다 **말없이** 쌓였다. 부탁한 적 없는 질문이
 * 매일 홈 첫 줄에 서 있었고, 사용자가 「어제 이야기는 띄우지 마라」고 했다.
 *
 * 지금은 사람이 답변에서 「내일 물어봐 주세요」를 누른 경우에만 남고, 그 다음 날 처음
 * 열 때 한 번 시트로 묻는다. 안 눌렀으면 홈에는 아무것도 없다.
 *
 * 한 번 답하면 기기에서도 지운다. 화면에서만 치우면 다음에 또 같은 것을 묻는다.
 *
 * 재료는 `{ answerId, date, firstActionTitle }` 뿐이다. 고민 원문과 답변 본문은 어디에도
 * 저장하지 않으므로 이 화면에 원문이 나올 수 없다.
 */

import { useEffect, useRef } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { daysSince, recallWording, type RecallEntry } from '../../shared/prefs/recall';
import { TEST_IDS, testId } from '../../shared/testIds';

import './daily.css';

export interface RecallSheetProps {
  /** 물어볼 것. 없으면 아무것도 그리지 않는다 */
  entry: RecallEntry | null;
  /** 「해봤어요」면 true. 어느 쪽이든 시트를 닫고 기기에서 지운다 */
  onRespond: (done: boolean) => void;
  /** 닫기·바깥·뒤로가기. 답하지 않은 것이라 기기에서는 지우지 않는다 */
  onClose: () => void;
}

export function RecallSheet({ entry, onRespond, onClose }: RecallSheetProps) {
  const analytics = useAnalytics();
  const sheetRef = useRef<HTMLDivElement>(null);
  const seen = useRef('');

  const open = entry != null;
  const since = entry != null ? daysSince(entry.date) : 0;

  useOverlayBackClose(open, onClose);

  useEffect(() => {
    if (entry == null || seen.current === entry.answerId) return;
    seen.current = entry.answerId;
    analytics.log('recall_card_impression', { days_since: since }, { kind: 'impression' });
  }, [analytics, entry, since]);

  useEffect(() => {
    if (!open) return;

    sheetRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (entry == null) return null;

  function respond(done: boolean): void {
    analytics.log('recall_card_click', { days_since: since, done }, { kind: 'click' });
    onRespond(done);
  }

  return (
    <div className="recall-root">
      <div className="recall-dim" onClick={onClose} {...testId(TEST_IDS.sheetDim)} />
      <div
        ref={sheetRef}
        className="recall-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recall-title"
        tabIndex={-1}
        {...testId(TEST_IDS.recallSheet)}
      >
        <span className="recall-sheet__grabber" aria-hidden="true" />

        <p className="recall-sheet__key">{since <= 1 ? '어제 이야기' : '지난 이야기'}</p>
        <h2 className="recall-sheet__title" id="recall-title">
          {recallWording(entry, since)} 적어 드린
          <br />
          「{entry.firstActionTitle}」는 해 보셨나요?
        </h2>

        <div className="recall-sheet__buttons">
          <button
            type="button"
            className="recall-sheet__btn recall-sheet__btn--yes"
            onClick={() => respond(true)}
            {...testId(TEST_IDS.recallYes)}
          >
            해봤어요
          </button>
          <button
            type="button"
            className="recall-sheet__btn"
            onClick={() => respond(false)}
            {...testId(TEST_IDS.recallNo)}
          >
            아직이요
          </button>
        </div>

        <button
          type="button"
          className="recall-sheet__close"
          onClick={onClose}
          {...testId(TEST_IDS.sheetClose)}
        >
          나중에 답할게요
        </button>
      </div>
    </div>
  );
}
