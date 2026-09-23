/**
 * 간직하고 나서 뜨는 한 장.
 *
 * 전에는 토스트 한 줄이었다. 2.4초 뒤에 사라지고 끝이라, 담은 사람이 **담긴 것을 보러 갈
 * 길이 없었다.** 보관함 탭이 답변 화면에는 없어서, 뒤로 가서 홈을 거쳐 다시 찾아 들어가야 했다.
 *
 * 그래서 둘을 남긴다. 보러 갈 사람은 바로 가고, 읽던 답을 마저 읽을 사람은 그 자리에 남는다.
 * 둘 다 사람이 고르는 것이라 시간이 지나도 저절로 닫히지 않는다.
 */

import { useEffect, useRef } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';

import './archive.css';

/** 어떻게 담겼나. 이미 있던 것을 새로 담았다고 말하지 않는다 */
export type SaveDoneKind = 'saved' | 'already';

const TITLE: Record<SaveDoneKind, string> = {
  saved: '보관함에 간직했어요',
  already: '이미 보관함에 있어요',
};

const SUB: Record<SaveDoneKind, string> = {
  saved: '앱을 닫아도 남아요. 언제든 다시 꺼내 볼 수 있어요.',
  already: '보관함에서 언제든 다시 꺼내 볼 수 있어요.',
};

export interface SaveDoneProps {
  open: boolean;
  kind: SaveDoneKind;
  /** 답변 아이디. 로그에 싣는다 */
  answerId: string;
  /** 「보관함 보러 가기」 */
  onGoArchive: () => void;
  /** 「계속 보기」. 시트만 닫고 답변 화면에 남는다 */
  onStay: () => void;
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.6 4.6L19 7.4" />
    </svg>
  );
}

export function SaveDone({ open, kind, answerId, onGoArchive, onStay }: SaveDoneProps) {
  const analytics = useAnalytics();
  const sheetRef = useRef<HTMLDivElement>(null);

  useOverlayBackClose(open, onStay);

  useEffect(() => {
    if (!open) return;
    analytics.log('save_done_view', { answer_id: answerId, kind }, { kind: 'impression' });
  }, [analytics, answerId, kind, open]);

  useEffect(() => {
    if (!open) return;

    sheetRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onStay();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open, onStay]);

  if (!open) return null;

  return (
    <div className="pw-root">
      <div className="pw-dim" onClick={onStay} {...testId(TEST_IDS.sheetDim)} />
      <div
        ref={sheetRef}
        className="pw-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-done-title"
        tabIndex={-1}
        {...testId(TEST_IDS.saveDone)}
      >
        <span className="pw-grabber" aria-hidden="true">
          <span className="pw-grabber__grip" />
        </span>

        <span className="save-done__mark" aria-hidden="true">
          <CheckIcon />
        </span>

        <h2 className="pw-title" id="save-done-title">
          {TITLE[kind]}
        </h2>
        <p className="pw-sub">{SUB[kind]}</p>

        <div className="pw-actions">
          <button
            type="button"
            className="arch-btn arch-btn--primary arch-btn--lg"
            onClick={onGoArchive}
            {...testId(TEST_IDS.saveDoneArchive)}
          >
            보관함 보러 가기
          </button>
          <button
            type="button"
            className="arch-btn arch-btn--plain"
            onClick={onStay}
            {...testId(TEST_IDS.saveDoneStay)}
          >
            계속 보기
          </button>
        </div>
      </div>
    </div>
  );
}
