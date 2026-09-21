/**
 * 홈 맨 앞에 서는 리뷰 청하기 카드.
 *
 * ── 왜 여기인가 ───────────────────────────────────────────────────────────
 *
 * 앱인토스가 「추천 미니앱」을 UX · 실사용 지표 · **리뷰** · 성능 넷으로 가르는데
 * 그 셋째 칸이 비어 있었다. 리뷰를 한 번도 청한 적이 없으니 쌓일 자리가 없었다.
 *
 * 덮개를 쓰지 않는다. 이 저장소의 절대 규칙 7번이 「진입 즉시 바텀시트 없음」이고,
 * 부탁하는 말일수록 그 선을 먼저 지켜야 한다. 대신 제목 바로 아래 가장 먼저 읽히는
 * 자리에 세우고, 닫는 길을 카드 안에 둔다.
 *
 * ── 누구에게 ─────────────────────────────────────────────────────────────
 *
 * **답을 두 번 이상 받아 본 사람에게만.** 한 번 써 본 사람은 이 앱이 무엇인지 아직
 * 모르고, 그 사람에게 별점을 물으면 낮은 점수가 아니라 아무 점수도 안 나온다.
 * 판정은 `shared/prefs/review` 가 하고 이 컴포넌트는 받은 대로 그린다.
 */

import { useEffect, useRef, type MouseEvent } from 'react';

import { useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';

import './growth.css';

export interface ReviewCardProps {
  /** 띄울 때만 true. 판정은 부르는 쪽이 한다 */
  open: boolean;
  /** 지금까지 받은 답의 수. 로그에만 쓴다 */
  answersTotal: number;
  /** 「별점 남기기」를 눌렀다. 리뷰 화면을 여는 일은 부르는 쪽이 한다 */
  onAccept: () => void;
  /** 「나중에」. 답을 두 번 더 받으면 한 번 더 묻는다 */
  onLater: () => void;
}

export function ReviewCard({ open, answersTotal, onAccept, onLater }: ReviewCardProps) {
  const analytics = useAnalytics();
  const seen = useRef(false);

  useEffect(() => {
    if (!open || seen.current) return;
    seen.current = true;
    analytics.log(
      'review_card_view',
      { answers_total: answersTotal },
      { kind: 'impression', once: 'review_card_view' },
    );
  }, [analytics, answersTotal, open]);

  if (!open) return null;

  /** 누르는 동안 초점이 입력칸에서 빠지지 않게 한다. 자세한 이유는 아래 주석 */
  function keepFocus(event: MouseEvent) {
    event.preventDefault();
  }

  return (
    <div className="review-card" role="group" aria-label="리뷰 남기기" {...testId(TEST_IDS.reviewCard)}>
      <div className="review-card__head">
        <span className="review-card__stars" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <svg key={i} viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z" />
            </svg>
          ))}
        </span>
        <p className="review-card__title">여기서 만난 말이 도움이 되었나요?</p>
      </div>

      <p className="review-card__body">
        별점을 남겨 주시면 같은 마음인 분들이 이 앱을 찾기 쉬워져요.
      </p>

      {/*
        두 버튼 다 누르는 동안 **입력칸의 초점을 빼앗지 않는다.**

        초점이 빠지면 홈 제목이 두 줄로 펴지면서 아래가 통째로 밀린다. 그러면 누르던
        버튼이 손가락 밑에서 비켜나 mouseup 이 엉뚱한 곳에 닿는다. 예시 칩이 같은 이유로
        이미 이 처리를 하고 있다. e2e 가 이것을 먼저 잡았고, 실기기에서도 같은 일이 난다.
      */}
      <div className="review-card__actions" onMouseDown={keepFocus}>
        <button
          type="button"
          className="review-card__go"
          onClick={onAccept}
          {...testId(TEST_IDS.reviewCardAccept)}
        >
          별점 남기기
        </button>
        <button
          type="button"
          className="review-card__later"
          onClick={onLater}
          {...testId(TEST_IDS.reviewCardLater)}
        >
          나중에
        </button>
      </div>
    </div>
  );
}
