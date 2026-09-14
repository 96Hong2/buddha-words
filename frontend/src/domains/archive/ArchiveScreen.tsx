import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { ROUTES } from '../../app/router';
import type { ApiResponse } from '../../shared/api';
import { useSession } from '../../shared/session';
import { TEST_IDS, testId } from '../../shared/testIds';
import { sceneForScreen } from '../../shared/visual/scene';

import { ArchiveItem } from './ArchiveItem';
import { listSaved, SAVE_LIMIT, type SavedAnswer } from './archiveStore';
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

export function ArchiveScreen() {
  const navigate = useNavigate();
  const { response } = useSession();
  const [saved] = useState<SavedAnswer[]>(listSaved);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const today = useMemo(() => todayCard(response), [response]);
  const empty = today == null && saved.length === 0;
  const art = sceneForScreen('archiveEmpty');

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
            {today != null && (
              <>
                <div className="arch-sec arch-sec--first">
                  <h2 className="arch-sec-title">오늘 나눈 이야기</h2>
                </div>
                <ArchiveItem item={today} today />
              </>
            )}

            {saved.length > 0 && (
              <>
                <div className={`arch-sec${today == null ? ' arch-sec--first' : ''}`}>
                  <h2 className="arch-sec-title">간직한 말씀</h2>
                  <span className="arch-sec-count">
                    {saved.length} / {SAVE_LIMIT}
                  </span>
                </div>
                {saved.map((item) => (
                  <ArchiveItem key={item.answerId} item={item} />
                ))}
              </>
            )}

            <div className="arch-sec">
              <h2 className="arch-sec-title">지난 이야기</h2>
            </div>

            {/* 자물쇠를 두지 않는다. 자리만 흐리게 알리고 한 줄로 안내한다 */}
            <button type="button" className="arch-past" onClick={() => setPaywallOpen(true)}>
              <span className="arch-past-inner" aria-hidden="true">
                <span className="arch-past-row">
                  <span className="arch-past-sq" />
                  <span className="arch-past-lines">
                    <span className="arch-past-bar" style={{ width: '42%' }} />
                    <span className="arch-past-bar" style={{ width: '86%' }} />
                  </span>
                </span>
                <span className="arch-past-row">
                  <span className="arch-past-sq" />
                  <span className="arch-past-lines">
                    <span className="arch-past-bar" style={{ width: '36%' }} />
                    <span className="arch-past-bar" style={{ width: '74%' }} />
                  </span>
                </span>
                <span className="arch-past-row">
                  <span className="arch-past-sq" />
                  <span className="arch-past-lines">
                    <span className="arch-past-bar" style={{ width: '48%' }} />
                    <span className="arch-past-bar" style={{ width: '80%' }} />
                  </span>
                </span>
              </span>
              <span className="arch-past-note">이용권이 있으면 지난 이야기를 다시 볼 수 있어요</span>
            </button>

            <div className="arch-pattern" aria-hidden="true" />
          </>
        )}
      </div>

      <div className="arch-bottom-space" />

      <nav className="arch-tabbar" aria-label="화면 이동">
        <button type="button" className="arch-tab" onClick={() => navigate(ROUTES.home)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4.5c4.3 0 7.8 2.8 7.8 6.3s-3.5 6.3-7.8 6.3c-.9 0-1.7-.1-2.5-.35L5.2 18.4l1.1-3.1C5 14.2 4.2 12.8 4.2 10.8 4.2 7.3 7.7 4.5 12 4.5z" />
          </svg>
          이야기하기
        </button>
        <span className="arch-tab arch-tab--on" aria-current="page">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <path d="M7.2 4h9.6a1 1 0 0 1 1 1v14.3l-5.8-3.4-5.8 3.4V5a1 1 0 0 1 1-1z" />
          </svg>
          보관함
        </span>
      </nav>

      <Paywall
        open={paywallOpen}
        trigger="archive_locked"
        onClose={() => setPaywallOpen(false)}
      />
    </div>
  );
}
