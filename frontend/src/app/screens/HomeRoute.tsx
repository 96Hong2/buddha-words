/**
 * 홈 조립.
 *
 * 도메인끼리는 서로를 import 하지 않는다. 그래서 concern(입력) · daily(오늘의 한마디·회고) ·
 * quota(오늘 몇 번째 이야기인가)를 잇는 일은 app 층인 여기서 한다.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { HomeScreen, type HomeCardSlot } from '../../domains/concern/HomeScreen';
import { DailyQuoteCard } from '../../domains/daily/DailyQuoteCard';
import { DailyQuoteSheet } from '../../domains/daily/DailyQuoteSheet';
import {
  RecallCard,
  daysSince,
  readRecall,
  type RecallEntry,
} from '../../domains/daily/RecallCard';
import { ContinueSheet } from '../../domains/quota/ContinueSheet';
import { ExhaustedNotice } from '../../domains/quota/ExhaustedNotice';
import { continuesLeft, gateFor, readQuota, type QuotaState } from '../../domains/quota/quota';
import { routeByRules } from '../../shared/api/routerPort';
import { useSession } from '../../shared/session';
import { useBridge } from '../providers';
import { ROUTES } from '../router';

/**
 * 이 글이 오늘의 횟수를 쓰는 이야기인가.
 *
 * 최종 판정은 서버가 한다. 화면은 규칙층만 보고 NORMAL·DEEP 후보일 때만 센다.
 * 가볍게 쓴 글 · 알아볼 수 없는 글 · 위기 글은 어느 쪽으로 판정되든 세지 않는다.
 */
function countsToday(text: string): boolean {
  const route = routeByRules(text).route;
  return route === 'normal' || route === 'deep';
}

export function HomeRoute() {
  const navigate = useNavigate();
  const bridge = useBridge();
  const { beginSubmit } = useSession();

  const [quota, setQuota] = useState<QuotaState>(readQuota);
  const [continueOpen, setContinueOpen] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [recall, setRecall] = useState<RecallEntry | null>(null);
  /** 시트가 열려 있는 동안 들고 있는 글. 시트를 닫아도 입력창에는 그대로 남는다 */
  const held = useRef('');

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
      if (!countsToday(text)) {
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
    if (text !== '') send(text);
  }, [send]);

  const renderCards = useCallback(
    ({ quote, focusField }: HomeCardSlot): ReactNode => (
      <>
        {recall != null && (
          <RecallCard
            entry={recall}
            onRespond={() => {
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
      </>
    ),
    [dailyOpen, recall],
  );

  return (
    <>
      <HomeScreen
        onSubmit={submit}
        notice={exhausted ? <ExhaustedNotice continuesUsed={quota.continuesUsed} /> : null}
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
