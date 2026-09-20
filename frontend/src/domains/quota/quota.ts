/**
 * 하루에 나눌 수 있는 이야기를 세는 자리.
 *
 * 하루 첫 NORMAL·DEEP 은 그냥 되고, **그다음부터는 광고를 본 만큼 계속 이어간다.**
 * LIGHT 는 하루 10회 소프트 상한이고, INVALID·CRISIS·SOLACE 는 세지 않는다.
 * 하루의 경계는 사용자 시간대 자정이다.
 *
 * ⚠ **하루 천장이 있었다(이어가기 4회, 합쳐 5회). 2026-09-20 에 없앴다.**
 * 광고를 보는 사람을 막고 있었다. 막는 일은 이제 서버만 한다(분당 제한 · 전역 예산 문).
 * 그래서 이 파일에는 상한 상수가 없다. 화면이 스스로 문을 닫지 않는다.
 *
 * 이 값은 기기에 남는 사본이다. 돈과 이어지는 판정은 서버가 하고, 서버가 `Quota` 를 주면
 * `fromServer` 로 그 값이 이긴다. 성공한 생성만 센다.
 */

import type { Quota } from '../../shared/api';

const KEY = 'buddha.quota.v1';

/** 하루 첫 NORMAL·DEEP */
export const FIRST_FREE = 1;
/** LIGHT 소프트 상한 */
export const LIGHT_SOFT_CAP = 10;

/** 다음 이야기가 지나야 할 문. 천장을 없애 둘뿐이다 */
export type Gate = 'free' | 'ad_continue';

/** 사용량을 세는 갈래. invalid·crisis·solace 는 세지 않는다 */
export type QuotaRoute = 'light' | 'normal' | 'deep' | 'invalid' | 'crisis' | 'solace';

export interface QuotaState {
  /** 사용자 시간대 자정 기준 날짜 */
  day: string;
  firstUsed: boolean;
  continuesUsed: number;
  lightUsed: number;
}

/**
 * 다음 하루가 열리는 시각. 사용자 시간대 자정이다.
 *
 * `dayKey` 가 기기 시간대로 날짜를 세니 다시 열리는 시각도 같은 시간대여야 한다.
 */
export function nextReset(now: Date = new Date()): Date {
  const reset = new Date(now);
  reset.setHours(24, 0, 0, 0);
  return reset;
}

/** 자정까지 남은 시간. 30분이 남아도 「약 1시간」이라고 말한다 */
export function hoursUntilReset(now: Date = new Date()): number {
  const ms = nextReset(now).getTime() - now.getTime();
  return Math.max(1, Math.ceil(ms / 3_600_000));
}

export function dayKey(now: Date = new Date()): string {
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const date = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${date}`;
}

function toCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

export function emptyQuota(now: Date = new Date()): QuotaState {
  return { day: dayKey(now), firstUsed: false, continuesUsed: 0, lightUsed: 0 };
}

/** 저장된 값이 어제 것이면 새 하루로 시작한다 */
export function readQuota(now: Date = new Date()): QuotaState {
  const today = dayKey(now);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return emptyQuota(now);
    const parsed = JSON.parse(raw) as Partial<QuotaState>;
    if (parsed.day !== today) return emptyQuota(now);
    return {
      day: today,
      firstUsed: parsed.firstUsed === true,
      continuesUsed: toCount(parsed.continuesUsed),
      lightUsed: toCount(parsed.lightUsed),
    };
  } catch {
    return emptyQuota(now);
  }
}

export function writeQuota(state: QuotaState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장이 막혀도 이야기는 이어져야 한다. 서버가 세는 값이 정본이다.
  }
}

/** 오늘 쓴 이야기 수 */
export function usedToday(state: QuotaState): number {
  return (state.firstUsed ? FIRST_FREE : 0) + state.continuesUsed;
}

/** LIGHT 가 소프트 상한에 닿았나. 막지는 않고 화면이 참고한다 */
export function isLightCapped(state: QuotaState): boolean {
  return state.lightUsed >= LIGHT_SOFT_CAP;
}

/** 지금 NORMAL·DEEP 을 보내면 무엇을 지나야 하나. 첫 이야기 뒤는 늘 광고다 */
export function gateFor(state: QuotaState): Gate {
  return state.firstUsed ? 'ad_continue' : 'free';
}

/** 성공한 생성 뒤에 센다. 세지 않는 갈래는 그대로 돌려준다 */
export function record(state: QuotaState, route: QuotaRoute): QuotaState {
  switch (route) {
    case 'light':
      return { ...state, lightUsed: state.lightUsed + 1 };
    case 'normal':
    case 'deep':
      return state.firstUsed
        ? { ...state, continuesUsed: state.continuesUsed + 1 }
        : { ...state, firstUsed: true };
    default:
      return state;
  }
}

/** 세고 바로 남긴다. 화면이 두 번 부르지 않게 한 걸음으로 묶는다 */
export function recordAndSave(route: QuotaRoute, now: Date = new Date()): QuotaState {
  const next = record(readQuota(now), route);
  writeQuota(next);
  return next;
}

/** 서버가 준 값이 이긴다 */
export function fromServer(state: QuotaState, quota: Quota): QuotaState {
  return {
    ...state,
    firstUsed: quota.firstUsed,
    continuesUsed: toCount(quota.continuesUsed),
  };
}

/**
 * 서버가 준 사용량을 기기 사본에 덮어쓴다. 답이 온 자리와 광고 문에 막힌 자리에서 부른다.
 *
 * 기기 값만 믿으면 저장소를 지우거나 앱을 다시 깐 사람에게는 오늘 횟수가 처음으로 돌아간다.
 * 그 상태로 보내면 서버는 같은 익명키의 오늘 횟수를 그대로 기억하고 있어 광고 문을 세우고,
 * 화면은 왜 막혔는지 모른 채 오류만 그린다.
 */
export function saveFromServer(quota: Quota, now: Date = new Date()): QuotaState {
  const next = fromServer(readQuota(now), quota);
  writeQuota(next);
  return next;
}

export function toQuota(state: QuotaState): Quota {
  return { continuesUsed: state.continuesUsed, firstUsed: state.firstUsed };
}
