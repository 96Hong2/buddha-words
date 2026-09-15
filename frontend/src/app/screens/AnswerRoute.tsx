/**
 * 답변 화면 조립.
 *
 * answer 도메인은 답을 그리는 일만 한다. 공유(share) · 간직(archive) · 보상형 광고(ads) ·
 * 오늘 몇 번째였나(quota) · 내일의 회고 카드(daily)를 잇는 일은 app 층인 여기서 한다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useRewardedAd } from '../../domains/ads/useRewardedAd';
import { AnswerScreen } from '../../domains/answer/AnswerScreen';
import { useExtensionResult } from '../../domains/answer/ExtensionCard';
import { countSaved, Paywall, saveAnswer } from '../../domains/archive';
import { writeRecall } from '../../domains/daily/RecallCard';
import { dayKey, recordAndSave, saveFromServer } from '../../domains/quota/quota';
import { ShareSheet, type ShareLinkState } from '../../domains/share/ShareSheet';
import { useAnalytics } from '../../shared/analytics';
import type { ApiAnswer } from '../../shared/api';
import { useApiClient } from '../../shared/api';
import { resolveApiBaseUrl } from '../../shared/api/baseUrl';
import { resolveApiMode } from '../../shared/api/client';
import { useSession } from '../../shared/session';
import { useBridge } from '../providers';

import './screens.css';

/**
 * 서버가 주소를 못 준 판에서만 쓰는 공유 주소.
 *
 * 가리키는 곳은 **백엔드 랜딩**이다. 이 앱 주소로 만들면 카톡·트위터 미리보기에 앱 소개
 * 그림만 뜬다. 여기는 CSR 이라 크롤러가 긁는 문서에 실을 글이 아직 없다. 백엔드 `/s/{token}`
 * 은 OG 메타가 박힌 문서를 내려주고, 사람이 열면 그 문서가 다시 이 앱의 랜딩으로 넘겨 준다.
 *
 * 평소에는 여기까지 오지 않는다. 서버가 `landingUrl` 을 내려 주고 화면은 그것을 그대로 쓴다.
 * 스텁 판에는 넘길 백엔드가 아예 없어서, 그때만 앱이 직접 그리는 자리로 둔다.
 */
function shareUrlFor(token: string): string {
  const api = resolveApiMode() === 'http' ? resolveApiBaseUrl() : null;
  if (api != null) return `${api}/s/${token}`;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/s/${token}`;
}

/** 카드에 올릴 해설. 첫 문장만 쓰는 일은 공유 카드가 한다 */
function glossOf(answer: ApiAnswer): string {
  return answer.pass2.status === 'done' ? answer.pass2.scriptureExplanation : '';
}

/** 간직하기 한 번의 끝. `failed` 는 담으려다 못 담은 것이다 */
type StoreOutcome = 'saved' | 'already' | 'limit' | 'failed';

/** 간직한 뒤에 뜨는 말. 담기지 않았으면 담겼다고 하지 않는다 */
const SAVE_TOAST: Record<Exclude<StoreOutcome, 'limit'>, string> = {
  saved: '보관함에 간직했어요. 앱을 닫아도 남아요',
  already: '이미 보관함에 있어요',
  failed: '지금은 간직하지 못했어요. 잠시 뒤에 다시 눌러 주세요',
};

/**
 * 이용권을 샀는데도 자리가 찼다고 나온 자리.
 *
 * 여기까지 오면 안 되지만, 오면 조용히 넘어가지 않는다. 돈을 낸 사람이 간직됐다고 믿고
 * 앱을 닫는 것이 가장 나쁘다. 지금 할 수 있는 일을 알려 준다.
 */
const PURCHASED_BUT_FULL =
  '이용권은 확인했는데 지금 간직하지 못했어요. 보관함에서 하나를 지우고 다시 눌러 주세요';

export function AnswerRoute() {
  const bridge = useBridge();
  const client = useApiClient();
  const analytics = useAnalytics();
  const { response, archivePass } = useSession();
  const ad = useRewardedAd('extension');

  const [shareOpen, setShareOpen] = useState(false);
  const [link, setLink] = useState<ShareLinkState>({ status: 'making' });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const answer = response != null && response.responseType === 'answer' ? response : null;
  /** 광고를 보고 받은 「다른 관점」. 간직할 때 함께 담는다 */
  const extension = useExtensionResult(answer?.answerId);

  /**
   * 오늘 쓴 횟수는 답이 실제로 나온 뒤에 센다. 답변 하나에 한 번이다.
   *
   * 세고 나서 **서버가 같이 보낸 사용량으로 덮어쓴다.** 기기 사본만 세면 저장소를 지우거나
   * 앱을 다시 깐 사람은 오늘 횟수가 처음으로 돌아가고, 서버는 그 익명키의 오늘을 그대로
   * 기억하고 있어 다음 이야기가 천장에서 막힌다. 서버가 세는 값이 정본이다.
   */
  const counted = useRef('');
  useEffect(() => {
    if (response == null) return;
    if (response.responseType === 'answer' && counted.current !== response.answerId) {
      counted.current = response.answerId;
      recordAndSave(response.route);
    } else if (response.responseType === 'light' && counted.current !== response.answerId) {
      counted.current = response.answerId;
      recordAndSave('light');
    }
    if ('quota' in response && response.quota != null) saveFromServer(response.quota);
  }, [response]);

  // 내일 홈에서 물어볼 한 줄. 남기는 것은 행동 제목뿐이고 고민 원문은 담지 않는다
  const recalled = useRef('');
  useEffect(() => {
    if (answer == null || answer.pass2.status !== 'done') return;
    if (recalled.current === answer.answerId) return;
    const first = answer.pass2.actions[0];
    if (first == null) return;
    recalled.current = answer.answerId;
    void writeRecall(bridge.storage, {
      answerId: answer.answerId,
      date: dayKey(),
      tags: answer.emotionTags,
      firstActionTitle: first.title,
    });
  }, [answer, bridge]);

  useEffect(() => {
    if (toast == null) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  /**
   * 간직한다.
   *
   * 답변 본문까지 함께 기기에 남긴다. 세션에만 두면 앱을 닫는 순간 사라져서, 간직해 놓고
   * 보관함에 가면 한 줄과 태그만 남아 있었다. **고민 원문(`sent`)은 넘기지 않는다.**
   *
   * 광고를 보고 받은 「다른 관점」도 같이 담는다. 이것만 빠지면 광고를 끝까지 본 대가가 사라진다.
   */
  const store = useCallback(
    (unlimited: boolean): StoreOutcome => {
      if (answer == null) return 'failed';
      const pass2 = answer.pass2;
      const before = countSaved();
      const result = saveAnswer(
        {
          answerId: answer.answerId,
          line: answer.modernBuddhaMessage,
          tags: answer.emotionTags,
          visualTheme: answer.visualTheme,
          detail: {
            scripture: answer.scriptures[0],
            // 요청2가 오기 전에 간직하면 경전만 남는다. 없는 자리를 지어내지 않는다
            explanation: pass2.status === 'done' ? pass2.scriptureExplanation : undefined,
            terms:
              pass2.status === 'done' ? (pass2.terms ?? answer.scriptures[0]?.terms) : undefined,
            analysis: pass2.status === 'done' ? pass2.personalAnalysis : undefined,
            actions: pass2.status === 'done' ? pass2.actions : undefined,
            closing: pass2.status === 'done' ? pass2.closingMessage : undefined,
            extension:
              extension == null
                ? undefined
                : {
                    scripture: extension.scripture,
                    alternativeAnalysis: extension.alternativeAnalysis,
                    action: extension.action,
                  },
          },
        },
        { unlimited },
      );
      analytics.log(
        'save_click',
        { answer_id: answer.answerId, slot_index: result.slotIndex },
        { kind: 'click' },
      );

      if (result.status === 'limit') return 'limit';
      if (result.status === 'already') return 'already';
      // 담았다는 답을 그대로 믿지 않는다. 저장소가 막힌 기기에서는 담겨 있지 않다
      return countSaved() > before ? 'saved' : 'failed';
    },
    [analytics, answer, extension],
  );

  const save = useCallback(() => {
    const outcome = store(archivePass === 'owned');
    if (outcome === 'limit') {
      setPaywallOpen(true);
      return;
    }
    setToast(SAVE_TOAST[outcome]);
  }, [archivePass, store]);

  /**
   * 이용권을 사고 돌아온 자리.
   *
   * 사람이 사려던 이유는 이 답변을 간직하는 것이었다. 그 일을 마저 한다.
   * 그래도 못 담았으면 담은 척하지 않고 그대로 말한다.
   */
  const saveAfterPurchase = useCallback(() => {
    const outcome = store(true);
    setToast(outcome === 'limit' ? PURCHASED_BUT_FULL : SAVE_TOAST[outcome]);
  }, [store]);

  const watchAd = useCallback(() => ad.show(answer?.answerId), [ad, answer]);

  /**
   * 링크가 가리킬 카드를 먼저 만들어 둔다. 링크만 있고 내용이 없으면 받은 사람은 만료 화면을 본다.
   *
   * **결과를 반드시 받는다.** 예전에는 이 호출을 던져만 두어서, 실패하면 아무도 잡지 않는
   * 거절로 끝나고 화면은 링크가 만들어진 것처럼 굴었다. 지금은 시트가 세 상태를 그대로 그린다.
   */
  const makeLink = useCallback(() => {
    if (answer == null) return;
    setLink({ status: 'making' });
    client
      .createShareToken({
        answerId: answer.answerId,
        card: {
          kind: 'fields',
          buddhaMessage: answer.modernBuddhaMessage,
          scripture: answer.scriptures[0],
          emotionTags: answer.emotionTags,
          explanation: answer.pass2.status === 'done' ? [answer.pass2.scriptureExplanation] : [],
        },
      })
      // 주소는 서버가 준 것을 그대로 쓴다. 못 받은 판에서만 화면이 조립한다
      .then(({ token, landingUrl }) =>
        setLink({ status: 'ready', url: landingUrl ?? shareUrlFor(token) }),
      )
      .catch(() => setLink({ status: 'failed' }));
  }, [answer, client]);

  const openShare = useCallback(() => {
    setShareOpen(true);
    makeLink();
  }, [makeLink]);

  return (
    <>
      <AnswerScreen
        onShare={openShare}
        onSave={save}
        onWatchAd={watchAd}
        adReady={ad.ready}
        adSupported={ad.ready && ad.supported}
      />

      {answer != null && (
        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          answerId={answer.answerId}
          scripture={answer.scriptures[0]}
          gloss={glossOf(answer)}
          link={link}
          onRetryLink={makeLink}
        />
      )}

      <Paywall
        open={paywallOpen}
        trigger="save_4th"
        onClose={() => setPaywallOpen(false)}
        onPurchased={saveAfterPurchase}
      />

      {toast != null && (
        <p className="route-toast" role="status">
          {toast}
        </p>
      )}
    </>
  );
}
