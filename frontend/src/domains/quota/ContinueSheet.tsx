/**
 * 같은 날 두 번째 고민부터 전송을 누르면 먼저 열리는 시트.
 *
 * 출구는 하나다: 답변 받기. 나가는 길은 손잡이·바깥·뒤로가기다.
 * 「오늘 답변 다시 보기」와 「닫기」 버튼은 없앴다. 바깥을 누르면 닫히는 시트에 닫기 버튼을
 * 또 두면, 정작 눌러야 할 하나가 셋 중 하나로 보인다.
 *
 * 광고를 못 띄우는 기기에서는 이 시트를 열지 않고 그냥 이어간다. 부르는 쪽이
 * `useRewardedAd('continue').supported` 를 먼저 보고, 잊었더라도 여기서 한 번 더 막는다.
 *
 * ── 광고를 끝까지 봐야 이어간다 ─────────────────────────────────────
 *
 * 이 자리는 **보상형**이고 **`userEarnedReward` 가 왔을 때만** 답으로 넘어간다.
 * 공식 문서가 보상형의 대표 쓰임으로 「이어하기」를 들고, SDK 가이드가 `dismissed` 만으로는
 * 지급하지 말라고 못 박는다. 정책이 막는 「광고 소비를 보상과 직접 연결」은 **누르면 즉시
 * 보상** 같은 부당한 연결이지 이 구조가 아니다.
 *
 * 중간에 닫으면 답을 주지 않고 시트에 남는다. 한때 5초만 보면 답을 주었는데 그것이
 * `dismissed` 지급이라 규칙에 어긋났다. 전면형으로 바꿔 답을 떼어 놓은 판도 있었지만,
 * 광고를 볼 이유가 함께 사라지고 단가도 낮아 되돌렸다.
 *
 * `noFill` 은 **우리 쪽 사정**이라 막지 않고 그냥 이어간다. 광고를 못 받는 기기에서
 * 기능이 통째로 막히면 막다른 구조가 된다.
 *
 * 전면형으로 돌리는 빌드(`VITE_AD_CONTINUE_KIND=interstitial`)에서는 보상 이벤트가 없어
 * `dismissed` 로 끝나므로, 그 판에서는 닫아도 이어간다. 어느 쪽이 나은지는 지표로 가른다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';
import { BottomSheet } from '../../shared/ui';
import { AD_KIND } from '../ads/placement';
import { useRewardedAd, type AdOutcome } from '../ads/useRewardedAd';

import './quota.css';

const TITLE = '이야기를 이어가 볼까요?';

/**
 * 버튼에 뭐라고 적나. **종류마다 다르다.**
 *
 * 보상형은 끝까지 봐야 답이 나오므로 「광고 보고 답변 받기」가 사실이고, 얼마나 참아야
 * 하는지도 적는다(실기기 실측 30초).
 *
 * 전면형은 닫아도 답이 나온다. 그 판에서 「광고 보고 답변 받기」라고 적으면 **광고를 봐야
 * 답을 준다는 거짓말**이 되고, 광고 시청과 보상을 묶은 구조로도 읽힌다. 길이도 문서에 없어
 * 초를 적지 않는다. 근거 없는 수치를 화면이 말하게 두지 않는다.
 */
const AD_BUTTON_LABEL = AD_KIND.continue === 'rewarded' ? '30초 광고 보고 답변 받기' : '답변 받기';

export interface ContinueSheetProps {
  open: boolean;
  /** 오늘 남은 이어가기 횟수 */
  continuesLeft: number;
  /** 오늘 이미 이어간 횟수. 로그에만 쓴다 */
  continuesUsed: number;
  onClose: () => void;
  /** 답을 만들기 시작한다. 광고는 아직 떠 있을 수 있다 */
  onContinue: () => void;
}

export function ContinueSheet({
  open,
  continuesLeft,
  continuesUsed,
  onClose,
  onContinue,
}: ContinueSheetProps) {
  const analytics = useAnalytics();
  const ad = useRewardedAd('continue');
  const logged = useRef(false);

  useOverlayBackClose(open, onClose);

  useEffect(() => {
    if (!open) {
      logged.current = false;
      return;
    }
    if (logged.current) return;
    logged.current = true;
    analytics.log('second_question_start', {
      continues_used: continuesUsed,
      gate: 'ad_continue',
    });
  }, [analytics, continuesUsed, open]);

  // 광고를 띄울 수 없는 기기라면 시트가 길을 막고 서 있는 셈이다. 조용히 비켜 준다.
  useEffect(() => {
    if (!open || !ad.ready || ad.supported) return;
    onClose();
    onContinue();
  }, [ad.ready, ad.supported, onClose, onContinue, open]);

  /** 중간에 닫았다. 답을 주지 않으므로 왜 안 넘어가는지 그 자리에 적는다 */
  const [bailed, setBailed] = useState(false);

  const watch = useCallback(async (): Promise<void> => {
    setBailed(false);
    const outcome: AdOutcome = await ad.show();

    // 광고가 안 온 것은 우리 쪽 사정이다. 막지 않고 그냥 보낸다
    if (outcome === 'noFill') {
      analytics.log('ad_skipped', { placement: 'continue', reason: 'no_fill' });
      onContinue();
      return;
    }

    /*
      보상형은 끝까지 본 사람만 `watched` 다. 닫은 사람에게 답을 주면 `dismissed` 지급이라
      SDK 가이드에 어긋난다. 전면형으로 돌리는 판에는 보상 이벤트가 없어 `dismissed` 가
      정상 종료이므로 그때는 이어간다.
    */
    if (outcome === 'watched' || AD_KIND.continue === 'interstitial') {
      onContinue();
      return;
    }

    setBailed(true);
  }, [ad, analytics, onContinue]);

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={TITLE} className="continue-sheet">
      <div {...testId(TEST_IDS.continueSheet)}>
        <h2 className="continue-sheet__title">{TITLE}</h2>
        <p className="continue-sheet__sub">오늘 {continuesLeft}번 더 이어갈 수 있어요</p>

        <div className="continue-sheet__actions">
          <button
            type="button"
            className="continue-sheet__ad"
            disabled={ad.showing}
            onClick={() => {
              void watch();
            }}
            {...testId(TEST_IDS.continueWatch)}
          >
            <span className="continue-sheet__play" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              >
                <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="3" />
                <path d="M10.6 9.6l4.6 2.6-4.6 2.6z" fill="currentColor" stroke="none" />
              </svg>
            </span>
            {/*
              「광고」라는 글자가 버튼 안에 있어야 한다. 누르는 순간 무엇이 뜨는지 라벨이
              말하지 않으면 앱인토스 심사 규칙에 닿는다.

              무슨 말을 적을지는 종류가 정한다(`AD_BUTTON_LABEL`). 보상형에만
              「광고 보고 ~받기」를 쓴다. 전면형은 닫아도 답이 나오므로 그 말이 거짓이 된다.
            */}
            <span className="continue-sheet__ad-label">
              {AD_BUTTON_LABEL}{' '}
              <span className="continue-sheet__badge" {...testId(TEST_IDS.adBadge)}>
                광고
              </span>
            </span>
          </button>
          <p className="continue-sheet__note" role={ad.showing || bailed ? 'status' : undefined}>
            {ad.showing
              ? '광고를 불러오고 있어요'
              : bailed
                ? '광고를 끝까지 봐야 이어갈 수 있어요'
                : AD_KIND.continue === 'rewarded'
                  ? '광고가 끝나면 답변을 만들어 드려요'
                  : '광고가 먼저 나오고, 그다음 답변을 만들어요'}
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}
