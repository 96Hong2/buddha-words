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
import { attributionLine, useApiClient, type SharedCard } from '../../shared/api';
import { useSession } from '../../shared/session';
import { TEST_IDS, testId } from '../../shared/testIds';
import { sceneForScreen } from '../../shared/visual/scene';

import { isReviewed, oneLineGloss } from './ShareCard';

import './share.css';

/** 링크 하나가 실어 나르는 것 전부. 보낸 사람이 적은 글은 여기에 없다 */
export type SharedAnswer = SharedCard;

export interface LandingScreenProps {
  /** 서버에서 받은 본문. 주지 않으면 주소의 토큰으로 찾는다 */
  shared?: SharedAnswer | null;
}

/** 카드를 못 가져온 이유. 「없는 링크」와 「지금 못 읽었다」는 다른 말이다 */
type Missing = 'gone' | 'failed';

/**
 * 서버가 그린 카드가 안 열린 이유를 가른다.
 *
 * 그림 하나로는 만료된 링크인지 서버가 죽은 것인지 구별할 수 없다. 뭉뚱그려 만료라고 말하면,
 * 잠깐 끊긴 것뿐인데 「보낸 사람이 지웠어요」라는 거짓말을 하게 된다. 404 만 없는 링크다.
 *
 * **그림이 이미 실패한 뒤에만 부른다.** 잘 열리는 경우에는 요청이 한 번도 늘지 않는다.
 */
async function askWhy(imageUrl: string): Promise<Missing> {
  try {
    const response = await fetch(imageUrl, { credentials: 'omit', mode: 'cors' });
    return response.status === 404 ? 'gone' : 'failed';
  } catch {
    // 닿지도 못했다. 링크가 없어진 것이 아니라 지금 못 읽은 것이다
    return 'failed';
  }
}

export function LandingScreen({ shared }: LandingScreenProps) {
  const { token } = useParams<{ token: string }>();
  const client = useApiClient();
  const [fetched, setFetched] = useState<SharedAnswer | null | undefined>(undefined);
  const [missing, setMissing] = useState<Missing>('gone');
  const [imageBroken, setImageBroken] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (shared !== undefined || token == null || token === '') return;
    let alive = true;
    // 던져만 두면 실패가 아무도 잡지 않는 거절로 끝나고 화면은 계속 빈 채로 남는다
    client
      .fetchSharedCard(token)
      .then((card) => {
        if (!alive) return;
        setMissing('gone');
        setFetched(card);
      })
      .catch(() => {
        if (!alive) return;
        // 링크가 없어진 것이 아니라 지금 못 읽은 것이다. 만료라고 말하면 거짓말이 된다
        setMissing('failed');
        setFetched(null);
      });
    return () => {
      alive = false;
    };
  }, [client, shared, token, attempt]);
  const analytics = useAnalytics();
  const navigate = useNavigate();
  const { setDraft, beginSubmit } = useSession();
  /**
   * 입력칸은 이 화면 것이다. 홈과 나눠 쓰지 않는다.
   *
   * 나눠 쓰면 「친구가 보낸 말씀」 아래에 내가 홈에서 쓰다 만 고민이 떠 있다. 받은 사람은
   * 이 화면을 처음 보는데 남의 말씀 밑에 자기 글이 있는 꼴이라 어색하다. 늘 빈 칸으로 연다.
   */
  const [text, setText] = useState('');
  const logged = useRef(false);

  const loading = shared === undefined && fetched === undefined;
  const received = shared === undefined ? (fetched ?? null) : shared;
  // 카드가 안 열리면 깨진 그림 자리를 남겨 두지 않는다. 왜 못 열었는지는 askWhy 가 가른다
  const card = received != null && received.kind === 'image' && imageBroken ? null : received;
  const scene = sceneForScreen('shareCard');
  const empty = sceneForScreen('archiveEmpty');
  // 카드와 같은 한 문장. 카드 그림을 못 받는 구현에서만 쓰인다
  const explanationLine =
    card != null && card.kind === 'fields' ? oneLineGloss(card.explanation[0] ?? '') : '';
  /*
   * 맨 아래 한 줄. 감수 여부를 아는 만큼만 적는다.
   *
   * 서버가 그린 카드(kind: 'image')는 그림 한 장이라 이 화면이 구절을 못 본다. 그 판에서는
   * 감수를 말하지 않는다. 감수 표기는 카드 그림 안에 이미 들어 있고, 여기서 한 번 더 적으면
   * 확인도 못 한 말을 적는 셈이 된다.
   */
  const aiLine =
    card != null && card.kind === 'fields'
      ? `${
          isReviewed(card.scripture)
            ? '경전 원문은 사람이 감수했고'
            : '경전 원문은 문헌 감수를 아직 받지 않았고'
        }, 풀이는 AI 가 썼어요. 의학·법률 조언이 아니에요.`
      : '풀이는 AI 가 썼어요. 의학·법률 조언이 아니에요.';

  useEffect(() => {
    // 조회가 끝나기 전에 찍으면 토큰이 살아 있어도 늘 죽은 것으로 남는다
    if (loading || logged.current) return;
    logged.current = true;
    analytics.log('share_landing_open', { token_valid: card != null });
  }, [analytics, card, loading]);

  function send(): void {
    const typed = text.trim();
    if (typed === '') return;
    analytics.log('share_landing_cta');
    // 보내는 순간부터는 홈과 같은 글이다. 위기 화면이 「닫으면 그대로 남아 있어요」라고
    // 약속하는데, 세션에 넘기지 않으면 닫고 돌아간 홈이 빈 칸이다
    setDraft(typed);
    beginSubmit(typed);
    void navigate(ROUTES.loading);
  }

  function startOwn(): void {
    analytics.log('share_landing_cta');
    void navigate(ROUTES.home);
  }

  if (loading) return null;

  if (card == null) {
    const failed = missing === 'failed';
    return (
      <div className="sh-land" {...testId(TEST_IDS.landing)}>
        <div className="sh-land__expired">
          {empty == null ? null : (
            <img className="sh-land__expired-illust" src={empty.src} alt="" />
          )}
          <h2>{failed ? '지금은 이 말씀을 불러오지 못했어요' : '이 말씀은 더 볼 수 없어요'}</h2>
          <p>
            {failed
              ? '잠시 뒤에 다시 열어 주세요. 기다리는 동안 오늘 당신의 이야기를 들려주셔도 좋아요.'
              : '링크가 만료됐거나 보낸 사람이 지웠어요. 대신 오늘 당신의 이야기를 들려주세요.'}
          </p>
          {failed ? (
            <button
              type="button"
              className="sh-btn"
              style={{ marginBottom: 10 }}
              onClick={() => {
                setImageBroken(false);
                setFetched(undefined);
                setAttempt((n) => n + 1);
              }}
            >
              다시 해보기
            </button>
          ) : null}
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

      {card.kind === 'image' ? (
        // 서버가 그린 1080 × 1620 카드 한 장. 경전 원문과 한 줄 풀이가 이미 그 안에 있다
        <img
          src={card.imageUrl}
          alt="친구가 보낸 말씀 카드"
          onError={() => {
            const { imageUrl } = card;
            void askWhy(imageUrl).then((why) => {
              setMissing(why);
              setImageBroken(true);
            });
          }}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: 330,
            margin: '0 auto 22px',
            aspectRatio: '1080 / 1620',
            borderRadius: 18,
            background: 'var(--surface-illust)',
          }}
        />
      ) : (
        <>
          <div className="sh-land__illust">
            {scene == null ? null : <img src={scene.src} alt="연꽃을 바라보는 부처" />}
          </div>

          {/*
           * 카드 그림을 못 받는 구현(스텁)에서도 서버가 그리는 카드와 같은 것을 보여 준다.
           * 보낸 사람이 받은 「오늘의 부처의 말」과 마음 태그는 여기에도 싣지 않는다.
           * 그 한마디는 그 사람의 고민을 읽고 쓴 문장이라 받는 사람에게 상황이 비친다.
           */}
          <div className="sh-land__card">
            <div className="sh-land__scripture">
              <p className="sh-land__sclab">경전 원문</p>
              <p>{card.scripture.text}</p>
              <cite>{attributionLine(card.scripture)}</cite>
            </div>
          </div>
        </>
      )}

      <h2 className="sh-land__cta">요즘 마음에 걸리는 일이 있나요?</h2>
      <p className="sh-land__ctasub">회원가입 없이 바로 이야기할 수 있어요. 세 줄이면 충분해요.</p>

      <textarea
        className="sh-land__field"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="오늘 있었던 일, 요즘 드는 생각, 무엇이든 좋아요"
        aria-label="요즘 마음에 걸리는 일이 있나요?"
        {...testId(TEST_IDS.concernField)}
      />
      <button
        type="button"
        className="sh-btn"
        onClick={send}
        disabled={text.trim() === ''}
        {...testId(TEST_IDS.submit)}
      >
        이야기 보내기
      </button>

      {card.kind === 'fields' ? (
        <>
          <div className="sh-land__rule" aria-hidden="true" />

          <div className="sh-land__card">
            <h2 className="sh-land__h">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M2.6 4.1c2 -.9 4 -.9 6 0v10c-2-.9-4-.9-6 0v-10Z"
                  stroke="var(--accent)"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <path
                  d="M15.4 4.1c-2-.9-4-.9-6 0v10c2-.9 4-.9 6 0v-10Z"
                  stroke="var(--accent)"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
              이 말씀은 이런 뜻이에요
            </h2>
            {/*
             * 해설 전문이 아니라 첫 문장만 싣는다. 카드와 같은 규칙이다(`oneLineGloss`).
             * 뒷문장은 보낸 사람의 상황을 짚는 글이라 받는 사람이 읽을 자리가 아니다.
             */}
            {explanationLine === '' ? null : <p className="sh-land__p">{explanationLine}</p>}
          </div>
        </>
      ) : null}

      <p className="sh-land__note">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          style={{ flex: '0 0 auto', marginTop: 1 }}
        >
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
        이 카드에는 경전 구절과 그 뜻만 담겨 있어요. 보낸 사람이 적은 이야기는 들어 있지 않아요
      </p>
      <p className="sh-land__ai">{aiLine}</p>
    </div>
  );
}
