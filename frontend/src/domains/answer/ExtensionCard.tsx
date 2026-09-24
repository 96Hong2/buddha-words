import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { elapsedBucket, useAnalytics } from '../../shared/analytics';
import { ApiFailure, attributionLine, useApiClient, type ApiExtension } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';
import { LeafAltAdButton, LeafCollectCta, LeafUseButton, Spinner } from '../../shared/ui';
import { adLead } from '../ads/placement';

type Phase = 'idle' | 'watching' | 'building' | 'failed' | 'done';

/** 「광고」 배지 앞에 서는 말. 보상형일 때만 초를 적는다 */
const AD_LEAD = adLead('extension');

/**
 * 받은 「다른 관점」을 카드 밖에 둔다.
 *
 * 간직하기는 답변 화면 바깥(AnswerRoute)이 하는데 이 결과는 카드 안에만 있었다. 그래서
 * 광고를 끝까지 보고 받은 것이 간직해도 남지 않았다. 답변 아이디로 들고 있어서 다음 이야기에
 * 지난 관점이 섞이지 않는다.
 */
const received = new Map<string, ApiExtension>();
const listeners = new Set<() => void>();

/**
 * 값을 이미 치른 답변. **연꽃이든 광고든 한 번 낸 것은 여기 남는다.**
 *
 * 받아 온 결과와 따로 두는 이유는, 치르고 나서 **가져오기가 실패할 수 있기** 때문이다.
 * 그때 「다시 받아보기」는 컴포넌트 state(`phase`)에만 있었다. 보관함에 갔다 오면 카드가
 * 다시 만들어지면서 그 state 가 사라지고, 처음 화면(연꽃·광고 버튼)으로 돌아간다.
 * **연꽃은 이미 빠졌는데 값을 또 내야 한다**(2026-09-24 리뷰).
 *
 * 저장소에 적지 않는다. 답 하나에 매인 값이고 앱을 다시 열면 그 답도 화면에 없다.
 */
const paidFor = new Set<string>();

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
  /**
   * 연꽃 한 송이로 지나간다. 돌려주는 값이 false 면 잔액이 모자라 아무 일도 안 일어났다.
   *
   * 없으면 연꽃 버튼을 아예 그리지 않는다. 다른 두 자리(이어가기 · 간직)와 같은 규칙이다.
   */
  onUseLeaf?: () => boolean;
  /**
   * 연꽃 모으기로 보낸다.
   *
   * 연꽃을 쓰는 자리는 셋인데 **모으러 가는 길은 시트 둘에만 있었다.** 그래서 연꽃이
   * 없는 사람이 이 카드에서 보는 것은 광고 버튼 하나뿐이었고, 연꽃이라는 것이 있는
   * 줄도 모른 채 매번 광고를 봤다. 쓰는 자리에 모으는 길이 같이 있어야 한다.
   */
  onCollectLeaf?: () => void;
  /** 지금 가진 연꽃. 한 송이 이상이면 광고 대신 이것을 먼저 권한다 */
  leaves?: number;
  /**
   * 이 기기에서 광고를 띄울 수 있나.
   *
   * 못 띄우는데 연꽃만 있는 사람에게는 **연꽃 버튼 하나만** 그린다. 눌러도 아무 일이
   * 없는 광고 버튼을 세우면 그 자리가 고장으로 읽힌다.
   */
  adSupported?: boolean;
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
  onUseLeaf,
  onCollectLeaf,
  leaves = 0,
  adSupported = true,
}: ExtensionCardProps) {
  const client = useApiClient();
  const analytics = useAnalytics();

  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState('');
  /** 무엇으로 치렀나. 실패 문구가 「다시 치르지 않아도 된다」를 말할 때 쓴다 */
  const [paidWith, setPaidWith] = useState<'ad' | 'leaf'>('ad');
  /**
   * 받은 결과는 카드 밖에 둔 것을 그대로 읽는다.
   *
   * 카드 안에만 두었을 때는 보관함에 갔다 돌아오면 카드가 다시 만들어지면서 결과가 사라지고,
   * 광고를 한 번 더 보라는 버튼이 그 자리에 떴다. 이미 끝까지 본 사람에게 값을 두 번 받는 셈이다.
   */
  const result = useExtensionResult(answerId);
  const cardRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const viewLogged = useRef(false);
  /**
   * 지금 단계를 **클로저 밖에서** 본다.
   *
   * 연꽃 버튼은 꽃이 날아가는 0.84초 뒤에 `onClick` 을 부르는데, 그 함수는 눌린 순간의
   * 렌더에 묶여 있다. 그 사이에 아래 광고 버튼을 누르면 `phase` 는 `watching` 이 되지만
   * 예약된 쪽은 옛 `idle` 을 보고 가드를 그냥 지나간다. 연꽃과 광고가 둘 다 나간다.
   */
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;
  /** 되살리기를 이미 걸었나. 마운트 한 번에 한 번이면 된다 */
  const revived = useRef<string | null>(null);

  /*
    이미 치렀는데 결과가 없는 채로 다시 그려졌다. **값을 또 받지 않고 곧바로 가져온다.**
    치르고 나서 가져오기가 실패한 뒤 보관함에 갔다 온 사람이 이 길로 온다.
  */
  useEffect(() => {
    if (result != null || phase !== 'idle' || !paidFor.has(answerId)) return;
    /*
      마운트당 한 번만 건다. 개발 판의 StrictMode 는 효과를 두 번 돌리는데, 그때 `phase` 가
      아직 `idle` 이라 가져오기가 두 번 나갔다. 서버에는 같은 요청이 겹쳐 들어간다.
    */
    if (revived.current === answerId) return;
    revived.current = answerId;
    void build();
    // build 는 매 렌더 새로 만들어지는 함수라 의존성에 넣으면 무한히 돈다.
    // 여기서 보는 것은 「이 답변을 이미 치렀나」 하나다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerId, phase, result]);

  /*
    받아 온 자리로 포커스를 옮긴다.
    누른 버튼이 사라지면서 포커스가 문서 맨 위로 떨어지는데, 이 카드는 긴 답변 맨 아래에
    있어서 키보드·보이스오버로 온 사람은 결과를 다시 찾으려면 처음부터 훑어 내려와야 한다.

    `phase` 가 `done` 일 때만 옮긴다. 보관함에 갔다 오면 카드가 다시 그려지는데 그때는
    `idle` 이라, 아무것도 안 눌렀는데 화면이 아래로 튀는 일이 없다.
  */
  useEffect(() => {
    if (phase !== 'done') return;
    resultRef.current?.focus();
  }, [phase]);

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
            { answer_id: answerId, route, ad_supported: adSupported },
            { kind: 'impression' },
          );
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [adSupported, analytics, answerId, route]);

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
    setPaidWith('ad');
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

    paidFor.add(answerId);
    await build();
  }

  /**
   * 연꽃으로 지나간다. 광고를 띄우지 않는다.
   *
   * 빼는 일은 부르는 쪽이 한다. 여기서 빼면 이 카드가 다시 그려질 때마다 셈이 흐트러지고,
   * 잔액을 쥔 쪽과 쓰는 쪽이 갈라진다.
   */
  function payWithLeaf() {
    if (onUseLeaf == null || phaseRef.current !== 'idle') return;
    if (!onUseLeaf()) return;
    paidFor.add(answerId);
    setPaidWith('leaf');
    void build();
  }

  /** 연꽃으로 지나갈 수 있나. 부르는 쪽이 길을 안 줬으면 없는 것으로 본다 */
  const hasLeaf = leaves > 0 && onUseLeaf != null;

  /*
    지나갈 길이 하나도 없으면 자리를 아예 두지 않는다. 눌러 봐야 안 되는 버튼을 세우면
    그 자리가 고장으로 읽힌다.

    ⚠ **이미 시작했거나 받아 둔 것이 있으면 유지한다.** 연꽃을 쓰면 잔액이 0 이 되는데,
    그때 이 자리가 사라지면 방금 치른 값으로 받던 것까지 화면에서 없어진다. 부르는 쪽에서
    이 판정을 하다가 실제로 그렇게 됐다.
  */
  if (!adSupported && !hasLeaf && result == null && phase === 'idle') return null;

  return (
    <div className="ext-card" ref={cardRef} {...testId(TEST_IDS.extensionCard)}>
      <p className="eyebrow">조금 더 깊게 보고 싶다면</p>

      {result != null ? (
        <div
          ref={resultRef}
          tabIndex={-1}
          className="ext-result"
          {...testId(TEST_IDS.extensionResult)}
        >
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
            /*
              ⚠ 버튼이 사라지고 이 블록이 들어선다. 시트 둘은 `BottomSheet` 가 포커스를
              가두고 돌려주지만 이 카드는 문서 흐름에 그냥 놓여 있어 그 보호가 없다.
              최소한 **지금 무슨 일이 도는지는 읽히게** 한다(2026-09-24 리뷰).
            */
            <div className="pending" role="status" style={{ marginTop: 'var(--s-4)' }}>
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
                쓸 수 있고, 값을 이미 치른 사람이 가장 먼저 하는 걱정이 그것이다.

                ⚠ **무엇으로 치렀는지에 맞춰 말한다.** 연꽃으로 온 사람에게 「광고를 다시
                보지 않아도 돼요」라고 하면, 광고를 본 적도 없는데 광고 이야기를 듣고
                정작 궁금한 것(연꽃을 또 써야 하나)에는 답을 못 듣는다(2026-09-24 리뷰).
              */}
              <p role="status">
                {failure}{' '}
                {paidWith === 'leaf' ? '연꽃을 다시 쓰지 않아도 돼요.' : '광고를 다시 보지 않아도 돼요.'}
              </p>
              <button type="button" className="ad-btn" onClick={() => void build()}>
                다시 받아보기
              </button>
            </div>
          ) : hasLeaf ? (
            /*
              연꽃이 있으면 이쪽이 주 버튼이고 광고는 아래 보조로 내려간다. 이어가기 ·
              간직 시트와 같은 순서다. 뒤집으면 이미 값을 치러 둔 사람 앞에 광고를 또
              세우는 셈이고, 그러면 연꽃을 미리 모을 이유가 그 자리에서 사라진다.
            */
            <div className="ext-choices">
              <LeafUseButton
                count={leaves}
                action="다른 관점 하나 더 보기"
                disabled={phase === 'watching'}
                onClick={payWithLeaf}
                testKey="leafSpendExtension"
              />
              {/* 광고를 못 띄우는 기기에서는 이 줄을 아예 그리지 않는다 */}
              {adSupported && (
                <LeafAltAdButton
                  lead={AD_LEAD}
                  label="보고 다른 관점 하나 더 보기"
                  disabled={!adReady}
                  busy={phase === 'watching'}
                  busyLabel="준비하고 있어요"
                  onClick={() => void watch()}
                  testKey="extensionCta"
                />
              )}
            </div>
          ) : (
            <button
              type="button"
              className="ad-btn"
              disabled={!adReady || phase === 'watching'}
              onClick={() => void watch()}
              {...testId(TEST_IDS.extensionCta)}
            >
              {phase === 'watching' || !adReady ? (
                <>
                  {/* 흐려지기만 하면 멈춘 것으로 읽힌다. 다른 광고 버튼 넷과 같이 도는 표를 둔다 */}
                  <Spinner className="ad-btn__spin" />
                  준비하고 있어요
                </>
              ) : (
                <>
                  {/* 광고 자리 넷이 같은 말투다: 얼마나 걸리는지와 무엇을 얻는지를 한 줄에 */}
                  {AD_LEAD != null && `${AD_LEAD} `}
                  <span className="ad-tag" {...testId(TEST_IDS.adBadge)}>
                    광고
                  </span>{' '}
                  보고 다른 관점 하나 더 보기
                </>
              )}
            </button>
          )}

          {/*
            연꽃을 모으러 가는 자리. 이어가기 · 간직 시트와 같은 부품이고 같은 순서다:
            광고 버튼 **아래**에 테두리 한 겹으로만 선다. 지금 답을 읽고 있는 사람에게
            먼저 권할 일이 아니라 「이번엔 광고를 보고 다음부터는 안 봐도 된다」로 읽혀야 한다.

            가져오는 중이거나 실패한 뒤에는 감춘다. 그 두 자리는 이미 값을 치른 사람이
            보는 화면이라, 모으러 가라는 말이 「한 번 더 내라」로 읽힌다.
          */}
          {onCollectLeaf != null && phase !== 'building' && phase !== 'failed' && (
            <LeafCollectCta
              count={leaves}
              action="봐요"
              disabled={phase === 'watching'}
              onClick={onCollectLeaf}
              testKey="leafCollectExtension"
            />
          )}
        </>
      )}
    </div>
  );
}
