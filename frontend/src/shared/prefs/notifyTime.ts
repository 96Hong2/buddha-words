/**
 * 알림을 받고 싶은 시각.
 *
 * ⚠ **이 값은 아직 발송을 움직이지 않는다.** 그 시각에 실제로 보내려면 셋이 더 필요하다:
 * 콘솔 스마트발송 템플릿 코드, 토스 서버 API(`messenger/send-message`)를 부를 mTLS 인증서,
 * 그리고 시각마다 그 API 를 부를 스케줄러. 셋 다 아직 없다.
 *
 * 그러면 왜 지금 받아 두나. **발송을 켤 때 기본 시각을 짐작으로 정하지 않기 위해서다.**
 * 사람들이 몇 시를 고르는지 미리 재 두면, 나중에 캠페인 한 번으로 보내야 하는 상황에서도
 * 가장 많이 고른 시각을 쓸 수 있다. 값은 기기에만 남고 서버로 올리지 않는다.
 *
 * 화면이 「그 시각에 보내드릴게요」라고 단정하지 않게 하는 것은 부르는 쪽(SettingsScreen)의
 * 몫이다. 알림 줄 자체가 템플릿 코드 없이는 그려지지 않으므로, 실기기에서 지킬 수 없는
 * 약속이 먼저 나가는 일은 없다.
 */

const KEY = 'buddha.notify.hour.v1';

/**
 * 아직 고르지 않은 사람에게 보일 시각.
 *
 * 밤 9시다. 하루를 덮고 마음을 들여다보는 시간대이고, 아침은 출근 준비와 겹쳐 알림이
 * 방해로 읽히기 쉽다. 근거가 생기면(위 로그) 이 값을 바꾼다.
 */
export const DEFAULT_NOTIFY_HOUR = 21;

/** 고를 수 있는 시각. 새벽은 뺀다. 그 시각에 오는 알림은 도움이 아니라 방해다 */
export const NOTIFY_HOURS = [6, 7, 8, 9, 10, 12, 18, 19, 20, 21, 22, 23] as const;

export type NotifyHour = (typeof NOTIFY_HOURS)[number];

function isHour(value: number): value is NotifyHour {
  return (NOTIFY_HOURS as readonly number[]).includes(value);
}

let cached: NotifyHour | null = null;

export function readNotifyHour(): NotifyHour {
  if (cached != null) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw == null ? NaN : Number.parseInt(raw, 10);
    cached = isHour(parsed) ? parsed : DEFAULT_NOTIFY_HOUR;
  } catch {
    cached = DEFAULT_NOTIFY_HOUR;
  }
  return cached;
}

export function writeNotifyHour(hour: NotifyHour): void {
  cached = hour;
  try {
    localStorage.setItem(KEY, String(hour));
  } catch {
    // 이 세션 동안은 캐시가 들고 있는다
  }
}

/** 사람이 직접 고른 값인가. 기본값을 그대로 둔 것과 가른다 */
export function notifyHourChosen(): boolean {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
}

/** 「오후 9시」처럼. 24시간 표기는 한국어 화면에서 잘 안 읽힌다 */
export function notifyHourLabel(hour: number): string {
  if (hour === 0) return '밤 12시';
  if (hour === 12) return '낮 12시';
  return hour < 12 ? `오전 ${hour}시` : `오후 ${hour - 12}시`;
}
