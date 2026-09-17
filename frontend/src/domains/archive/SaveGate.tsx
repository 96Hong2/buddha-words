/**
 * 간직하기 앞에 서는 짧은 확인.
 *
 * 예전에는 셋까지 공짜로 담기고 넷째부터 이용권을 물었다. 지금은 개수 제한이 없고 대신
 * 광고 하나를 본다. 몇 개를 담았든 같은 값이라 「자리가 없다」는 말을 할 일이 없어졌다.
 *
 * **버튼을 누르자마자 광고를 띄우지 않는다.** 전면 광고는 화면을 통째로 덮어서, 예고 없이
 * 뜨면 사람은 자기가 무엇을 눌렀는지부터 잃는다. 한 장 물어보고 시작한다.
 *
 * 광고를 못 띄우는 기기·광고 그룹 id 가 없는 번들에서는 이 시트가 아예 열리지 않는다.
 * 부르는 쪽이 그때는 곧바로 간직한다. 광고 때문에 간직이 막히면 안 된다.
 */

import { useEffect, useRef } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { isArchivePassEnabled } from '../../shared/session/session';
import { TEST_IDS, testId } from '../../shared/testIds';

import './archive.css';

export interface SaveGateProps {
  open: boolean;
  /** 답변 아이디. 로그에 싣는다 */
  answerId: string;
  onClose: () => void;
  /** 「보고 간직하기」를 눌렀다. 광고를 띄우고 간직하는 일은 부르는 쪽이 한다 */
  onWatch: () => void;
  /** 광고가 도는 중. 버튼을 두 번 누르지 못하게 한다 */
  pending?: boolean;
  /**
   * 「광고 없이 간직하기」를 눌렀다. 이용권 시트를 여는 일은 부르는 쪽이 한다.
   *
   * 이 자리에 두는 이유: 광고를 보기 싫은 사람이 지금 정확히 여기 서 있다. 개수 제한이
   * 없어지면서 이용권을 파는 자리가 사라졌는데, 팔 곳을 다시 찾느라 보관함에 배너를
   * 세우면 다시 읽으러 온 사람에게 파는 말을 먼저 건네게 된다.
   */
  onBuyPass?: () => void;
}

export function SaveGate({
  open,
  answerId,
  onClose,
  onWatch,
  pending = false,
  onBuyPass,
}: SaveGateProps) {
  const analytics = useAnalytics();
  const sheetRef = useRef<HTMLDivElement>(null);

  useOverlayBackClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    analytics.log('save_gate_view', { answer_id: answerId }, { kind: 'impression' });
  }, [analytics, answerId, open]);

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

  if (!open) return null;

  return (
    <div className="pw-root">
      <div className="pw-dim" onClick={onClose} {...testId(TEST_IDS.sheetDim)} />
      <div
        ref={sheetRef}
        className="pw-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-gate-title"
        tabIndex={-1}
        {...testId(TEST_IDS.saveGate)}
      >
        <span className="pw-grabber" aria-hidden="true" />

        <h2 className="pw-title" id="save-gate-title">
          짧은 광고를 보면 간직할 수 있어요
        </h2>
        <p className="pw-sub">
          보관함에 담아 두면 앱을 닫아도 남아요. 몇 개를 담든 개수 제한은 없어요.
        </p>

        <div className="pw-actions">
          <button
            type="button"
            className="arch-btn arch-btn--primary arch-btn--lg"
            disabled={pending}
            onClick={onWatch}
            {...testId(TEST_IDS.saveGateWatch)}
          >
            {pending ? '광고를 여는 중이에요' : '보고 간직하기'}
          </button>
          <button
            type="button"
            className="arch-btn arch-btn--plain"
            onClick={onClose}
            {...testId(TEST_IDS.sheetClose)}
          >
            다음에
          </button>
        </div>

        {/* 파는 말은 작게 아래에 둔다. 광고를 보는 쪽이 이 화면의 기본 길이다 */}
        {isArchivePassEnabled() && onBuyPass != null && (
          <button
            type="button"
            className="pw-quiet"
            onClick={onBuyPass}
            {...testId(TEST_IDS.saveGateBuy)}
          >
            광고 없이 간직하기
          </button>
        )}
      </div>
    </div>
  );
}
