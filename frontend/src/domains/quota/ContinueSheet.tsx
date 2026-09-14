/**
 * 같은 날 두 번째 고민부터 전송을 누르면 먼저 열리는 시트.
 *
 * 출구가 셋이다: 광고를 보고 이어가기 · 오늘 답변 다시 보기 · 닫기. 손잡이·바깥·뒤로가기로도 닫힌다.
 * 광고를 못 띄우는 기기에서는 이 시트를 열지 않고 그냥 이어간다. 부르는 쪽이
 * `useRewardedAd('continue').supported` 를 먼저 보고, 잊었더라도 여기서 한 번 더 막는다.
 *
 * 「광고」라는 글자는 버튼 안 배지 하나로 끝낸다. 앞서 무료로 준 것을 세는 문장을 쓰지 않는다.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

import { useOverlayBackClose } from '../../app/providers';
import { ROUTES } from '../../app/router';
import { useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';
import { BottomSheet } from '../../shared/ui';
import { useRewardedAd } from '../ads/useRewardedAd';

import './quota.css';

const TITLE = '이야기를 이어가 볼까요?';

export interface ContinueSheetProps {
  open: boolean;
  /** 오늘 남은 이어가기 횟수 */
  continuesLeft: number;
  /** 오늘 이미 이어간 횟수. 로그에만 쓴다 */
  continuesUsed: number;
  onClose: () => void;
  /** 광고를 끝까지 봤을 때. 여기서 전송을 잇는다 */
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
  const navigate = useNavigate();
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

  async function watch(): Promise<void> {
    const earned = await ad.show();
    if (earned) onContinue();
  }

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={TITLE} className="continue-sheet">
      <div {...testId(TEST_IDS.continueSheet)}>
        <h2 className="continue-sheet__title">{TITLE}</h2>
        <p className="continue-sheet__sub">
          짧은 영상이 끝나면 바로 이어서 들어 드릴게요 (오늘 {continuesLeft}번 남았어요)
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
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="3" />
              <path d="M10.6 9.6l4.6 2.6-4.6 2.6z" fill="currentColor" stroke="none" />
            </svg>
            <span className="continue-sheet__badge" {...testId(TEST_IDS.adBadge)}>
              광고
            </span>
            보고 이야기 이어가기
          </button>
          <p className="continue-sheet__note">
            끝까지 보면 바로 이어가요. 중간에 닫으면 이 자리로 돌아와요
          </p>

          <button
            type="button"
            className="continue-sheet__ghost"
            onClick={() => {
              onClose();
              void navigate(ROUTES.answer);
            }}
          >
            오늘 답변 다시 보기
          </button>
          <button type="button" className="continue-sheet__plain" onClick={onClose}>
            닫기
          </button>
        </div>

        <p className="continue-sheet__hint">닫아도 적은 글은 그대로 남아 있어요</p>
      </div>
    </BottomSheet>
  );
}
