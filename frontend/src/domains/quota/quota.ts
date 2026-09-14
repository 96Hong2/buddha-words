/**
 * 하루에 나눌 수 있는 이야기를 세는 자리.
 *
 * 하루 첫 NORMAL·DEEP 은 그냥 되고, 그다음부터는 이어가기(광고) 4회, 천장이 5회다.
 * LIGHT 는 하루 10회 소프트 상한이고, INVALID·CRISIS·SOLACE 는 세지 않는다.
 * 하루의 경계는 사용자 시간대 자정이다.
 *
 * 이 값은 기기에 남는 사본이다. 돈과 이어지는 판정은 서버가 하고, 서버가 `Quota` 를 주면
 * `fromServer` 로 그 값이 이긴다. 성공한 생성만 센다.
 */

import type { Quota } from '../../shared/api';

const KEY = 'buddha.quota.v1';

/** 하루 첫 NORMAL·DEEP */
export const FIRST_FREE = 1;
/** 광고를 보고 이어갈 수 있는 횟수 */
export const CONTINUE_LIMIT = 4;
/** 하루 천장. 첫 이야기 1 + 이어가기 4 */
export const DAILY_CEILING = 5;
/** LIGHT 소프트 상한 */
export const LIGHT_SOFT_CAP = 10;

/** 다음 이야기가 지나야 할 문 */
export type Gate = 'free' | 'ad_continue' | 'exhausted';

/** 사용량을 세는 갈래. invalid·crisis·solace 는 세지 않는다 */
export type QuotaRoute = 'light' | 'normal' | 'deep' | 'invalid' | 'crisis' | 'solace';

export interface QuotaState {
  /** 사용자 시간대 자정 기준 날짜 */
  day: string;
  firstUsed: boolean;
  continuesUsed: number;
  lightUsed: number;
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

export function continuesLeft(state: QuotaState): number {
  return Math.max(0, CONTINUE_LIMIT - state.continuesUsed);
}

export function isExhausted(state: QuotaState): boolean {
  return continuesLeft(state) === 0 || usedToday(state) >= DAILY_CEILING;
}

/** LIGHT 가 소프트 상한에 닿았나. 막지는 않고 화면이 참고한다 */
export function isLightCapped(state: QuotaState): boolean {
  return state.lightUsed >= LIGHT_SOFT_CAP;
}

/** 지금 NORMAL·DEEP 을 보내면 무엇을 지나야 하나 */
export function gateFor(state: QuotaState): Gate {
  if (!state.firstUsed) return 'free';
  if (isExhausted(state)) return 'exhausted';
  return 'ad_continue';
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

export function toQuota(state: QuotaState): Quota {
  return {
    continuesLeft: continuesLeft(state),
    continuesUsed: state.continuesUsed,
    firstUsed: state.firstUsed,
    exhausted: isExhausted(state),
  };
}
