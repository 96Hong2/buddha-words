import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { ROUTES } from '../../app/router';
import type { ApiResponse } from '../../shared/api';
import { isArchivePassEnabled, useSession } from '../../shared/session/session';
import { itemsBucket, useAnalytics } from '../../shared/analytics';
import { TEST_IDS, testId } from '../../shared/testIds';
import { sceneForScreen } from '../../shared/visual/scene';

import { ArchiveDetail } from './ArchiveDetail';
import { ArchiveItem, ChevronIcon } from './ArchiveItem';
import { listSaved, removeSaved, SAVE_LIMIT, type SavedAnswer } from './archiveStore';
import { Paywall } from './Paywall';

import './archive.css';

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
function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.75" y="10.5" width="14.5" height="9.5" rx="2.6" />
      <path d="M8.4 10.5V7.9a3.6 3.6 0 0 1 7.2 0v2.6" />
    </svg>
  );
}

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
  const [paywallOpen, setPaywallOpen] = useState(false);
  /** 펼쳐 보는 중인 항목. 카드를 누르면 여기 들어온다 */
  const [opened, setOpened] = useState<SavedAnswer | null>(null);

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

  const passEnabled = isArchivePassEnabled();
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
                  {!owned && (
                    <span className="arch-sec-count">
                      {saved.length} / {SAVE_LIMIT}
                    </span>
                  )}
                </div>
                {saved.map((item) => (
                  <ArchiveItem
                    key={item.answerId}
                    item={item}
                    today={today != null && today.answerId === item.answerId}
                    onOpen={() => open(item)}
                  />
                ))}
              </>
            )}

            <div className="arch-sec">
              <h2 className="arch-sec-title">간직할 자리</h2>
              <span className={`arch-sec-state${owned ? ' arch-sec-state--open' : ''}`}>
                {owned ? '제한 없음' : `${SAVE_LIMIT}개까지`}
              </span>
            </div>

            {/*
              여기는 이용권이 실제로 하는 일만 적는다.
              「지난 이야기가 여기에 쌓여요」라고 적어 두었던 자리인데, 간직하지 않은 답변은
              기기에도 서버에도 남지 않아서 이용권을 산 뒤에도 아무것도 쌓이지 않는다.
              돈을 낸 사람이 빈 자리를 계속 보게 되고, 같은 화면의 이용권 시트가 「간직하지 않고
              지나간 이야기는 다시 불러올 수 없어요」라고 정반대로 말한다.
              지금 이용권이 푸는 것은 간직 자리 제한 하나뿐이라 그것만 적는다.
            */}
            {owned ? (
              <div className="arch-past arch-past--open">
                <span className="arch-past-mark" aria-hidden="true">
                  <CheckIcon />
                </span>
                <span className="arch-past-texts">
                  <span className="arch-past-title">이용권이 있어요</span>
                  <span className="arch-past-note">간직할 수 있는 개수에 제한이 없어요</span>
                </span>
              </div>
            ) : (
              <button type="button" className="arch-past" onClick={() => setPaywallOpen(true)}>
                <span className="arch-past-mark" aria-hidden="true">
                  <LockIcon />
                </span>
                <span className="arch-past-texts">
                  <span className="arch-past-title">간직할 자리는 {SAVE_LIMIT}개까지예요</span>
                  <span className="arch-past-note">
                    {passEnabled
                      ? '이용권이 있으면 개수 제한 없이 간직할 수 있어요'
                      : '새로 간직하려면 간직한 말씀 하나를 지워 주세요'}
                  </span>
                  <span className="arch-past-cta">
                    {passEnabled ? '이용권 보기' : '자세히 보기'}
                    <ChevronIcon />
                  </span>
                </span>
              </button>
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
      </nav>

      <ArchiveDetail
        item={opened}
        today={opened != null && today != null && today.answerId === opened.answerId}
        onClose={() => setOpened(null)}
        onDelete={remove}
      />

      <Paywall open={paywallOpen} trigger="archive_locked" onClose={() => setPaywallOpen(false)} />
    </div>
  );
}
