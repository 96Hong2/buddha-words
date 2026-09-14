/**
 * API 클라이언트 하나. 화면은 이 인터페이스만 본다.
 *
 * 구현이 둘이다. 실제 백엔드를 부르는 것과, 서버 없이 도는 스텁이다.
 * 어느 쪽인지는 화면이 모른다. 스텁은 개발·e2e 전용이고 운영 번들에서는 쓰이지 않는다.
 */

import {
  buildExtension,
  buildPass2,
  buildSolace,
  dial,
  pickDaily,
  readShared,
  rememberShared,
  respondTo,
  sleep,
} from './stubData';
import { decide } from './routerPort';
import type {
  ApiExtension,
  ApiResponse,
  ConcernRequest,
  DailyQuote,
  Pass2,
  SharedCard,
} from './types';

export class ApiFailure extends Error {
  constructor(
    readonly reason: 'timeout' | 'offline' | 'budget' | 'schema' | 'provider',
    message: string,
  ) {
    super(message);
    this.name = 'ApiFailure';
  }
}

/** 브릿지가 준 익명 식별키 상태. 실제 백엔드가 붙으면 요청 헤더가 이 값을 읽는다 */
export type AnonKeyState =
  | { status: 'pending' }
  | { status: 'ready'; key: string }
  | { status: 'unsupported' }
  | { status: 'failed' };

export interface ApiClientOptions {
  /** 값이 아니라 게터로 받는다. 값으로 받으면 키가 도착할 때마다 인스턴스가 새로 만들어진다 */
  getAnonKey: () => AnonKeyState;
}

export interface ApiClient {
  /** 1차 패스까지. crisis · invalid · light 는 여기서 끝난다 */
  submitConcern(req: ConcernRequest): Promise<ApiResponse>;
  /** 2차 패스. 같은 멱등키로 다시 불러도 사용량이 줄지 않는다 */
  fetchPass2(req: { answerId: string; idempotencyKey: string; text: string }): Promise<Pass2>;
  /** 위기 안내를 본 사람이 스스로 눌렀을 때만. 서버가 같은 원문으로 다시 판정한다 */
  continueAfterCrisis(req: { text: string }): Promise<ApiResponse>;
  /** 보상형 광고를 끝까지 본 뒤 */
  fetchExtension(req: { answerId: string; text: string; usedIds: string[] }): Promise<ApiExtension>;
  /** 오늘의 한마디. 모델을 부르지 않는다 */
  fetchDailyQuote(dateISO: string): Promise<DailyQuote>;
  /** 공유 링크를 만든다. 서버가 토큰을 내준다 */
  createShareToken(req: { answerId: string; card: SharedCard }): Promise<string>;
  /** 링크로 들어온 사람이 보는 카드. 보낸 사람의 고민 원문은 담기지 않는다 */
  fetchSharedCard(token: string): Promise<SharedCard | null>;
}

/** 서버 없이 도는 구현. 라우터 판정은 정본 그대로 쓴다 */
export function createStubClient(): ApiClient {
  const routes = new Map<string, { text: string; route: 'normal' | 'deep' }>();

  async function guard(): Promise<void> {
    const fail = dial().failSend;
    if (fail != null) {
      await sleep(200);
      throw new ApiFailure(fail, '전송하지 못했어요.');
    }
  }

  return {
    async submitConcern({ text }) {
      await guard();
      const decision = decide(text);
      await sleep(dial().pass1Ms ?? 600);
      const response = respondTo(text, decision);
      if (response.responseType === 'answer') {
        routes.set(response.answerId, { text, route: response.route });
      }
      return response;
    },

    async fetchPass2({ answerId, text }) {
      await sleep(dial().pass2Ms ?? 1200);
      if (dial().failPass2 === true) return { status: 'failed', retryable: true };
      const known = routes.get(answerId);
      return buildPass2(text, known?.route ?? 'normal');
    },

    async continueAfterCrisis({ text }) {
      // 서버가 같은 원문으로 다시 판정한다. 클라이언트가 보낸 「이어도 된다」를 믿지 않는다.
      const decision = decide(text);
      await sleep(dial().pass1Ms ?? 800);
      return buildSolace(text, decision);
    },

    async fetchExtension({ answerId, text, usedIds }) {
      await sleep(900);
      return buildExtension(text, answerId, usedIds);
    },

    async fetchDailyQuote(dateISO) {
      await sleep(80);
      return pickDaily(dateISO);
    },

    async createShareToken({ answerId, card }) {
      rememberShared(answerId, card);
      return answerId;
    },

    async fetchSharedCard(token) {
      await sleep(120);
      return readShared(token);
    },
  };
}

/**
 * 실제 백엔드 구현은 M0 백엔드가 뜬 뒤 여기에 붙인다.
 * 지금은 스텁 하나뿐이라, 주소가 없으면 스텁으로 간다는 사실을 화면이 알 필요가 없다.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  void options;
  return createStubClient();
}
