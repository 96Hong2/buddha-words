import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { ROUTES } from '../../app/router';
import { useBridge } from '../../app/providers';
import { useApiClient } from '../../shared/api';
import {
  notifyTemplateCode,
  notifyUsable,
  readNotify,
  writeNotify,
  type NotifyState,
} from '../../shared/prefs/notify';
import { markNotifyDone, readMilestones } from '../../shared/prefs/milestones';
import {
  isArchivePassEnabled,
  useSession,
  type ArchivePassState,
} from '../../shared/session/session';
import { TEST_IDS, testId } from '../../shared/testIds';
import { LotusIcon } from '../../shared/ui';
import { useAnalytics } from '../../shared/analytics';
import { useOpenLink } from '../../shared/lib/useOpenLink';
import { appShareMessage, appShareUrl } from '../share/shareText';
import { LEAVES_PER_REWARDED_AD } from '../ads/placement';
import {
  readTextSize,
  TEXT_SIZE_LABEL,
  TEXT_SIZES,
  writeTextSize,
  type TextSize,
} from '../../shared/prefs/textSize';
import './settings.css';

/**
 * 문의를 받는 곳. 앱 안에서 바로 메일 앱으로 넘긴다.
 *
 * 1호 제품(10초 가계부)이 쓰는 발신 계정을 함께 쓴다. **주인이 실제로 읽는 자리라야 한다.**
 * 한때 `help@buddhawords.kr` 을 적어 뒀는데 만든 적이 없는 주소였고, 출시 직전까지 남아 있었다.
 * 앱마다 주소를 새로 만들면 또 그렇게 된다. 읽는 사람이 하나이므로 받는 자리도 하나로 둔다.
 *
 * 문의 자체는 토스도 받아 콘솔 「문의 내역」으로 넘겨 준다. 이 줄은 그 길을 모르는 사람을 위한 것이다.
 */
const CONTACT_EMAIL = 'pocket.app.official@gmail.com';

/** 이용권 자리에 지금 무엇이 적히나. 모르는 것은 모른다고 적는다 */
const PASS_ROW: Record<ArchivePassState, { value: string; desc: string }> = {
  owned: { value: '있음', desc: '기다리지 않고 바로 간직할 수 있어요' },
  none: { value: '없음', desc: '지금은 짧은 영상을 보면 간직할 수 있어요' },
  unknown: { value: '확인 중', desc: '토스에 남은 구매 내역을 읽고 있어요' },
};

/** 구매 내역을 다시 읽고 나서 하는 말 */
const RESTORE_NOTICE: Record<ArchivePassState, string> = {
  owned: '이용권을 찾았어요. 기다리지 않고 간직할 수 있어요.',
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
  on: { value: '받기로 함', desc: '토스 앱 알림 설정에서 끌 수 있어요' },
  declined: { value: '받기', desc: '다시 받고 싶으면 눌러 주세요' },
  unsupported: { value: '준비 중', desc: '지금 토스 앱 버전에서는 켤 수 없어요' },
  pending: { value: '준비 중', desc: '하루 한 번 알려드릴게요. 곧 시작해요' },
};

/** 동의를 묻고 나서 하는 말 */
const NOTIFY_NOTICE: Record<NotifyState, string> = {
  unset: '',
  on: '알림을 받기로 했어요.',
  declined: '알림을 받지 않기로 했어요. 언제든 다시 켤 수 있어요.',
  unsupported: '지금은 알림을 켤 수 없어요. 토스 앱을 업데이트해 주세요.',
  pending: '',
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

export interface SettingsScreenProps {
  /**
   * 지금 가진 연꽃과 모으기 시트를 여는 길. **둘 다 있어야 줄을 그린다.**
   *
   * 연꽃은 `domains/leaf` 것이고 여기는 `domains/settings` 다. 도메인끼리는 서로를
   * 들여오지 않기로 해서, 잇는 일은 app 층(`SettingsRoute`)이 한다.
   */
  leafCount?: number;
  onOpenLeaf?: () => void;
  /**
   * 이 기기에서 연꽃을 모을 수 있나. 못 모으는 판에서는 **모으라고 청하지 않는다.**
   *
   * 구버전·광고 끄기·그룹 id 가 없는 번들이 그렇다. 그 사람에게 「광고를 보면 모아둘
   * 수 있어요」라고 적으면 눌러 봐야 아는 거짓말이 된다. 모으기 시트가 같은 자리에서
   * 같은 판단을 한다(`LeafSheet` 의 `canCollect`).
   */
  leafCollectable?: boolean;
}

export function SettingsScreen({
  leafCount,
  onOpenLeaf,
  leafCollectable = true,
}: SettingsScreenProps = {}) {
  const navigate = useNavigate();
  const bridge = useBridge();
  const api = useApiClient();
  const analytics = useAnalytics();
  const openLink = useOpenLink();
  const { archivePass, refreshArchivePass } = useSession();
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [textSize, setTextSize] = useState<TextSize>(() => readTextSize());

  const [notify, setNotify] = useState<NotifyState>(() => readNotify());
  const [asking, setAsking] = useState(false);
  const [notifyNotice, setNotifyNotice] = useState<string | null>(null);
  /** 홈 추가 경로 안내를 펼쳤나. 시트를 열 만한 내용이 아니라 한 줄로 편다 */
  const [homeAddOpen, setHomeAddOpen] = useState(false);
  /** 앱을 알리는 중. 두 번 누르면 시트가 두 번 뜬다 */
  const [sharing, setSharing] = useState(false);
  /** 보내고 나서 하는 말. 버튼 라벨이 아니라 따로 둔다. 라벨 변화는 보조기기에 상태로 안 읽힌다 */
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  /**
   * 지금 토스에 동의를 물을 수 있나.
   *
   * ⚠ **알림 자리 자체는 이 값과 무관하게 늘 그린다.** 예전에는 못 물으면 줄을 통째로
   * 감췄는데, 실기기에서 「설정에 알림이 없다」는 말을 들었다. 감추면 준비 중이라는 사실도
   * 함께 사라져서, 사람은 이 앱에 알림이라는 것이 없다고 읽는다.
   *
   * 물을 수 없을 때 하는 일은 둘이다: 줄을 「준비 중」으로 적고, 누를 수 없게 한다.
   */
  const canAsk = notifyUsable(bridge.supports('notification'));

  useEffect(() => {
    if (!homeAddOpen) return;
    analytics.log(
      'home_add_view',
      { from: 'settings', answers_total: readMilestones().answers },
      { kind: 'impression' },
    );
  }, [analytics, homeAddOpen]);

  /**
   * 설정 화면을 연 사실. 어떤 줄이 실제로 눌리는지 보려면 분모가 필요하다.
   * 마운트할 때 한 번이다. 글자 크기를 바꿀 때마다 다시 세면 한 방문이 여러 번이 된다.
   */
  useEffect(() => {
    analytics.log(
      'settings_view',
      { notify_state: readNotify(), text_size: readTextSize() },
      { kind: 'screen' },
    );
  }, [analytics]);

  /**
   * 알림 동의를 묻는다.
   *
   * **켠 사람도 다시 누를 수 있다.** 앱인토스 SDK 는 동의를 요청하는 길만 주고, 끄는 길도
   * 지금 상태를 되묻는 길도 안 준다. 사람이 토스 설정에서 끈 것을 우리는 모른다.
   * 그 상태에서 「받기로 함」이라 말하면서 버튼까지 막으면 앱 안에서 다시 켤 길이 없어진다.
   * 그래서 끄는 곳은 토스 설정이라고 적고, 여기서 「꺼짐」으로 바꿔 놓지는 않는다.
   */
  const askNotify = useCallback(() => {
    if (asking) return;
    setAsking(true);
    setNotifyNotice(null);
    analytics.log('notification_prompt_accept', { surface: 'settings' }, { kind: 'click' });
    void bridge
      .requestNotificationAgreement(notifyTemplateCode())
      .then((result): 'granted' | 'denied' =>
        result === 'agreementRejected' ? 'denied' : 'granted',
      )
      .catch((): 'unsupported' => 'unsupported')
      .then((result) => {
        analytics.log('notification_permission', { result });
        const next: NotifyState =
          result === 'granted' ? 'on' : result === 'denied' ? 'declined' : 'unsupported';
        writeNotify(next);
        setNotify(next);
        setNotifyNotice(NOTIFY_NOTICE[next]);
        // 여기서 켠 사람에게 세 번째 답에서 같은 것을 또 묻지 않는다
        if (next === 'on') markNotifyDone();
        /*
          받지 않기로 했으면 남아 있던 되짚기 예약을 거둔다.
          거절한 사람에게 예약된 알림이 한 번 더 가면, 여기서 누른 「받지 않음」이
          아무 일도 하지 않은 것이 된다.
        */
        if (next === 'declined') {
          void api.cancelReminder().catch(() => {
            // 못 거뒀으면 알림이 한 번 더 간다. 그것 때문에 설정 화면을 멈추지 않는다
          });
        }
      })
      .finally(() => setAsking(false));
  }, [analytics, api, asking, bridge]);

  /**
   * 앱을 친구에게 알린다.
   *
   * ── 왜 설정에도 두나 ────────────────────────────────────────────────
   *
   * 알릴 길이 둘 있었는데 둘 다 **스스로 찾아갈 수 없는 자리**였다. 답변 화면 권유는
   * 두 번째 답에서 한 번 뜨고 지나가고, 보관함 카드는 첫 간직 직후에만 뜬다. 지나친
   * 사람이 나중에 알리고 싶어져도 갈 곳이 없었다. 설정은 늘 같은 자리에 있다.
   *
   * 여기서 보내는 것은 토스가 만든 앱 주소와 한 줄 소개뿐이다. 적은 이야기도 받은 답도
   * 함께 가지 않는다(`appShareMessage`).
   *
   * 권유 시간표(`markNudgeShown`)는 **건드리지 않는다.** 스스로 찾아와 누른 일이라
   * 부탁한 적이 없고, 그걸로 나중에 뜰 권유를 닫으면 누른 사람만 손해를 본다.
   */
  const shareApp = useCallback(() => {
    if (sharing) return;
    setSharing(true);
    setShareNotice(null);
    analytics.log('settings_row_click', { row: 'app_share' }, { kind: 'click' });

    void (async () => {
      const message = appShareMessage(await appShareUrl(bridge));
      let sent: 'sent' | 'dismissed' | 'unsupported' = 'unsupported';
      try {
        sent = await bridge.share.sendMessage(message);
      } catch {
        sent = 'unsupported';
      }

      // 스스로 닫은 것은 실패가 아니다. 아무 말도 하지 않는다
      if (sent === 'dismissed') {
        setSharing(false);
        return;
      }
      if (sent === 'sent') {
        analytics.log('settings_app_share_complete', { method: 'system' });
        setSharing(false);
        return;
      }

      // 시트를 못 열면 글을 복사하고 **복사했다고 말한다.** 말없이 복사하지 않는다
      try {
        await navigator.clipboard.writeText(message);
      } catch {
        analytics.log('settings_app_share_fail', { reason: 'copy_blocked' });
        setShareNotice('지금은 보내지 못했어요');
        setSharing(false);
        return;
      }
      analytics.log('settings_app_share_complete', { method: 'copy' });
      setShareNotice('보낼 글을 복사했어요');
      setSharing(false);
    })();
  }, [analytics, bridge, sharing]);

  /**
   * 안내·문의 줄로 넘어간다. 어떤 줄이 실제로 눌리는지 남긴다.
   * 안 눌리는 줄은 다음 판에서 뺀다. 설정은 줄이 늘기만 하고 줄지 않는 자리다.
   */
  const openRow = useCallback(
    (row: string, to: string) => {
      analytics.log('settings_row_click', { row }, { kind: 'click' });
      navigate(to);
    },
    [analytics, navigate],
  );

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
    analytics.log('settings_row_click', { row: 'pass_restore' }, { kind: 'click' });
    setChecking(true);
    setNotice(null);
    void refreshArchivePass()
      .then((state) => setNotice(RESTORE_NOTICE[state]))
      // 못 읽은 것과 없는 것은 다르다. 읽지 못한 쪽으로 말한다
      .catch(() => setNotice(RESTORE_NOTICE.unknown))
      .finally(() => setChecking(false));
  }, [analytics, checking, refreshArchivePass]);

  /**
   * 알림 줄에 지금 무엇이라고 적나.
   *
   * 물을 수 없는 판에서는 사람이 무엇을 골랐든 「준비 중」이다. 저장된 값이 `unset` 이라고
   * 「받기」라고 적어 두면 눌러도 아무 일이 없는 버튼을 권하는 셈이 된다.
   */
  const rowState: NotifyState = canAsk
    ? notify
    : // 낡은 토스 앱은 업데이트하면 되는 일이고, 템플릿이 없는 것은 우리가 할 일이다.
      // 둘을 같은 말로 덮으면 업데이트하면 될 사람이 우리를 기다린다.
      !bridge.supports('notification')
      ? 'unsupported'
      : // 이미 받기로 했거나 됐다고 한 사람의 답은 그대로 둔다. 그 위를 「준비 중」으로 덮으면
        // 거절한 사람에게 「곧 시작해요」라고 말하게 된다
        notify === 'unset'
        ? 'pending'
        : notify;

  // 팔지 않는 판에서는 이용권 자리를 그리지 않는다. 이미 가진 사람에게는 그대로 보여 준다
  const showPass = isArchivePassEnabled() || archivePass === 'owned';
  const row = PASS_ROW[archivePass];

  return (
    <div className="set-screen" {...testId(TEST_IDS.settings)}>
      <div className="set-pad">
        <h1 className="set-title">설정</h1>
        <p className="set-sub">홈에 추가하고, 알림과 글자 크기도 여기서 정할 수 있어요</p>

        {/*
          홈 화면에 추가하기.

          ⚠ 이름을 토스가 쓰는 말과 맞춘다. 실제로 누르는 메뉴가 「홈 화면에 추가하기」라
          우리가 「토스 홈」이라고 부르면 안내를 따라간 사람이 다른 이름을 만난다
          (2026-09-23 사용자 지적).

          ── 왜 맨 위이고 왜 강조하나 ────────────────────────────────────

          이 앱은 토스 안에 있어서, 홈에 두지 않으면 다시 오려면 미니앱 목록을 뒤져야 한다.
          **다시 오는 길을 만드는 유일한 줄**이라 설정에서 가장 값이 큰 항목이다. 그런데
          다른 줄과 똑같은 모양으로 목록 가운데 있으면 찾는 사람만 찾는다.

          강조는 색을 더 쓰지 않고 한다. 금색 테두리 한 겹과 은은한 바탕, 제목을 명조로.
          앱 전체가 쓰는 재료 그대로다. 파란 버튼이나 빨간 점을 붙이면 이 화면만 튄다.
        */}
        <p className="set-group">바로 열기</p>
        <div className="set-list set-list--hero">
          <button
            type="button"
            className="set-item set-item--hero"
            onClick={() => setHomeAddOpen((now) => !now)}
            aria-expanded={homeAddOpen}
            {...testId(TEST_IDS.settingsHomeAdd)}
          >
            <span className="set-icon set-icon--hero" aria-hidden="true">
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
              <span className="set-item-title set-item-title--hero">홈 화면에 추가하기</span>
              {/* 한 줄에 들어가는 길이로 둔다. 두 줄로 넘어가면 끝 낱말만 남아 어수선하다 */}
              <span className="set-item-desc">휴대폰 홈에서 바로 열 수 있어요</span>
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

        {/*
          앱 알리기. **홈 추가 바로 아래다**(2026-09-23 사용자 지시).

          둘은 같은 일을 한다: 이 앱으로 다시 오는 길을 만드는 것. 하나는 자기 홈에,
          하나는 남의 대화방에 만든다. 자리는 붙이되 이름은 따로 준다. 「바로 열기」는
          홈 추가를 가리키는 말이라, 그 아래 공유를 넣으면 같은 뜻으로 읽힌다.
        */}
        <p className="set-group">알리기</p>
        <div className="set-list">
          <button
            type="button"
            className="set-item"
            onClick={shareApp}
            /*
              ⚠ 누른 자리에서 `disabled` 로 막지 않는다. 눌린 요소가 비활성화되면 포커스가
              body 로 빠져서, 공유 시트를 닫고 돌아온 사람은 설정 목록에서 자리를 잃는다.
              두 번 눌리는 것은 `shareApp` 안의 `sharing` 가드가 막는다.
            */
            aria-disabled={sharing || undefined}
            {...testId(TEST_IDS.settingsAppShare)}
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
                <circle cx="17.5" cy="6" r="2.6" />
                <circle cx="6.5" cy="12" r="2.6" />
                <circle cx="17.5" cy="18" r="2.6" />
                <path d="M8.9 10.8 15.1 7.3M8.9 13.2l6.2 3.5" />
              </svg>
            </span>
            <span className="set-text">
              <span className="set-item-title">친구에게 앱 알리기</span>
              {/* 무엇이 가는지 먼저 말한다. 적은 이야기가 갈까 봐 안 누르는 쪽이 더 흔하다 */}
              <span className="set-item-desc">적으신 이야기는 함께 가지 않아요</span>
            </span>
            <Chevron />
          </button>
        </div>
        {/*
          ⚠ `role` 을 조건으로 붙이지 않는다. 라이브 리전은 **내용이 바뀌기 전에** 이미
          접근성 트리에 있어야 읽힌다. 공유 시트를 못 여는 기기에서는 「복사했어요」가
          이 길의 유일한 알림이다.
        */}
        <p className="set-hint" role="status">
          {shareNotice ?? ''}
        </p>

        {/*
          연꽃 모으기.

          홈 위쪽 칩이 유일한 입구였다. 그 칩은 작고, 설정을 열어 앱이 뭘 해 주는지
          훑는 사람은 연꽃이라는 것이 있는 줄도 몰랐다. 여기에 한 줄 두면 **무엇이고
          어떻게 얻는지**가 설명 한 문장과 함께 읽힌다.

          **홈 추가 바로 아래에 둔다.** 알림은 아직 보낼 수 없는 자리라 「준비 중」으로
          서 있는데, 그 아래에 두면 지금 쓸 수 있는 것이 못 쓰는 것 뒤에 가린다.
          (2026-09-22 사용자 지시)
        */}
        {leafCount != null && onOpenLeaf != null && (
          <>
            <p className="set-group">연꽃</p>
            <div className="set-list">
              <button
                type="button"
                className="set-item"
                onClick={onOpenLeaf}
                {...testId(TEST_IDS.settingsLeaf)}
              >
                <span className="set-icon" aria-hidden="true">
                  <LotusIcon size={20} />
                </span>
                <span className="set-text">
                  <span className="set-item-title">연꽃 모으기</span>
                  <span className="set-item-desc">
                    {/* 오른쪽 값 칸(N송이)이 자리를 먹는다. 한 줄에 드는 길이로 둔다 */}
                    {leafCollectable
                      ? `30초 광고로 ${LEAVES_PER_REWARDED_AD}송이씩 모아요`
                      : '지금은 모을 수 없어요'}
                  </span>
                </span>
                <span className="set-value">{leafCount}송이</span>
                <Chevron />
              </button>
            </div>
          </>
        )}

        {/*
          알림. **줄 하나다.**

          한때 「매일 마음 돌아보기」와 「받고 싶은 시간」 두 줄이었다. 앞은 받을지 말지이고
          뒤는 몇 시에 받을지라 서로 다른 것을 묻지만, **지금 토스 앱 버전에서는 받기 자체를
          켤 수 없다.** 못 켜는 알림의 시각을 고르게 두면 골라 놓고 안 오는 것을 고장으로
          읽는다. 보낼 수 있게 되면 시각 고르개를 그때 되살린다. 시각 값 자체는
          `shared/prefs/notifyTime` 에 그대로 있고 답변 화면의 「내일 여쭤볼게요」가 쓴다.
          (2026-09-22 사용자 지시)

          **늘 그린다.** 못 켜는 판에서는 줄을 감추는 대신 「준비 중」이라고 적는다.
          감추면 준비 중이라는 사실까지 사라져서 사람은 알림이 없는 앱으로 읽는다.
        */}
        <p className="set-group">알림</p>
        <div className="set-list">
          <button
            type="button"
            className="set-item"
            onClick={askNotify}
            /*
                  켠 사람도 다시 누를 수 있다. SDK 는 지금 상태를 되묻는 길을 안 준다.
                  토스 설정에서 끈 사람에게 「받기로 함」이라 말하면서 버튼까지 막으면,
                  앱 안에서 다시 켤 길이 아예 없어진다. 다시 불러도 해롭지 않다.

                  물을 수 없는 판에서만 막는다. 눌러도 아무 일이 없는 버튼보다 낫다.
                */
            disabled={asking || !canAsk}
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
              <span className="set-item-title">알림 받기</span>
              <span className="set-item-desc">{NOTIFY_ROW[rowState].desc}</span>
            </span>
            <span className="set-value">{asking ? '여는 중' : NOTIFY_ROW[rowState].value}</span>
          </button>
        </div>

        {notifyNotice != null && notifyNotice !== '' && (
          <p className="set-hint" role="status">
            {notifyNotice}
          </p>
        )}

        {/*
          글자 크기.

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

        <p className="set-group">안내</p>
        <div className="set-list">
          <button
            type="button"
            className="set-item"
            onClick={() => openRow('privacy', ROUTES.privacy)}
          >
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

          <button
            type="button"
            className="set-item"
            onClick={() => openRow('terms', `${ROUTES.privacy}#terms`)}
          >
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

          <a
            className="set-item"
            href={`mailto:${CONTACT_EMAIL}`}
            onClick={(event) => {
              analytics.log('settings_row_click', { row: 'contact' }, { kind: 'click' });
              openLink(event, `mailto:${CONTACT_EMAIL}`);
            }}
          >
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

          <button
            type="button"
            className="set-item"
            onClick={() => openRow('app_info', ROUTES.appInfo)}
          >
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
          {/*
            앱 아이콘을 그대로 쓴다. 이름은 아래에서 글자로 다시 쓴다.

            한때 `logo_lockup` 을 잘라 썼는데, 그 그림은 연꽃 아래에 이름이 픽셀로 박혀 있어
            **정사각형으로 자르면 연꽃을 다 담는 순간 이름 윗머리가 따라 들어온다.** 연꽃이
            81×56 이라 가로가 훨씬 넓어서 그렇다. 크롭 좌표를 맞춰 봐도 연꽃이 오른쪽으로
            밀리거나 아래가 잘렸다. 아이콘은 애초에 정사각형에 맞춰 그린 그림이라 자를 것이 없다.
          */}
          <img className="set-foot-mark" src="/assets/app_icon.webp" alt="" />
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
