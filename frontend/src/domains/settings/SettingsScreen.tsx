import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router';

import { ROUTES } from '../../app/router';
import { TEST_IDS, testId } from '../../shared/testIds';

import './settings.css';

/** 문의를 받는 곳. 앱 안에서 바로 메일 앱으로 넘긴다 */
const CONTACT_EMAIL = 'help@buddhawords.kr';

function Chevron() {
  return (
    <span className="set-chev" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 5.5l6.5 6.5-6.5 6.5" />
      </svg>
    </span>
  );
}

export function SettingsScreen() {
  const navigate = useNavigate();

  return (
    <div className="set-screen" {...testId(TEST_IDS.settings)}>
      <div className="set-pad">
        <h1 className="set-title">설정</h1>
        <p className="set-sub">확인할 것과 도움받을 곳을 한 곳에 모았어요</p>

        <p className="set-group">안내</p>
        <div className="set-list">
          <button type="button" className="set-item" onClick={() => navigate(ROUTES.privacy)}>
            <span className="set-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M12 3.5l7 2.6v5.4c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6.1z" />
                <path d="M9.3 12.2l2 2 3.4-3.9" strokeLinecap="round" />
              </svg>
            </span>
            <span className="set-text">
              <span className="set-item-title">개인정보 안내</span>
              <span className="set-item-desc">적은 이야기를 어떻게 다루는지 알려드려요</span>
            </span>
            <Chevron />
          </button>

          <button type="button" className="set-item" onClick={() => navigate(ROUTES.privacy)}>
            <span className="set-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M6 3.8h9.2L19 7.6V20a.6.6 0 0 1-.6.6H6A.6.6 0 0 1 5.4 20V4.4A.6.6 0 0 1 6 3.8z" />
                <path d="M14.8 4v4h4M8.4 12.4h7.2M8.4 16h5" strokeLinecap="round" />
              </svg>
            </span>
            <span className="set-text">
              <span className="set-item-title">이용약관</span>
              <span className="set-item-desc">앱 안에서 바로 읽을 수 있어요</span>
            </span>
            <Chevron />
          </button>

          <button type="button" className="set-item" onClick={() => navigate(ROUTES.helpLines)}>
            <span className="set-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M12 19.6S4.6 15.4 4.6 10.1A3.9 3.9 0 0 1 12 8.2a3.9 3.9 0 0 1 7.4 1.9c0 5.3-7.4 9.5-7.4 9.5z" />
              </svg>
            </span>
            <span className="set-text">
              <span className="set-item-title">도움받을 곳</span>
              <span className="set-item-desc">마음이 많이 힘들 때 바로 이야기할 수 있어요</span>
            </span>
            <Chevron />
          </button>
        </div>

        <p className="set-group">문의</p>
        <div className="set-list">
          <a className="set-item" href={`mailto:${CONTACT_EMAIL}`}>
            <span className="set-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <rect x="3.4" y="5.6" width="17.2" height="12.8" rx="2.4" />
                <path d="M4.2 7.2L12 12.6l7.8-5.4" strokeLinecap="round" />
              </svg>
            </span>
            <span className="set-text">
              <span className="set-item-title">문의 이메일</span>
              <span className="set-item-desc">{CONTACT_EMAIL} 로 보낼 수 있어요</span>
            </span>
            <Chevron />
          </a>

          <button type="button" className="set-item" onClick={() => navigate(ROUTES.appInfo)}>
            <span className="set-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <circle cx="12" cy="12" r="8.2" />
                <path d="M12 11v5.4" strokeLinecap="round" />
                <circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <span className="set-text">
              <span className="set-item-title">앱 정보</span>
              <span className="set-item-desc">판과 배포 정보를 확인해요</span>
            </span>
            <span className="set-value">{__APP_VERSION__}</span>
            <Chevron />
          </button>
        </div>

        <div className="set-foot">
          {/* logo_lockup 은 마크 아래에 이름이 픽셀로 박혀 있다. 마크만 잘라 쓰고 이름은 아래에서 다시 쓴다 */}
          <div className="asset-crop set-foot-mark" style={{ '--iw': 172, '--ih': 166, '--cx': 44, '--cy': 12, '--k': 0.857 } as CSSProperties}>
            <img src="/assets/logo_lockup.webp" alt="" />
          </div>
          <div className="set-foot-name">부처의 말</div>
          <div className="set-foot-ver">버전 {__APP_VERSION__} · 답변은 AI가 만들어요</div>
        </div>
      </div>
    </div>
  );
}
