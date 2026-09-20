/**
 * 알림을 받고 싶은 시각.
 *
 * **이 값이 되짚기 알림의 시각을 정한다.** 「내일 알림으로 여쭤볼게요」를 누르면 화면이
 * 여기 적힌 시각으로 내일의 절대 시각을 계산해 서버에 예약한다(`TomorrowReminder`).
 * 값 자체는 기기에만 남고, 서버로 가는 것은 계산이 끝난 절대 시각 하나다.
 *
 * ⚠ **예약이 실제 알림이 되려면 셋이 더 있어야 한다**: 콘솔 기능성 캠페인의 템플릿 코드와
 * 그 문구 검수 승인, 토스 서버 API 를 부를 mTLS 인증서, 1분마다 발송 잡을 깨우는 스케줄러.
 * 셋이 갖춰지기 전에는 예약만 쌓이고 알림은 가지 않는다.
 *
 * 화면이 「그 시각에 보내드릴게요」라고 단정해도 되는지는 `FLAGS.reminderPush` 가 가른다.
 * 그 플래그가 꺼져 있으면 예약은 하되 알림을 약속하지 않는다.
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

/** 「오후 9시」처럼. 24시간 표기는 한국어 화면에서 잘 안 읽힌다 */
export function notifyHourLabel(hour: number): string {
  if (hour === 0) return '밤 12시';
  if (hour === 12) return '낮 12시';
  return hour < 12 ? `오전 ${hour}시` : `오후 ${hour - 12}시`;
}
