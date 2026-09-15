import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { useBridge } from '../../app/providers';
import { ROUTES } from '../../app/router';
import { useAnalytics } from '../../shared/analytics';
import { useApiClient, type DailyQuote } from '../../shared/api';
import { recordVisit } from '../../shared/lib/visitLog';
import { useSession } from '../../shared/session';
import { TEST_IDS, testId } from '../../shared/testIds';
import { sceneForScreen } from '../../shared/visual/scene';

import { ConcernField } from './ConcernField';
import { DepthIndicator } from './DepthIndicator';
import { EntryCard, entryCardPending, markEntryCardSeen, type EntryCardDismiss } from './EntryCard';
import { ExampleChips } from './ExampleChips';
import { DraftNotice, ReturnCard } from './HomeCards';

import './concern.css';

/** 오늘의 한마디도 진입 카드도 사용자 시간대 자정이 기준이다 */
function todayISO(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** 입력 묶음 아래 카드 자리에 넘겨주는 것 */
export interface HomeCardSlot {
  /** 오늘의 한마디. 아직 안 왔으면 undefined */
  quote: DailyQuote | undefined;
  /** 입력창으로 초점을 옮긴다 */
  focusField: () => void;
}

export interface HomeScreenProps {
  /**
   * 전송을 app 층이 가져간다. 오늘 몇 번째 이야기인지 세는 일이 여기 붙는다.
   * 주지 않으면 이 화면이 바로 대기 화면으로 보낸다.
   */
  onSubmit?: (text: string) => void;
  /**
   * 전송 버튼 아래 안내 자리. 오늘 몫을 다 쓴 카드가 여기 들어온다.
   * 카드 자리와 같은 것을 받는다. 그 안내가 오늘의 한마디로 가는 길을 두려면 구절이 왔는지 알아야 한다.
   */
  notice?: (slot: HomeCardSlot) => ReactNode;
  /** 입력 묶음 아래 카드 자리. 오늘의 한마디·회고 카드가 여기 들어온다 */
  renderCards?: (slot: HomeCardSlot) => ReactNode;
}

export function HomeScreen({ onSubmit, notice, renderCards }: HomeScreenProps = {}) {
  const navigate = useNavigate();
  const bridge = useBridge();
  const analytics = useAnalytics();
  const client = useApiClient();
  const { draft, setDraft, response, beginSubmit } = useSession();

  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  /** 앱을 열었을 때 이미 남아 있던 글인가. 이번에 쓴 글과 갈라야 「남겨 뒀어요」 줄이 맞는다 */
  const [restored, setRestored] = useState(() => draft.trim() !== '');

  const [dateISO] = useState(todayISO);
  const [entryTurn] = useState(() => entryCardPending(dateISO));
  const [entryOpen, setEntryOpen] = useState(false);

  const { data: quote } = useQuery({
    queryKey: ['daily-quote', dateISO],
    queryFn: () => client.fetchDailyQuote(dateISO),
  });

  const home = sceneForScreen('home');
  const text = draft.trim();

  const focusField = useCallback(() => {
    fieldRef.current?.focus();
  }, []);

  /**
   * 입력칸에서 초점이 빠져나가지 않게 한다.
   * 초점이 빠지면 제목이 두 줄로 펴지면서 아래가 통째로 밀리고, 누르던 버튼이 손가락 밑에서 비켜난다.
   */
  const keepFocus = useCallback((event: MouseEvent) => {
    event.preventDefault();
  }, []);

  // 앱을 연 사실. 세션당 한 번이고, 몇 번째 실행인지는 구간으로만 남긴다
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void recordVisit(bridge.storage, Date.now()).then((visit) => {
      analytics.appOpen('app_open', {
        is_first_open: visit.isFirstOpen,
        open_bucket: visit.openBucket,
        entry: 'home',
      });
    });
  }, [analytics, bridge]);

  // 오늘의 한마디가 도착하면 진입 카드가 먼저 온다. 하루 한 번이라 그 자리에서 날짜를 적어 둔다.
  // 한 번만 돈다. 조회가 다시 돌 때 카드가 되살아나면 닫은 사람 앞에 또 뜬다.
  // 홈 카드 쪽 노출 로그는 daily 카드가 스스로 찍는다
  const greeted = useRef(false);
  useEffect(() => {
    if (quote == null || greeted.current) return;
    greeted.current = true;
    if (!entryTurn) return;
    markEntryCardSeen(dateISO);
    setEntryOpen(true);
    analytics.log(
      'daily_quote_impression',
      { quote_id: quote.quoteId, surface: 'entry_card' },
      { kind: 'impression' },
    );
  }, [analytics, dateISO, entryTurn, quote]);

  const dismissQuote = useCallback(
    (how: EntryCardDismiss) => {
      if (quote != null) {
        analytics.log('entry_card_dismiss', { quote_id: quote.quoteId, how });
      }
      setEntryOpen(false);
      focusField();
    },
    [analytics, focusField, quote],
  );

  const pickExample = useCallback(
    (example: string) => {
      setDraft(example);
      focusField();
    },
    [focusField, setDraft],
  );

  const clearDraft = useCallback(() => {
    setDraft('');
    setRestored(false);
    focusField();
  }, [focusField, setDraft]);

  // 실제 호출은 대기 화면이 한다. 여기서는 보낼 글과 멱등키만 세션에 남긴다
  const submit = useCallback(() => {
    if (text === '') return;
    if (onSubmit != null) {
      onSubmit(text);
      return;
    }
    beginSubmit(text);
    navigate(ROUTES.loading);
  }, [beginSubmit, navigate, onSubmit, text]);

  const showReturn = response != null;
  const showDraftNotice = restored && text !== '';

  return (
    <div {...testId(TEST_IDS.home)} className="home-screen">
      <div className="body">
        <div className="svc">
          <p className="svc-line">
            <b>부처의 말</b>
            <i>·</i>AI 가 경전을 찾아 풀어 드려요
          </p>
          <button
            {...testId(TEST_IDS.settingsButton)}
            className="icon-btn"
            type="button"
            aria-label="설정"
            onClick={() => navigate(ROUTES.settings)}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        </div>

        {showReturn && <ReturnCard onOpen={() => navigate(ROUTES.answer)} />}

        {/* 키보드가 올라오면 제목이 한 줄로 접히고 입력 묶음이 위로 붙는다 */}
        {showReturn ? (
          <h2 className="hero">
            무슨 일이 있었나요?
            <br />
            편하게 이야기해 주세요
          </h2>
        ) : focused ? (
          <div className="hero-row">
            <h2 className="hero">무슨 일이 있었나요?</h2>
            {home != null && <img className="home-face home-face--sm" src={home.src} alt="" />}
          </div>
        ) : (
          <div className="lead-row">
            <h2 className="hero">
              무슨 일이 있었나요?
              <br />
              편하게 이야기해 주세요
            </h2>
            {home != null && <img className="home-face" src={home.src} alt="" />}
          </div>
        )}

        <div className="cluster">
          {showDraftNotice && <DraftNotice onClear={clearDraft} />}

          <ConcernField
            value={draft}
            onChange={setDraft}
            fieldRef={fieldRef}
            onFocusChange={setFocused}
          />

          <DepthIndicator text={draft} />

          {text === '' && <ExampleChips onPick={pickExample} onKeepFocus={keepFocus} />}

          <button
            {...testId(TEST_IDS.submit)}
            className="send"
            type="button"
            disabled={text === ''}
            onMouseDown={keepFocus}
            onClick={submit}
          >
            이야기 보내기
          </button>
          <p className="micro">
            답변은 AI 가 만들어요 · <span className="nb">이름·연락처</span>는 적지 않아도 괜찮아요
          </p>
          {notice?.({ quote, focusField })}
        </div>

        {renderCards != null && (
          <div className="home-cards">{renderCards({ quote, focusField })}</div>
        )}
      </div>

      <nav className="tabbar" aria-label="주요 탭">
        <button className="tab sel" type="button" aria-current="page">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20.5 11.8a8.3 8.3 0 0 1-8.9 8.2 9 9 0 0 1-3.4-.8L3.5 20.5l1.4-4.6a8.1 8.1 0 0 1-1-4 8.3 8.3 0 0 1 8.7-8.2 8.3 8.3 0 0 1 7.9 8.1Z" />
          </svg>
          이야기하기
        </button>
        <button className="tab" type="button" onClick={() => navigate(ROUTES.archive)}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18.5 20.5 12 15.9l-6.5 4.6V5.6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2Z" />
          </svg>
          보관함
        </button>
      </nav>

      {entryOpen && quote != null && (
        <EntryCard quote={quote} showDailyNote onDismiss={dismissQuote} />
      )}
    </div>
  );
}
