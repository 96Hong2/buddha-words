/**
 * 같은 날 두 번째 고민부터 전송을 누르면 먼저 열리는 시트.
 *
 * 출구는 하나다: 광고를 보고 답을 받는 것. 나가는 길은 손잡이·바깥·뒤로가기다.
 * 「오늘 답변 다시 보기」와 「닫기」 버튼은 없앴다. 바깥을 누르면 닫히는 시트에 닫기 버튼을
 * 또 두면, 정작 눌러야 할 하나가 셋 중 하나로 보인다.
 *
 * 광고를 못 띄우는 기기에서는 이 시트를 열지 않고 그냥 이어간다. 부르는 쪽이
 * `useRewardedAd('continue').supported` 를 먼저 보고, 잊었더라도 여기서 한 번 더 막는다.
 *
 * ── 광고가 도는 동안 답을 만든다 ─────────────────────────────────────
 *
 * 예전에는 광고를 **끝까지 본 뒤에** 요청을 보냈다. 30초를 보고 나서 답을 또 20초 기다리는
 * 셈이라, 광고를 다 본 사람이 빈 화면 앞에서 한 번 더 기다렸다.
 *
 * 지금은 광고를 틀고 5초가 지나면 답을 만들기 시작한다. 광고가 끝날 즈음 답이 와 있다.
 * 5초를 못 채우고 닫은 사람에게는 모델을 돌리지 않는다. 광고를 보지 않기로 한 사람의
 * 답을 만들어 두는 것은 비용만 쓰고 아무도 읽지 않는다.
 *
 * 왜 5초인가: 광고가 뜨자마자 닫는 사람과 끝까지 보는 사람이 갈리는 자리다. 그보다 길게
 * 잡으면 답을 만들 시간이 모자라 광고가 끝나도 또 기다린다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { immediateBucket, useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';
import { BottomSheet } from '../../shared/ui';
import { useRewardedAd, type AdOutcome } from '../ads/useRewardedAd';

import './quota.css';

const TITLE = '이야기를 이어가 볼까요?';

/** 광고를 틀고 이만큼 지나면 답을 만들기 시작한다 */
const COMMIT_AFTER_MS = 5000;

export interface ContinueSheetProps {
  open: boolean;
  /** 오늘 남은 이어가기 횟수 */
  continuesLeft: number;
  /** 오늘 이미 이어간 횟수. 로그에만 쓴다 */
  continuesUsed: number;
  onClose: () => void;
  /** 답을 만들기 시작한다. 광고는 아직 돌고 있을 수 있다 */
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
  /** 광고를 부르지 못했다. 누른 사람에게 아무 말도 없이 있으면 고장으로 읽힌다 */
  const [failed, setFailed] = useState(false);

  useOverlayBackClose(open, onClose);

  useEffect(() => {
    if (!open) {
      logged.current = false;
      setFailed(false);
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
    setFailed(false);
    const startedAt = Date.now();

    let started = false;
    const startAnswer = () => {
      if (started) return;
      started = true;
      analytics.log('ad_answer_early_start', { placement: 'continue' });
      onContinue();
    };

    const timer = window.setTimeout(startAnswer, COMMIT_AFTER_MS);
    let outcome: AdOutcome = 'noFill';
    try {
      outcome = await ad.show();
    } finally {
      window.clearTimeout(timer);
    }
    if (started) return;

    /*
      타이머가 안 돌았는데 여기까지 왔다.

      전면 광고가 WebView 를 덮는 동안 타이머가 눌리는 기기가 있어서, 광고가 끝나고 나서야
      이 줄에 닿기도 한다. 그때는 실제로 지난 시간을 보고 판단한다. 시계는 눌리지 않는다.
    */
    const elapsed = Date.now() - startedAt;
    if (outcome === 'watched' || elapsed >= COMMIT_AFTER_MS) {
      startAnswer();
      return;
    }

    /*
      광고가 한 장도 안 왔다. **우리 쪽 사정으로 사람을 막지 않는다.**

      여기서 멈추면 광고를 못 받는 기기에서는 같은 버튼을 몇 번 눌러도 답을 못 받고, 시트
      바깥을 누를 줄 아는 사람만 빠져나간다. 막다른 구조다. 그냥 이어가고 이유를 남긴다.
    */
    if (outcome === 'noFill') {
      analytics.log('ad_skipped', { placement: 'continue', reason: 'no_fill' });
      onContinue();
      return;
    }

    // 사람이 5초를 못 채우고 닫았다. 보기 싫다는 뜻이라 모델을 돌리지 않는다
    analytics.log('ad_bail_early', {
      placement: 'continue',
      within_bucket_s: immediateBucket(elapsed),
    });
    setFailed(true);
  }, [ad, analytics, onContinue]);

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={TITLE} className="continue-sheet">
      <div {...testId(TEST_IDS.continueSheet)}>
        <h2 className="continue-sheet__title">{TITLE}</h2>
        <p className="continue-sheet__sub">
          광고가 나오는 동안 답변을 만들어 둘게요 (오늘 {continuesLeft}번 더 이어갈 수 있어요)
        </p>

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
              **초를 반드시 적는다.** 얼마나 참아야 하는지 모르는 채로 전면 광고를 만나면
              사람은 중간에 닫는다. 「광고」라는 글자도 버튼 안에 있어야 한다.
              누르는 순간 무엇이 뜨는지 라벨이 말하지 않으면 앱인토스 심사 규칙에 닿는다.
            */}
            <span className="continue-sheet__ad-label">
              답변 만드는 동안 30초{' '}
              <span className="continue-sheet__badge" {...testId(TEST_IDS.adBadge)}>
                광고
              </span>{' '}
              보고 답변 받기
            </span>
          </button>
          <p className="continue-sheet__note" role={failed ? 'status' : undefined}>
            {/*
              여기 오는 사람은 광고를 스스로 닫은 사람뿐이다(광고가 안 온 쪽은 그냥 이어간다).
              나갈 길도 함께 적는다. 닫기 버튼은 없앴고, 바깥을 눌러 닫는 것을 모르는 사람이 있다.
            */}
            {failed
              ? '아직 답변을 만들지 않았어요. 다시 누르거나, 빈 곳을 눌러 닫으세요'
              : '광고가 끝나면 답변을 보여드려요'}
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}
