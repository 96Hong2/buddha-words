/**
 * 홈 조립.
 *
 * 도메인끼리는 서로를 import 하지 않는다. 그래서 concern(입력) · daily(오늘의 한마디·회고) ·
 * quota(오늘 몇 번째 이야기인가)를 잇는 일은 app 층인 여기서 한다.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { HomeScreen, type HomeCardSlot } from '../../domains/concern/HomeScreen';
import { DailyQuoteCard } from '../../domains/daily/DailyQuoteCard';
import { DailyQuoteSheet } from '../../domains/daily/DailyQuoteSheet';
import { RecallAsk } from '../../domains/daily/RecallAsk';
import { ReviewCard } from '../../domains/growth/ReviewCard';
import { LeafChip, LeafSheet, useLeafWallet } from '../../domains/leaf';
import { OnboardingScreen, onboardingPending } from '../../domains/onboarding';
import { ContinueSheet } from '../../domains/quota/ContinueSheet';
import { gateFor, readQuota, saveFromServer, type QuotaState } from '../../domains/quota/quota';
import { useAnalytics } from '../../shared/analytics';
import { useApiClient, type Quota } from '../../shared/api';
import { resolveApiMode } from '../../shared/api/client';
import { FLAGS } from '../../shared/flags';
import { readMilestones } from '../../shared/prefs/milestones';
import { markReviewAsked, reviewCardDue, snoozeReview } from '../../shared/prefs/review';
import { markAdWatched } from '../../shared/api/http';
import { markEntryCardSeen } from '../../domains/concern/EntryCard';
import {
  clearRecall,
  daysSince,
  hushRecallToday,
  readRecall,
  recallHushedToday,
  RECALL_MAX_DAYS,
  type RecallEntry,
} from '../../shared/prefs/recall';
import { useSession } from '../../shared/session';
import { useBridge } from '../providers';
import { ROUTES } from '../router';

/**
 * 사용량 문을 누가 여는가.
 *
 * **화면이 먼저 막지 않는다.** 예전에는 규칙층(`routeByRules`)만 보고 NORMAL·DEEP 이면
 * 광고 시트를 띄웠다. 규칙층은 위기를 확정하지 못한다(normal·deep 판정은 늘 confidence 0.5,
 * 곧 「분류기가 봐야 한다」는 뜻이다). 그래서 분류기가 잡을 위기 글이 서버에 닿기도 전에
 * 광고에 막혔고, 시트를 닫으면 창구를 영영 못 봤다.
 *
 * 지금은 보내고 나서 서버가 「광고가 필요하다」고 답할 때 시트를 연다. 서버는 위기를
 * 사용량보다 먼저 처리하므로(`routes.py`) 위기 글은 분류기까지 돌아 창구로 간다.
 *
 * 스텁 판에는 사용량을 세는 서버가 없다. 그 판에서만 화면이 기기 사본으로 문을 연다.
 */
/** 진입 카드와 같은 기준(기기 시간대 자정)으로 오늘을 적는다 */
function todayISO(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function serverOpensTheGate(): boolean {
  return resolveApiMode() === 'http';
}

/** 대기 화면이 광고 문에 막혀 돌려보낼 때 들려 보내는 것 */
interface HomeNavState {
  gatedQuota?: Quota;
}

export function HomeRoute() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const bridge = useBridge();
  const { beginSubmit, sent } = useSession();
  const api = useApiClient();
  const analytics = useAnalytics();
  const leaf = useLeafWallet();

  /**
   * 온보딩을 아직 안 봤나. 마운트할 때 한 번만 읽는다.
   *
   * 플래그가 `none` 이면(B안) 온보딩 없이 바로 입력이다. 그 판에서도 본 것으로 적어 두어,
   * 나중에 플래그를 켜도 이미 쓰던 사람에게 첫 화면이 다시 뜨지 않게 한다.
   */
  const [onboarding, setOnboarding] = useState(
    () => FLAGS.onboarding === 'two_step' && onboardingPending(),
  );

  const [quota, setQuota] = useState<QuotaState>(readQuota);
  const [continueOpen, setContinueOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  /**
   * 「어제 적어 드린 그거 해 보셨나요?」로 물어볼 것.
   *
   * 예전에는 답을 받을 때마다 말없이 쌓여서 홈 카드로 매일 물었다. 지금은 답변에서
   * 「내일 했는지 물어봐 주세요」를 **누른 사람에게만** 남고, 다음 날 시트로 한 번 묻는다.
   * 안 눌렀으면 홈에는 아무것도 없다.
   */
  const [recall, setRecall] = useState<RecallEntry | null>(null);
  /** 연잎 모으기 시트 */
  const [leafOpen, setLeafOpen] = useState(false);
  /**
   * 지금까지 받은 답의 수와, 그것으로 정해지는 리뷰 카드.
   *
   * 마운트할 때 한 번 읽고 끝이다. 홈에 서 있는 동안에는 답이 늘지 않고, 답을 받고
   * 돌아오면 이 화면이 새로 마운트된다.
   */
  const [answers] = useState(() => readMilestones().answers);
  const [reviewOpen, setReviewOpen] = useState(() => reviewCardDue(readMilestones().answers));
  /** 시트가 열려 있는 동안 들고 있는 글. 시트를 닫아도 입력창에는 그대로 남는다 */
  const held = useRef('');
  /** 이미 문을 연 서버 사용량. 같은 값으로 시트를 두 번 열지 않는다 */
  const handledCap = useRef<Quota | null>(null);

  /**
   * 서버가 사용량으로 막아 대기 화면이 돌려보낸 자리.
   *
   * 서버가 센 값을 기기 사본에 적어 둔다. 그리고 그 값이 말하는 문을 바로 연다:
   * 이어가기가 남아 있으면 광고 시트, 다 썼으면 천장 안내다.
   * 왜 답이 안 나왔는지 모른 채 홈에 서 있게 두지 않는다.
   *
   * 한 번 쓰고 나면 히스토리에서도 지운다. 남겨 두면 광고를 보고 답까지 받은 뒤 뒤로 돌아왔을 때
   * 그 낡은 값이 다시 살아나, 이미 쓴 횟수를 안 쓴 것으로 되돌리고 광고 시트를 또 연다.
   */
  useEffect(() => {
    const capped = (state as HomeNavState | null)?.gatedQuota;
    // 같은 자리에서 온 값은 한 번만 연다. 글을 고쳐 다시 보낼 때 옛 값이 시트를 또 열면 안 된다
    if (capped == null || handledCap.current === capped) return;
    handledCap.current = capped;
    void navigate(ROUTES.home, { replace: true, state: null });
    setQuota(saveFromServer(capped));
    // 보낸 글은 세션이 그대로 쥐고 있다. 광고를 다 보면 이 글을 그대로 잇는다
    held.current = sent;
    setContinueOpen(true);
  }, [navigate, sent, state]);

  /**
   * 물어볼 것이 남아 있나.
   *
   * 셋을 다 본다. 오늘 받은 답을 두고 「어제 이야기」라고 물을 수 없고(1일), 한 달 전 것을
   * 들고 와도 그 사람은 이미 잊었다(7일). 오늘 한 번 닫았으면 그날은 더 묻지 않는다.
   */
  useEffect(() => {
    let alive = true;
    void readRecall(bridge.storage).then((entry) => {
      if (!alive) return;
      if (entry == null) {
        setRecall(null);
        return;
      }
      const since = daysSince(entry.date);
      const dueToday = since >= 1 && since <= RECALL_MAX_DAYS;
      setRecall(dueToday && !recallHushedToday() ? entry : null);
      // 이레가 지나면 조용히 버린다. 남겨 두면 다음 달에도 계속 걸린다
      if (since > RECALL_MAX_DAYS) void clearRecall(bridge.storage);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  const send = useCallback(
    (text: string) => {
      beginSubmit(text);
      void navigate(ROUTES.loading);
    },
    [beginSubmit, navigate],
  );

  const submit = useCallback(
    (text: string) => {
      if (serverOpensTheGate()) {
        // 막지 않고 보낸다. 광고가 필요하면 서버가 답으로 알려 주고 위의 효과가 시트를 연다
        send(text);
        return;
      }

      const state = readQuota();
      setQuota(state);

      const gate = gateFor(state);
      if (gate === 'free') {
        send(text);
        return;
      }
      held.current = text;
      setContinueOpen(true);
    },
    [send],
  );

  const closeContinue = useCallback(() => setContinueOpen(false), []);

  const goOn = useCallback(() => {
    setContinueOpen(false);
    const text = held.current;
    held.current = '';
    if (text === '') return;
    // 이어가기 광고 자리를 지났다는 표를 세운다. 다음 요청이 이걸 들고 가야 서버가 문을 연다.
    // 보상형 판에서는 끝까지 본 사람만 여기까지 온다. 광고가 안 온 사람은 그냥 통과한다
    markAdWatched();
    send(text);
  }, [send]);

  /**
   * 연잎으로 이어간다. 광고를 띄우지 않는다.
   *
   * **잔액을 빼는 데 성공했을 때만 넘어간다.** 두 화면이 거의 같은 순간에 마지막 한 장을
   * 쓰려 할 때, 있다고 믿고 진행하면 없는 연잎으로 두 번 지나간다.
   *
   * `goOn` 이 `markAdWatched` 를 세운다. 서버는 연잎을 모르므로(기기에만 있다) 그 표가
   * 없으면 광고 문에서 다시 막힌다. 연잎도 광고 한 편을 미리 치른 것이라 같은 표를 쓴다.
   */
  const continueWithLeaf = useCallback(() => {
    if (!leaf.spend('continue')) return;
    analytics.log('ad_skipped', { placement: 'continue', reason: 'leaf' });
    goOn();
  }, [analytics, goOn, leaf]);

  /**
   * 리뷰 화면을 청한다.
   *
   * **떴는지는 알 수 없다.** `Review.request` 가 아무것도 돌려주지 않고, 토스가 사람의
   * 피로도를 보고 띄울지 정한다. 그래서 여기서 「청했다」를 적고 다시 묻지 않는다.
   * 못 연 경우(`failed`)만 미룸으로 돌려, 우리 쪽 사정으로 기회를 잃지 않게 한다.
   */
  const askReview = useCallback(async () => {
    analytics.log('review_card_accept', { answers_total: answers }, { kind: 'click' });
    setReviewOpen(false);

    if (!bridge.supports('review')) {
      // 낡은 토스 앱이다. 업데이트를 청하는 말을 여기서 꺼내지 않는다. 부탁이 두 겹이 된다
      markReviewAsked();
      analytics.log('review_request', { result: 'unsupported' });
      return;
    }
    try {
      await bridge.requestReview();
      markReviewAsked();
      analytics.log('review_request', { result: 'asked' });
    } catch {
      // 우리 쪽 사정으로 못 열었다. 영영 안 묻는 대신 답을 두 번 더 받으면 한 번 더 묻는다
      snoozeReview(answers);
      analytics.log('review_request', { result: 'failed' });
    }
  }, [analytics, answers, bridge]);

  const laterReview = useCallback(() => {
    analytics.log('review_card_later', { answers_total: answers }, { kind: 'click' });
    snoozeReview(answers);
    setReviewOpen(false);
  }, [analytics, answers]);

  const renderCards = useCallback(
    ({ quote, focusField }: HomeCardSlot): ReactNode =>
      quote != null ? (
        <>
          <DailyQuoteCard quote={quote} onOpen={() => setDailyOpen(true)} />
          <DailyQuoteSheet
            open={dailyOpen}
            quote={quote}
            onClose={() => setDailyOpen(false)}
            onStart={focusField}
          />
        </>
      ) : null,
    [dailyOpen],
  );

  /**
   * 물어본 것에 답했다. 기기에서도 지운다. 화면에서만 치우면 다음에 또 같은 것을 묻는다.
   *
   * 서버 예약도 거둔다. 알림이 가기 전에 앱에서 먼저 답한 사람에게 같은 것을 또 물으면,
   * 되짚기가 아니라 잔소리가 된다.
   */
  const respondRecall = useCallback(() => {
    void clearRecall(bridge.storage);
    void api.cancelReminder().catch(() => {
      // 못 거뒀으면 알림이 한 번 더 간다. 그것 때문에 홈을 멈추지 않는다
    });
    setRecall(null);
  }, [api, bridge]);

  /**
   * 답하지 않고 닫았다.
   *
   * 기기에서 지우지는 않는다. 답할 마음이 남아 있을 수 있다. 다만 **오늘은 더 묻지 않는다.**
   * 이 표가 없으면 앱을 열 때마다 같은 질문이 다시 서고, 그것이 예전 회고 카드가 받은 불평이다.
   */
  const hushRecall = useCallback(() => {
    hushRecallToday();
    setRecall(null);
  }, []);

  /**
   * 온보딩과 진입 카드가 잇달아 뜨면 첫 실행이 덮개 두 장으로 시작한다.
   * 온보딩을 본 날은 오늘의 한마디 카드를 띄우지 않는다. 홈의 카드 자리에는 그대로 있다.
   *
   * 홈에 추가 안내는 여기서 띄우지 않는다. 첫 화면에서 하려던 일(이야기 쓰기)을 가리지
   * 않으려고 첫 답을 받은 뒤로 옮겼다(`AnswerRoute` 의 권유 시간표).
   */
  const doneOnboarding = useCallback(() => {
    markEntryCardSeen(todayISO());
    setOnboarding(false);
  }, []);

  if (onboarding) return <OnboardingScreen onDone={doneOnboarding} />;

  return (
    <>
      <HomeScreen
        onSubmit={submit}
        renderCards={renderCards}
        leafChip={<LeafChip onOpen={() => setLeafOpen(true)} />}
        /*
          맨 앞 자리. **되짚기가 있으면 리뷰는 그날 물러난다.**
          되짚기는 사람이 「내일 물어봐 주세요」를 눌러 청한 것이고 리뷰는 우리가 하는
          부탁이다. 둘이 한 화면에 쌓이면 이야기를 쓰러 온 사람 앞에 카드가 두 장 선다.
        */
        leadCard={
          <ReviewCard
            open={reviewOpen && recall == null}
            answersTotal={answers}
            onAccept={() => void askReview()}
            onLater={laterReview}
          />
        }
        /* 「내일 물어봐 주세요」를 누른 사람에게만, 다음 날 입력칸 바로 위에 한 번 */
        topCard={<RecallAsk entry={recall} onRespond={respondRecall} onClose={hushRecall} />}
      />

      <ContinueSheet
        open={continueOpen}
        continuesUsed={quota.continuesUsed}
        onClose={closeContinue}
        onContinue={goOn}
        leaves={leaf.count}
        onUseLeaf={continueWithLeaf}
      />

      {/*
        연잎 모으기. 홈에서 여는 판은 **모으고 나서도 시트에 남는다.**
        한 장 모았다고 닫아 버리면 여러 장 쌓으려는 사람이 칩을 매번 다시 눌러야 한다.
      */}
      <LeafSheet open={leafOpen} surface="home_chip" onClose={() => setLeafOpen(false)} />
    </>
  );
}
