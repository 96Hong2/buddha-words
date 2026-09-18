import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { ROUTES } from '../../app/router';
import type { ApiResponse } from '../../shared/api';
import { useSession } from '../../shared/session/session';
import { itemsBucket, useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';
import { sceneForScreen } from '../../shared/visual/scene';

import { ArchiveDetail } from './ArchiveDetail';
import { ArchiveItem } from './ArchiveItem';
import { listSaved, removeSaved, toggleFavorite, type SavedAnswer } from './archiveStore';

import './archive.css';

/**
 * 한 번에 그리는 개수.
 *
 * 간직 개수 제한이 없어지면서 목록에 끝이 없어졌다. 스무 장이 넘어가면 아래로만 긴 화면이
 * 되고, 방금 담은 것을 보러 온 사람이 스크롤로 그것을 찾는다. 열 장이면 한 화면에서
 * 두어 번 넘기는 길이다.
 *
 * 무한 스크롤 대신 버튼을 둔다. 얼마나 남았는지 숫자로 보이고, 끝에 닿았다는 것도 분명하다.
 */
const PAGE = 10;

/** 무엇만 볼까 */
type Filter = 'all' | 'favorite';

/** 오늘 나눈 이야기. 이번에 받은 답변을 그대로 카드 한 장으로 보여 준다 */
function todayCard(response: ApiResponse | null): SavedAnswer | null {
  if (response == null || response.responseType !== 'answer') return null;
  return {
    answerId: response.answerId,
    savedAt: Date.now(),
    line: response.modernBuddhaMessage,
    tags: response.emotionTags,
    visualTheme: response.visualTheme,
  };
}

/** 잠긴 자리의 자물쇠 */
/** 이용권으로 열린 자리 */
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5.5 12.4l4.2 4.2 8.8-8.8" />
    </svg>
  );
}

export function ArchiveScreen() {
  const navigate = useNavigate();
  const { response, archivePass } = useSession();
  const [saved, setSaved] = useState<SavedAnswer[]>(listSaved);
  /** 펼쳐 보는 중인 항목. 카드를 누르면 여기 들어온다 */
  const [opened, setOpened] = useState<SavedAnswer | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  /** 지금까지 몇 장을 펼쳤나. 「더 보기」를 누를 때마다 한 쪽씩 는다 */
  const [shown, setShown] = useState(PAGE);

  const analytics = useAnalytics();

  /**
   * 보관함을 연 사실과 그 안에 몇 개가 있나.
   * 「어떤 기능은 클릭조차 하지 않는가」를 물어보려면 화면을 연 횟수가 있어야 한다.
   */
  useEffect(() => {
    analytics.log('archive_view', { items_bucket: itemsBucket(saved.length) }, { kind: 'screen' });
    // 마운트할 때 한 번이다. 지우고 다시 세면 같은 방문이 여러 번으로 셈해진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics]);

  const owned = archivePass === 'owned';
  const today = useMemo(() => todayCard(response), [response]);

  /**
   * 오늘 받은 답을 이미 간직했다면 「오늘 나눈 이야기」에 또 그리지 않는다.
   * 같은 카드가 두 자리에 놓이면 둘 중 어느 쪽이 진짜 보관된 것인지 알 수 없다.
   * 대신 간직한 말씀 쪽 카드에 「오늘」을 붙여 그것이 오늘 것임을 알린다.
   */
  const savedToday = today != null && saved.some((item) => item.answerId === today.answerId);
  const todayOnly = savedToday ? null : today;
  const empty = todayOnly == null && saved.length === 0;
  const art = sceneForScreen('archiveEmpty');

  const favorites = saved.filter((item) => item.favorite === true);
  const inFilter = filter === 'favorite' ? favorites : saved;
  const page = inFilter.slice(0, shown);
  const left = inFilter.length - page.length;

  function open(item: SavedAnswer) {
    setOpened(item);
    // 며칠 전에 간직한 것을 다시 여나. 보관함이 쌓아 두는 자리인지 다시 읽는 자리인지 가른다
    const days = Math.max(0, Math.floor((Date.now() - item.savedAt) / 86_400_000));
    analytics.log('archive_item_open', { days_since: days }, { kind: 'click' });
  }

  function remove(answerId: string) {
    removeSaved(answerId);
    setSaved(listSaved());
    setOpened(null);
  }

  function favorite(item: SavedAnswer) {
    const on = toggleFavorite(item.answerId);
    // 저장소가 정본이다. 화면 상태를 따로 세지 않고 다시 읽는다
    setSaved(listSaved());
    analytics.log('archive_favorite', { on }, { kind: 'click' });
  }

  function pickFilter(next: Filter) {
    if (next === filter) return;
    setFilter(next);
    setShown(PAGE);
    analytics.log('archive_filter', { filter: next }, { kind: 'click' });
  }

  function more() {
    const next = shown + PAGE;
    setShown(next);
    analytics.log('archive_more', { page: Math.ceil(next / PAGE) }, { kind: 'click' });
  }

  return (
    <div className="arch-screen" {...testId(TEST_IDS.archive)}>
      <div className="arch-pad">
        <h1 className="arch-title">보관함</h1>
        <p className="arch-sub">오늘 나눈 이야기와 간직한 말씀이 모이는 곳이에요</p>

        {empty ? (
          <div className="arch-empty">
            {art != null && (
              <span className="arch-empty-art" style={{ background: art.backdrop }}>
                <img className="buddha-v2" src={art.src} alt="" />
              </span>
            )}
            <h2 className="arch-empty-title">아직 간직한 말씀이 없어요</h2>
            <p className="arch-empty-desc">마음에 남는 말을 간직해보세요</p>
            <p className="arch-empty-how">답변 아래 간직하기를 누르면 여기에 쌓여요</p>
            <button
              type="button"
              className="arch-btn arch-btn--primary arch-btn--lg arch-empty-cta"
              onClick={() => navigate(ROUTES.home)}
            >
              이야기하러 가기
            </button>
          </div>
        ) : (
          <>
            {todayOnly != null && (
              <>
                <div className="arch-sec arch-sec--first">
                  <h2 className="arch-sec-title">오늘 나눈 이야기</h2>
                </div>
                {/* 세션에만 있는 답이다. 남는 것처럼 보이지 않게 여기서 미리 말해 둔다 */}
                <p className="arch-note">
                  이 답변은 앱을 닫으면 사라져요. 간직하면 여기에 남아 다시 볼 수 있어요.
                </p>
                {/*
                  아직 간직하지 않은 답이다. 이 답은 세션에 살아 있으니 답변 화면으로 돌려보낸다.
                  상세 시트로 열면 기기에 없는 것을 보관함에 있는 것처럼 보이게 한다.
                */}
                <ArchiveItem item={todayOnly} today onOpen={() => navigate(ROUTES.answer)} />
              </>
            )}

            {saved.length > 0 && (
              <>
                <div className={`arch-sec${todayOnly == null ? ' arch-sec--first' : ''}`}>
                  <h2 className="arch-sec-title">간직한 말씀</h2>
                  <span className="arch-sec-count">{saved.length}개</span>
                </div>

                {/*
                  즐겨찾기가 하나도 없으면 필터를 그리지 않는다.
                  누를 때마다 빈 화면이 나오는 칸은 길만 늘린다.
                */}
                {favorites.length > 0 && (
                  <div className="arch-filter" role="group" aria-label="보기">
                    <button
                      type="button"
                      className={filter === 'all' ? 'is-on' : undefined}
                      aria-pressed={filter === 'all'}
                      onClick={() => pickFilter('all')}
                      {...testId(TEST_IDS.archiveFilter)}
                    >
                      전체 {saved.length}
                    </button>
                    <button
                      type="button"
                      className={filter === 'favorite' ? 'is-on' : undefined}
                      aria-pressed={filter === 'favorite'}
                      onClick={() => pickFilter('favorite')}
                      {...testId(TEST_IDS.archiveFilter)}
                    >
                      즐겨찾기 {favorites.length}
                    </button>
                  </div>
                )}

                {page.map((item) => (
                  <ArchiveItem
                    key={item.answerId}
                    item={item}
                    today={today != null && today.answerId === item.answerId}
                    onOpen={() => open(item)}
                    onToggleFavorite={() => favorite(item)}
                  />
                ))}

                {left > 0 && (
                  <button
                    type="button"
                    className="arch-more"
                    onClick={more}
                    {...testId(TEST_IDS.archiveMore)}
                  >
                    {left}개 더 보기
                  </button>
                )}
              </>
            )}

            {/*
              간직 개수 제한이 없어져서 「몇 개까지」를 세던 자리가 사라졌다.
              이용권이 지금 하는 일은 간직할 때 짧은 광고를 건너뛰는 것 하나다.
              산 사람에게만 그 사실을 알리고, 안 산 사람에게 파는 말을 먼저 걸지 않는다.
              광고를 본 값이 이용권보다 싸고, 여기는 파는 화면이 아니라 다시 읽는 화면이다.
            */}
            {owned && (
              <div className="arch-past arch-past--open">
                <span className="arch-past-mark" aria-hidden="true">
                  <CheckIcon />
                </span>
                <span className="arch-past-texts">
                  <span className="arch-past-title">이용권이 있어요</span>
                  <span className="arch-past-note">광고 없이 바로 간직할 수 있어요</span>
                </span>
              </div>
            )}

            <div className="arch-pattern" aria-hidden="true" />
          </>
        )}
      </div>

      <div className="arch-bottom-space" />

      <nav className="arch-tabbar" aria-label="화면 이동">
        <button type="button" className="arch-tab" onClick={() => navigate(ROUTES.home)}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4.5c4.3 0 7.8 2.8 7.8 6.3s-3.5 6.3-7.8 6.3c-.9 0-1.7-.1-2.5-.35L5.2 18.4l1.1-3.1C5 14.2 4.2 12.8 4.2 10.8 4.2 7.3 7.7 4.5 12 4.5z" />
          </svg>
          이야기하기
        </button>
        <span className="arch-tab arch-tab--on" aria-current="page">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7.2 4h9.6a1 1 0 0 1 1 1v14.3l-5.8-3.4-5.8 3.4V5a1 1 0 0 1 1-1z" />
          </svg>
          보관함
        </span>
        <button type="button" className="arch-tab" onClick={() => navigate(ROUTES.settings)}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
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

      <ArchiveDetail
        item={opened}
        today={opened != null && today != null && today.answerId === opened.answerId}
        onClose={() => setOpened(null)}
        onDelete={remove}
      />

    </div>
  );
}
