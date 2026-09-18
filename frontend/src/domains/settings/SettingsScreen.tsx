import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';

import { ROUTES } from '../../app/router';
import { useBridge } from '../../app/providers';
import {
  notifyTemplateCode,
  notifyUsable,
  readNotify,
  writeNotify,
  type NotifyState,
} from '../../shared/prefs/notify';
import {
  isArchivePassEnabled,
  useSession,
  type ArchivePassState,
} from '../../shared/session/session';
import { TEST_IDS, testId } from '../../shared/testIds';
import { useAnalytics } from '../../shared/analytics';
import {
  readTextSize,
  TEXT_SIZE_LABEL,
  TEXT_SIZES,
  writeTextSize,
  type TextSize,
} from '../../shared/prefs/textSize';

import './settings.css';

/** 문의를 받는 곳. 앱 안에서 바로 메일 앱으로 넘긴다 */
const CONTACT_EMAIL = 'help@buddhawords.kr';

/** 이용권 자리에 지금 무엇이 적히나. 모르는 것은 모른다고 적는다 */
const PASS_ROW: Record<ArchivePassState, { value: string; desc: string }> = {
  owned: { value: '있음', desc: '광고 없이 바로 간직할 수 있어요' },
  none: { value: '없음', desc: '지금은 짧은 광고를 보면 간직할 수 있어요' },
  unknown: { value: '확인 중', desc: '토스에 남은 구매 내역을 읽고 있어요' },
};

/** 구매 내역을 다시 읽고 나서 하는 말 */
const RESTORE_NOTICE: Record<ArchivePassState, string> = {
  owned: '이용권을 찾았어요. 광고 없이 간직할 수 있어요.',
  none: '이 토스 계정으로 산 이용권이 없어요.',
  unknown: '구매 내역을 확인하지 못했어요. 잠시 뒤에 다시 눌러 주세요.',
};

/**
 * 알림 자리에 지금 무엇이 적히나.
 *
 * 「켜짐」이라고 단정하지 않는다. 우리가 아는 것은 「동의를 받아 두었다」이고, 사람이 토스
 * 설정에서 끈 것은 알 수 없다. SDK 가 지금 상태를 되묻는 길을 주지 않는다.
 */
const NOTIFY_ROW: Record<NotifyState, { value: string; desc: string }> = {
  unset: { value: '받기', desc: '하루 한 번, 마음을 들여다볼 시간을 알려드려요' },
  on: { value: '받는 중', desc: '끄는 것은 토스 앱 알림 설정에서 할 수 있어요' },
  declined: { value: '받기', desc: '다시 받고 싶으면 눌러 주세요' },
  unsupported: { value: '받기', desc: '이 버전에서는 알림을 켤 수 없어요' },
};

/** 동의를 묻고 나서 하는 말 */
const NOTIFY_NOTICE: Record<NotifyState, string> = {
  unset: '',
  on: '알림을 받기로 했어요. 하루 한 번 알려드릴게요.',
  declined: '알림을 받지 않기로 했어요. 언제든 다시 켤 수 있어요.',
  unsupported: '지금은 알림을 켤 수 없어요. 토스 앱을 업데이트해 주세요.',
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
  const bridge = useBridge();
  const analytics = useAnalytics();
  const { archivePass, refreshArchivePass } = useSession();
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [textSize, setTextSize] = useState<TextSize>(() => readTextSize());

  const [notify, setNotify] = useState<NotifyState>(() => readNotify());
  const [asking, setAsking] = useState(false);
  const [notifyNotice, setNotifyNotice] = useState<string | null>(null);
  /** 홈 추가 경로 안내를 펼쳤나. 시트를 열 만한 내용이 아니라 한 줄로 편다 */
  const [homeAddOpen, setHomeAddOpen] = useState(false);

  useEffect(() => {
    if (!homeAddOpen) return;
    analytics.log('home_add_view', { from: 'settings' }, { kind: 'impression' });
  }, [analytics, homeAddOpen]);

  /**
   * 알림 동의를 묻는다.
   *
   * 이미 켜 둔 사람에게는 버튼이 눌리지 않는다. 앱인토스 SDK 는 동의를 **요청**하는 길만
   * 주고 끄는 길도 지금 상태를 되묻는 길도 안 준다. 그래서 끄는 곳은 토스 설정이라고 적는다.
   * 여기서 「꺼짐」으로 바꿔 놓으면 실제로는 켜져 있는데 꺼진 것처럼 보이게 된다.
   */
  const askNotify = useCallback(() => {
    if (asking || notify === 'on') return;
    if (!notifyUsable(bridge.supports('notification'))) {
      setNotifyNotice('이 버전에서는 알림을 켤 수 없어요. 토스 앱을 업데이트해 주세요.');
      return;
    }
    setAsking(true);
    setNotifyNotice(null);
    analytics.log('notification_prompt_accept', { surface: 'settings' }, { kind: 'click' });
    void bridge
      .requestNotificationAgreement(notifyTemplateCode())
      .then((result): 'granted' | 'denied' => (result === 'agreementRejected' ? 'denied' : 'granted'))
      .catch((): 'unsupported' => 'unsupported')
      .then((result) => {
        analytics.log('notification_permission', { result });
        const next: NotifyState =
          result === 'granted' ? 'on' : result === 'denied' ? 'declined' : 'unsupported';
        writeNotify(next);
        setNotify(next);
        setNotifyNotice(NOTIFY_NOTICE[next]);
      })
      .finally(() => setAsking(false));
  }, [analytics, asking, bridge, notify]);

  /** 고른 즉시 화면 전체가 커진다. 저장 버튼을 따로 두지 않는다 */
  const pickTextSize = useCallback(
    (size: TextSize) => {
      if (size === textSize) return;
      setTextSize(size);
      writeTextSize(size);
      analytics.log('text_size_change', { size, from: 'settings' }, { kind: 'click' });
    },
    [analytics, textSize],
  );

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
        <p className="set-sub">읽기 편한 크기로 맞추고, 알아둘 것을 한 곳에서 볼 수 있어요</p>

        {/*
          글자 크기.
          
          맨 위에 둔다. 이 설정을 찾는 사람은 지금 글씨가 작아서 온 것이고, 그 사람이
          목록을 훑어 내려가게 만들면 찾는 동안 계속 작은 글씨를 읽어야 한다.

          미리보기 문장을 함께 둔다. 「크게」가 얼마나 큰지는 눌러 보기 전에는 모른다.
        */}
        <p className="set-group">글자 크기</p>
        <div className="set-list">
          <div className="set-textsize" {...testId(TEST_IDS.textSize)}>
            <div className="set-textsize__row" role="radiogroup" aria-label="글자 크기">
              {TEXT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={textSize === size}
                  className={`set-textsize__btn${textSize === size ? ' is-on' : ''}`}
                  onClick={() => pickTextSize(size)}
                  data-size={size}
                  {...testId(TEST_IDS.textSizeOption)}
                >
                  <span className="set-textsize__a">가</span>
                  <span className="set-textsize__l">{TEXT_SIZE_LABEL[size]}</span>
                </button>
              ))}
            </div>
            <p className="set-textsize__preview">
              마음은 붙잡기 어렵고 가볍게 흔들립니다. 지혜로운 이는 그 마음을 바르게 합니다.
            </p>
          </div>
        </div>

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

        {/*
          알림과 홈 추가.

          둘 다 답변 화면에서 한 번씩 권하는 것인데, 그 한 번을 놓쳤거나 나중에 마음이
          바뀐 사람이 찾아올 자리가 없었다. 권유는 사라지지만 설정은 남는다.
        */}
        <p className="set-group">알림과 바로가기</p>
        <div className="set-list">
          <button
            type="button"
            className="set-item"
            onClick={askNotify}
            disabled={notify === 'on' || asking}
            {...testId(TEST_IDS.settingsNotify)}
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
                <path d="M18 9.6a6 6 0 1 0-12 0c0 4.2-1.4 5.6-1.4 5.6h14.8S18 13.8 18 9.6z" />
                <path d="M10.3 18.6a2 2 0 0 0 3.4 0" />
              </svg>
            </span>
            <span className="set-text">
              <span className="set-item-title">하루 한 번 알림</span>
              <span className="set-item-desc">{NOTIFY_ROW[notify].desc}</span>
            </span>
            <span className="set-value">{asking ? '여는 중' : NOTIFY_ROW[notify].value}</span>
          </button>

          <button
            type="button"
            className="set-item"
            onClick={() => setHomeAddOpen((now) => !now)}
            aria-expanded={homeAddOpen}
            {...testId(TEST_IDS.settingsHomeAdd)}
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
                <path d="M4.5 10.8 12 4.6l7.5 6.2V19a.8.8 0 0 1-.8.8H5.3a.8.8 0 0 1-.8-.8z" />
                <path d="M12 16.4v-4.6M9.7 14.1h4.6" />
              </svg>
            </span>
            <span className="set-text">
              <span className="set-item-title">토스 홈에 추가하기</span>
              <span className="set-item-desc">홈에서 바로 열 수 있어요</span>
            </span>
            <Chevron />
          </button>
        </div>

        {/*
          앱인토스에 홈 추가를 부르는 API 가 없다. 사람이 상단 더보기(⋯)에서 직접 골라야 하고,
          그 메뉴는 토스앱 5.246.0 부터 있다. 그래서 여기가 하는 일은 어디를 눌러야 하는지
          가리키는 것뿐이다. 되지도 않는 버튼을 두고 누르면 「직접 해 주세요」라고 하는 쪽이 나쁘다.
        */}
        {homeAddOpen && (
          <p className="set-hint set-hint--how">
            화면 맨 위{' '}
            <span className="set-dots" aria-label="더보기">
              <i />
              <i />
              <i />
            </span>{' '}
            를 누르고 <b>홈 화면에 추가하기</b>를 고르세요
          </p>
        )}

        {notifyNotice != null && (
          <p className="set-hint" role="status">
            {notifyNotice}
          </p>
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

        {/* 탭바가 자리를 덮지 않게 그만큼 비워 둔다 */}
        <div className="set-tab-space" />
      </div>

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
        <button type="button" className="arch-tab" onClick={() => navigate(ROUTES.archive)}>
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
        </button>
        <span className="arch-tab arch-tab--on" aria-current="page">
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
        </span>
      </nav>
    </div>
  );
}
