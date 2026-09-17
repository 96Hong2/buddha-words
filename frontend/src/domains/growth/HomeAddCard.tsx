/**
 * 「홈에 추가하기」 안내.
 *
 * ── 왜 버튼 하나로 안 되나 ──────────────────────────────────────────────
 *
 * 앱인토스에 홈 추가를 부르는 API 가 없다. 사람이 상단 네비게이션의 더보기(⋯)를 눌러
 * 「홈 화면에 추가하기」를 직접 골라야 하고, 그 메뉴는 토스앱 5.246.0 부터 있다.
 *
 * 그래서 이 카드가 하는 일은 **어디를 눌러야 하는지 가리키는 것**뿐이다. 되지도 않는
 * 버튼을 큼직하게 두고 누르면 「직접 해 주세요」라고 말하는 쪽이 더 나쁘다.
 *
 * ── 어디에 두나 ──────────────────────────────────────────────────────
 *
 * 홈 입력칸 아래다. 시트로 덮지 않는다. 온보딩을 막 지난 사람이 처음 만나는 화면에서
 * 하려던 일(이야기 쓰기)을 가리면, 이 앱이 처음 하는 말이 부탁이 된다.
 *
 * 한 번 닫으면 다시 뜨지 않는다.
 */

import { useEffect } from 'react';

import { useAnalytics } from '../../shared/analytics';
import { markHomeAddDone } from '../../shared/prefs/milestones';
import { TEST_IDS, testId } from '../../shared/testIds';

import './growth.css';

export interface HomeAddCardProps {
  onClose: () => void;
}

export function HomeAddCard({ onClose }: HomeAddCardProps) {
  const analytics = useAnalytics();

  useEffect(() => {
    analytics.log('home_add_view', {}, { kind: 'impression', once: 'home_add_view' });
  }, [analytics]);

  function close(how: 'close' | 'later'): void {
    analytics.log('home_add_dismiss', { how }, { kind: 'click' });
    markHomeAddDone();
    onClose();
  }

  return (
    <div className="gr-card" {...testId(TEST_IDS.homeAdd)}>
      <div className="gr-card__top">
        <p className="gr-card__title">토스 홈에 두고 바로 열 수 있어요</p>
        <button
          type="button"
          className="gr-card__x"
          aria-label="닫기"
          onClick={() => close('close')}
          {...testId(TEST_IDS.homeAddClose)}
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/*
        경로를 글로만 적으면 「더보기」가 어느 것인지 못 찾는다. 점 셋을 그려 두면
        화면 위에 있는 그 모양과 눈으로 맞출 수 있다.
      */}
      <p className="gr-card__how">
        화면 맨 위{' '}
        <span className="gr-dots" aria-label="더보기">
          <i />
          <i />
          <i />
        </span>{' '}
        를 누르고 <b>홈 화면에 추가하기</b>
      </p>

      <button type="button" className="gr-card__later" onClick={() => close('later')}>
        다음에 할게요
      </button>
    </div>
  );
}
