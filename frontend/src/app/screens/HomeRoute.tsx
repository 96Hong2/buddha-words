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
import {
  RecallCard,
  clearRecall,
  daysSince,
  readRecall,
  type RecallEntry,
} from '../../domains/daily/RecallCard';
import { OnboardingScreen, onboardingPending } from '../../domains/onboarding';
import { ContinueSheet } from '../../domains/quota/ContinueSheet';
import { ExhaustedNotice } from '../../domains/quota/ExhaustedNotice';
import {
  continuesLeft,
  gateFor,
  readQuota,
  saveFromServer,
  type QuotaState,
} from '../../domains/quota/quota';
import type { Quota } from '../../shared/api';
import { resolveApiMode } from '../../shared/api/client';
import { FLAGS } from '../../shared/flags';
import { markAdWatched } from '../../shared/api/http';
import { markEntryCardSeen } from '../../domains/concern/EntryCard';
import { HomeAddCard } from '../../domains/growth/HomeAddCard';
import { readMilestones } from '../../shared/prefs/milestones';
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

/** 대기 화면이 사용량에 막혀 돌려보낼 때 들려 보내는 것 */
interface HomeNavState {
  exhaustedQuota?: Quota;
}

export function HomeRoute() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const bridge = useBridge();
  const { beginSubmit, sent } = useSession();

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
  const [exhausted, setExhausted] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  /**
   * 홈에 추가 안내를 띄울까.
   *
   * 온보딩을 이미 지난 사람에게만 뜬다. 처음 여는 사람은 온보딩 두 장을 지나 곧바로
   * 여기로 오므로 그 실행에서 한 번 보게 되고, 닫으면 다시 뜨지 않는다.
   */
  const [homeAdd, setHomeAdd] = useState(
    () => !onboardingPending() && !readMilestones().homeAddDone,
  );
  const [recall, setRecall] = useState<RecallEntry | null>(null);
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
    const capped = (state as HomeNavState | null)?.exhaustedQuota;
    // 같은 자리에서 온 값은 한 번만 연다. 글을 고쳐 다시 보낼 때 옛 값이 시트를 또 열면 안 된다
    if (capped == null || handledCap.current === capped) return;
    handledCap.current = capped;
    void navigate(ROUTES.home, { replace: true, state: null });
    const next = saveFromServer(capped);
    setQuota(next);
    if (gateFor(next) === 'exhausted') {
      setExhausted(true);
      return;
    }
    // 보낸 글은 세션이 그대로 쥐고 있다. 광고를 다 보면 이 글을 그대로 잇는다
    held.current = sent;
    setContinueOpen(true);
  }, [navigate, sent, state]);

  useEffect(() => {
    let alive = true;
    void readRecall(bridge.storage).then((entry) => {
      // 오늘 받은 답을 두고 「어제 이야기」라고 물을 수는 없다
      if (alive) setRecall(entry != null && daysSince(entry.date) >= 1 ? entry : null);
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
      if (gate === 'exhausted') {
        setExhausted(true);
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
    // 광고를 끝까지 봤다는 표를 세운다. 다음 요청이 이걸 들고 가야 서버가 문을 연다
    markAdWatched();
    send(text);
  }, [send]);

  /**
   * 천장 카드. 오늘의 한마디가 왔을 때만 그 길을 준다.
   * 시트는 아래 카드 자리가 들고 있어서, 구절이 없으면 눌러도 아무 일이 안 일어난다.
   */
  const renderNotice = useCallback(
    ({ quote }: HomeCardSlot): ReactNode => (
      <ExhaustedNotice
        continuesUsed={quota.continuesUsed}
        onOpenDailyQuote={quote != null ? () => setDailyOpen(true) : undefined}
      />
    ),
    [quota.continuesUsed],
  );

  const renderCards = useCallback(
    ({ quote, focusField }: HomeCardSlot): ReactNode => (
      <>
        {recall != null && (
          <RecallCard
            entry={recall}
            onRespond={() => {
              // 기기에서도 지운다. 화면에서만 치우면 앱을 다시 열 때 같은 것을 또 묻는다
              void clearRecall(bridge.storage);
              setRecall(null);
              focusField();
            }}
          />
        )}

        {quote != null && (
          <>
            <DailyQuoteCard quote={quote} onOpen={() => setDailyOpen(true)} />
            <DailyQuoteSheet
              open={dailyOpen}
              quote={quote}
              onClose={() => setDailyOpen(false)}
              onStart={focusField}
            />
          </>
        )}

        {homeAdd && <HomeAddCard onClose={() => setHomeAdd(false)} />}
      </>
    ),
    [bridge, dailyOpen, homeAdd, recall],
  );

  /**
   * 온보딩과 진입 카드가 잇달아 뜨면 첫 실행이 덮개 두 장으로 시작한다.
   * 온보딩을 본 날은 오늘의 한마디 카드를 띄우지 않는다. 홈의 카드 자리에는 그대로 있다.
   */
  const doneOnboarding = useCallback(() => {
    markEntryCardSeen(todayISO());
    setOnboarding(false);
    // 온보딩을 막 지난 사람이 이 안내의 주 대상이다. 상태를 처음 잡을 때는 아직
    // 온보딩 중이라 꺼져 있었으니 여기서 켠다
    if (!readMilestones().homeAddDone) setHomeAdd(true);
  }, []);

  if (onboarding) return <OnboardingScreen onDone={doneOnboarding} />;

  return (
    <>
      <HomeScreen
        onSubmit={submit}
        notice={exhausted ? renderNotice : undefined}
        renderCards={renderCards}
      />

      <ContinueSheet
        open={continueOpen}
        continuesLeft={continuesLeft(quota)}
        continuesUsed={quota.continuesUsed}
        onClose={closeContinue}
        onContinue={goOn}
      />
    </>
  );
}
