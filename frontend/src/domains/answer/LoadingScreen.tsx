import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { ApiFailure, messageFor, type ErrorCode } from '../../shared/api';
import { useApiClient } from '../../shared/api';
import { elapsedBucket, useAnalytics } from '../../shared/analytics';
import { useSession } from '../../shared/session';
import { sceneForScreen } from '../../shared/visual/scene';
import { TEST_IDS, testId } from '../../shared/testIds';
import { ROUTES } from '../../app/router';
import { useRewardedAd } from '../ads/useRewardedAd';
import { FLAGS } from '../../shared/flags';

import './answer.css';

/** 네 단계는 실제 진행에 묶여 있다. 앞 둘이 요청1, 뒤 둘은 답변 화면의 스켈레톤 자리다 */
export const PROGRESS_STEPS = [
  '이야기를 읽고 있어요',
  '마음의 핵심을 살펴보고 있어요',
  '닿아 있는 가르침을 찾고 있어요',
  '지금 상황에 맞게 풀고 있어요',
] as const;

const TITLES = ['이야기를\n읽고 있어요', '마음의 핵심을\n살펴보고 있어요'] as const;

const QUOTES = ['기다리는 동안 숨을 한 번 길게 쉬어 보세요', '서두르지 않아도 괜찮습니다'] as const;

/** 1 → 2 는 요청1 안에서 시간표로 넘어간다. 2 → 3 은 요청1 완료라는 실제 신호로 넘어간다 */
const STEP_TWO_MS = 2000;
/** 멈춘 화면을 만들지 않으려고 이 간격으로 하단 한 문장을 바꾼다 */
const QUOTE_TURN_MS = 4000;

/**
 * 지금 살아 있는 이야기의 멱등키.
 *
 * 요청1·요청2는 이 화면이 사라진 뒤에 도착한다. 그 사이에 사람이 홈으로 돌아가 다음 이야기를
 * 보냈으면, 늦게 온 답을 세션에 쓰는 순간 방금 받은 답변이 옛 답변으로 되돌아간다.
 * 사라진 화면의 ref 로는 다음 이야기가 시작된 것을 알 수 없어 화면 밖에 한 자리를 둔다.
 */
let liveKey: string | null = null;

function codeOf(reason: ApiFailure['reason']): ErrorCode {
  if (reason === 'timeout') return 'TIMEOUT';
  if (reason === 'offline') return 'OFFLINE';
  if (reason === 'budget') return 'BUDGET';
  return 'SERVER';
}

/** 지나온 단계에 체크가 남아 앞으로 나아간 것이 보인다. 대기 화면과 답변 화면이 같이 쓴다 */
export function StepList({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="steps" role="list">
      {steps.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'now' : 'todo';
        return (
          <li
            key={label}
            className={`step step--${state}`}
            aria-current={state === 'now' ? 'step' : undefined}
          >
            <span className="step__dot">
              {state === 'done' ? <CheckIcon /> : <span className="step__core" />}
            </span>
            <span className="step__text">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.6 8.4l2.9 2.9 5.9-6.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LotusMark() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      <path d="M10 3.4c1.7 1.8 2.5 3.6 2.5 5.5 0 1.4-.8 2.8-2.5 4.1-1.7-1.3-2.5-2.7-2.5-4.1 0-1.9.8-3.7 2.5-5.5z" />
      <path d="M4.9 6.8c2 .6 3.4 1.7 4.2 3.3.6 1.2.5 2.6-.2 4.2-2-.5-3.4-1.4-4.1-2.6-1-1.6-.9-3.3.1-4.9z" />
      <path d="M15.1 6.8c1 1.6 1.1 3.3.1 4.9-.7 1.2-2.1 2.1-4.1 2.6-.7-1.6-.8-3-.2-4.2.8-1.6 2.2-2.7 4.2-3.3z" />
    </svg>
  );
}

/**
 * 답변을 만드는 동안 보는 화면.
 *
 * 여기서 요청1을 부르고, 종류에 따라 갈라 보낸다. 요청2는 답변 화면으로 넘어간 뒤에
 * 이어서 부른다.
 *
 * ── 광고는 요청과 **나란히** 돈다 ───────────────────────────────────
 *
 * 광고를 띄우고 나서 요청을 보내면 기다리는 시간이 광고만큼 길어진다. 그래서 제출은
 * 화면이 뜨는 즉시 나가고, 광고는 그 위를 덮는다. 사람이 광고를 보는 20초가 원래
 * 비어 있던 대기 시간이라 **답이 늦어지지 않는다.**
 *
 * 광고를 닫았을 때 답이 아직이면 이 화면이 그대로 이어진다. 답이 이미 왔으면 그 사이
 * 화면이 넘어가 있어 광고를 닫는 순간 답변이 보인다. 둘 다 따로 처리할 것이 없다.
 *
 * 답이 먼저 도착했으면 광고를 띄우지 않는다. 다 만든 답을 광고로 막는 것은 기다리는
 * 시간을 채우는 일이 아니라 길을 막는 일이다.
 *
 * ⚠ **이 자리는 네 광고 자리 중 사람이 누르지 않는 유일한 곳이라 심사 위험이 있다.**
 * `VITE_FLAG_GENERATION_AD=off` 로 이 자리만 끈다. 근거는 `shared/flags/flags.ts`.
 */
export function LoadingScreen() {
  const client = useApiClient();
  const analytics = useAnalytics();
  const navigate = useNavigate();
  const { sent, idempotencyKey, setResponse } = useSession();

  const [stage, setStage] = useState(0);
  const [quote, setQuote] = useState(0);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  /** StrictMode 가 효과를 두 번 돌려도 같은 멱등키로 두 번 보내지 않는다 */
  const submittedKey = useRef<string | null>(null);
  const scene = sceneForScreen('loading');

  const ad = useRewardedAd('generation');
  /** 답이 왔거나 실패로 끝났나. 광고를 띄우기 전에 이 값을 본다 */
  const settledAnswer = useRef(false);
  /** 광고를 이미 한 번 띄웠나. 한 번 기다리는 동안 한 번이다 */
  const adShown = useRef(false);
  /** 광고가 화면을 덮고 있나. 앱을 떠난 것으로 잘못 세지 않으려고 본다 */
  const adCovering = useRef(false);

  const submit = useCallback(async () => {
    const startedAt = Date.now();
    // 이 제출의 키. 아래에서 답이 올 때마다 아직 이 이야기가 화면의 주인인지 이 값으로 본다
    const myKey = idempotencyKey;
    liveKey = myKey;
    try {
      const response = await client.submitConcern({
        text: sent,
        idempotencyKey: myKey,
      });
      // 답이 왔다. 아직 안 띄운 광고는 이제 띄우지 않는다
      settledAnswer.current = true;
      if (response.responseType === 'light') {
        analytics.log('answer_generated', {
          answer_id: response.answerId,
          pass: 'light',
          elapsed_bucket_ms: elapsedBucket(Date.now() - startedAt),
          regenerated: false,
        });
      } else if (response.responseType === 'answer') {
        analytics.log('answer_generated', {
          answer_id: response.answerId,
          route: response.route,
          pass: 1,
          elapsed_bucket_ms: elapsedBucket(Date.now() - startedAt),
          regenerated: false,
        });
        /**
         * 어느 갈래로 어떤 등급의 모델이 돌았나.
         *
         * 이 값이 없으면 「Deep 답을 받은 사람이 Normal 보다 더 오래 남는가」도,
         * 「비싼 등급이 그 값을 하는가」도 물어볼 수 없다. `answer_id` 로 만족도·완독률·
         * 공유·리텐션에 이어 붙인다.
         *
         * 등급은 갈래가 정한다(DEEP=premium, 나머지=cheap). 예산이 몰려 내려간 판은
         * 서버가 `routeNote` 로 밝히므로 그때는 내려간 값으로 적는다. 지어내지 않는다.
         * 값 자체(토큰·달러)는 기기가 모른다. 그쪽은 서버의 `llm_spend` 로그가 남긴다.
         */
        const downgraded = response.routeNote === 'downgraded_budget';
        analytics.log('model_route', {
          route: response.route,
          model_tier: response.route === 'deep' && !downgraded ? 'premium' : 'cheap',
          use_rag: true,
          confidence_bucket: undefined,
          floor_applied: downgraded,
        });
      }

      // 기다리는 동안 다음 이야기가 시작됐으면 이 답은 화면에 올리지 않는다.
      // 답이 만들어진 것은 사실이라 위 기록은 그대로 남긴다.
      if (liveKey !== myKey) return;

      setResponse(response);

      if (response.responseType === 'crisis') {
        navigate(ROUTES.crisis, { replace: true });
        return;
      }

      navigate(ROUTES.answer, { replace: true });
      if (response.responseType !== 'answer') return;

      // 요청2는 화면이 넘어간 뒤에 이어서 돈다. 받는 자리는 세션이라 이 화면이 사라져도 남는다.
      const pass2StartedAt = Date.now();
      try {
        const pass2 = await client.fetchPass2({
          answerId: response.answerId,
          idempotencyKey: myKey,
          text: sent,
        });
        // 60초까지 기다리는 요청이다. 그 사이 다음 이야기가 시작됐으면 세션에 쓰지 않는다
        if (liveKey === myKey) setResponse({ ...response, pass2 });
        if (pass2.status === 'done') {
          analytics.log('answer_generated', {
            answer_id: response.answerId,
            route: response.route,
            pass: 2,
            elapsed_bucket_ms: elapsedBucket(Date.now() - pass2StartedAt),
            regenerated: false,
          });
        } else {
          analytics.log('answer_failed', {
            route: response.route,
            pass: 2,
            reason: 'provider',
          });
        }
      } catch (error) {
        if (liveKey === myKey) {
          setResponse({
            ...response,
            pass2: { status: 'failed', retryable: true },
          });
        }
        analytics.log('answer_failed', {
          route: response.route,
          pass: 2,
          reason: error instanceof ApiFailure ? error.reason : 'provider',
        });
      }
    } catch (error) {
      settledAnswer.current = true;
      const failed =
        error instanceof ApiFailure ? error : new ApiFailure('provider', '보내지 못했어요.');
      analytics.log('answer_failed', { pass: 1, reason: failed.reason });
      if (failed.quota != null) {
        // 오늘 천장에 닿았다. 여기에 오류 화면을 그리면 「다시 해보기」를 몇 번 눌러도 같은
        // 자리에 남는다. 사용량을 읽고 쓰는 일은 quota 도메인 몫이라 app 층인 홈으로 넘겨
        // 서버가 센 값을 적게 하고, 홈이 천장 안내를 그린다. 적은 글은 그대로 남는다
        navigate(ROUTES.home, { replace: true, state: { exhaustedQuota: failed.quota } });
        return;
      }
      setFailure(failed);
    }
  }, [analytics, client, idempotencyKey, navigate, sent, setResponse]);

  /**
   * 답을 만드는 중에 앱을 떠났나.
   *
   * 생성이 20초를 넘기는 일이 있는데, 그동안 기다리지 못하고 나가는 사람이 얼마나 되는지
   * 몰랐다. 여기가 「답변 생성 시간이 길어질수록 이탈하는가」에 답하는 유일한 자리다.
   * 답이 도착해 화면이 넘어간 뒤에는 세지 않는다.
   */
  const waitingFrom = useRef(0);
  const settled = useRef(false);

  useEffect(() => {
    waitingFrom.current = Date.now();
    function onHide() {
      if (document.visibilityState !== 'hidden' || settled.current) return;
      // 전면 광고가 덮으면 WebView 도 숨겨진다. 그것을 나간 것으로 세면 이 지표가 통째로 망가진다
      if (adCovering.current) return;
      settled.current = true;
      analytics.log('friction_generation_abandon', {
        route: 'unknown',
        elapsed_bucket_ms: elapsedBucket(Date.now() - waitingFrom.current),
      });
    }
    document.addEventListener('visibilitychange', onHide);
    return () => {
      settled.current = true;
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [analytics]);

  useEffect(() => {
    // 적은 글 없이 이 화면에 들어올 수는 없다. 새로고침으로 들어오면 홈으로 돌린다.
    if (sent.trim() === '' || idempotencyKey === '') {
      navigate(ROUTES.home, { replace: true });
      return;
    }
    if (submittedKey.current === idempotencyKey) return;
    submittedKey.current = idempotencyKey;
    void submit();
  }, [idempotencyKey, navigate, sent, submit]);

  /**
   * 기다리는 동안 광고를 한 번 덮는다.
   *
   * 제출은 위 효과에서 이미 나갔다. 여기서 기다리게 만드는 것은 아무것도 없고, 답이
   * 오는 길과 광고가 도는 길이 서로를 막지 않는다.
   *
   * 못 띄우는 기기·광고 그룹 id 가 없는 번들에서는 `supported` 가 false 라 이 효과가
   * 통째로 지나간다. 그때는 예전처럼 대기 화면만 보인다.
   */
  useEffect(() => {
    // 심사에서 걸릴 수 있는 자리라 한 줄로 끌 수 있다. 꺼도 나머지 세 자리는 그대로 돈다
    if (!FLAGS.generationAd) return;
    if (adShown.current || !ad.ready || !ad.supported) return;
    if (settledAnswer.current || failure != null) return;
    adShown.current = true;
    adCovering.current = true;
    void ad.show().finally(() => {
      adCovering.current = false;
    });
  }, [ad, failure]);

  useEffect(() => {
    if (failure != null) return;
    const toStepTwo = window.setTimeout(() => setStage(1), STEP_TWO_MS);
    const turning = window.setInterval(() => setQuote((n) => n + 1), QUOTE_TURN_MS);
    return () => {
      window.clearTimeout(toStepTwo);
      window.clearInterval(turning);
    };
  }, [failure]);

  function retry() {
    setFailure(null);
    setStage(0);
    setQuote(0);
    // 같은 멱등키로 다시 부른다. 오늘 남은 횟수가 다시 줄지 않는다.
    void submit();
  }

  if (failure != null) {
    return (
      <div className="ans" {...testId(TEST_IDS.loading)}>
        {failure.reason === 'offline' && (
          <div className="net-banner">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 4l18 16" />
              <path d="M5.2 9.2a13 13 0 0 1 3.6-2.2" />
              <path d="M13.4 7.1a13 13 0 0 1 5.4 2.1" />
              <path d="M8 12.6a8.6 8.6 0 0 1 2.2-1.2" />
              <path d="M16 12.6a8.6 8.6 0 0 0-1.6-1" />
              <path d="M12 17.8h.01" />
            </svg>
            인터넷이 끊겼어요. 연결되면 이어서 할 수 있어요
          </div>
        )}

        <div className="state" role="alert" {...testId(TEST_IDS.errorState)}>
          <div className="state-art" aria-hidden="true">
            <LotusMark />
          </div>
          <h2 className="h-screen">지금은 답을 만들지 못했어요</h2>
          <p className="lead">{messageFor(codeOf(failure.reason))}</p>
          <div className="state-note">
            <span className="chip-note">
              <span className="ic" aria-hidden="true">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9.5 17 4 11.6" />
                </svg>
              </span>
              쓰신 이야기는 그대로 있어요. 다시 보내도 오늘 남은 횟수는 줄지 않아요
            </span>
          </div>
        </div>

        <div className="foot">
          <button
            type="button"
            className="btn btn--solid"
            onClick={retry}
            {...testId(TEST_IDS.retry)}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 12a8 8 0 1 1-2.6-5.9" />
              <path d="M20 4v4.4h-4.4" />
            </svg>
            다시 해보기
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate(ROUTES.home, { replace: true })}
          >
            닫기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ans" {...testId(TEST_IDS.loading)}>
      <div className="wait">
        <div className="wait__top" />

        <div className="buddha-frame">
          <img src={scene?.src} alt="찻잔을 든 부처" />
        </div>

        <p
          className="wait__title"
          key={stage}
          aria-live="polite"
          {...testId(TEST_IDS.loadingLabel)}
        >
          {TITLES[stage]}
        </p>

        <StepList steps={PROGRESS_STEPS} current={stage} />

        <div className="wait__bottom" />
        <p className="wait__quote">{QUOTES[quote % QUOTES.length]}</p>
      </div>

      <div className="ripple-band" aria-hidden="true" />
    </div>
  );
}
