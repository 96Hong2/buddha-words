import { useEffect, useState, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router';

import { elapsedBucket, useAnalytics } from '../../shared/analytics';
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

import { ExtensionCard } from './ExtensionCard';
import { PROGRESS_STEPS, StepList } from './LoadingScreen';
import { FLAGS } from '../../shared/flags';

import { AnswerFeedback } from './AnswerFeedback';
import { NotificationPrompt } from './NotificationPrompt';
import { ScriptureCard } from './ScriptureCard';

/**
 * 마음 태그의 한글 이름과 칩 색.
 *
 * 색은 토큰이 정한 계열을 따른다. 색이 매번 달라지면 태그가 신호가 아니라 장식이 된다.
 *
 * 이름은 **그 상태의 사람이 자기 화면에서 읽을 말**로 고른다. 칩은 화면 맨 위에 서서
 * 본문보다 먼저 읽히므로, 마음의 이름이 아니라 그 사람의 문제 이름을 적으면 그 한 칸이
 * 판정이 된다. 사별하고 엄마 방을 못 치우는 사람에게 「집착」, 인정받고 싶은 사람에게
 * 「인정욕구」가 그랬다. 서버는 이미 사별한 사람에게 「집착이 문제였다」로 읽히는 구절을
 * 후보에서 거르고 있는데(domains/scripture/safety.py) 화면 칩만 그 기준 밖에 있었다.
 *
 * 이름 정본은 `spec/visual-theme.ts` 의 `THEME_SCENE[].ko` 와 보관함 칩이다. 세 곳이 같은 말을 쓴다.
 * 태그 코드(attachment 같은 영문 값)는 서버·그림 배정이 쓰는 값이라 바꾸지 않는다.
 */
const TAG: Record<EmotionTag, { ko: string; tone: 'sage' | 'lotus' | 'neutral' }> = {
  anxiety: { ko: '불안', tone: 'sage' },
  confusion: { ko: '혼란', tone: 'sage' },
  comparison: { ko: '남과 견주는 마음', tone: 'lotus' },
  approval: { ko: '인정받고 싶은 마음', tone: 'lotus' },
  attachment: { ko: '아직 남은 마음', tone: 'lotus' },
  loneliness: { ko: '외로움', tone: 'lotus' },
  anger: { ko: '분노', tone: 'neutral' },
  regret: { ko: '후회', tone: 'neutral' },
  emptiness: { ko: '공허', tone: 'neutral' },
  fatigue: { ko: '지친 마음', tone: 'neutral' },
  other: { ko: '복잡한 마음', tone: 'neutral' },
};

const ROUTE_NOTE = {
  promoted_topic: '짧게 쓰셨지만 중요한 이야기라 깊게 봤어요',
  downgraded_budget: '지금은 답변이 몰려서 간단한 풀이로 드렸어요',
} as const;

const DEEP_NOTE = '이야기를 자세히 들려줘서, 더 깊이 풀어 봤어요';

/**
 * 마음 태그 앞에 서는 한 줄.
 *
 * 전에는 첫 태그 하나를 뽑아 「지금 마음의 중심에는 집착이 있어 보여요」라고 적었다.
 * 두 가지가 사실이 아니었다. 모델에게 순위를 물은 적이 없어 첫 태그는 중심이 아니고,
 * 엄마 유품을 못 치우는 사람에게 「집착」은 마음의 이름이 아니라 판정으로 읽힌다.
 * 본문은 「이상한 게 아니에요」로 다독이는데 맨 위 한 줄이 그 다독임을 먼저 지웠다.
 * 그래서 하나를 고르는 문장을 없애고, 아래 칩이 무엇인지만 먼저 말한다.
 */
const TAG_LEAD = '적어 주신 이야기에서 이런 마음이 읽혔어요';

/**
 * 「오늘의 부처의 말」 아래에 붙는 한 줄.
 *
 * 전에는 「부처의 가르침을 오늘의 언어로 풀어쓴 말이에요」였다. 이 줄이 두 번 틀렸다.
 * 감수를 통과한 16구절 중 6구절은 부처의 말이 아니라 원효·승만부인·조주 선사·뿐니까
 * 장로니의 말인데 그 구절이 붙은 답변에도 같은 줄이 그대로 붙었다. 그리고 이 한마디는
 * 어느 구절을 풀어쓴 것이 아니라 이 고민을 읽고 모델이 새로 쓴 문장이다.
 *
 * 화자를 보고 줄을 갈라 쓸 수는 없다. 서버가 화면에 주는 것은 완성된 귀속 문구
 * 한 줄(`attributionLine`)뿐이라 화면이 「부처인가」를 판정할 값이 없고, 그 판정을
 * 문자열에서 되짚으면 조주 선사의 말이 부처의 말이 되는 쪽으로 틀린다.
 * 그래서 화자를 말하지 않고 이 문장이 무엇인지만 말한다. 어느 구절이 붙어도 사실이다.
 */
const AI_LINE_NOTE = '이 고민에 맞춰 AI 가 쓴 말이에요. 경전 원문은 바로 아래에 있어요';

/** 요청2를 기다리는 동안 4초마다 바뀌는 자리. 20초 동안 멈춘 화면을 만들지 않는다 */
const PENDING_TURN_MS = 4000;
const NOTE_EARLY = '쓰신 이야기를 하나씩 짚어 이 아래에 이어서 적어 드려요';
const NOTE_LATE = '이 화면을 나가도 답은 그대로 남아 있어요. 홈에서 다시 열 수 있어요';

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
  /** 하단 고정 바가 떠 있나. 떠 있으면 문서 흐름의 같은 버튼을 감춘다 */
  barOn?: boolean;
}

/** 7블록 v0.3 순서 그대로. 면(카드)은 네 번만 바뀐다 */
export function AnswerBody({
  answer,
  closingRef,
  barOn = false,
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
  const [reported, setReported] = useState(false);
  const [committed, setCommitted] = useState(false);

  const pass2 = answer.pass2;
  const scripture = answer.scriptures[0];
  /**
   * 사람이 읽어야 하는 글자 수. 「길수록 완독률이 떨어지나」를 물어보려면 필요하다.
   * 본문을 로그에 싣지 않으므로 길이만 구간으로 남긴다.
   */
  const answerChars =
    answer.modernBuddhaMessage.length +
    (pass2.status === 'done'
      ? pass2.scriptureExplanation.length +
        pass2.personalAnalysis.reduce((sum, part) => sum + part.heading.length + part.body.length, 0) +
        pass2.actions.reduce((sum, act) => sum + act.title.length + (act.why?.length ?? 0), 0) +
        pass2.closingMessage.length
      : 0);
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

  /**
   * 행동 블록이 화면에 들어왔다.
   *
   * 「Action 까지 읽는 비율은?」이 이 앱에서 가장 중요한 질문 중 하나다. 답을 읽기만 하고
   * 끝나는지, 오늘 할 일까지 가져가는지가 갈린다. 블록 도달(`answer_section_view`)과 따로
   * 두는 이유는, 행동이 실제로 몇 개 왔는지(0개일 수도 있다)를 함께 봐야 하기 때문이다.
   */
  useEffect(() => {
    if (pass2.status !== 'done' || pass2.actions.length === 0) return;
    analytics.log(
      'action_view',
      { answer_id: answer.answerId, action_index: pass2.actions.length },
      { kind: 'impression', once: `action_view:${answer.answerId}` },
    );
  }, [analytics, answer.answerId, pass2]);

  function commitAction() {
    setCommitted(true);
    analytics.log(
      'action_commit',
      { answer_id: answer.answerId, action_index: 0 },
      { kind: 'click', once: `action_commit:${answer.answerId}` },
    );
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
      <section className="block" data-answer-section="tags" {...testId(TEST_IDS.answerTags)}>
        {/* 태그를 읽기 전에 이것이 무엇인지 먼저 말한다. 아래 칩을 판정으로 읽지 않게 */}
        <p className="tag-lead">{TAG_LEAD}</p>
        <div className="tags">
          {answer.emotionTags.map((tag) => (
            <span key={tag} className={`tag tag--${TAG[tag].tone}`}>
              #{TAG[tag].ko}
            </span>
          ))}
        </div>
      </section>

      {/* 묶음 A · ② 오늘의 부처의 말 */}
      <section className="block block--tight" data-answer-section="message">
        {note != null && (
          <p className="deep-note">
            <SparkIcon />
            {note}
          </p>
        )}
        <div className="today" {...testId(TEST_IDS.buddhaMessage)}>
          <p className="eyebrow">오늘의 부처의 말</p>
          <blockquote>{answer.modernBuddhaMessage}</blockquote>
          <p className="sub-note">{AI_LINE_NOTE}</p>
          <span className="badge">
            <SparkIcon />
            AI 생성
          </span>
        </div>
      </section>

      {/* 묶음 B · ③ 실제 가르침 + ④ 이 말씀은 이런 뜻이에요 */}
      <div data-answer-section="scripture">
        <ScriptureCard
          answerId={answer.answerId}
          scripture={scripture}
          explanation={pass2.status === 'done' ? pass2.scriptureExplanation : undefined}
          terms={terms}
        />
      </div>

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
          <section className="block card" data-answer-section="analysis" {...testId(TEST_IDS.analysis)}>
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
          <section className="block card" data-answer-section="action">
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

            {/*
              「오늘 이것만 해볼게요」.
              체크리스트를 만들지 않는다. 누른 사실만 남기고 화면은 한 줄로 답한다.
              이 한 번의 탭이 「행동까지 갔나」를 재는 유일한 신호다. 플래그로 끈다.
            */}
            {FLAGS.actionCommit && pass2.actions.length > 0 && (
              <div className="act-commit">
                {committed ? (
                  <p className="p-micro">좋아요. 오늘 하나면 충분해요</p>
                ) : (
                  <button
                    type="button"
                    className="act-commit-btn"
                    onClick={commitAction}
                    {...testId(TEST_IDS.actionCommit)}
                  >
                    오늘 이것만 해볼게요
                  </button>
                )}
              </div>
            )}

            <div className="pattern-band" aria-hidden="true" />

            <div className="closing" data-answer-section="closing" ref={closingRef} {...testId(TEST_IDS.closing)}>
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

          <section className="feedback" data-answer-section="cta">
            <AnswerFeedback
              answerId={answer.answerId}
              route={answer.route}
              primaryTag={answer.emotionTags[0]}
              answerChars={answerChars}
            />
            <NotificationPrompt />
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

          {/*
            이 답은 세션에만 있다. 앱을 닫으면 사라지는데 그 말이 어디에도 없어서, 광고를 보며
            받은 답까지 잃고 나서야 알게 됐다. 간직하기를 누르기 전에 같은 자리에서 알린다.
          */}
          <p className="keep-note" {...testId(TEST_IDS.keepNote)}>
            이 답변은 앱을 닫으면 사라져요. 간직하면 경전 원문과 풀이, 받은 다른 관점까지 보관함에
            그대로 남아요.
          </p>

          {/* 하단 고정 바와 같은 두 버튼이다. 셀렉터는 고정 바 쪽 하나만 붙인다.
              바가 올라와 있으면 같은 버튼이 위아래로 겹쳐 보이므로 이쪽을 감춘다.
              자리는 그대로 두어 바가 오르내릴 때 본문이 튀지 않게 한다 */}
          <div className={barOn ? 'actions-inline is-hidden' : 'actions-inline'}>
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

      {/*
        화면을 다 읽고 나가는 자리. 상단 배지가 짧게 말한 것을 여기서 한 번 풀어 적는다.

        「사람이 감수했다」고는 적지 않는다. 이 화면은 지금 붙은 구절이 감수를 통과했는지
        모르고, 후보 풀에는 감수 전 구절이 함께 들어 있다. 근거 없이 감수 도장을 찍지 않는
        것은 공유 카드·공유 링크가 이미 지키는 규칙이다. 감수 여부는 구절마다 다르므로
        그 구절의 「원문 보기」가 말한다. 여기서는 무엇을 AI 가 썼고 무엇을 안 썼는지만 가른다.
      */}
      <div className="notice">
        <p>
          경전 원문은 앱이 지어낸 문장이 아니라 문헌에서 옮긴 것이고, 풀이와 조언은 AI 가 썼어요.
          어느 저본을 옮겼고 감수를 받았는지는 구절의 「원문 보기」에 적어 두었어요. 의학·법률
          조언이 아니에요.
        </p>
        <Link to={ROUTES.helpLines}>많이 힘들다면 도움받을 곳을 봐 주세요</Link>
      </div>
    </div>
  );
}
