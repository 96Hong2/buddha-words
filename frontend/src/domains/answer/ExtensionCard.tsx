import { useEffect, useRef, useState } from 'react';

import { useAnalytics } from '../../shared/analytics';
import { useApiClient, type ApiExtension } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';

import { elapsedBucket } from './buckets';

type Phase = 'idle' | 'watching' | 'building' | 'done';

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
  const [result, setResult] = useState<ApiExtension | null>(null);
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
      setPhase('idle');
      return;
    }

    setPhase('building');
    const startedAt = Date.now();
    try {
      const extension = await client.fetchExtension({
        answerId,
        text,
        usedIds,
      });
      setResult(extension);
      setPhase('done');
      analytics.log('extension_generated', {
        answer_id: answerId,
        elapsed_bucket_ms: elapsedBucket(Date.now() - startedAt),
      });
    } catch {
      setPhase('idle');
    }
  }

  return (
    <div className="ext-card" ref={cardRef} {...testId(TEST_IDS.extensionCard)}>
      <p className="eyebrow">조금 더 깊게 보고 싶다면</p>

      {phase === 'done' && result != null ? (
        <div className="ext-result" {...testId(TEST_IDS.extensionResult)}>
          <div className="scripture">
            <p className="text">{result.scripture.text}</p>
            <p className="cite">{result.scripture.citation}</p>
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
                  <span className="ad-tag" {...testId(TEST_IDS.adBadge)}>
                    광고
                  </span>
                  보고 다른 관점 하나 더 보기
                </>
              ) : (
                '광고 준비 중'
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
