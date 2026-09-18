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

/** 아직 묻지 않음 · 받기로 함 · 됐다고 함 · 이 기기에서 못 씀 */
export type NotifyState = 'unset' | 'on' | 'declined' | 'unsupported';

const KNOWN: NotifyState[] = ['unset', 'on', 'declined', 'unsupported'];

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
 * 알림을 권해도 되나.
 *
 * 셋을 **다** 본다: 플래그 · 기기 지원 · 템플릿 코드. 하나라도 없으면 눌러도 아무 일이
 * 일어나지 않는 버튼이 된다. 권유는 한 사람에게 한 번뿐이라, 그 한 번을 죽은 버튼에 쓰면
 * 다시 물을 자리가 없다.
 *
 * 개발·e2e 는 목 브릿지가 동의를 돌려주므로 코드 없이도 화면을 확인할 수 있다.
 */
export function notifyUsable(supportsNotification: boolean): boolean {
  if (!FLAGS.notificationPrompt || !supportsNotification) return false;
  return import.meta.env.DEV || notifyTemplateCode() !== '';
}
