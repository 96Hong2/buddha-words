import { useEffect, useRef, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';

import './archive.css';

/** 콘솔에 등록한 비소모품 상품. 가격은 화면에 적힌 값과 같아야 한다 */
const SKU = 'archive_pass';
const PRICE_KRW = 4900;

export type PurchaseOutcome = 'completed' | 'cancelled' | 'failed';

export interface PaywallProps {
  open: boolean;
  /** 어디서 열렸나. 네 번째 간직하기면 save_4th, 지난 이야기를 눌렀으면 archive_locked */
  trigger: 'save_4th' | 'archive_locked';
  onClose: () => void;
  /**
   * 이용권 결제. 결제 배선이 붙기 전에는 넘기지 않고, 그동안 구매 버튼은 눌리지 않는다.
   * 결과를 돌려주면 이 시트가 purchase_complete · purchase_fail 을 남긴다.
   */
  onPurchase?: () => Promise<PurchaseOutcome>;
}

/**
 * O5 이용권 시트.
 *
 * 사용자가 네 번째로 간직하려 했을 때 열린다. 진입하자마자 뜨지 않는다.
 * 닫는 길은 셋이다: 닫기 버튼 · 시트 바깥 · 시스템 뒤로가기.
 */
export function Paywall({ open, trigger, onClose, onPurchase }: PaywallProps) {
  const analytics = useAnalytics();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);

  useOverlayBackClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    analytics.log('paywall_view', { trigger });
  }, [analytics, open, trigger]);

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

  async function buy(): Promise<void> {
    if (onPurchase == null || pending) return;

    setPending(true);
    analytics.log('purchase_start', { sku: SKU });
    try {
      const outcome = await onPurchase();
      if (outcome === 'completed') {
        analytics.log('purchase_complete', { sku: SKU, amount_krw: PRICE_KRW });
        onClose();
        return;
      }
      analytics.log('purchase_fail', { sku: SKU, error_code: outcome });
    } catch {
      // 실패 내용은 남기지 않는다. 예외 메시지에 무엇이 실려 있을지 모른다.
      analytics.log('purchase_fail', { sku: SKU, error_code: 'error' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pw-root">
      <div className="pw-dim" onClick={onClose} {...testId(TEST_IDS.sheetDim)} />
      <div
        ref={sheetRef}
        className="pw-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pw-title"
        tabIndex={-1}
        {...testId(TEST_IDS.paywall)}
      >
        <span className="pw-grabber" aria-hidden="true" />
        <h2 className="pw-title" id="pw-title">
          마음에 남은 말을 계속 간직할까요?
        </h2>
        <p className="pw-sub">
          지금은 3개까지 보관할 수 있어요. 이용권이 있으면 지난 이야기와 간직한 말씀을 모두 다시 볼
          수 있어요.
        </p>

        <ul className="pw-benefits">
          <li>지난 고민 열람</li>
          <li>저장 무제한</li>
          <li>즐겨찾기 무제한</li>
          <li>태그별 모아보기</li>
        </ul>

        <p className="pw-price">
          마음 보관함 이용권 · ₩4,900 <small>한 번 결제</small>
        </p>

        <div className="pw-actions">
          <button
            type="button"
            className="arch-btn arch-btn--primary arch-btn--lg"
            disabled={onPurchase == null || pending}
            onClick={() => void buy()}
            {...testId(TEST_IDS.paywallBuy)}
          >
            이용권 구매하기
          </button>
          <button
            type="button"
            className="arch-btn arch-btn--plain"
            onClick={onClose}
            {...testId(TEST_IDS.sheetClose)}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
