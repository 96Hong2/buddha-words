import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useAnalytics } from '../../shared/analytics';
import type { ApiAnswer } from '../../shared/api';
import { useSession } from '../../shared/session';
import { sceneForTheme, type Pose } from '../../shared/visual/scene';
import { TEST_IDS, testId } from '../../shared/testIds';
import { ROUTES } from '../../app/router';

import { AnswerBody } from './AnswerBody';
import { InvalidAnswer } from './InvalidAnswer';
import { LightAnswer } from './LightAnswer';
import './answer.css';

/** 표정은 늘 평온하다. 상황은 자세와 배경 시간대가 말한다 */
const POSE_ALT: Record<Pose, string> = {
  open_eyes: '정면을 바라보며 앉아 있는 부처',
  listening: '한 손을 가슴에 얹고 듣고 있는 부처',
  welcome: '합장한 부처',
  reading: '책을 내려다보는 부처',
  tea: '찻잔을 든 부처',
  lotus: '연꽃을 바라보는 부처',
};

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
  const scene = sceneForTheme(answer.visualTheme);

  const [progress, setProgress] = useState(6);
  const [scrolled, setScrolled] = useState(false);
  const [barOn, setBarOn] = useState(false);
  const closingRef = useRef<HTMLDivElement | null>(null);
  /** 답변이 바뀔 때만 비운다. 화면이 다시 마운트돼도 같은 답변이면 다시 찍지 않는다 */
  const read = useRef({ id: '', marks: new Set<number>() });

  useEffect(() => {
    function sync() {
      if (read.current.id !== answer.answerId) {
        read.current = { id: answer.answerId, marks: new Set<number>() };
      }

      const total = document.documentElement.scrollHeight;
      const seen = window.scrollY + window.innerHeight;
      const ratio = total <= window.innerHeight ? 1 : Math.min(1, seen / total);

      setProgress(Math.max(6, Math.round(ratio * 100)));
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
          AI 생성
        </span>
      </div>

      <div className="illust" style={{ background: scene.backdrop }}>
        <img className="main" src={scene.src} alt={POSE_ALT[scene.pose]} />
      </div>

      <AnswerBody answer={answer} closingRef={closingRef} {...wires} />

      <div className={barOn ? 'bottombar on' : 'bottombar'} {...testId(TEST_IDS.bottomBar)}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={wires.onShare}
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
          onClick={wires.onSave}
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
