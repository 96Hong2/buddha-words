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
 * ── 광고와 답을 떼어 놓는다 ─────────────────────────────────────────
 *
 * 이 자리 광고는 **전면형**이고, **광고를 끝까지 봤는지와 답을 주는지는 아무 관계가 없다.**
 * 앱인토스 광고 정책이 「광고 소비를 보상과 직접 연결하는 구조」를 금지하고, 광고를 봐야
 * 무언가를 주는 구조는 보상형(`userEarnedReward` 때만 지급)에만 허용된다. 예전에는 보상형
 * 30초를 끝까지 봐야 했는데 실기기에서 너무 길었다. 그래서 짧은 전면형으로 바꾸고 답을
 * 광고와 떼었다. 광고를 곧바로 닫아도 답은 나온다.
 *
 * 순서는 지킨다: **광고가 화면에 뜬 순간** 답을 만들기 시작하고 대기 화면으로 넘어간다.
 * 광고를 불러오는 동안은 시트에 머문다. 먼저 넘어가면 답을 읽는 도중에 광고가 뒤늦게 덮는다.
 * 광고가 안 오면(불러오기 시간 초과 포함) 광고 없이 넘어간다.
 */

import { useCallback, useEffect, useRef } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';
import { BottomSheet } from '../../shared/ui';
import { useRewardedAd, type AdOutcome } from '../ads/useRewardedAd';

import './quota.css';

const TITLE = '이야기를 이어가 볼까요?';

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

  const watch = useCallback(async (): Promise<void> => {
    let started = false;
    const startAnswer = () => {
      if (started) return;
      started = true;
      onContinue();
    };

    const outcome: AdOutcome = await ad.show(undefined, { onShown: startAnswer });
    if (outcome === 'noFill' && !started) {
      analytics.log('ad_skipped', { placement: 'continue', reason: 'no_fill' });
    }
    // 뜬 순간을 못 받았어도 광고가 끝났으면 답으로 간다. 닫은 사람도 똑같다
    startAnswer();
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

              「광고 보고 답변 받기」라고 쓰지 않는다. 그 말은 광고를 봐야 답을 준다는
              뜻이고, 그런 구조는 보상형에만 허용된다. 이 자리는 광고와 답이 따로 간다.
              초도 적지 않는다. 전면형이 몇 초 뜨는지는 문서에 없다.
            */}
            <span className="continue-sheet__ad-label">
              답변 받기{' '}
              <span className="continue-sheet__badge" {...testId(TEST_IDS.adBadge)}>
                광고
              </span>
            </span>
          </button>
          <p className="continue-sheet__note" role={ad.showing ? 'status' : undefined}>
            {ad.showing ? '광고를 불러오고 있어요' : '광고가 먼저 나오고, 그동안 답변을 만들어요'}
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}
