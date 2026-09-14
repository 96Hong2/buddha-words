/**
 * 화면이 오류를 어떻게 말할지 정하는 자리.
 * 서버가 준 문자열을 그대로 보여 주지 않는다. 사람이 읽을 문장은 여기서 고른다.
 */

export type ErrorCode =
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'BUDGET'
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
