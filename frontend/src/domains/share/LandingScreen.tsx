/**
 * 공유 링크로 들어온 첫 화면 (S9).
 *
 * 받은 사람은 아직 이 앱을 모른다. 그래서 설명 화면도 회원가입도 두지 않고, 받은 말씀 바로
 * 아래에 입력창을 둔다. 링크 → 전송이 두 탭이고, 전송하면 홈을 거치지 않고 대기 화면으로 간다.
 *
 * 토큰이 죽었으면 막다른 길 대신 「나도 이야기해보기」를 둔다.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { ROUTES } from '../../app/router';
import { useAnalytics } from '../../shared/analytics';
import { useApiClient, type SharedCard } from '../../shared/api';
import { useSession } from '../../shared/session';
import { TEST_IDS, testId } from '../../shared/testIds';
import { sceneForScreen } from '../../shared/visual/scene';

import './share.css';

/** 링크 하나가 실어 나르는 것 전부. 보낸 사람이 적은 글은 여기에 없다 */
export type SharedAnswer = SharedCard;

export interface LandingScreenProps {
  /** 서버에서 받은 본문. 주지 않으면 주소의 토큰으로 찾는다 */
  shared?: SharedAnswer | null;
}

export function LandingScreen({ shared }: LandingScreenProps) {
  const { token } = useParams<{ token: string }>();
  const client = useApiClient();
  const [fetched, setFetched] = useState<SharedAnswer | null | undefined>(undefined);

  useEffect(() => {
    if (shared !== undefined || token == null || token === '') return;
    let alive = true;
    void client.fetchSharedCard(token).then((card) => {
      if (alive) setFetched(card);
    });
    return () => {
      alive = false;
    };
  }, [client, shared, token]);
  const analytics = useAnalytics();
  const navigate = useNavigate();
  const { draft, setDraft, beginSubmit } = useSession();
  const logged = useRef(false);

  const card = shared === undefined ? (fetched ?? null) : shared;
  const scene = sceneForScreen('shareCard');
  const empty = sceneForScreen('archiveEmpty');

  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    analytics.log('share_landing_open', { token_valid: card != null });
  }, [analytics, card]);

  function send(): void {
    const text = draft.trim();
    if (text === '') return;
    analytics.log('share_landing_cta');
    beginSubmit(text);
    void navigate(ROUTES.loading);
  }

  function startOwn(): void {
    analytics.log('share_landing_cta');
    void navigate(ROUTES.home);
  }

  if (shared === undefined && fetched === undefined) return null;

  if (card == null) {
    return (
      <div className="sh-land" {...testId(TEST_IDS.landing)}>
        <div className="sh-land__expired">
          {empty == null ? null : <img className="sh-land__expired-illust" src={empty.src} alt="" />}
          <h2>이 말씀은 더 볼 수 없어요</h2>
          <p>링크가 만료됐거나 보낸 사람이 지웠어요. 대신 오늘 당신의 이야기를 들려주세요.</p>
          <button type="button" className="sh-btn" onClick={startOwn}>
            나도 이야기해보기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sh-land" {...testId(TEST_IDS.landing)}>
      <p className="sh-land__from">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 4.2c2.7 2.2 4.2 4.6 4.2 6.9A4.2 4.2 0 0 1 12 15.3a4.2 4.2 0 0 1-4.2-4.2c0-2.3 1.5-4.7 4.2-6.9Z"
            fill="var(--accent-rule)"
          />
          <path
            d="M3.6 13.6c3.1-.9 5.6-.3 7.4 1.4-1.8 1.7-4.3 2.3-7.4 1.4Zm16.8 0c-3.1-.9-5.6-.3-7.4 1.4 1.8 1.7 4.3 2.3 7.4 1.4Z"
            fill="var(--accent)"
          />
        </svg>
        친구가 보낸 말씀이에요
      </p>

      <div className="sh-land__illust">
        {scene == null ? null : <img src={scene.src} alt="연꽃을 바라보는 부처" />}
      </div>

      <p className="sh-land__line">{card.buddhaMessage}</p>

      <h2 className="sh-land__cta">요즘 마음에 걸리는 일이 있나요?</h2>
      <p className="sh-land__ctasub">회원가입 없이 바로 이야기할 수 있어요. 세 줄이면 충분해요.</p>

      <textarea
        className="sh-land__field"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="오늘 있었던 일, 요즘 드는 생각, 무엇이든 좋아요"
        aria-label="요즘 마음에 걸리는 일이 있나요?"
        {...testId(TEST_IDS.concernField)}
      />
      <button
        type="button"
        className="sh-btn"
        onClick={send}
        disabled={draft.trim() === ''}
        {...testId(TEST_IDS.submit)}
      >
        이야기 보내기
      </button>

      <div className="sh-land__rule" aria-hidden="true" />

      <div className="sh-land__card">
        <div className="sh-land__scripture">
          <p>{card.scripture.text}</p>
          <cite>{card.scripture.citation}</cite>
        </div>
      </div>

      <div className="sh-land__card">
        <h2 className="sh-land__h">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M2.6 4.1c2 -.9 4 -.9 6 0v10c-2-.9-4-.9-6 0v-10Z" stroke="var(--accent)" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M15.4 4.1c-2-.9-4-.9-6 0v10c2-.9 4-.9 6 0v-10Z" stroke="var(--accent)" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          이 말씀은 이런 뜻이에요
        </h2>
        {card.explanation.map((paragraph) => (
          <p key={paragraph} className="sh-land__p">
            {paragraph}
          </p>
        ))}
      </div>

      <p className="sh-land__note">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 1 }}>
          <path
            d="M7 1.4 2.2 3.3v3.4c0 3 2 5.2 4.8 5.9 2.8-.7 4.8-2.9 4.8-5.9V3.3L7 1.4Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M4.9 7.1 6.4 8.6 9.3 5.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        보낸 사람의 고민 내용은 담기지 않아요
      </p>
      <p className="sh-land__ai">이 답변은 AI 가 경전을 찾아 풀어 쓴 것이에요. 의학·법률 조언이 아니에요.</p>
    </div>
  );
}
