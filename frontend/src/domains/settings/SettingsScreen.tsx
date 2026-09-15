import { useCallback, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';

import { ROUTES } from '../../app/router';
import {
  isArchivePassEnabled,
  useSession,
  type ArchivePassState,
} from '../../shared/session/session';
import { TEST_IDS, testId } from '../../shared/testIds';

import './settings.css';

/** 문의를 받는 곳. 앱 안에서 바로 메일 앱으로 넘긴다 */
const CONTACT_EMAIL = 'help@buddhawords.kr';

/** 이용권 자리에 지금 무엇이 적히나. 모르는 것은 모른다고 적는다 */
const PASS_ROW: Record<ArchivePassState, { value: string; desc: string }> = {
  owned: { value: '있음', desc: '간직 개수에 제한이 없어요' },
  none: { value: '없음', desc: '보관함에서 네 번째로 간직할 때 살 수 있어요' },
  unknown: { value: '확인 중', desc: '토스에 남은 구매 내역을 읽고 있어요' },
};

/** 구매 내역을 다시 읽고 나서 하는 말 */
const RESTORE_NOTICE: Record<ArchivePassState, string> = {
  owned: '이용권을 찾았어요. 간직 개수에 제한이 없어요.',
  none: '이 토스 계정으로 산 이용권이 없어요.',
  unknown: '구매 내역을 확인하지 못했어요. 잠시 뒤에 다시 눌러 주세요.',
};

function Chevron() {
  return (
    <span className="set-chev" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9.5 5.5l6.5 6.5-6.5 6.5" />
      </svg>
    </span>
  );
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const { archivePass, refreshArchivePass } = useSession();
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * 산 사람이 자기 것을 확인하는 자리.
   *
   * 이용권은 기기가 아니라 토스 계정에 남는다. 앱을 다시 깔면 기기 캐시가 비어 있어서
   * 산 사람이 「없음」을 보게 되는데, 그때 스스로 되살릴 자리가 없으면 문의밖에 길이 없다.
   */
  const restore = useCallback(() => {
    if (checking) return;
    setChecking(true);
    setNotice(null);
    void refreshArchivePass()
      .then((state) => setNotice(RESTORE_NOTICE[state]))
      // 못 읽은 것과 없는 것은 다르다. 읽지 못한 쪽으로 말한다
      .catch(() => setNotice(RESTORE_NOTICE.unknown))
      .finally(() => setChecking(false));
  }, [checking, refreshArchivePass]);

  // 팔지 않는 판에서는 이용권 자리를 그리지 않는다. 이미 가진 사람에게는 그대로 보여 준다
  const showPass = isArchivePassEnabled() || archivePass === 'owned';
  const row = PASS_ROW[archivePass];

  return (
    <div className="set-screen" {...testId(TEST_IDS.settings)}>
      <div className="set-pad">
        <h1 className="set-title">설정</h1>
        <p className="set-sub">앱에 대해 알아둘 것을 한 곳에 모았어요</p>

        {showPass && (
          <>
            <p className="set-group">이용권</p>
            <div className="set-list" {...testId(TEST_IDS.archivePass)}>
              <div className="set-line">
                <span className="set-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  >
                    <path d="M4.6 7.4h14.8a.6.6 0 0 1 .6.6v8a.6.6 0 0 1-.6.6H4.6a.6.6 0 0 1-.6-.6V8a.6.6 0 0 1 .6-.6z" />
                    <path d="M4 11h16" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="set-text">
                  <span className="set-item-title">마음 보관함 이용권</span>
                  <span className="set-item-desc">{row.desc}</span>
                </span>
                <span className="set-value">{row.value}</span>
              </div>

              <button
                type="button"
                className="set-item"
                onClick={restore}
                disabled={checking}
                {...testId(TEST_IDS.archivePassRestore)}
              >
                <span className="set-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.2" />
                    <path d="M18.6 4.2v3.2h-3.2" />
                  </svg>
                </span>
                <span className="set-text">
                  <span className="set-item-title">구매 내역 다시 확인</span>
                  <span className="set-item-desc">
                    앱을 다시 깔았거나 기기를 바꿨을 때 눌러 주세요
                  </span>
                </span>
                {checking && <span className="set-value">확인 중</span>}
              </button>
            </div>
            {notice != null && (
              <p className="set-hint" role="status">
                {notice}
              </p>
            )}
          </>
        )}

        <p className="set-group">안내</p>
        <div className="set-list">
          <button type="button" className="set-item" onClick={() => navigate(ROUTES.privacy)}>
            <span className="set-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              >
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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              >
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
        </div>

        <p className="set-group">문의</p>
        <div className="set-list">
          <a className="set-item" href={`mailto:${CONTACT_EMAIL}`}>
            <span className="set-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              >
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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              >
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
          <div
            className="asset-crop set-foot-mark"
            style={
              { '--iw': 172, '--ih': 166, '--cx': 44, '--cy': 12, '--k': 0.857 } as CSSProperties
            }
          >
            <img src="/assets/logo_lockup.webp" alt="" />
          </div>
          <div className="set-foot-name">부처의 말</div>
          <div className="set-foot-ver">버전 {__APP_VERSION__} · 답변은 AI가 만들어요</div>
        </div>
      </div>
    </div>
  );
}
