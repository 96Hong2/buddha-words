import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { ROUTES } from '../../app/router';
import { charsBucket, useAnalytics } from '../../shared/analytics';
import { useApiClient, type DailyQuote } from '../../shared/api';
import { useSession } from '../../shared/session';
import { TEST_IDS, testId } from '../../shared/testIds';
import { sceneForScreen } from '../../shared/visual/scene';

import { ConcernField } from './ConcernField';
import { DepthIndicator } from './DepthIndicator';
import { EntryCard, entryCardPending, markEntryCardSeen, type EntryCardDismiss } from './EntryCard';
import { ExampleChips } from './ExampleChips';
import { DraftClearAsk, DraftClearButton, DraftConfirm, DraftNotice } from './HomeCards';
import { useInputFunnel } from './useInputFunnel';

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
  /** 입력 묶음 아래 카드 자리. 오늘의 한마디 카드가 여기 들어온다 */
  renderCards?: (slot: HomeCardSlot) => ReactNode;
  /**
   * 입력칸 **바로 위** 자리.
   *
   * 지금 여기 오는 것은 「어제 적어 드린 그거 해 보셨나요」 하나다. 사람이 답변에서
   * 부탁한 질문이라 아래 카드 자리가 아니라 먼저 보이는 자리에 둔다. 덮개는 쓰지 않는다.
   */
  topCard?: ReactNode;
  /**
   * 제목 바로 아래, 카드 묶음 **맨 앞** 자리.
   *
   * `topCard` 와 다르다. 저쪽은 입력칸 바로 위라 쓰려는 사람의 손 가까이 서고, 이쪽은
   * 화면을 위에서 아래로 훑을 때 가장 먼저 눈에 들어온다. 사람당 한 번뿐인 말(리뷰
   * 청하기)을 여기 둔다. 둘이 같이 있으면 이것이 위다.
   *
   * 카드 자리와 같은 슬롯을 받는다. 카드가 사라질 때 초점을 입력칸으로 돌려놓아야
   * 키보드로 쓰는 사람이 화면 맨 위로 튕기지 않는다.
   */
  leadCard?: (slot: HomeCardSlot) => ReactNode;
  /** 서비스 줄 오른쪽, 설정 아이콘 옆에 서는 연꽃 잔액 칩 */
  leafChip?: ReactNode;
  /**
   * 하루 첫 진입 카드를 띄우지 않는다.
   *
   * 「오늘의 말씀 보기」로 들어온 사람에게 쓴다. 그 길로 오면 시트가 이미 같은 구절을
   * 펼쳐 놓는데, 카드가 그 뒤에 겹쳐 서면 **같은 말을 두 번** 하게 되고 뒤로가기가
   * 보이지도 않는 카드를 먼저 닫는다. 오늘 몫은 시트가 보여 준 것으로 친다.
   */
  skipEntryCard?: boolean;
}

export function HomeScreen({
  onSubmit,
  notice,
  renderCards,
  topCard,
  leadCard,
  leafChip,
  skipEntryCard = false,
}: HomeScreenProps = {}) {
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const client = useApiClient();
  const { draft, setDraft, response, beginSubmit } = useSession();

  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  /** 앱을 열었을 때 이미 남아 있던 글인가. 이번에 쓴 글과 갈라야 「남겨 뒀어요」 줄이 맞는다 */
  const [restored, setRestored] = useState(() => draft.trim() !== '');
  /** 답을 받고 이 화면으로 돌아온 것인가. 마운트할 때 한 번 정하고 바뀌지 않는다 */
  const fromAnswer = useRef(response != null);
  /** 쓰던 글을 지울지 묻는 시트. 답을 받고 돌아왔는데 글이 남아 있을 때만 연다 */
  const [askClear, setAskClear] = useState(() => response != null && draft.trim() !== '');
  /** 「전체 지우기」를 눌러 확인 카드가 열렸나 */
  const [clearAsking, setClearAsking] = useState(false);

  const [dateISO] = useState(todayISO);
  const [entryTurn] = useState(() => entryCardPending(dateISO));
  const [entryOpen, setEntryOpen] = useState(false);

  const { data: quote } = useQuery({
    queryKey: ['daily-quote', dateISO],
    queryFn: () => client.fetchDailyQuote(dateISO),
  });

  const home = sceneForScreen('home');
  const text = draft.trim();

  // 쓰는 동안의 깔때기. 구간이 바뀔 때만 보낸다
  const funnel = useInputFunnel(draft, restored);

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

  // 오늘의 한마디가 도착하면 진입 카드가 먼저 온다. 하루 한 번이라 그 자리에서 날짜를 적어 둔다.
  // 한 번만 돈다. 조회가 다시 돌 때 카드가 되살아나면 닫은 사람 앞에 또 뜬다.
  // 홈 카드 쪽 노출 로그는 daily 카드가 스스로 찍는다
  const greeted = useRef(false);
  useEffect(() => {
    if (quote == null || greeted.current) return;
    greeted.current = true;
    if (!entryTurn) return;
    // 시트가 이미 같은 구절을 펼쳐 놓았다. 오늘 몫은 쓴 것으로 적고 카드는 띄우지 않는다
    if (skipEntryCard) {
      markEntryCardSeen(dateISO);
      return;
    }
    markEntryCardSeen(dateISO);
    setEntryOpen(true);
    analytics.log(
      'daily_quote_impression',
      { quote_id: quote.quoteId, surface: 'entry_card' },
      { kind: 'impression' },
    );
  }, [analytics, dateISO, entryTurn, quote, skipEntryCard]);

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

  /**
   * 쓰던 글을 비운다.
   *
   * **묻던 것도 함께 닫는다.** 「쓰시던 이야기가 남아 있어요」는 글자 수만 보고 서 있어서,
   * 「전체 지우기」로 비운 뒤 새 이야기를 쓰기 시작하면 그 카드가 되살아났다. 방금 스스로
   * 치운 사람에게 「남아 있어요」라고 다시 묻는 꼴이다.
   */
  const clearDraft = useCallback(() => {
    setDraft('');
    setRestored(false);
    setAskClear(false);
    setClearAsking(false);
    focusField();
  }, [focusField, setDraft]);

  // 글이 사라지면 묻던 것도 함께 닫는다. 다시 쓰기 시작했을 때 되살아나면 안 된다
  useEffect(() => {
    if (text === '') setClearAsking(false);
  }, [text]);

  // 시트가 뜬 사실을 한 번 남긴다. 「글이 남아 있는 채로 돌아오는 일」이 얼마나 잦은지 본다
  useEffect(() => {
    if (!askClear) return;
    analytics.log(
      'draft_confirm_view',
      { chars_bucket: charsBucket(draft.length) },
      { kind: 'impression', once: 'draft_confirm_view' },
    );
    // 마운트할 때 한 번이다. 글자가 바뀔 때마다 다시 찍지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics, askClear]);

  const answerDraft = useCallback(
    (choice: 'clear' | 'keep') => {
      analytics.log('draft_confirm_choice', { choice }, { kind: 'click' });
      setAskClear(false);
      if (choice === 'clear') clearDraft();
      else focusField();
    },
    [analytics, clearDraft, focusField],
  );

  /**
   * 「전체 지우기」를 눌렀다.
   *
   * 우리가 물어서 고른 `draft_confirm_choice` 와 **다른 이름으로 센다.** 한 이름으로 묶으면
   * 「이어 쓰기와 새로 쓰기 중 무엇이 많은가」에 우리가 물어본 자리의 답만 들어온다.
   */
  const openClear = useCallback(() => {
    setClearAsking(true);
    analytics.log(
      'draft_clear_open',
      { chars_bucket: charsBucket(draft.length) },
      { kind: 'click' },
    );
  }, [analytics, draft.length]);

  const answerClear = useCallback(
    (choice: 'clear' | 'cancel') => {
      setClearAsking(false);
      analytics.log(
        'draft_clear_confirm',
        { choice, chars_bucket: charsBucket(draft.length) },
        { kind: 'click' },
      );
      if (choice === 'clear') clearDraft();
      else focusField();
    },
    [analytics, clearDraft, draft.length, focusField],
  );

  // 실제 호출은 대기 화면이 한다. 여기서는 보낼 글과 멱등키만 세션에 남긴다
  const submit = useCallback(() => {
    if (text === '') return;
    // 세는 것이 먼저다. 아래에서 화면이 넘어가면 이 컴포넌트가 사라진다
    funnel.markSubmit(text);
    if (onSubmit != null) {
      onSubmit(text);
      return;
    }
    beginSubmit(text);
    navigate(ROUTES.loading);
  }, [beginSubmit, funnel, navigate, onSubmit, text]);

  /**
   * 답을 받고 돌아온 자리인가.
   *
   * 여기서 하던 「방금 물어본 이야기의 답이 준비됐어요」 카드는 없앴다. 답을 **이미 다 보고**
   * 뒤로 온 사람에게도 똑같이 떠서, 본 것을 보러 가라고 매번 권했다. 답으로 돌아가는 길은
   * 보관함의 「오늘 나눈 이야기」가 이미 준다.
   *
   * 대신 이 신호로 다른 것을 한다. 답을 받고 왔는데 쓰던 글이 그대로 남아 있으면, 그 글은
   * 방금 보낸 글이다. 새 이야기를 쓰려는 사람 앞에 지난 글이 놓여 있는 것이라 한 번 묻는다.
   */
  const showDraftNotice = restored && text !== '' && !fromAnswer.current;

  /**
   * 「전체 지우기」를 보일까.
   *
   * **같은 일을 하는 버튼을 둘 세우지 않는다.** 「이어서 쓸 수 있게 남겨 뒀어요」 옆에도,
   * 「쓰시던 이야기가 남아 있어요」 안에도 이미 지우는 길이 있다. 그 둘이 서 있는 동안에는
   * 이 버튼을 감춘다. 카드가 사라지고 나면 다시 나타나, 쓴 글을 비울 길은 언제나 남는다.
   */
  const showClear = text !== '' && !showDraftNotice && !askClear && !clearAsking;

  return (
    <div {...testId(TEST_IDS.home)} className="home-screen">
      <div className="body">
        <div className="svc">
          {/*
            전에는 이름 뒤에 「AI 가 경전을 찾아 풀어 드려요」가 붙어 있었다.
            AI 표시는 답변 화면 맨 위 배지가 이미 하고 있고, 그 표시는 고지 의무가 요구하는
            자리라 거기 한 곳이면 된다. 홈 제목까지 같은 말을 하면 이 앱이 「경전을 읽는 자리」가
            아니라 「AI 를 쓰는 자리」로 먼저 읽힌다.
          */}
          <p className="svc-line">
            <b>부처의 말</b>
          </p>
          <div className="svc-right">
            {leafChip}
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
        </div>

        {/* 키보드가 올라오면 제목이 한 줄로 접히고 입력 묶음이 위로 붙는다 */}
        {focused ? (
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
          {/* 맨 앞 자리. 사람당 한 번뿐인 말이 여기 선다 */}
          {leadCard?.({ quote, focusField })}
          {topCard}
          {/* 답을 받고 돌아온 자리에서만 묻는다. 덮지 않고 입력칸 위에 선다 */}
          <DraftConfirm open={askClear && text !== ''} onAnswer={answerDraft} />
          {showDraftNotice && <DraftNotice onClear={openClear} />}

          <ConcernField
            value={draft}
            onChange={setDraft}
            fieldRef={fieldRef}
            onFocusChange={setFocused}
          />

          {/*
            입력칸 아래 한 줄에 둘이 함께 선다: 왼쪽에 깊이 표시, 오른쪽 끝에 전체 지우기.
            지우기에 줄 하나를 따로 주면 왼쪽이 통째로 비어 화면에 빈 띠가 생긴다.
          */}
          <div className="field-foot">
            <DepthIndicator text={draft} />
            {showClear && <DraftClearButton onOpen={openClear} />}
          </div>
          {clearAsking && text !== '' && <DraftClearAsk onAnswer={answerClear} />}

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
          {/* 「답변은 AI 가 만들어요」는 답변 화면 배지가 이미 말한다. 여기서는 쓰는 사람에게 필요한 것만 */}
          <p className="micro">
            <span className="nb">이름·연락처</span>는 적지 않아도 괜찮아요
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
        <button className="tab" type="button" onClick={() => navigate(ROUTES.settings)}>
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
            <circle cx="12" cy="12" r="3.1" />
            <path d="M19.2 14.6a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-2.6 1.1v.2a1.8 1.8 0 1 1-3.6 0v-.1a1.5 1.5 0 0 0-2.6-1.1l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0-1.1-2.6h-.2a1.8 1.8 0 1 1 0-3.6h.1a1.5 1.5 0 0 0 1.1-2.6l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.2a1.8 1.8 0 1 1 3.6 0v.1a1.5 1.5 0 0 0 2.6 1.1l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.2a1.8 1.8 0 1 1 0 3.6h-.1a1.5 1.5 0 0 0-1.4.9z" />
          </svg>
          설정
        </button>
      </nav>

      {entryOpen && quote != null && (
        <EntryCard quote={quote} showDailyNote onDismiss={dismissQuote} />
      )}
    </div>
  );
}
