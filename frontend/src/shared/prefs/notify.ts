/**
 * 알림을 켰나.
 *
 * ⚠ **이 값은 「우리가 동의를 받아 두었다」는 기록이지 OS 권한의 현재 상태가 아니다.**
 * 앱인토스 SDK 는 동의를 **요청**하는 길(`Notification.requestAgreement`)만 주고 지금
 * 켜져 있는지 되묻는 길은 주지 않는다. 사람이 토스 설정에서 끄면 우리는 알 수 없다.
 * 그래서 화면에서 「켜져 있어요」라고 단정하지 않고 「받기로 했어요」라고만 적는다.
 *
 * 저장은 localStorage 다. 설정 화면이 첫 페인트에 상태를 그려야 해서 비동기 저장소를 안 쓴다.
 */

import { FLAGS } from '../flags';

const KEY = 'buddha.notify.v1';

/**
 * 아직 묻지 않음 · 받기로 함 · 됐다고 함 · 이 기기에서 못 씀 · 받기로 했는데 아직 못 물음.
 *
 * `pending` 이 왜 있나. 토스에 동의를 물으려면 콘솔에서 만든 스마트발송 템플릿 코드가
 * 있어야 하는데, 그 코드가 아직 없다. 그렇다고 알림 자리를 통째로 감추면 사람은
 * **설정에 알림이 없다**고 읽는다. 그래서 자리는 두고, 고른 시각을 받아 두고,
 * 아직 보내지 못한다는 사실을 그 자리에 적는다.
 */
export type NotifyState = 'unset' | 'on' | 'declined' | 'unsupported' | 'pending';

const KNOWN: NotifyState[] = ['unset', 'on', 'declined', 'unsupported', 'pending'];

let cached: NotifyState | null = null;

export function readNotify(): NotifyState {
  if (cached != null) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    cached = KNOWN.includes(raw as NotifyState) ? (raw as NotifyState) : 'unset';
  } catch {
    cached = 'unset';
  }
  return cached;
}

export function writeNotify(state: NotifyState): void {
  cached = state;
  try {
    localStorage.setItem(KEY, state);
  } catch {
    // 이 세션 동안은 캐시가 들고 있는다
  }
}

export function resetNotify(): void {
  cached = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 지울 수 없으면 캐시만 비운다
  }
}

/** 콘솔 스마트발송 템플릿 코드. 빌드할 때 준다. 없으면 실기기에서 동의 화면이 뜨지 않는다 */
export function notifyTemplateCode(): string {
  const raw = import.meta.env.VITE_NOTIFICATION_TEMPLATE_CODE;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * 지금 **토스에 동의를 물을 수 있나.**
 *
 * 셋을 다 본다: 플래그 · 기기 지원 · 템플릿 코드. 하나라도 없으면 물어봐야 아무 일이
 * 일어나지 않는다. 답을 받고 나서 권하는 한 번짜리 권유(`NudgeOverlay`)는 이 값이
 * false 면 띄우지 않는다. 그 한 번을 죽은 버튼에 쓰면 다시 물을 자리가 없다.
 *
 * ⚠ **설정 화면의 알림 자리는 이 값과 무관하게 늘 있다.** 물을 수 없다고 자리까지 감추면
 * 사람은 「이 앱에는 알림이 없다」로 읽는다. 실제로 그 일이 있었다. 설정은 무엇을 정할 수
 * 있는지 보여 주는 자리라, 아직 안 되는 것은 감추는 대신 안 된다고 적는다.
 *
 * 개발·e2e 는 목 브릿지가 동의를 돌려주므로 코드 없이도 화면을 확인할 수 있다.
 */
export function notifyUsable(supportsNotification: boolean): boolean {
  if (!FLAGS.notificationPrompt || !supportsNotification) return false;
  return import.meta.env.DEV || notifyTemplateCode() !== '';
}
