/**
 * 연꽃을 모으는 자리.
 *
 * **여기서만 광고가 하려던 일을 막지 않는다.** 다른 세 자리는 길목에 서 있어서, 광고를
 * 보는 동안 사람은 원래 하려던 일을 멈추고 기다린다. 이 시트는 사람이 스스로 열고,
 * 안 열어도 앱은 그대로 돈다. 그래서 여기 있는 광고만 「방해」가 아니다.
 *
 * 여는 곳은 홈 연꽃 칩 하나다. 이어가기·간직 시트에서 이리로 오는 길은 두지 않는다.
 * 시트 위에 시트를 쌓으면 사람이 무엇을 누르고 있었는지 잃는다. 그쪽에는 어디서 모으는지
 * 한 줄로 적어 두는 것으로 끝낸다.
 *
 * 닫는 길은 손잡이·바깥·뒤로가기다. 닫기 버튼을 따로 두지 않는다. 눌러야 할 버튼이
 * 하나일 때 그 옆에 닫기를 세우면 둘 중 하나로 보인다(이어가기 시트와 같은 이유).
 *
 * ── 몇 초를 봐야 한 송이인가 ──────────────────────────────────────────
 *
 * **초로 정해진 선이 우리 쪽에 없다.** 주는 조건은 하나다: 앱인토스 SDK 가 보상을
 * 받았다고 알려 줄 때(`userEarnedReward`, 이 코드의 `outcome === 'watched'`).
 * 그 순간을 정하는 것은 광고 네트워크이고, 보통 30초짜리를 끝까지 본 뒤다.
 * 우리가 「20초부터」 같은 선을 따로 두면 그것이 곧 `dismissed` 지급이라 SDK 가이드에
 * 어긋난다(계획 1.6 · [[ADR 0016]]).
 *
 * 그래서 화면도 초로 약속하지 않는다. **「보상을 받았다고 뜰 때까지」**라고 적는다.
 * 버튼에 적는 「30초」는 얼마나 걸리는지의 안내이지 지급 조건이 아니다.
 * (2026-09-22 사용자 질문: 「몇 초까지 보면 모을 수 있어?」)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';
import { BottomSheet, LotusIcon, Spinner } from '../../shared/ui';
import '../../shared/ui/leaf.css';
import { useRewardedAd } from '../ads/useRewardedAd';

import { useLeafWallet } from './useLeaves';

const TITLE = '연꽃 모으기';

export interface LeafSheetProps {
  open: boolean;
  onClose: () => void;
}

export function LeafSheet({ open, onClose }: LeafSheetProps) {
  const analytics = useAnalytics();
  const ad = useRewardedAd('collect');
  const { count, earn } = useLeafWallet();

  /** 이번에 막 모았나. 잔액 아래 잠깐 붙는 말이다 */
  const [justEarned, setJustEarned] = useState(false);

  /**
   * 왜 연꽃이 안 늘었나. 둘을 갈라 적는다.
   *
   * `dismissed` 는 사람이 닫은 것이고 `noFill` 은 **우리 쪽 사정**이다. 둘을 한 말로
   * 뭉치면 광고가 안 온 사람에게 「끝까지 봐야」라고 탓하게 된다. 한때 `noFill` 을 아무
   * 말 없이 지나쳤는데, 8초를 기다린 사람 앞에 잔액도 그대로이고 설명도 없었다.
   */
  const [failed, setFailed] = useState<'dismissed' | 'noFill' | null>(null);
  const logged = useRef(false);

  /**
   * 지금 이 기기에서 연꽃을 모을 수 있나.
   *
   * 판정이 끝나기 전(`ready` 가 false)에는 **모을 수 있는 쪽으로 본다.** 반대로 두면
   * 시트를 여는 순간 「모을 수 없어요」가 깜빡 떴다가 버튼으로 바뀐다.
   */
  const canCollect = !ad.ready || ad.supported;

  /*
    열고 닫을 때마다 지난 판을 지운다. **여는 쪽도 지워야 한다.**

    이 시트는 홈에 늘 마운트돼 있어서 닫아도 상태가 남는다. 광고를 불러오는 동안 시트를
    밀어 닫고, 그 사이 광고가 떠서 끝까지 돌면 `justEarned` 가 닫힌 시트에 걸린다.
    다음에 열었을 때 아무것도 안 했는데 「연꽃 한 송이가 늘었어요」가 먼저 보인다.
  */
  useEffect(() => {
    setJustEarned(false);
    setFailed(null);
    if (!open) {
      logged.current = false;
      return;
    }
    if (logged.current) return;
    logged.current = true;
    analytics.log('leaf_sheet_view', { balance: count }, { kind: 'impression' });
    // count 는 로그에 싣기만 한다. 잔액이 바뀔 때마다 이 효과가 다시 돌면 방금 띄운
    // 「늘었어요」를 스스로 지운다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics, open]);

  const watch = useCallback(async () => {
    setFailed(null);
    setJustEarned(false);
    const outcome = await ad.show();
    // 보상을 받은 사람에게만 준다. 닫은 사람에게 주면 보상형 규칙에 어긋난다
    if (outcome !== 'watched') {
      setFailed(outcome === 'dismissed' ? 'dismissed' : 'noFill');
      return;
    }
    // 잔액은 시트가 닫혀 있어도 늘려야 한다. 광고를 끝까지 본 것은 사실이다
    earn();
    setJustEarned(true);
  }, [ad, earn]);

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={TITLE} className="leaf-sheet">
      <div {...testId(TEST_IDS.leafSheet)}>
        <div className="leaf-sheet__balance">
          <LotusIcon size={44} className="leaf-sheet__icon" />
          {/* 아이콘이 `aria-hidden` 이라, 무엇이 몇 송이인지는 이 라벨이 말해야 한다 */}
          <p
            className="leaf-sheet__count"
            aria-label={`가진 연꽃 ${count}송이`}
            {...testId(TEST_IDS.leafSheetCount)}
          >
            <b>{count}</b>송이
          </p>
          {/*
            라이브 리전은 **내용이 바뀌기 전에 이미 DOM 에 있어야** 읽힌다. 한때 문구와 함께
            마운트했는데, 리전 자체가 새로 생기는 것이라 안 읽는 기기가 있었다. 껍데기를 늘 둔다.
          */}
          <p className="leaf-sheet__earned" role="status" {...testId(TEST_IDS.leafEarned)}>
            {justEarned ? '연꽃 한 송이가 늘었어요' : ''}
          </p>
        </div>

        <h2 className="leaf-sheet__title">{TITLE}</h2>
        {/*
          못 모으는 판에서는 「미리 모아 두면」이라고 말하지 않는다. 모을 길이 막힌 사람에게
          모으라고 청하는 셈이다. 가진 것으로 할 수 있는 일만 적는다.
        */}
        <p className="leaf-sheet__sub">
          {canCollect ? (
            <>
              미리 모아 두면 <b>기다리지 않고</b> 이야기를 이어가거나 말씀을 간직할 수 있어요.
            </>
          ) : (
            <>
              가진 연꽃으로 <b>기다리지 않고</b> 이야기를 이어가거나 말씀을 간직할 수 있어요.
            </>
          )}
        </p>

        {!canCollect ? (
          /* 구버전·광고 끄기·그룹 id 가 없는 번들. 왜 못 모으는지는 적되 앱을 막지 않는다 */
          <p className="leaf-sheet__note" role="status" {...testId(TEST_IDS.leafUnavailable)}>
            지금은 연꽃을 모을 수 없어요. 가진 연꽃은 그대로 쓸 수 있어요.
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
              {/*
                다른 광고 자리와 같은 말투다: 몇 초짜리인지와 무엇을 얻는지를 한 줄에.
                `text-wrap: balance` 는 이 span 에 건다. 버튼이 flex 라 바깥에 걸면 안 먹는다
              */}
              {/*
                광고를 불러오는 동안 버튼이 잠긴다. 흐려지기만 하면 멈춘 것으로 읽혀서
                도는 표와 이유를 함께 둔다(2026-09-22 사용자 지적).
              */}
              {ad.showing ? (
                <>
                  <Spinner className="leaf-sheet__spin" />
                  <span className="leaf-sheet__ad-label">준비하고 있어요</span>
                </>
              ) : (
                <span className="leaf-sheet__ad-label">
                  30초{' '}
                  <span className="leaf-sheet__badge" {...testId(TEST_IDS.adBadge)}>
                    광고
                  </span>{' '}
                  보고 연꽃 한 송이 모으기
                </span>
              )}
            </button>
            {/* 리전은 늘 서 있는다. 이유는 ContinueSheet 의 같은 자리 주석 */}
            <p className="leaf-sheet__note" role="status" {...testId(TEST_IDS.leafNote)}>
              {ad.showing
                ? '잠시만 기다려 주세요'
                : failed === 'dismissed'
                  ? // 무엇이 모자랐는지 정확히 말한다. 「끝까지」는 사람마다 다르게 읽힌다
                    '보상을 받기 전에 닫아서 연꽃이 생기지 않았어요'
                  : failed === 'noFill'
                    ? '지금은 열 수 없어요. 잠시 뒤에 다시 눌러 주세요'
                    : ''}
            </p>
          </>
        )}

        {/* 버는 말 바로 뒤라, 이름이 없으면 이 목록도 「모으는 곳」으로 읽힌다 */}
        <p className="leaf-sheet__uses-title" id="leaf-uses-title">
          연꽃을 쓰는 곳
        </p>
        <ul className="leaf-sheet__uses" aria-labelledby="leaf-uses-title">
          <li>이야기를 이어갈 때 한 송이</li>
          <li>말씀을 보관함에 간직할 때 한 송이</li>
          {/* 쌓아 둘 수 있다는 사실. 한 송이만 모을 수 있는 줄 아는 사람이 있다 */}
          <li>몇 송이든 모아 둘 수 있어요</li>
        </ul>
      </div>
    </BottomSheet>
  );
}
