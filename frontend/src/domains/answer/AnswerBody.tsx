import { useEffect, useState, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router';

import { useAnalytics } from '../../shared/analytics';
import {
  ApiFailure,
  useApiClient,
  type ApiAnswer,
  type EmotionTag,
  type Term,
} from '../../shared/api';
import { useSession } from '../../shared/session';
import { TEST_IDS, testId } from '../../shared/testIds';
import { ROUTES } from '../../app/router';

import { elapsedBucket } from './buckets';
import { ExtensionCard } from './ExtensionCard';
import { PROGRESS_STEPS, StepList } from './LoadingScreen';
import { ScriptureCard } from './ScriptureCard';

/** 태그 색은 토큰이 정한 계열을 따른다. 색이 매번 달라지면 태그가 신호가 아니라 장식이 된다 */
const TAG: Record<EmotionTag, { ko: string; tone: 'sage' | 'lotus' | 'neutral' }> = {
  anxiety: { ko: '불안', tone: 'sage' },
  confusion: { ko: '혼란', tone: 'sage' },
  comparison: { ko: '비교', tone: 'lotus' },
  approval: { ko: '인정욕구', tone: 'lotus' },
  attachment: { ko: '집착', tone: 'lotus' },
  loneliness: { ko: '외로움', tone: 'lotus' },
  anger: { ko: '분노', tone: 'neutral' },
  regret: { ko: '후회', tone: 'neutral' },
  emptiness: { ko: '공허', tone: 'neutral' },
  fatigue: { ko: '피로', tone: 'neutral' },
  other: { ko: '복잡함', tone: 'neutral' },
};

const ROUTE_NOTE = {
  promoted_topic: '짧게 쓰셨지만 중요한 이야기라 깊게 봤어요',
  downgraded_budget: '지금은 답변이 몰려서 간단한 풀이로 드렸어요',
} as const;

const DEEP_NOTE = '이야기를 자세히 들려줘서, 더 깊이 풀어 봤어요';

/** 요청2를 기다리는 동안 4초마다 바뀌는 자리. 20초 동안 멈춘 화면을 만들지 않는다 */
const PENDING_TURN_MS = 4000;
const NOTE_EARLY = '쓰신 이야기를 하나씩 짚어 이 아래에 이어서 적어 드려요';
const NOTE_LATE = '이 화면을 나가도 답은 그대로 남아 있어요. 홈에서 다시 열 수 있어요';

function subjectParticle(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  const hasFinal = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return hasFinal ? '이' : '가';
}

function LotusMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      <path d="M10 3.4c1.7 1.8 2.5 3.6 2.5 5.5 0 1.4-.8 2.8-2.5 4.1-1.7-1.3-2.5-2.7-2.5-4.1 0-1.9.8-3.7 2.5-5.5z" />
      <path d="M4.9 6.8c2 .6 3.4 1.7 4.2 3.3.6 1.2.5 2.6-.2 4.2-2-.5-3.4-1.4-4.1-2.6-1-1.6-.9-3.3.1-4.9z" />
      <path d="M15.1 6.8c1 1.6 1.1 3.3.1 4.9-.7 1.2-2.1 2.1-4.1 2.6-.7-1.6-.8-3-.2-4.2.8-1.6 2.2-2.7 4.2-3.3z" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" />
      <path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4l2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z" />
    </svg>
  );
}

/** 요청2가 아직 오지 않은 자리. 진행 막대도 남은 시간도 그리지 않는다 */
function PendingBlock() {
  const [turn, setTurn] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTurn((n) => n + 1), PENDING_TURN_MS);
    return () => window.clearInterval(id);
  }, []);

  const seconds = turn * (PENDING_TURN_MS / 1000);
  const late = seconds >= 16;
  const line =
    seconds >= 20
      ? '거의 다 됐어요'
      : late
        ? '이야기가 길어서 조금 더 걸려요'
        : '지금 상황에 맞게\n풀어보고 있어요';
  // 20초를 넘겨도 네 초마다 한 줄은 바뀐다. 멈춘 화면을 만들지 않는다
  const note = turn % 2 === 1 ? NOTE_LATE : NOTE_EARLY;

  return (
    <section className={late ? 'pending pending--late' : 'pending'}>
      <div className="pending__lotus">
        <LotusMark size={54} />
      </div>
      <p className="pending__line" key={line} aria-live="polite">
        {line}
      </p>
      <p className="pending__note">{note}</p>
      <span className="dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>

      <StepList steps={PROGRESS_STEPS.slice(2)} current={seconds >= 8 ? 1 : 0} />

      <div className="skel" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

export interface AnswerBodyProps {
  answer: ApiAnswer;
  /** ⑦ 마지막 한마디. 하단 고정 바가 이 자리를 보고 올라온다 */
  closingRef?: RefObject<HTMLDivElement | null>;
  onShare?: () => void;
  onSave?: () => void;
  /** 보상형 광고를 띄운다. 끝까지 봤으면 true */
  onWatchAd?: () => Promise<boolean>;
  /** 광고 지원 여부 판정이 끝났나 */
  adReady?: boolean;
  /** 이 기기에서 광고를 띄울 수 있나. 못 띄우면 Extension 자리를 아예 두지 않는다 */
  adSupported?: boolean;
}

/** 7블록 v0.3 순서 그대로. 면(카드)은 네 번만 바뀐다 */
export function AnswerBody({
  answer,
  closingRef,
  onShare,
  onSave,
  onWatchAd,
  adReady,
  adSupported = true,
}: AnswerBodyProps) {
  const client = useApiClient();
  const analytics = useAnalytics();
  const navigate = useNavigate();
  const { sent, idempotencyKey, setResponse } = useSession();

  const [retrying, setRetrying] = useState(false);
  const [helpful, setHelpful] = useState<'yes' | 'unsure' | null>(null);
  const [reported, setReported] = useState(false);

  const pass2 = answer.pass2;
  const scripture = answer.scriptures[0];
  const terms: Term[] = pass2.status === 'done' ? (pass2.terms ?? scripture.terms ?? []) : [];
  const note =
    answer.routeNote != null
      ? ROUTE_NOTE[answer.routeNote]
      : answer.route === 'deep'
        ? DEEP_NOTE
        : null;

  async function retryPass2() {
    setRetrying(true);
    const startedAt = Date.now();
    try {
      // 같은 멱등키로 요청2만 다시 부른다. 오늘 남은 횟수가 다시 줄지 않는다.
      const next = await client.fetchPass2({
        answerId: answer.answerId,
        idempotencyKey,
        text: sent,
      });
      setResponse({ ...answer, pass2: next });
      if (next.status === 'done') {
        analytics.log('answer_generated', {
          answer_id: answer.answerId,
          route: answer.route,
          pass: 2,
          elapsed_bucket_ms: elapsedBucket(Date.now() - startedAt),
          regenerated: true,
        });
      } else {
        analytics.log('answer_failed', {
          route: answer.route,
          pass: 2,
          reason: 'provider',
        });
      }
    } catch (error) {
      analytics.log('answer_failed', {
        route: answer.route,
        pass: 2,
        reason: error instanceof ApiFailure ? error.reason : 'provider',
      });
    } finally {
      setRetrying(false);
    }
  }

  function report() {
    setReported(true);
    analytics.log(
      'answer_report',
      { answer_id: answer.answerId, reason_code: 'uncomfortable' },
      { kind: 'click' },
    );
  }

  return (
    <div className="doc">
      {/* 묶음 A · ① 마음 태그 */}
      <section className="block" {...testId(TEST_IDS.answerTags)}>
        <div className="tags">
          {answer.emotionTags.map((tag) => (
            <span key={tag} className={`tag tag--${TAG[tag].tone}`}>
              #{TAG[tag].ko}
            </span>
          ))}
        </div>
        <p className="tag-line">
          지금 마음의 중심에는 <b>{TAG[answer.emotionTags[0]].ko}</b>
          {subjectParticle(TAG[answer.emotionTags[0]].ko)} 있어 보여요.
        </p>
      </section>

      {/* 묶음 A · ② 오늘의 부처의 말 */}
      <section className="block block--tight">
        {note != null && (
          <p className="deep-note">
            <SparkIcon />
            {note}
          </p>
        )}
        <div className="today" {...testId(TEST_IDS.buddhaMessage)}>
          <p className="eyebrow">오늘의 부처의 말</p>
          <blockquote>{answer.modernBuddhaMessage}</blockquote>
          <p className="sub-note">부처의 가르침을 오늘의 언어로 풀어쓴 말이에요</p>
          <span className="badge">
            <LotusMark size={12} />
            현대적 풀이
          </span>
        </div>
      </section>

      {/* 묶음 B · ③ 실제 가르침 + ④ 이 말씀은 이런 뜻이에요 */}
      <ScriptureCard
        scripture={scripture}
        explanation={pass2.status === 'done' ? pass2.scriptureExplanation : undefined}
        terms={terms}
      />

      {pass2.status === 'pending' && <PendingBlock />}

      {pass2.status === 'failed' && (
        <div className="failed">
          <div className="card">
            <p className="line">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 8v4.5" />
                <path d="M12 16h.01" />
              </svg>
              나머지를 못 불러왔어요
            </p>
            <p className="sub-line">다시 시도해도 오늘 남은 횟수는 줄지 않아요</p>
            <button
              type="button"
              className="btn btn--solid btn--wide"
              disabled={retrying}
              onClick={() => void retryPass2()}
              {...testId(TEST_IDS.retry)}
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {pass2.status === 'done' && (
        <>
          {/* 묶음 C · ⑤ 당신의 이야기를 보면 */}
          <section className="block card" {...testId(TEST_IDS.analysis)}>
            <div className="sec-head">
              <span className="ico">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M7.5 16.5A4.5 4.5 0 0 1 5 8.2 4.2 4.2 0 0 1 9.4 4.6 4.4 4.4 0 0 1 16 4.9a4.3 4.3 0 0 1 3.4 6.7 4 4 0 0 1-2.7 6.2c-1.2 1.6-3.6 1.8-5 .5-1.3 1-3.2.6-4.2-.8z" />
                  <path d="M5 20.5h.01M8 22.5h.01" />
                </svg>
              </span>
              <h2>당신의 이야기를 보면</h2>
            </div>

            {pass2.personalAnalysis.map((section) => (
              <div className="sub" key={section.heading}>
                <h3>{section.heading}</h3>
                {section.body
                  .split(/\n+/)
                  .filter((line) => line.trim() !== '')
                  .map((line, index) => (
                    <p className="body" key={index}>
                      {line}
                    </p>
                  ))}
              </div>
            ))}
          </section>

          {/* 묶음 D · ⑥ 지금 할 수 있는 것 + ⑦ 마지막 한마디 */}
          <section className="block card">
            <div className="sec-head" {...testId(TEST_IDS.actions)}>
              <span className="ico">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 21v-7" />
                  <path d="M12 14c0-3 2-5 5-5.2.2 3-1.8 5.2-5 5.2z" />
                  <path d="M12 16c-3.2 0-5.2-2.2-5-5.2C10 11 12 13 12 16z" />
                </svg>
              </span>
              <h2>지금 할 수 있는 것</h2>
            </div>
            <ol className="acts">
              {pass2.actions.map((action, index) => (
                <li key={action.title}>
                  <span className="n">{index + 1}</span>
                  <p>
                    <b>{action.title}</b>
                    {action.why != null && <span className="why">{action.why}</span>}
                  </p>
                </li>
              ))}
            </ol>

            <div className="pattern-band" aria-hidden="true" />

            <div className="closing" ref={closingRef} {...testId(TEST_IDS.closing)}>
              <span className="ico">
                <LotusMark size={22} />
              </span>
              <p>{pass2.closingMessage}</p>
            </div>
          </section>

          {/* 답변 밖 · Deep Extension. 누르지 않으면 아무 광고도 없다 */}
          {answer.extensionAvailable && adSupported && (
            <ExtensionCard
              answerId={answer.answerId}
              route={answer.route}
              text={sent}
              usedIds={answer.scriptures.map((item) => item.id)}
              onWatchAd={onWatchAd}
              adReady={adReady}
            />
          )}

          <section className="feedback">
            <p className="q">오늘 마음에 도움이 됐나요?</p>
            <div className="fb-row">
              <button
                type="button"
                className="fb-btn"
                aria-pressed={helpful === 'yes'}
                onClick={() => setHelpful('yes')}
              >
                <svg
                  className="h"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20.5C7.5 18 4 14.8 4 11.2A3.9 3.9 0 0 1 12 8.8 3.9 3.9 0 0 1 20 11.2c0 3.6-3.5 6.8-8 9.3z" />
                </svg>
                도움이 됐어요
              </button>
              <button
                type="button"
                className="fb-btn"
                aria-pressed={helpful === 'unsure'}
                onClick={() => setHelpful('unsure')}
              >
                <svg
                  className="q2"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M9.7 9.6a2.4 2.4 0 0 1 4.6.8c0 1.6-2.3 2-2.3 3.4" />
                  <path d="M12 17.2h.01" />
                </svg>
                잘 모르겠어요
              </button>
            </div>
            {reported ? (
              <p className="p-micro">알려 주셔서 고마워요. 이 답변을 다시 살펴볼게요</p>
            ) : (
              <button
                type="button"
                className="report"
                onClick={report}
                {...testId(TEST_IDS.reportLink)}
              >
                이 답변이 불편했어요
              </button>
            )}
          </section>

          {/* 하단 고정 바와 같은 두 버튼이다. 셀렉터는 고정 바 쪽 하나만 붙인다 */}
          <div className="actions-inline">
            <button type="button" className="btn btn--ghost" onClick={onShare}>
              <ShareIcon />
              공유하기
            </button>
            <button type="button" className="btn btn--solid" onClick={onSave}>
              <SaveIcon />
              간직하기
            </button>
          </div>

          <div className="again">
            <p>오늘 또 마음에 걸리는 일이 생기면 언제든 다시 오셔요</p>
            <button
              type="button"
              className="btn btn--ghost btn--wide"
              onClick={() => navigate(ROUTES.home)}
              {...testId(TEST_IDS.againButton)}
            >
              다시 이야기하기
            </button>
          </div>
        </>
      )}

      <div className="notice">
        <p>이 답변은 AI 가 경전을 찾아 풀어 쓴 것이에요. 의학·법률 조언이 아니에요.</p>
        <Link to={ROUTES.helpLines}>많이 힘들다면 도움받을 곳을 봐 주세요</Link>
      </div>
    </div>
  );
}
