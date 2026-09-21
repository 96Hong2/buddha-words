/**
 * 연잎을 모으는 자리.
 *
 * **여기서만 광고가 하려던 일을 막지 않는다.** 다른 세 자리는 길목에 서 있어서, 광고를
 * 보는 동안 사람은 원래 하려던 일을 멈추고 기다린다. 이 시트는 사람이 스스로 열고,
 * 안 열어도 앱은 그대로 돈다. 그래서 여기 있는 광고만 「방해」가 아니다.
 *
 * 닫는 길은 손잡이·바깥·뒤로가기다. 닫기 버튼을 따로 두지 않는다. 눌러야 할 버튼이
 * 하나일 때 그 옆에 닫기를 세우면 둘 중 하나로 보인다(이어가기 시트와 같은 이유).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';
import { BottomSheet, LeafIcon } from '../../shared/ui';
import '../../shared/ui/leaf.css';
import { useRewardedAd } from '../ads/useRewardedAd';

import { useLeafWallet } from './useLeaves';

const TITLE = '연잎 모으기';

/** 어디서 열었나. 로그에만 쓴다 */
export type LeafSheetSurface = 'home_chip' | 'continue' | 'save';

export interface LeafSheetProps {
  open: boolean;
  surface: LeafSheetSurface;
  onClose: () => void;
  /**
   * 한 장 모았다. 부르는 쪽이 하던 일을 이어가고 싶을 때 쓴다.
   *
   * 홈에서는 안 넘긴다. 모으고 나서도 시트에 남아 한 장 더 모을 수 있어야 한다.
   */
  onEarned?: (balance: number) => void;
}

export function LeafSheet({ open, surface, onClose, onEarned }: LeafSheetProps) {
  const analytics = useAnalytics();
  const ad = useRewardedAd('collect');
  const { count, earn } = useLeafWallet();

  /** 이번에 막 모았나. 잔액 숫자 옆에 잠깐 붙는 말이다 */
  const [justEarned, setJustEarned] = useState(false);
  /** 광고를 끝까지 못 봤다. 왜 안 늘었는지 그 자리에 적는다 */
  const [bailed, setBailed] = useState(false);
  const logged = useRef(false);

  useEffect(() => {
    if (!open) {
      logged.current = false;
      setJustEarned(false);
      setBailed(false);
      return;
    }
    if (logged.current) return;
    logged.current = true;
    analytics.log('leaf_sheet_view', { balance: count, surface }, { kind: 'impression' });
  }, [analytics, count, open, surface]);

  const watch = useCallback(async () => {
    setBailed(false);
    setJustEarned(false);
    const outcome = await ad.show();
    // 끝까지 본 사람에게만 준다. 닫은 사람에게 주면 보상형 규칙에 어긋난다
    if (outcome !== 'watched') {
      // 광고가 아예 안 온 것은 우리 쪽 사정이다. 사람 탓처럼 적지 않는다
      setBailed(outcome === 'dismissed');
      return;
    }
    const balance = earn();
    setJustEarned(true);
    onEarned?.(balance);
  }, [ad, earn, onEarned]);

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={TITLE} className="leaf-sheet">
      <div {...testId(TEST_IDS.leafSheet)}>
        <div className="leaf-sheet__balance">
          <LeafIcon size={44} className="leaf-sheet__icon" />
          <p className="leaf-sheet__count" {...testId(TEST_IDS.leafSheetCount)}>
            <b>{count}</b>장
          </p>
          {justEarned && (
            <p className="leaf-sheet__earned" role="status" {...testId(TEST_IDS.leafEarned)}>
              연잎 한 장이 늘었어요
            </p>
          )}
        </div>

        <h2 className="leaf-sheet__title">{TITLE}</h2>
        <p className="leaf-sheet__sub">
          미리 모아 두면 <b>광고 없이</b> 이야기를 이어가거나 말씀을 간직할 수 있어요.
        </p>

        {ad.ready && !ad.supported ? (
          /* 구버전·광고 끄기·그룹 id 가 없는 번들. 왜 못 모으는지는 적되 앱을 막지 않는다 */
          <p className="leaf-sheet__note" role="status" {...testId(TEST_IDS.leafUnavailable)}>
            지금은 연잎을 모을 수 없어요. 가진 연잎은 그대로 쓸 수 있어요.
          </p>
        ) : (
          <>
            <button
              type="button"
              className="leaf-sheet__ad"
              disabled={!ad.ready || ad.showing}
              onClick={() => void watch()}
              {...testId(TEST_IDS.leafWatch)}
            >
              {/* 다른 광고 자리와 같은 말투다: 몇 초짜리인지와 무엇을 얻는지를 한 줄에 */}
              30초{' '}
              <span className="leaf-sheet__badge" {...testId(TEST_IDS.adBadge)}>
                광고
              </span>{' '}
              보고 연잎 한 장 모으기
            </button>
            <p className="leaf-sheet__note" role={ad.showing || bailed ? 'status' : undefined}>
              {ad.showing
                ? '광고를 불러오고 있어요'
                : bailed
                  ? '광고를 끝까지 봐야 연잎이 생겨요'
                  : '몇 장이든 모을 수 있어요'}
            </p>
          </>
        )}

        <ul className="leaf-sheet__uses">
          <li>이야기를 이어갈 때 한 장</li>
          <li>말씀을 보관함에 간직할 때 한 장</li>
        </ul>
      </div>
    </BottomSheet>
  );
}
