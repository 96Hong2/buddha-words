/**
 * 홈 조립.
 *
 * 도메인끼리는 서로를 import 하지 않는다. 그래서 concern(입력) · daily(오늘의 한마디·회고) ·
 * quota(오늘 몇 번째 이야기인가)를 잇는 일은 app 층인 여기서 한다.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { routeByRules } from '@spec/router.ts';

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
import { ApiFailure, useApiClient, type Quota } from '../../shared/api';
import { resolveApiMode } from '../../shared/api/client';
import { FLAGS } from '../../shared/flags';
import { readMilestones } from '../../shared/prefs/milestones';
import {
  countReviewShown,
  markReviewAsked,
  reviewCardDue,
  snoozeReview,
} from '../../shared/prefs/review';
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
 * **판정은 서버가 하고, 시트는 화면이 먼저 띄운다.** 둘을 나눈 것이 이 구조의 전부다.
 *
 * 한때 화면이 스스로 막았다. 규칙층(`routeByRules`)만 보고 NORMAL·DEEP 이면 광고 시트를
 * 띄웠는데, 규칙층은 위기를 확정하지 못한다(normal·deep 판정은 늘 confidence 0.5, 곧
 * 「분류기가 봐야 한다」는 뜻이다). 분류기가 잡을 위기 글이 서버에 닿기도 전에 광고에
 * 막혔고, 시트를 닫으면 창구를 영영 못 봤다.
 *
 * 그래서 보내고 나서 서버가 「광고가 필요하다」고 답할 때 시트를 열게 고쳤다. 안전은
 * 지켜졌는데 **화면이 한 번 넘어갔다 돌아왔다.** 이야기 보내기를 누르면 답을 만드는
 * 화면이 뜨고, 3초쯤 뒤에 그 화면이 사라지며 광고 시트가 올라왔다. 만들다 만 것처럼
 * 보이고, 광고를 보기도 전에 답이 만들어지는 줄로 읽힌다(2026-09-21 사용자 지적).
 *
 * 지금은 **광고 문이 설 자리면 홈에 선 채로 시트부터 띄우고, 요청은 그 뒤에서 보낸다.**
 * 서버가 하는 일은 한 글자도 안 바뀌었다: 위기면 창구를 주고, 아니면 광고 문을 세운다.
 * 바뀐 것은 그동안 사람이 보는 화면뿐이다. 광고를 다 보면 그때 대기 화면으로 넘어간다.
 *
 * 스텁 판에는 사용량을 세는 서버가 없다. 그 판에서는 기기 사본만으로 시트를 연다.
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
  const { beginSubmit, sent, setResponse } = useSession();
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
  /**
   * 되짚기 조회가 끝났나. **끝나기 전에는 리뷰 카드를 그리지 않는다.**
   *
   * 브릿지 저장소가 비동기라 `recall` 초기값이 null 이다. 그대로 두면 첫 페인트에 리뷰
   * 카드가 떴다가 조회가 끝나면 사라진다. 그 찰나에 노출 로그가 이미 찍혀 분모가 부풀고,
   * 화면도 한 번 덜컹한다.
   */
  const [recallChecked, setRecallChecked] = useState(false);
  /**
   * 오늘 되짚기가 있었나. 답하거나 닫아서 치운 뒤에도 남는다.
   *
   * `recall` 이 null 이 되는 순간 리뷰 카드가 그 자리에 바로 올라오면, 방금 하나를 치운
   * 사람 앞에 부탁이 연달아 두 번 선다. 그날은 리뷰가 물러나 있는 것이 맞다.
   */
  const hadRecall = useRef(false);
  /** 연꽃 모으기 시트 */
  const [leafOpen, setLeafOpen] = useState(false);
  /**
   * 지금까지 받은 답의 수와, 그것으로 정해지는 리뷰 카드.
   *
   * 마운트할 때 한 번 읽고 끝이다. 홈에 서 있는 동안에는 답이 늘지 않고, 답을 받고
   * 돌아오면 이 화면이 새로 마운트된다.
   */
  const [answers] = useState(() => readMilestones().answers);
  /*
    리뷰 카드를 띄울까.

    **못 쓰는 토스 앱에서는 아예 안 그린다.** 눌러도 아무 일이 없는 버튼을 세우는 것은
    우리가 미리 알고 있는 막다른 길이다. 「불러도 안 뜰 수 있다」와는 다르다. 저쪽은
    토스가 피로도를 보고 정하는 것이고 이쪽은 우리가 먼저 아는 사실이다.
  */
  const [reviewOpen, setReviewOpen] = useState(
    () => bridge.supports('review') && reviewCardDue(readMilestones().answers),
  );
  /** 시트가 열려 있는 동안 들고 있는 글. 시트를 닫아도 입력창에는 그대로 남는다 */
  const held = useRef('');
  /** 이미 문을 연 서버 사용량. 같은 값으로 시트를 두 번 열지 않는다 */
  const handledCap = useRef<Quota | null>(null);
  /**
   * 뒤에서 돌고 있는 요청의 번호.
   *
   * 이 값이 올라가면 그 전에 나간 요청은 화면을 바꾸지 못한다. 사람이 광고를 보고
   * 먼저 지나갔거나 시트를 닫은 뒤에 늦게 도착한 답이 화면을 빼앗는 일을 막는다.
   */
  const preflightSeq = useRef(0);

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
    /*
      보낸 글은 세션이 그대로 쥐고 있다. 광고를 다 보면 이 글을 그대로 잇는다.
      **여기서는 `beginSubmit` 을 다시 부르지 않는다.** 대기 화면이 정해 둔 멱등키가
      아직 살아 있고, 그 키로 다시 보내야 서버가 같은 이야기로 알아본다.
    */
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
        setRecallChecked(true);
        return;
      }
      const since = daysSince(entry.date);
      const dueToday = since >= 1 && since <= RECALL_MAX_DAYS;
      const due = dueToday && !recallHushedToday();
      if (due) hadRecall.current = true;
      setRecall(due ? entry : null);
      setRecallChecked(true);
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

  /**
   * 시트를 띄워 둔 채 뒤에서 보내는 요청. **위기 판정을 화면이 가로채지 않으려는 것이다.**
   *
   * 서버는 위기를 사용량보다 먼저 본다(`routes.py`). 그래서 이 요청 하나로 셋이 갈린다:
   *
   *   위기            창구 화면을 받는다. 시트를 닫고 그리로 보낸다
   *   광고 문(429)    시트는 이미 떠 있다. 서버가 센 사용량만 적는다
   *   그 밖           대기 화면으로 넘긴다. 같은 멱등키라 서버가 만든 답을 그대로 받는다
   *
   * **위기는 시트를 닫은 뒤에도 통과시킨다.** 사람이 광고를 안 보기로 했다고 해서 위기
   * 글이 창구에 못 닿으면, 화면이 먼저 막던 옛 구조로 되돌아가는 셈이다.
   */
  const preflight = useCallback(
    async (text: string, key: string) => {
      const seq = preflightSeq.current;
      try {
        const response = await api.submitConcern({ text, idempotencyKey: key });
        if (response.responseType === 'crisis') {
          held.current = '';
          setContinueOpen(false);
          setResponse(response);
          void navigate(ROUTES.crisis, { replace: true });
          return;
        }
        // 그 사이 사람이 광고를 보고 지나갔거나 시트를 닫았다. 화면을 빼앗지 않는다
        if (seq !== preflightSeq.current) return;
        held.current = '';
        setContinueOpen(false);
        void navigate(ROUTES.loading);
      } catch (error) {
        if (seq !== preflightSeq.current) return;
        const failed = error instanceof ApiFailure ? error : null;
        if (failed?.quota != null) {
          // 광고 문이 섰다. 기다리던 답이라 화면은 그대로 두고 사용량만 맞춘다
          setQuota(saveFromServer(failed.quota));
          return;
        }
        // 못 보냈다. 「다시 해보기」가 있는 대기 화면이 이 실패를 그린다
        held.current = '';
        setContinueOpen(false);
        void navigate(ROUTES.loading);
      }
    },
    [api, navigate, setResponse],
  );

  const submit = useCallback(
    (text: string) => {
      const state = readQuota();
      setQuota(state);

      // 오늘 첫 이야기는 광고가 없다. 곧장 보낸다
      if (gateFor(state) === 'free') {
        send(text);
        return;
      }

      /*
        **규칙층이 위기를 보면 시트를 세우지 않는다.**

        서버도 같은 판정으로 광고 문을 건너뛴다(`routes.py` 의 `_rules_saw_crisis`).
        그래서 이 글은 어차피 광고에 안 걸리는데, 시트만 잠깐 떴다 닫히면 죽고 싶다고
        적은 사람이 광고 버튼을 먼저 보게 된다. 그 몇 초를 없앤다.

        규칙층이 못 잡는 에두른 표현은 여전히 시트를 거친다. 그건 분류기가 봐야 알 수
        있고, 그때는 뒤에서 도는 요청이 창구로 데려간다(`preflight`). 화면이 스스로
        위기를 판정하지 않는다는 선은 그대로다.
      */
      if (routeByRules(text).route === 'crisis') {
        send(text);
        return;
      }

      // 여기부터는 광고 문이 설 자리다. 화면을 넘기지 않고 시트를 먼저 세운다
      preflightSeq.current += 1;
      const key = beginSubmit(text);
      held.current = text;
      setContinueOpen(true);

      // 스텁 판에는 사용량을 세는 서버가 없다. 뒤에서 보낼 것도 없다
      if (serverOpensTheGate()) void preflight(text, key);
    },
    [beginSubmit, preflight, send],
  );

  /**
   * 시트를 닫았다. **뒤에서 돌던 요청의 화면 전환을 무르게 한다.**
   *
   * 닫은 사람은 지금은 안 하겠다는 뜻이다. 그 뒤에 답이 도착해 화면이 저절로 넘어가면
   * 방금 내린 결정이 뒤집힌다. 위기만은 그래도 통과한다(`preflight` 참고).
   */
  const closeContinue = useCallback(() => {
    preflightSeq.current += 1;
    setContinueOpen(false);
  }, []);

  /**
   * 이야기를 이어간다. **보냈으면 true 다.**
   *
   * 돌려주는 값이 있어야 연꽃 경로가 값을 낼지 정할 수 있다. 붙들어 둔 글이 비어 있으면
   * 아무것도 안 보내는데, 그때도 연꽃을 빼면 아무 일도 안 하고 한 장이 사라진다.
   */
  const goOn = useCallback((): boolean => {
    setContinueOpen(false);
    const text = held.current;
    held.current = '';
    if (text === '') return false;
    // 뒤에서 돌던 요청이 이제 와서 화면을 바꾸지 않게 한다. 사람이 먼저 지나갔다
    preflightSeq.current += 1;
    // 이어가기 광고 자리를 지났다는 표를 세운다. 다음 요청이 이걸 들고 가야 서버가 문을 연다.
    // 보상형 판에서는 끝까지 본 사람만 여기까지 온다. 광고가 안 온 사람은 그냥 통과한다
    markAdWatched();
    /*
      **여기서 멱등키를 다시 만들지 않는다.** 시트를 열 때 이미 정해 뒀다. 새 키로 보내면
      광고 문 앞에서 이미 분류까지 마친 그 이야기를 서버가 처음 보는 글로 다시 받는다.
    */
    void navigate(ROUTES.loading);
    return true;
  }, [navigate]);

  /**
   * 연꽃으로 이어간다. 광고를 띄우지 않는다.
   *
   * **잔액을 빼는 데 성공했을 때만 넘어간다.** 두 화면이 거의 같은 순간에 마지막 한 장을
   * 쓰려 할 때, 있다고 믿고 진행하면 없는 연꽃으로 두 번 지나간다.
   *
   * `goOn` 이 `markAdWatched` 를 세운다. 서버는 연꽃을 모르므로(기기에만 있다) 그 표가
   * 없으면 광고 문에서 다시 막힌다. 연꽃도 광고 한 편을 미리 치른 것이라 같은 표를 쓴다.
   */
  const continueWithLeaf = useCallback(() => {
    if (leaf.count < 1) return;
    // 보낸 뒤에 뺀다. 붙들어 둔 글이 비어 있으면 아무 일도 안 일어나는데, 먼저 빼면
    // 그 판에서 한 장이 그냥 사라진다. 간직하기도 같은 순서다
    if (!goOn()) return;
    if (!leaf.spend('continue')) {
      analytics.log('leaf_spend_missed', { placement: 'continue' });
    }
    analytics.log('ad_skipped', { placement: 'continue', reason: 'leaf' });
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

    /*
      여기까지 오면 카드를 그린 뒤에 지원 여부가 바뀐 것이다(거의 없다). 카드를 띄울 때
      이미 걸렀으므로 평소에는 이 가지를 안 탄다. 그래도 남겨 둔다: 없으면 낡은 앱에서
      던지는 것을 아래 catch 가 「우리 쪽 실패」로 읽어 계속 다시 묻게 된다.
    */
    if (!bridge.supports('review')) {
      /*
        **영구히 닫지 않는다.** 리뷰 화면이 뜬 적이 없는데 「청했다」로 적으면, 나중에
        토스 앱을 최신으로 올려도 카드가 다시는 안 뜬다. 아래 catch 와 같은 「우리 쪽
        사정」이라 같게 다룬다. 카드를 띄울 때 이미 걸러서 평소에는 여기까지 안 온다.
      */
      snoozeReview(answers);
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

  /**
   * 카드를 띄웠다는 사실을 센다. **누르지 않고 지나간 사람을 위한 것이다.**
   *
   * 「나중에」를 누르면 미룸으로 적히지만, 그냥 이야기를 쓰러 가는 사람에게는 아무 표도
   * 안 남아서 앱을 열 때마다 같은 부탁이 같은 자리에 다시 섰다. 세 번 보여 주고 그만둔다
   * (`REVIEW_MAX_SHOWN`). 막는 일은 다음에 열 때 `reviewCardDue` 가 한다. 이번 한 번은
   * 끝까지 보여 준다.
   *
   * **여기서 닫지 않는다.** 세자마자 닫으면 세 번째 사람은 카드를 보지도 못한다.
   *
   * 세는 조건이 그리는 조건과 같아야 한다(`recall` 이 있는 날은 카드가 물러난다).
   * 안 보인 것을 세면 되짚기가 있던 날들이 조용히 기회를 먹는다.
   */
  const reviewCounted = useRef(false);
  const reviewShowing = reviewOpen && recallChecked && recall == null && !hadRecall.current;
  useEffect(() => {
    if (!reviewShowing || reviewCounted.current) return;
    reviewCounted.current = true;
    countReviewShown();
  }, [reviewShowing]);

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
        leadCard={({ focusField }) => (
          <ReviewCard
            open={reviewShowing}
            answersTotal={answers}
            /* 카드가 사라질 때 초점을 입력칸으로 돌린다. 키보드로 누른 사람이 화면 맨
               위로 튕기지 않게 한다. 마우스·터치는 카드가 초점을 안 빼앗아 그대로다 */
            onAccept={() => {
              void askReview();
              focusField();
            }}
            onLater={() => {
              laterReview();
              focusField();
            }}
          />
        )}
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
        연꽃 모으기. 홈에서 여는 판은 **모으고 나서도 시트에 남는다.**
        한 장 모았다고 닫아 버리면 여러 장 쌓으려는 사람이 칩을 매번 다시 눌러야 한다.
      */}
      <LeafSheet open={leafOpen} onClose={() => setLeafOpen(false)} />
    </>
  );
}
