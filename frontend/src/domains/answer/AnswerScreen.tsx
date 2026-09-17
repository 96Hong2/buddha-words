import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useAnalytics } from '../../shared/analytics';
import type { ApiAnswer } from '../../shared/api';
import { useSession } from '../../shared/session';
import { artForTheme } from '../../shared/visual/scene';
import { TEST_IDS, testId } from '../../shared/testIds';
import { ROUTES } from '../../app/router';

import { AnswerBody } from './AnswerBody';
import { useAnswerConsumption } from './useAnswerConsumption';
import { InvalidAnswer } from './InvalidAnswer';
import { LightAnswer } from './LightAnswer';
import './answer.css';

/**
 * 화면 맨 위에 늘 떠 있는 표시.
 *
 * 전에는 「AI 생성」 한 마디였다. 이 배지는 sticky 라 아래로 내려가도 따라오는데, 그 아래에는
 * 문헌에서 옮겨 온 경전 원문 카드도 있다. 화면 전체를 가리키는 「AI 생성」이 그 위에까지 서면
 * 경전까지 모델이 지어낸 것으로 읽힌다. 이 앱은 경전을 지어내지 않는다.
 *
 * 다만 감수를 통과했는지는 구절마다 다르므로 여기서 말하지 않는다. 그 도장은 근거가 있는
 * 자리에서만 찍는다(공유 카드·공유 링크·구절의 「원문 보기」).
 *
 * 그래서 이 한 줄이 무엇이 AI 이고 무엇이 아닌지를 함께 말한다. 어느 블록 위에 서 있어도
 * 참인 문장이라 sticky 여도 어긋나지 않는다. 블록마다 붙는 자세한 표시는 AnswerBody 가 맡는다.
 *
 * 「AI 생성」 네 글자는 그대로 남긴다. 고지 의무가 요구하는 말이고 확인 항목이 이 문자열을 본다.
 * 뒤에 예외만 덧붙였다. 배지는 nowrap 이라 길어지면 본문을 더 가리므로 한 뼘 안에서 끝낸다.
 */
const TOP_BADGE = 'AI 생성 · 경전은 원문';

/** 완독 판정. 답변 하나에 한 번씩만 찍는다 */
const READ_MARKS = [
  { at: 50, name: 'answer_read_50' },
  { at: 70, name: 'answer_read_70' },
  { at: 90, name: 'answer_read_90' },
] as const;

export interface AnswerScreenProps {
  /** 공유 시트를 연다 */
  onShare?: () => void;
  /** 간직한다. 자리가 찼으면 부르는 쪽이 이용권 시트를 연다 */
  onSave?: () => void;
  /** 보상형 광고를 띄운다. 끝까지 봤으면 true */
  onWatchAd?: () => Promise<boolean>;
  /** 광고 지원 여부 판정이 끝났나 */
  adReady?: boolean;
  /** 이 기기에서 광고를 띄울 수 있나 */
  adSupported?: boolean;
}

function FullAnswer({ answer, ...wires }: { answer: ApiAnswer } & AnswerScreenProps) {
  const analytics = useAnalytics();
  const art = artForTheme(answer.visualTheme);

  const [progress, setProgress] = useState(6);
  const [scrolled, setScrolled] = useState(false);
  const [barOn, setBarOn] = useState(false);
  const closingRef = useRef<HTMLDivElement | null>(null);
  /** 답변이 바뀔 때만 비운다. 화면이 다시 마운트돼도 같은 답변이면 다시 찍지 않는다 */
  const read = useRef({ id: '', marks: new Set<number>() });
  /** 지금까지 내려간 최대 비율. 나갈 때 어디까지 읽었는지 이 값으로 남긴다 */
  const deepest = useRef(0);

  // 블록별 도달과 이탈. 화면에 아무것도 더하지 않고 보기만 한다
  const consumption = useAnswerConsumption(
    answer.answerId,
    answer.route,
    () => deepest.current,
  );

  useEffect(() => {
    function sync() {
      if (read.current.id !== answer.answerId) {
        read.current = { id: answer.answerId, marks: new Set<number>() };
        deepest.current = 0;
      }

      const total = document.documentElement.scrollHeight;
      const seen = window.scrollY + window.innerHeight;
      const ratio = total <= window.innerHeight ? 1 : Math.min(1, seen / total);

      const percent = Math.round(ratio * 100);
      deepest.current = Math.max(deepest.current, percent);
      setProgress(Math.max(6, percent));
      setScrolled(window.scrollY > 24);

      for (const mark of READ_MARKS) {
        if (ratio * 100 < mark.at || read.current.marks.has(mark.at)) continue;
        read.current.marks.add(mark.at);
        analytics.log(mark.name, {
          answer_id: answer.answerId,
          route: answer.route,
        });
      }
    }

    sync();
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [analytics, answer.answerId, answer.route]);

  useEffect(() => {
    const closing = closingRef.current;
    if (closing == null) return;
    // ⑦ 마지막 한마디가 화면에 들어온 뒤에만 공유·간직 바가 올라온다.
    // 이미 지나쳐 내려간 자리에서 요청2가 도착하는 일도 있어, 위로 지나간 경우도 도달로 본다.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.boundingClientRect.bottom < 0) setBarOn(true);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(closing);
    return () => observer.disconnect();
  }, [answer.pass2.status]);

  return (
    <div className="ans" {...testId(TEST_IDS.answer)}>
      <div className={scrolled ? 'topline scrolled' : 'topline'}>
        <div className="bar" style={{ width: `${progress}%` }} />
        <div className="scrim" aria-hidden="true" />
        <span className="ai-badge">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
          </svg>
          {TOP_BADGE}
        </span>
      </div>

      <div className="illust">
        <img className="main" src={art.src} alt={art.alt} />
      </div>

      <AnswerBody answer={answer} closingRef={closingRef} barOn={barOn} {...wires} />

      <div className={barOn ? 'bottombar on' : 'bottombar'} {...testId(TEST_IDS.bottomBar)}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            consumption.markExit('share');
            wires.onShare?.();
          }}
          {...testId(TEST_IDS.shareButton)}
        >
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
          공유하기
        </button>
        <button
          type="button"
          className="btn btn--solid"
          onClick={() => {
            consumption.markExit('save');
            wires.onSave?.();
          }}
          {...testId(TEST_IDS.saveButton)}
        >
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
          간직하기
        </button>
      </div>
    </div>
  );
}

/**
 * 답변 화면. 받은 응답 종류를 보고 갈라 그린다.
 * 위기·위로는 안전 도메인 화면이라 여기서 그리지 않고 그 화면으로 보낸다.
 */
export function AnswerScreen(props: AnswerScreenProps = {}) {
  const { response } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (response == null) {
      navigate(ROUTES.home, { replace: true });
      return;
    }
    if (response.responseType === 'crisis') navigate(ROUTES.crisis, { replace: true });
    else if (response.responseType === 'solace') navigate(ROUTES.solace, { replace: true });
  }, [navigate, response]);

  if (response == null) return null;
  if (response.responseType === 'light') return <LightAnswer answer={response} />;
  if (response.responseType === 'invalid') return <InvalidAnswer answer={response} />;
  if (response.responseType !== 'answer') return null;

  return <FullAnswer answer={response} {...props} />;
}
