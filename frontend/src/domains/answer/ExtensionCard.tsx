import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { elapsedBucket, useAnalytics } from '../../shared/analytics';
import { ApiFailure, attributionLine, useApiClient, type ApiExtension } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';

type Phase = 'idle' | 'watching' | 'building' | 'failed' | 'done';

/**
 * 받은 「다른 관점」을 카드 밖에 둔다.
 *
 * 간직하기는 답변 화면 바깥(AnswerRoute)이 하는데 이 결과는 카드 안에만 있었다. 그래서
 * 광고를 끝까지 보고 받은 것이 간직해도 남지 않았다. 답변 아이디로 들고 있어서 다음 이야기에
 * 지난 관점이 섞이지 않는다.
 */
const received = new Map<string, ApiExtension>();
const listeners = new Set<() => void>();

function keep(answerId: string, extension: ApiExtension): void {
  received.set(answerId, extension);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 이 답변에 붙은 「다른 관점」. 아직 안 받았으면 null */
export function useExtensionResult(answerId: string | undefined): ApiExtension | null {
  return useSyncExternalStore(subscribe, () =>
    answerId == null ? null : (received.get(answerId) ?? null),
  );
}

/**
 * 못 받은 이유를 사람 말로 옮긴다. 서버가 준 문자열을 그대로 내보내지 않는다.
 * 광고를 끝까지 본 사람에게는 「다시 보지 않아도 된다」가 가장 궁금한 정보라 끝에 붙인다.
 */
function whyFailed(error: unknown): string {
  const reason = error instanceof ApiFailure ? error.reason : 'provider';
  if (reason === 'offline') return '인터넷이 잠깐 닿지 않아 다른 관점을 가져오지 못했어요.';
  if (reason === 'timeout') return '가져오는 데 너무 오래 걸려서 멈췄어요.';
  if (reason === 'budget') return '지금은 이야기가 많이 몰려 있어서 가져오지 못했어요.';
  return '다른 관점을 가져오지 못했어요.';
}

export interface ExtensionCardProps {
  answerId: string;
  route: 'normal' | 'deep';
  /** 다시 볼 이야기 원문. 서버로만 가고 로그·이벤트에는 싣지 않는다 */
  text: string;
  /** 이미 쓴 구절. 같은 경전이 두 번 나오지 않게 한다 */
  usedIds: string[];
  /** 보상형 광고를 띄운다. 끝까지 보면 true. 없으면 스텁으로 즉시 성공 처리한다 */
  onWatchAd?: () => Promise<boolean>;
  /** 광고 로드가 끝났나. 훅이 붙기 전에는 스텁이라 준비된 것으로 본다 */
  adReady?: boolean;
}

/**
 * 답변 끝에 붙는 「조금 더 깊게 보고 싶다면」.
 *
 * 누르지 않으면 아무 광고도 없다. 보상을 못 받으면 아무것도 붙이지 않는다.
 * 「광고」라는 글자는 버튼 안 배지 하나로 끝낸다.
 */
export function ExtensionCard({
  answerId,
  route,
  text,
  usedIds,
  onWatchAd,
  adReady = true,
}: ExtensionCardProps) {
  const client = useApiClient();
  const analytics = useAnalytics();

  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState('');
  /**
   * 받은 결과는 카드 밖에 둔 것을 그대로 읽는다.
   *
   * 카드 안에만 두었을 때는 보관함에 갔다 돌아오면 카드가 다시 만들어지면서 결과가 사라지고,
   * 광고를 한 번 더 보라는 버튼이 그 자리에 떴다. 이미 끝까지 본 사람에게 값을 두 번 받는 셈이다.
   */
  const result = useExtensionResult(answerId);
  const cardRef = useRef<HTMLDivElement>(null);
  const viewLogged = useRef(false);

  useEffect(() => {
    const card = cardRef.current;
    if (card == null || viewLogged.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || viewLogged.current) continue;
          viewLogged.current = true;
          analytics.log(
            'deep_extension_view',
            { answer_id: answerId, route, ad_supported: adReady },
            { kind: 'impression' },
          );
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [adReady, analytics, answerId, route]);

  /**
   * 보상을 받은 뒤 본문을 가져온다. 광고는 여기 없다.
   *
   * 다시 시도가 이 함수만 부르는 것이 중요하다. 광고는 이미 끝까지 봤으니 가져오기가
   * 실패했다고 광고를 한 번 더 보게 하지 않는다.
   */
  async function build() {
    setPhase('building');
    const startedAt = Date.now();
    try {
      const extension = await client.fetchExtension({
        answerId,
        text,
        usedIds,
      });
      // 간직하기와 다시 그려지는 카드가 함께 읽어 가도록 카드 밖에 둔다
      keep(answerId, extension);
      setPhase('done');
      analytics.log('extension_generated', {
        answer_id: answerId,
        elapsed_bucket_ms: elapsedBucket(Date.now() - startedAt),
      });
    } catch (error) {
      // 조용히 원래 카드로 돌아가지 않는다. 끝까지 본 사람은 왜 못 받았는지 알아야 한다
      setFailure(whyFailed(error));
      setPhase('failed');
    }
  }

  // 광고 자체의 로그(start · complete · fail)는 광고를 띄운 쪽이 남긴다. 여기서 또 찍지 않는다
  async function watch() {
    setPhase('watching');

    let granted = true;
    try {
      if (onWatchAd != null) granted = await onWatchAd();
    } catch {
      granted = false;
    }

    if (!granted) {
      // 스스로 닫은 것이라 알릴 것이 없다. 안 본 사람에게 실패라고 말하지 않는다
      setPhase('idle');
      return;
    }

    await build();
  }

  return (
    <div className="ext-card" ref={cardRef} {...testId(TEST_IDS.extensionCard)}>
      <p className="eyebrow">조금 더 깊게 보고 싶다면</p>

      {result != null ? (
        <div className="ext-result" {...testId(TEST_IDS.extensionResult)}>
          <div className="scripture">
            <p className="text">{result.scripture.text}</p>
            <p className="cite">{attributionLine(result.scripture)}</p>
          </div>
          <div className="sub">
            <h3>{result.alternativeAnalysis.heading}</h3>
            <p className="body">{result.alternativeAnalysis.body}</p>
          </div>
          <ol className="acts" style={{ marginTop: 'var(--s-5)' }}>
            <li>
              <span className="n">1</span>
              <p>
                <b>{result.action.title}</b>
                {result.action.why != null && <span className="why">{result.action.why}</span>}
              </p>
            </li>
          </ol>
        </div>
      ) : (
        <>
          <p>
            같은 이야기를 <b>다른 경전과 다른 관점</b>으로 한 번 더 봐요. 새 경전 하나, 다른 해석
            하나, 행동 하나가 이 아래에 붙어요. 같은 말을 길게 반복하지 않아요.
          </p>

          {phase === 'building' ? (
            <div className="pending" style={{ marginTop: 'var(--s-4)' }}>
              <p className="pending__line">{'다른 관점으로\n한 번 더 보고 있어요'}</p>
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <div className="skel" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : phase === 'failed' ? (
            <div style={{ marginTop: 'var(--s-4)' }}>
              {/*
                이 분기에는 광고 버튼이 없어 배지도 없다. 그래서 여기서 「광고」를 한 번
                쓸 수 있고, 30초를 이미 치른 사람이 가장 먼저 하는 걱정이 그것이다.
              */}
              <p role="status">{failure} 광고를 다시 보지 않아도 돼요.</p>
              <button type="button" className="ad-btn" onClick={() => void build()}>
                다시 받아보기
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ad-btn"
              disabled={!adReady || phase === 'watching'}
              onClick={() => void watch()}
              {...testId(TEST_IDS.extensionCta)}
            >
              {adReady ? (
                <>
                  {/* 보상형 두 자리는 같은 말투다: 몇 초짜리인지와 무엇을 얻는지를 한 줄에 */}
                  30초{' '}
                  <span className="ad-tag" {...testId(TEST_IDS.adBadge)}>
                    광고
                  </span>{' '}
                  보고 다른 관점 하나 더 보기
                </>
              ) : (
                '준비하고 있어요'
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
