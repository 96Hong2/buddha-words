/**
 * 화면이 오류를 어떻게 말할지 정하는 자리.
 * 서버가 준 문자열을 그대로 보여 주지 않는다. 사람이 읽을 문장은 여기서 고른다.
 */

import type { Quota } from './types';

/**
 * 요청 하나가 실패한 사유. 화면이 이 다섯 값으로 갈린다.
 * 새 값을 만들지 않는다. 새 실패가 생기면 이 중 하나로 옮긴다.
 *
 * 이 클래스가 `client.ts` 가 아니라 여기 사는 이유는 `http.ts` 가 이걸 쓰기 때문이다.
 * `client.ts` 는 `http.ts` 를 부르므로, 거기에 두면 둘이 서로를 부른다.
 */
export class ApiFailure extends Error {
  constructor(
    readonly reason: 'timeout' | 'offline' | 'budget' | 'too_fast' | 'schema' | 'provider',
    message: string,
    /**
     * 서버가 막으면서 같이 보낸 오늘 사용량. 하루 천장에 닿았을 때만 온다.
     *
     * 사유를 여섯 번째로 늘리지 않으려고 값으로 가른다. 이 값이 있으면 「오늘 다 썼다」라
     * 다시 눌러도 결과가 같고, 없으면 전역 예산이 몰린 것이라 잠시 뒤에는 열린다.
     */
    readonly quota?: Quota,
  ) {
    super(message);
    this.name = 'ApiFailure';
  }
}

export type ErrorCode =
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'BUDGET'
  | 'TOO_FAST'
  | 'SERVER'
  | 'CLIENT_CONFIG'
  | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 다시 불러도 결과가 같은 실패는 재시도하지 않는다 */
  get isRetryable(): boolean {
    return this.code === 'OFFLINE' || this.code === 'TIMEOUT' || this.code === 'SERVER';
  }
}

const MESSAGES: Record<ErrorCode, string> = {
  OFFLINE: '지금 인터넷이 닿지 않아요. 연결을 확인하고 다시 보내 주세요.',
  TIMEOUT: '답을 만드는 데 너무 오래 걸렸어요. 다시 보내 주세요.',
  BUDGET: '지금은 이야기가 많이 몰려 있어요. 잠시 뒤에 다시 보내 주세요.',
  // 몰려서가 아니라 이 사람이 빠르게 보낸 것이다. 남 탓으로 읽히지 않게 가른다
  TOO_FAST: '조금 빠르게 보내셨어요. 잠시 뒤에 다시 보내 주세요.',
  SERVER: '잠시 문제가 있었어요. 다시 보내 주세요.',
  CLIENT_CONFIG: '앱 설정에 문제가 있어요. 토스 앱을 업데이트해 주세요.',
  UNKNOWN: '잠시 문제가 있었어요. 다시 보내 주세요.',
};

export function messageFor(code: ErrorCode): string {
  return MESSAGES[code];
}

/** 적은 글은 어떤 실패에서도 지우지 않는다. 화면이 이 값을 보고 판단한다 */
export function keepsDraft(): boolean {
  return true;
}
