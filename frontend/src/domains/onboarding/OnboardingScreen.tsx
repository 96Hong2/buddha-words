/**
 * 첫 실행에 한 번 보는 두 장.
 *
 * **사용법을 가르치는 화면이 아니다.** 「여기에 내 고민을 써도 되겠구나」를 이해하게 하는
 * 것이 전부다. 그래서 기능 설명도, 광고·결제 설명도, 모델 설명도 넣지 않는다.
 * 두 장을 넘기면 곧바로 입력 화면이다.
 *
 * 바텀시트가 아니라 화면 자체다. 진입하자마자 전면을 막는 시트는 플랫폼이 다크패턴으로 본다.
 * 첫 장부터 「둘러보기」로 건너뛸 수 있고, 뒤로가기는 앱을 닫는다(첫 화면의 정상 동작이다).
 */

import { useEffect, useRef, useState } from 'react';

import { elapsedBucket, useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';
import { artForScreen } from '../../shared/visual/scene';

import { markOnboardingSeen } from './onboardingStore';
import './onboarding.css';

const TOTAL_STEPS = 2;

export interface OnboardingScreenProps {
  /** 두 장을 다 봤거나 건너뛰었다. 부르는 쪽이 입력 화면으로 넘긴다 */
  onDone: () => void;
}

export function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const analytics = useAnalytics();
  // 진입 카드와 같은 새벽 연못 장면을 쓴다. 첫 화면 둘이 같은 자리에서 시작한다
  const art = artForScreen('entryCard');

  const [step, setStep] = useState(1);
  const startedAt = useRef(Date.now());
  const stepAt = useRef(Date.now());

  useEffect(() => {
    stepAt.current = Date.now();
    analytics.log(
      'onboarding_view',
      { step, total_steps: TOTAL_STEPS, variant: 'two_step' },
      { kind: 'screen', once: `onboarding_view:${step}` },
    );
  }, [analytics, step]);

  function finish() {
    markOnboardingSeen();
    analytics.log('onboarding_complete', {
      variant: 'two_step',
      elapsed_bucket_ms: elapsedBucket(Date.now() - startedAt.current),
    });
    onDone();
  }

  function next() {
    analytics.log(
      'onboarding_next',
      { step, elapsed_bucket_ms: elapsedBucket(Date.now() - stepAt.current) },
      { kind: 'click' },
    );
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      return;
    }
    finish();
  }

  function skip() {
    analytics.log('onboarding_skip', { step }, { kind: 'click' });
    markOnboardingSeen();
    onDone();
  }

  return (
    <main className="ob" {...testId(TEST_IDS.onboarding)}>
      <div className="ob-stage">
        <img src={art.src} alt={art.alt} />
      </div>

      {step === 1 ? (
        <div className="ob-copy" {...testId(TEST_IDS.onboardingStep1)}>
          <h1>마음에 걸리는 일이 있나요?</h1>
          <p>
            작은 일도 괜찮아요.
            <br />
            지금 가장 신경 쓰이는 일을 적어 주세요.
          </p>
        </div>
      ) : (
        <div className="ob-copy" {...testId(TEST_IDS.onboardingStep2)}>
          <h1>이야기에 맞는 가르침을 찾아 드려요</h1>
          <ul className="ob-list">
            <li>
              <span aria-hidden="true">🪷</span> 마음을 짚어 보고
            </li>
            <li>
              <span aria-hidden="true">📖</span> 실제 경전을 찾아
            </li>
            <li>
              <span aria-hidden="true">🌱</span> 오늘 해볼 일을 함께 정리해요
            </li>
          </ul>
          <p className="ob-hint">자세히 쓸수록 더 깊게 답해 드려요.</p>
        </div>
      )}

      <div className="ob-foot">
        <button
          type="button"
          className="ob-cta"
          onClick={next}
          {...testId(TEST_IDS.onboardingNext)}
        >
          {step === 1 ? '이야기해 볼게요' : '시작하기'}
        </button>
        <button
          type="button"
          className="ob-skip"
          onClick={skip}
          {...testId(TEST_IDS.onboardingSkip)}
        >
          둘러보기
        </button>
      </div>

      <div className="ob-dots" aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }, (_, index) => (
          <i key={index} className={index + 1 === step ? 'on' : undefined} />
        ))}
      </div>
    </main>
  );
}
