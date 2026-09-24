/**
 * 「연꽃 한 송이를 썼어요」.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────
 *
 * 연꽃으로 지나가면 광고가 안 뜬다. 그건 좋은 일인데, **아무 일도 일어나지 않은 것과
 * 구분이 안 된다.** 버튼을 눌렀더니 그냥 다음 화면이 나온다. 잔액은 홈 칩에서만 보이고
 * 그때 사람은 홈에 없다. 그래서 모아 둔 것이 줄어든 줄 모르고, 다음에 광고를 만나면
 * 왜 이번엔 광고가 뜨는지 모른다.
 *
 * 한 줄로 알린다. 무엇을 썼고 몇 송이가 남았는지.
 *
 * 앱 껍데기에 한 번만 마운트한다. 신호는 라우팅 밖(`spentNotice`)에 있어서, 쓰는 순간
 * 화면이 바뀌어도 이 토스트는 그대로 떠 있는다.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { TEST_IDS, testId } from '../../shared/testIds';
import { LotusIcon } from '../../shared/ui';
import '../../shared/ui/leaf.css';

import { clearLeafSpend, readLeafSpend, subscribeLeafSpend } from './spentNotice';

/** 얼마나 떠 있나. 권유 토스트(1.8초)보다 길다. 잔액까지 읽어야 하는 두 마디라서다 */
const SHOW_MS = 2600;

/**
 * 자리마다 무엇을 했다고 말하나.
 *
 * ⚠ **`LeafSpend` 에 자리를 늘리면 여기도 늘린다.** 타입이 강제하지 못한다(키가 `string`
 * 이라야 알 수 없는 값도 받아 넘길 수 있다). 빠뜨리면 아래 기본값 「지나갔어요」가 떠서,
 * 무엇을 했는지 말하라고 만든 부품이 정작 그 자리에서만 그걸 안 한다(2026-09-24 리뷰).
 */
const ACTION: Record<string, string> = {
  continue: '이어갔어요',
  save: '간직했어요',
  extension: '다른 관점을 봤어요',
};

export function LeafSpentToast() {
  const notice = useSyncExternalStore(subscribeLeafSpend, readLeafSpend, () => null);

  /*
    일련번호를 키로 걸어 시간을 다시 잰다. 연달아 쓰면(이어가고 바로 간직) 두 번째
    알림이 첫 번째의 남은 시간에 얹혀 금방 사라진다.
  */
  const seq = notice?.seq ?? 0;
  useEffect(() => {
    if (seq === 0) return;
    const timer = window.setTimeout(clearLeafSpend, SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [seq]);

  /*
    **리전 껍데기를 늘 둔다.** 라이브 리전은 내용이 바뀌기 전에 이미 DOM 에 있어야
    읽힌다. 글과 함께 마운트하면 리전 자체가 새로 생기는 것이라 안 읽는 기기가 있다.
    같은 사고를 연꽃 모으기 시트에서 한 번 겪었다(`LeafSheet` 의 `leaf-earned`).
  */
  return createPortal(
    <div
      className={notice == null ? 'leaf-spent leaf-spent--off' : 'leaf-spent'}
      role="status"
      {...testId(TEST_IDS.leafSpentToast)}
    >
      {notice == null ? null : (
        <>
          <LotusIcon size={20} className="leaf-spent__icon" />
          <span className="leaf-spent__text">
            {/* 한 줄에 한 마디. 무엇을 했는지 먼저, 얼마 남았는지 그다음 */}
            <span className="leaf-spent__did">
              연꽃 한 송이로 {ACTION[notice.placement] ?? '지나갔어요'}
            </span>
            {/* 남은 수를 붙여 다음에 무엇을 만날지 미리 알린다. 0 이면 그 사실을 말한다 */}
            <b className="leaf-spent__left">
              {notice.balance === 0 ? '남은 연꽃이 없어요' : `${notice.balance}송이 남았어요`}
            </b>
          </span>
        </>
      )}
    </div>,
    document.body,
  );
}
