/**
 * 답변 화면 조립.
 *
 * answer 도메인은 답을 그리는 일만 한다. 공유(share) · 간직(archive) · 보상형 광고(ads) ·
 * 오늘 몇 번째였나(quota) · 내일의 회고 카드(daily)를 잇는 일은 app 층인 여기서 한다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useRewardedAd } from '../../domains/ads/useRewardedAd';
import { AnswerScreen } from '../../domains/answer/AnswerScreen';
import { Paywall, saveAnswer } from '../../domains/archive';
import { writeRecall } from '../../domains/daily/RecallCard';
import { dayKey, recordAndSave } from '../../domains/quota/quota';
import { ShareSheet } from '../../domains/share/ShareSheet';
import { useAnalytics } from '../../shared/analytics';
import type { ApiAnswer } from '../../shared/api';
import { useApiClient } from '../../shared/api';
import { useSession } from '../../shared/session';
import { useBridge } from '../providers';

import './screens.css';

/** 공유 주소. 서버가 토큰을 발급하면 이 자리만 그 값으로 바꾼다 */
function shareUrlFor(answerId: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/s/${answerId}`;
}

/** 카드에 올릴 해설. 첫 문장만 쓰는 일은 공유 카드가 한다 */
function glossOf(answer: ApiAnswer): string {
  return answer.pass2.status === 'done' ? answer.pass2.scriptureExplanation : '';
}

export function AnswerRoute() {
  const bridge = useBridge();
  const client = useApiClient();
  const analytics = useAnalytics();
  const { response } = useSession();
  const ad = useRewardedAd('extension');

  const [shareOpen, setShareOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const answer = response != null && response.responseType === 'answer' ? response : null;

  // 오늘 쓴 횟수는 답이 실제로 나온 뒤에 센다. 답변 하나에 한 번이다
  const counted = useRef('');
  useEffect(() => {
    if (response == null) return;
    if (response.responseType === 'answer') {
      if (counted.current === response.answerId) return;
      counted.current = response.answerId;
      recordAndSave(response.route);
      return;
    }
    if (response.responseType === 'light') {
      if (counted.current === response.answerId) return;
      counted.current = response.answerId;
      recordAndSave('light');
    }
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

  const save = useCallback(() => {
    if (answer == null) return;
    const result = saveAnswer({
      answerId: answer.answerId,
      line: answer.modernBuddhaMessage,
      tags: answer.emotionTags,
      visualTheme: answer.visualTheme,
    });
    analytics.log(
      'save_click',
      { answer_id: answer.answerId, slot_index: result.slotIndex },
      { kind: 'click' },
    );

    if (result.status === 'limit') {
      setPaywallOpen(true);
      return;
    }
    setToast(result.status === 'already' ? '이미 보관함에 있어요' : '보관함에 간직했어요');
  }, [analytics, answer]);

  const watchAd = useCallback(() => ad.show(answer?.answerId), [ad, answer]);

  /** 링크가 가리킬 카드를 먼저 만들어 둔다. 링크만 있고 내용이 없으면 받은 사람은 만료 화면을 본다 */
  const openShare = useCallback(() => {
    setShareOpen(true);
    if (answer == null) return;
    void client.createShareToken({
      answerId: answer.answerId,
      card: {
        buddhaMessage: answer.modernBuddhaMessage,
        scripture: answer.scriptures[0],
        emotionTags: answer.emotionTags,
        explanation: answer.pass2.status === 'done' ? [answer.pass2.scriptureExplanation] : [],
      },
    });
  }, [answer, client]);

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
          tags={answer.emotionTags}
          buddhaMessage={answer.modernBuddhaMessage}
          scripture={answer.scriptures[0]}
          gloss={glossOf(answer)}
          shareUrl={shareUrlFor(answer.answerId)}
        />
      )}

      <Paywall open={paywallOpen} trigger="save_4th" onClose={() => setPaywallOpen(false)} />

      {toast != null && (
        <p className="route-toast" role="status">
          {toast}
        </p>
      )}
    </>
  );
}
