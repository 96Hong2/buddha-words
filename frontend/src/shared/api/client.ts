/**
 * API 클라이언트 하나. 화면은 이 인터페이스만 본다.
 *
 * 구현이 둘이다. 실제 백엔드를 부르는 `http` 와 서버 없이 도는 `stub` 이다.
 * 어느 쪽인지는 화면이 모른다. 고르는 것은 `VITE_API_MODE` 하나이고 기본값은 스텁이다.
 * 값과 쓰는 법은 `frontend/.env.example` 에 있다.
 *
 * **고르지 못하면 스텁으로 빠지지 않는다.** 설정이 틀린 채로 도는 앱은 붙었다고 착각하게 만든다.
 * 그런 경우에는 모든 호출이 설정 오류로 실패해 화면에 오류가 뜬다.
 */

import { resolveApiBaseUrl, API_BASE_URL_ENV } from './baseUrl';
import { ApiError, ApiFailure } from './errors';
import { createHttpClient } from './http';
import { decide } from './routerPort';
import type {
  ApiExtension,
  ApiResponse,
  ConcernRequest,
  DailyQuote,
  Pass2,
  SharedCard,
  ShareLink,
  ShareScope,
} from './types';

// 실패 사유 클래스는 `errors.ts` 에 산다. 화면은 여기서도 그대로 꺼내 쓴다
export { ApiFailure };

/** 브릿지가 준 익명 식별키 상태. http 구현의 요청 헤더가 이 값을 읽는다 */
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
  /** 공유 링크를 만든다. 토큰도 메신저에 붙일 주소도 서버가 내준다 */
  createShareToken(req: {
    answerId: string;
    card: SharedCard;
    scope?: ShareScope;
  }): Promise<ShareLink>;
  /** 링크로 들어온 사람이 보는 카드. 보낸 사람의 고민 원문은 담기지 않는다 */
  fetchSharedCard(token: string): Promise<SharedCard | null>;
}

/** 스텁 구현 묶음. 지금 받지 않고 실제로 쓸 때 받는다 */
type StubData = typeof import('./stubData');

/** 한 번 받아 두고 다음 호출은 같은 약속을 재사용한다 */
let loadingStub: Promise<StubData> | null = null;

/**
 * 스텁 모듈을 쓸 때 받아 온다.
 *
 * 정적으로 import 하면 스텁이 읽는 경전 시드 400구절(342 kB)이 운영 번들에도 같이 실린다.
 * 어느 모드인지는 런타임에 갈려서 번들러가 스스로 떨어내지 못한다.
 * `import.meta.env.DEV` 는 vite 가 빌드 때 값으로 박으므로, 운영 빌드에서는 아래 조건이
 * 거짓으로 굳어 블록 전체가 죽은 코드가 되고 시드도 dist 에서 빠진다.
 * 그래서 이 비교는 여기서 직접 적는다. 변수로 빼면 치환이 안 걸린다.
 *
 * 모드가 아니라 DEV 로 가르는 이유가 있다. 모드로 가르면 값을 안 주고 빌드한 판에 스텁이
 * 그대로 실려, 심사 번들 안에 지어낸 경전 문장이 남는다. 운영 빌드에는 아예 없어야 한다.
 */
function loadStub(): Promise<StubData> {
  if (import.meta.env.DEV) {
    loadingStub ??= import('./stubData').catch((error: unknown) => {
      // 실패한 약속을 남겨 두면 다음 호출도 같은 실패를 되받는다
      loadingStub = null;
      throw error;
    });
    return loadingStub;
  }
  // http 빌드에는 스텁이 실려 있지 않다. 여기까지 왔다면 모드 판정이 어긋난 것이다
  return Promise.reject(new ApiError('CLIENT_CONFIG', '운영 빌드에는 스텁이 실려 있지 않아요.'));
}

/** 서버 없이 도는 구현. 라우터 판정은 정본 그대로 쓰고 답변 본문만 결정론으로 지어낸다 */
export function createStubClient(): ApiClient {
  const routes = new Map<string, { text: string; route: 'normal' | 'deep' }>();

  async function guard(stub: StubData): Promise<void> {
    const fail = stub.dial().failSend;
    if (fail != null) {
      await stub.sleep(200);
      throw new ApiFailure(fail, '전송하지 못했어요.');
    }
  }

  return {
    async submitConcern({ text }) {
      const stub = await loadStub();
      await guard(stub);
      const decision = decide(text);
      await stub.sleep(stub.dial().pass1Ms ?? 600);
      const response = stub.respondTo(text, decision);
      if (response.responseType === 'answer') {
        routes.set(response.answerId, { text, route: response.route });
      }
      return response;
    },

    async fetchPass2({ answerId, text }) {
      const stub = await loadStub();
      await stub.sleep(stub.dial().pass2Ms ?? 1200);
      if (stub.dial().failPass2 === true) return { status: 'failed', retryable: true };
      const known = routes.get(answerId);
      return stub.buildPass2(text, known?.route ?? 'normal');
    },

    async continueAfterCrisis({ text }) {
      const stub = await loadStub();
      // 서버가 같은 원문으로 다시 판정한다. 클라이언트가 보낸 「이어도 된다」를 믿지 않는다.
      const decision = decide(text);
      await stub.sleep(stub.dial().pass1Ms ?? 800);
      return stub.buildSolace(text, decision);
    },

    async fetchExtension({ answerId, text, usedIds }) {
      const stub = await loadStub();
      await stub.sleep(900);
      return stub.buildExtension(text, answerId, usedIds);
    },

    async fetchDailyQuote(dateISO) {
      const stub = await loadStub();
      await stub.sleep(80);
      return stub.pickDaily(dateISO);
    },

    async createShareToken({ answerId, card }) {
      const stub = await loadStub();
      stub.rememberShared(answerId, card);
      // 스텁에는 랜딩을 그릴 백엔드가 없다. 주소를 지어내지 않고 화면이 자기 자리를 쓰게 둔다
      return { token: answerId, landingUrl: null };
    },

    async fetchSharedCard(token) {
      const stub = await loadStub();
      await stub.sleep(120);
      return stub.readShared(token);
    },
  };
}

/** 어느 구현을 쓸지. 값은 `frontend/.env.example` 을 본다 */
export type ApiMode = 'stub' | 'http';

/** 빌드 때 넣는 환경변수 이름 */
export const API_MODE_ENV = 'VITE_API_MODE';

/** 개발에서 안 정했을 때만 쓰는 값. e2e 와 화면 개발이 서버 없이 돌아야 한다 */
const DEV_DEFAULT_MODE: ApiMode = 'stub';

/**
 * 고른 모드를 읽는다. 오타면 null 이다.
 *
 * 운영 빌드는 `http` 만 받는다. 스텁은 경전 문장과 풀이를 앱 안에서 지어내므로, 값을 안 주고
 * 빌드한 판이 그대로 나가면 백엔드를 한 번도 부르지 않고 캔 답변을 내보내게 된다.
 * 그 판에서는 모델도 화이트리스트도 돌지 않고 화면의 「답변은 AI 가 만들어요」도 거짓이 된다.
 * 그래서 미설정을 기본값으로 메우지 않고 설정 오류로 남긴다. 오류 화면이 뜨는 편이 낫다.
 *
 * `import.meta.env.VITE_...` 와 `import.meta.env.DEV` 는 vite 가 빌드 때 값으로 갈아 끼운다.
 * 키를 변수로 꺼내면 그 치환이 안 걸려 운영 빌드에서 값이 사라진다. 그래서 여기서만 직접 적는다.
 */
export function resolveApiMode(): ApiMode | null {
  const raw = import.meta.env.VITE_API_MODE;
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!import.meta.env.DEV) return value === 'http' ? 'http' : null;
  if (value === '') return DEV_DEFAULT_MODE;
  if (value === 'stub' || value === 'http') return value;
  return null;
}

/**
 * 설정이 틀렸을 때 돌려주는 클라이언트. 모든 호출이 같은 오류로 실패한다.
 *
 * 여기서 던지지 않고 클라이언트를 돌려주는 이유가 있다. 만드는 자리에서 던지면 앱 껍데기까지
 * 같이 죽어 사용자는 하얀 화면만 본다. 요청할 때 실패하면 오류 화면이라도 뜬다.
 */
function createBrokenClient(why: string): ApiClient {
  // 개발자가 첫 새로고침에 알아채야 한다. 조용히 넘기지 않는다
  console.error(`[api] ${why}`);
  const fail = (): never => {
    throw new ApiError('CLIENT_CONFIG', why);
  };
  return {
    submitConcern: fail,
    fetchPass2: fail,
    continueAfterCrisis: fail,
    fetchExtension: fail,
    fetchDailyQuote: fail,
    createShareToken: fail,
    fetchSharedCard: fail,
  };
}

/**
 * 스위치. 스텁이냐 실제 백엔드냐를 여기 한 곳에서 정한다.
 * http 를 골랐는데 주소가 없으면 스텁으로 빠지지 않고 설정 오류로 남는다.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const mode = resolveApiMode();
  if (mode === null) {
    return createBrokenClient(
      `${API_MODE_ENV} 값이 올바르지 않아요. 개발은 stub·http, 운영 빌드는 http 만 받아요.`,
    );
  }
  if (mode === 'stub') return createStubClient();

  const baseUrl = resolveApiBaseUrl();
  if (baseUrl === null) {
    return createBrokenClient(
      `${API_MODE_ENV}=http 인데 ${API_BASE_URL_ENV} 가 없거나 운영에서 https 가 아니에요.`,
    );
  }
  return createHttpClient(baseUrl, options);
}
