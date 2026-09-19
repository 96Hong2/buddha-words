import { useEffect, useRef, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { immediateBucket, useAnalytics } from '../../shared/analytics';
import {
  ARCHIVE_PASS_SKU,
  isArchivePassEnabled,
  useSession,
  type ArchivePurchaseOutcome,
} from '../../shared/session/session';
import { TEST_IDS, testId } from '../../shared/testIds';

import './archive.css';

/** 콘솔 상품과 같은 값이어야 한다. 화면에 적는 가격도 콘솔과 같이 고친다 */
const SKU = ARCHIVE_PASS_SKU;
const PRICE_KRW = 4900;

/** 결제가 끝나지 않았을 때 보여 줄 말. 오류 내용을 그대로 옮기지 않는다 */
const FAIL_NOTICE = '결제를 끝내지 못했어요. 잠시 뒤에 다시 시도해 주세요.';

/**
 * 이 토스 앱 버전에서는 주문서가 아예 안 열린다.
 * 다시 눌러도 같은 자리라 「다시 시도」 대신 할 수 있는 일을 알려 준다.
 */
const UNSUPPORTED_NOTICE = '토스 앱을 최신 버전으로 업데이트하면 이용권을 살 수 있어요.';

export type PurchaseOutcome = ArchivePurchaseOutcome;

export interface PaywallProps {
  open: boolean;
  /** 어디서 열렸나. 간직 광고 자리면 save_ad, 보관함에서 열었으면 archive_locked */
  trigger: 'save_ad' | 'archive_locked';
  onClose: () => void;
  /**
   * 이용권 결제를 갈아 끼울 때만 넘긴다. 안 넘기면 세션이 브릿지로 실제 결제를 연다.
   * 결과를 돌려주면 이 시트가 purchase_complete · purchase_fail 을 남긴다.
   */
  onPurchase?: () => Promise<PurchaseOutcome>;
  /**
   * 결제가 끝난 직후, 시트가 닫히기 전에 부른다.
   *
   * 사람은 이용권을 사려고 여기 온 것이 아니라 **간직하려다** 온 것이다. 사고 나서 시트만
   * 닫히면 하려던 일이 사라진다. 부르는 쪽이 이 자리에서 그 일을 마저 한다.
   */
  onPurchased?: () => void;
}

/**
 * O5 이용권 시트.
 *
 * 지금은 자동으로 뜨지 않는다. 간직 개수 제한이 없어져서 길을 막고 서는 자리가 사라졌다.
 * 닫는 길은 셋이다: 닫기 버튼 · 시트 바깥 · 시스템 뒤로가기.
 */
export function Paywall({ open, trigger, onClose, onPurchase, onPurchased }: PaywallProps) {
  const analytics = useAnalytics();
  const { archivePass, buyArchivePass } = useSession();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 이 기기에서는 결제를 못 연다고 확인된 상태. 버튼을 살려 두면 헛되이 다시 누른다 */
  const [blocked, setBlocked] = useState(false);

  const enabled = isArchivePassEnabled();
  const owned = archivePass === 'owned';
  /**
   * 주문 이력을 못 읽은 상태. 「없다」와 갈라 둔 값을 화면에서도 갈라야 한다.
   *
   * 다시 깐 기기에서 이력 조회가 실패하면 산 사람도 여기에 머문다. 그 사람에게 파는 말만
   * 보여 주면 이미 가진 것을 또 사게 된다. 버튼은 살려 둔다. 결제를 못 여는 낡은 앱도 같은
   * 자리에 머물러서, 버튼을 지우면 아직 안 산 사람이 살 길까지 막힌다.
   */
  const unverified = archivePass === 'unknown';
  const purchase = onPurchase ?? buyArchivePass;

  useOverlayBackClose(open, onClose);

  /**
   * 열린 시각. 닫을 때 얼마 만에 닫았는지 함께 남긴다.
   * 2초 안에 닫혔으면 사람이 원해서 연 화면이 아니라 길을 막고 선 화면이다.
   */
  const openedAt = useRef(0);

  useEffect(() => {
    if (!open) return;
    analytics.log('paywall_view', { trigger });
    openedAt.current = Date.now();
    return () => {
      if (openedAt.current === 0) return;
      analytics.log('paywall_close', {
        trigger,
        within_bucket_s: immediateBucket(Date.now() - openedAt.current),
      });
      openedAt.current = 0;
    };
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
    if (pending) return;

    setPending(true);
    setNotice(null);
    analytics.log('purchase_start', { sku: SKU });
    try {
      const outcome = await purchase();
      if (outcome === 'completed') {
        analytics.log('purchase_complete', { sku: SKU, amount_krw: PRICE_KRW });
        // 하려던 일을 먼저 마치고 닫는다. 닫고 나서 부르면 그 결과를 말할 자리가 없다.
        onPurchased?.();
        onClose();
        return;
      }
      analytics.log('purchase_fail', { sku: SKU, error_code: outcome });
      // 취소는 사용자가 고른 것이라 아무 말도 하지 않는다. 실패만 알린다.
      if (outcome === 'failed') setNotice(FAIL_NOTICE);
      if (outcome === 'unsupported') {
        setNotice(UNSUPPORTED_NOTICE);
        setBlocked(true);
      }
    } catch {
      // 실패 내용은 남기지 않는다. 예외 메시지에 무엇이 실려 있을지 모른다.
      analytics.log('purchase_fail', { sku: SKU, error_code: 'error' });
      setNotice(FAIL_NOTICE);
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

        {/* 플래그가 꺼져 있으면 파는 화면을 아예 그리지 않는다. 자리가 찼다는 안내만 남는다 */}
        {!enabled ? (
          <>
            <h2 className="pw-title" id="pw-title">
              30초 광고를 보면 간직할 수 있어요
            </h2>
            <p className="pw-sub">간직할 수 있는 개수에는 제한이 없어요.</p>
          </>
        ) : owned ? (
          <>
            <h2 className="pw-title" id="pw-title">
              이미 이용권이 있어요
            </h2>
            <p className="pw-sub">광고 없이 바로 간직할 수 있어요.</p>
          </>
        ) : (
          <>
            <h2 className="pw-title" id="pw-title">
              광고 없이 간직할까요?
            </h2>
            <p className="pw-sub">
              간직할 때마다 보는 30초 광고가 없어져요. 개수 제한은 원래 없어요.
            </p>

            {/*
              여기 적는 것은 지금 이 판에서 실제로 되는 것뿐이다.
              지난 고민 열람·즐겨찾기·태그별 모아보기는 아직 없어서 적지 않는다.
            */}
            <ul className="pw-benefits">
              <li>간직할 때 광고를 보지 않아요</li>
              <li>앱을 다시 깔아도 이용권 그대로</li>
            </ul>

            {/* 이름 · 값 · 단위를 각각 덩어리로 둔다. 좁은 폭에서 「결제」만 떨어져 나가지 않게 */}
            <p className="pw-price">
              <span className="pw-price__name">마음 보관함 이용권</span>
              <span className="pw-price__amount">₩4,900</span>
              <small>한 번 결제</small>
            </p>

            {/*
              사기 전에 못 하는 것을 먼저 말한다. 적은 글도 답변도 서버에 남기지 않아서
              간직해 두지 않은 이야기는 이용권을 사도 돌아오지 않는다.

              공유 링크를 만들면 카드의 경전 문장과 풀이 한 줄은 서버에 30일 남는다.
              돈을 받기 직전이라 그 예외까지 적는다. 개인정보 안내와 같은 말을 쓴다.
            */}
            <p className="pw-note">
              간직하지 않고 지나간 이야기는 다시 불러올 수 없어요. 적으신 글과 답변을 서버에 남기지
              않거든요. 공유 링크를 만들었을 때만 그 링크에 담길 내용이 30일 동안 남고, 적으신 고민
              글은 그때도 함께 가지 않아요.
            </p>

            {unverified && (
              <p className="pw-sub">
                지금은 이용권을 확인하지 못했어요. 이미 사셨다면 잠시 뒤에 다시 열어 주세요.
              </p>
            )}
          </>
        )}

        {notice != null && (
          <p className="pw-sub" role="alert">
            {notice}
          </p>
        )}

        <div className="pw-actions">
          {enabled && !owned && (
            <button
              type="button"
              className="arch-btn arch-btn--primary arch-btn--lg"
              disabled={pending || blocked}
              onClick={() => void buy()}
              {...testId(TEST_IDS.paywallBuy)}
            >
              {pending ? '결제를 기다리고 있어요' : '이용권 구매하기'}
            </button>
          )}
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
