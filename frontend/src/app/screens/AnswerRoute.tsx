/**
 * 답변 화면 조립.
 *
 * answer 도메인은 답을 그리는 일만 한다. 공유(share) · 간직(archive) · 보상형 광고(ads) ·
 * 오늘 몇 번째였나(quota) · 내일의 회고 카드(daily)를 잇는 일은 app 층인 여기서 한다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useRewardedAd } from '../../domains/ads/useRewardedAd';
import { AnswerScreen } from '../../domains/answer/AnswerScreen';
import { useExtensionResult } from '../../domains/answer/ExtensionCard';
import {
  countSaved,
  isSaved,
  Paywall,
  saveAnswer,
  SaveDone,
  SaveGate,
  type SaveDoneKind,
} from '../../domains/archive';
import { NudgeOverlay, notifyAlreadySettled } from '../../domains/growth/NudgeOverlay';
import {
  countAnswer,
  markNudgeShown,
  nudgeFor,
  readMilestones,
  type Nudge,
} from '../../shared/prefs/milestones';
import { notifyUsable, notifyTemplateCode } from '../../shared/prefs/notify';
import { recordAndSave, saveFromServer } from '../../domains/quota/quota';
import { ShareSheet, type ShareLinkState } from '../../domains/share/ShareSheet';
import { appShareUrl } from '../../domains/share/shareText';
import type { ShareScope } from '../../shared/api';
import { useAnalytics } from '../../shared/analytics';
import type { ApiAnswer } from '../../shared/api';
import { useApiClient } from '../../shared/api';
import { resolveApiBaseUrl } from '../../shared/api/baseUrl';
import { resolveApiMode } from '../../shared/api/client';
import { useSession } from '../../shared/session';
import { ROUTES } from '../router';
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
type StoreOutcome = 'saved' | 'already' | 'failed';

/** 담지 못했을 때만 토스트다. 담긴 경우는 완료 시트가 받는다 */
const SAVE_FAIL_TOAST = '지금은 간직하지 못했어요. 잠시 뒤에 다시 눌러 주세요';

export function AnswerRoute() {
  const bridge = useBridge();
  const client = useApiClient();
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const { response, archivePass } = useSession();
  const ad = useRewardedAd('extension');
  const saveAd = useRewardedAd('save');

  const [shareOpen, setShareOpen] = useState(false);
  /** 무엇을 보낼지. 기본은 적게 나가는 쪽이다 */
  const [scope, setScope] = useState<ShareScope>('scripture');
  const [link, setLink] = useState<ShareLinkState>({ status: 'making' });
  /** 간직 앞에 서는 광고 안내 시트 */
  const [gateOpen, setGateOpen] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** 간직하고 나서 뜨는 한 장. 담긴 경우에만 연다 */
  const [done, setDone] = useState<SaveDoneKind | null>(null);
  /**
   * 이 사람의 몇 번째 답인가. 광고를 띄울지와 무엇을 권할지를 이 수 하나가 정한다.
   *
   * **저장소에서 읽어 시작한다.** 0 으로 두면 요청2가 도착하기 전까지 몇 번째 답이든
   * 「첫 답」으로 보여, 그 사이에 간직하기를 누른 사람이 늘 광고 없이 담긴다.
   * 아래 효과가 이번 답을 세고 나면 그 값으로 덮인다.
   */
  const [answersTotal, setAnswersTotal] = useState(() => readMilestones().answers);
  /** 이번 답에서 띄울 권유 하나. 없으면 아무것도 안 뜬다 */
  const [nudge, setNudge] = useState<Nudge | null>(null);
  /** 간직 시트에서 「광고 없이」를 눌렀을 때 여는 이용권 시트 */
  const [paywallOpen, setPaywallOpen] = useState(false);

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

  /**
   * 지금까지 받은 답이 몇 개인가. 이 수 하나가 두 가지를 정한다.
   *
   *   광고    첫 답까지는 띄우지 않는다. 값을 한 번 받아 본 사람에게만 값을 받으라고 한다
   *   권유    1·2·3·4 번째에 하나씩. 시간표는 milestones 한 곳에 있다
   *
   * 하루 사용량(quota)과 따로 센다. 그쪽은 자정에 리셋되고 이쪽은 계속 쌓인다.
   * 답이 **다 만들어진 뒤**에 센다. 요청1만 온 화면에서 권하면 아직 답을 못 본 사람에게
   * 남에게 권하라고 하는 셈이다.
   */
  const milestoned = useRef('');
  useEffect(() => {
    if (answer == null || answer.pass2.status !== 'done') return;
    if (milestoned.current === answer.answerId) return;
    milestoned.current = answer.answerId;

    // 같은 답으로 두 번 세지 않는 일은 저장소가 한다. 화면 ref 로는 못 막는다.
    // 보관함의 「오늘 나눈 이야기」로 같은 답에 다시 들어오면 이 화면이 새로 마운트된다
    const total = countAnswer(answer.answerId);
    setAnswersTotal(total);
    // 첫 사용 무료의 본전을 재는 자리. 분모가 1, 분자가 2 다
    analytics.log(
      'answer_milestone',
      { answers_total: total, is_first: total === 1 },
      { once: `answer_milestone:${answer.answerId}` },
    );

    const next = nudgeFor(total);
    if (next == null) return;
    // 알림을 못 켜는 판이거나 이미 켠 사람이다. 그 한 번을 죽은 버튼·이미 한 대답에 쓰지 않는다
    if (next === 'notify' && (!notifyUsable(bridge.supports('notification')) || notifyAlreadySettled())) {
      return;
    }
    /*
     * 「띄웠다」를 여기서 센다. 카드 안에서 세면 안 된다. 카드는 공유 시트·간직 시트가
     * 열릴 때 언마운트되고 시트를 닫으면 다시 마운트되는데, 그때 컴포넌트 안의 가드는
     * 비어 있다. 한 번 띄운 것이 둘로 세어져 네 번째 자리의 홈 추가가 통째로 사라졌다.
     */
    markNudgeShown(next);
    setNudge(next);
  }, [analytics, answer, bridge]);

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
    (gate: 'ad' | 'pass' | 'free' | 'first_use'): StoreOutcome => {
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
      );

      if (result.status === 'already') return 'already';
      // 담았다는 답을 그대로 믿지 않는다. 저장소가 막힌 기기에서는 담겨 있지 않다
      if (countSaved() <= before) return 'failed';
      // 실제로 담긴 것만 센다. 누른 것(save_click)과 담긴 것을 가르는 자리다
      analytics.log('save_complete', {
        answer_id: answer.answerId,
        slot_index: result.slotIndex,
        gate,
      });
      return 'saved';
    },
    [analytics, answer, extension],
  );

  /**
   * 담긴 결과를 화면에 옮긴다. 담겼으면 시트, 못 담았으면 토스트다.
   *
   * 예전에는 셋 다 토스트 한 줄이었다. 2.4초 뒤에 사라지고 끝이라 **담은 것을 보러 갈 길이
   * 없었다.** 담긴 경우에만 시트를 열어 두 갈래를 둔다.
   */
  const afterStore = useCallback((outcome: StoreOutcome) => {
    if (outcome === 'failed') {
      setToast(SAVE_FAIL_TOAST);
      return;
    }
    setDone(outcome);
  }, []);

  /**
   * 간직하기를 눌렀다.
   *
   * 문지기는 짧은 광고 하나다. 셋까지 공짜로 담기던 개수 제한은 없앴다.
   * 아래 넷은 광고를 거치지 않는다. 광고가 **간직 자체를 막으면 안 되기** 때문이다.
   *
   *   이미 담긴 답변    담을 것이 없다. 광고를 보여 줄 이유가 없다
   *   첫 답변          아직 이 앱이 무엇인지 본 것이 하나뿐이다. 그 하나에 값을 매기지 않는다
   *   이용권을 산 사람   그 사람이 산 것이 지금은 이것이다
   *   광고를 못 띄우는 판 구버전·광고 끄기·그룹 id 가 없는 번들. 그냥 담는다
   *
   * 넷 다 화면에서는 똑같이 「광고 없이 담겼다」로 보인다. 왜 없었는지를 `ad_skipped` 로
   * 남겨야 나중에 0건을 보고 원인을 가를 수 있다.
   */
  const save = useCallback(() => {
    if (answer == null) return;
    analytics.log(
      'save_click',
      { answer_id: answer.answerId, slot_index: countSaved() + 1 },
      { kind: 'click' },
    );

    if (isSaved(answer.answerId)) {
      /*
       * 이미 담긴 답이라 광고를 보여 줄 이유가 없다.
       *
       * 그래도 `store` 를 부른다. 간직한 **뒤에** 광고를 보고 「다른 관점」을 받는 순서가
       * 있어서, 그때 다시 간직하기를 누르면 그 조각을 마저 담아야 한다(archiveStore 의
       * `fillDetail`). 여기서 시트만 띄우고 돌아가면 광고를 끝까지 본 대가가 사라진다.
       */
      analytics.log('ad_skipped', { placement: 'save', reason: 'already_saved' });
      afterStore(store('free'));
      return;
    }
    // 아직 답을 하나밖에 못 받아 본 사람이다. 그 첫 답을 간직하는 데 값을 매기지 않는다
    if (answersTotal <= 1) {
      analytics.log('ad_skipped', { placement: 'save', reason: 'first_use' });
      afterStore(store('first_use'));
      return;
    }
    if (archivePass === 'owned') {
      analytics.log('ad_skipped', { placement: 'save', reason: 'pass' });
      afterStore(store('pass'));
      return;
    }
    if (!saveAd.ready || !saveAd.supported) {
      analytics.log('ad_skipped', { placement: 'save', reason: 'unsupported' });
      afterStore(store('free'));
      return;
    }
    setGateOpen(true);
  }, [afterStore, analytics, answer, answersTotal, archivePass, saveAd.ready, saveAd.supported, store]);

  /** 「보고 간직하기」를 눌렀다. 끝까지 본 사람만 담긴다 */
  const watchAndSave = useCallback(async () => {
    if (answer == null || gateBusy) return;
    analytics.log('save_gate_accept', { answer_id: answer.answerId }, { kind: 'click' });
    setGateBusy(true);
    let watched = false;
    try {
      watched = (await saveAd.show(answer.answerId)) === 'watched';
    } catch {
      watched = false;
    }
    setGateBusy(false);
    setGateOpen(false);
    // 스스로 닫은 사람에게는 아무 말도 하지 않는다. 실패라고 말할 일이 아니다.
    // 다만 광고가 **뜨지도 못한** 판이면 간직을 막지 않는다. 광고 사정으로 기능이 죽는다
    if (watched) {
      afterStore(store('ad'));
      return;
    }
    if (!saveAd.supported) afterStore(store('free'));
  }, [afterStore, analytics, answer, gateBusy, saveAd, store]);

  const watchAd = useCallback(
    async () => (await ad.show(answer?.answerId)) === 'watched',
    [ad, answer],
  );

  /**
   * 링크가 가리킬 카드를 먼저 만들어 둔다. 링크만 있고 내용이 없으면 받은 사람은 만료 화면을 본다.
   *
   * **결과를 반드시 받는다.** 예전에는 이 호출을 던져만 두어서, 실패하면 아무도 잡지 않는
   * 거절로 끝나고 화면은 링크가 만들어진 것처럼 굴었다. 지금은 시트가 세 상태를 그대로 그린다.
   */
  const makeLink = useCallback(
    (want: ShareScope) => {
      if (answer == null) return;
      setLink({ status: 'making' });
      client
        .createShareToken({
          answerId: answer.answerId,
          scope: want,
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
    },
    [answer, client],
  );

  /**
   * 범위를 바꾸면 링크를 다시 연다.
   *
   * 링크 하나에 무엇이 담겼는지는 만들 때 정해진다. 바꾸고 나서 옛 주소를 보내면 고른 것과
   * 다른 것이 나간다.
   */
  const changeScope = useCallback(
    (next: ShareScope) => {
      setScope(next);
      makeLink(next);
    },
    [makeLink],
  );

  const openShare = useCallback(() => {
    setShareOpen(true);
    setScope('scripture');
    makeLink('scripture');
  }, [makeLink]);

  /** 네이티브 공유 시트를 연다. 받는 앱은 기기가 고른다 */
  const sendMessage = useCallback(
    async (message: string) => {
      if (!bridge.supports('share')) return 'unsupported' as const;
      return bridge.share.sendMessage(message);
    },
    [bridge],
  );

  /** 알림 동의를 묻는다. 결과 셋을 그대로 돌려준다 */
  const askNotify = useCallback(async () => {
    if (!bridge.supports('notification')) return 'unsupported' as const;
    try {
      const result = await bridge.requestNotificationAgreement(notifyTemplateCode());
      return result === 'agreementRejected' ? ('denied' as const) : ('granted' as const);
    } catch {
      return 'unsupported' as const;
    }
  }, [bridge]);

  return (
    <>
      <AnswerScreen
        onShare={openShare}
        onSave={save}
        onWatchAd={watchAd}
        adReady={ad.ready}
        adSupported={ad.ready && ad.supported}
      />

      {/*
        답변 위로 올라오는 권유 한 장. 한 번에 하나이고 덮개를 쓰지 않는다.
        간직 시트나 공유 시트가 열려 있는 동안에는 물러난다. 시트 둘이 겹치면
        사람이 무엇을 누르고 있는지 잃는다.
      */}
      {nudge != null && !gateOpen && !shareOpen && done == null && paywallOpen === false && (
        <NudgeOverlay
          nudge={nudge}
          answersTotal={answersTotal}
          appUrl={appShareUrl()}
          onSendMessage={sendMessage}
          onAskNotify={askNotify}
          onDone={() => setNudge(null)}
        />
      )}

      {answer != null && (
        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          answerId={answer.answerId}
          scripture={answer.scriptures[0]}
          gloss={glossOf(answer)}
          scope={scope}
          onScopeChange={changeScope}
          answer={answer}
          link={link}
          onRetryLink={() => makeLink(scope)}
          onSendMessage={sendMessage}
        />
      )}

      {answer != null && (
        <SaveGate
          open={gateOpen}
          answerId={answer.answerId}
          pending={gateBusy}
          onClose={() => setGateOpen(false)}
          onWatch={() => void watchAndSave()}
          onBuyPass={() => {
            setGateOpen(false);
            setPaywallOpen(true);
          }}
        />
      )}

      {answer != null && (
        <SaveDone
          open={done != null}
          kind={done ?? 'saved'}
          answerId={answer.answerId}
          onGoArchive={() => {
            analytics.log('save_done_action', { action: 'archive' }, { kind: 'click' });
            setDone(null);
            void navigate(ROUTES.archive);
          }}
          onStay={() => {
            analytics.log('save_done_action', { action: 'stay' }, { kind: 'click' });
            setDone(null);
          }}
        />
      )}

      <Paywall
        open={paywallOpen}
        trigger="save_ad"
        onClose={() => setPaywallOpen(false)}
        // 사려던 이유는 이 답변을 간직하는 것이었다. 사고 나면 그 일을 마저 한다
        onPurchased={() => afterStore(store('pass'))}
      />

      {toast != null && (
        <p className="route-toast" role="status">
          {toast}
        </p>
      )}
    </>
  );
}
