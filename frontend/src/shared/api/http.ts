/**
 * 실제 백엔드(FastAPI)를 부르는 구현. `ApiClient` 인터페이스만 지킨다.
 *
 * 세 가지를 지킨다.
 * 1. 절대주소로 간다. vite 프록시를 쓰지 않아 개발에서도 진짜 교차 출처 요청이 나간다(`baseUrl.ts`).
 * 2. 어떤 실패든 `ApiFailure` 다섯 사유로 옮긴다. 화면은 그 값만 보고 갈린다. 새 사유를 만들지 않는다.
 * 3. 서버가 필요로 하지 않는 고민 원문은 보내지 않는다. 2차 패스와 Extension 은 answerId 만 간다.
 *    서버가 pending 행에 원문을 쥐고 있어 다시 보낼 이유가 없다.
 *
 * 엔드포인트는 `backend/app/api/routes.py` 여덟 자리다.
 * POST /concern · POST /concern/pass2 · POST /concern/continue · POST /concern/extension · GET /daily
 * POST /share · GET /share/{id}/card.png · GET /share/{id}/og.png
 */

import type { AnonKeyState, ApiClient, ApiClientOptions } from './client';
import { ApiFailure } from './errors';
import type { ApiExtension, ApiResponse, DailyQuote, Pass2, Quota, Scripture } from './types';

/** 브릿지가 준 익명 식별키. 서버 인증은 이 헤더 하나다 */
const HEADER_ANON_KEY = 'X-Anon-Key';
/** 같은 키로 다시 불러도 오늘 남은 횟수가 줄지 않는다. 서버가 지난번 판정을 그대로 돌려준다 */
const HEADER_IDEMPOTENCY = 'X-Idempotency-Key';
/** 기기 시간대. 서버가 하루 사용량의 자정 기준을 여기에 맞춘다 */
const HEADER_TIMEZONE = 'X-Timezone';

/** 모델을 지나는 요청. 화면이 60초를 넘김으로 안내하므로 그 값에 맞춘다 */
const CALL_TIMEOUT_MS = 60_000;
/** 오늘의 한마디는 모델을 부르지 않는다. 이만큼 걸리면 서버가 앓는 것이다 */
const DAILY_TIMEOUT_MS = 10_000;

/** 브릿지가 익명키를 늦게 줘도 첫 요청을 놓치지 않게 기다린다 */
const ANON_KEY_WAIT_MS = 8_000;
const ANON_KEY_POLL_MS = 50;

const PASS2_STATUS = new Set(['pending', 'failed', 'done']);

/**
 * 아래 목록은 전부 `spec/answer.schema.json` 의 닫힌 값이다.
 * 화면이 이 값을 그대로 표의 키로 써서(`TAG[tag]` · `CHANNELS[key]`) 모르는 값이 오면 그리다 터진다.
 * 서버는 모델이 낸 값을 접어서 보내지만, 접히지 않고 새어 나온 값까지 여기서 받지는 않는다.
 */
const ANSWER_ROUTES = new Set(['normal', 'deep']);
const EMOTION_TAGS = new Set([
  'anxiety',
  'comparison',
  'approval',
  'attachment',
  'anger',
  'regret',
  'loneliness',
  'emptiness',
  'confusion',
  'fatigue',
  'other',
]);
const CHANNELS = new Set(['109', 'madeleine', '1577-0199', '1388', '1366', '112']);
const INVALID_KEYS = new Set(['playful', 'empty', 'injection', 'repetition']);
const CRISIS_LEVELS = new Set(['acute', 'distress']);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 기기가 쓰는 시간대 이름(IANA). `Asia/Seoul` 같은 값이다.
 *
 * 안 보내면 서버가 전부 서울 자정으로 묶어 버려서, 다른 시간대에 있는 사람은 하루 한 번이
 * 엉뚱한 시각에 돌아온다. 브라우저가 이름을 못 주는 드문 경우에는 헤더를 빼고 서버 기본값에
 * 맡긴다. 지어낸 값을 보내면 사용량이 엉뚱한 날짜 칸에 들어간다.
 */
function deviceTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone !== '' ? zone : null;
  } catch {
    return null;
  }
}

function schemaFailure(): ApiFailure {
  return new ApiFailure('schema', '서버가 준 답의 모양이 달라요.');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw schemaFailure();
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  if (typeof value !== 'string' || value === '') throw schemaFailure();
  return value;
}

function asCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw schemaFailure();
  return Math.max(0, Math.floor(value));
}

function asFlag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw schemaFailure();
  return value;
}

/** `least` 는 스키마의 minItems 다. 그보다 적게 오면 화면이 채울 수 없는 자리가 생긴다 */
function asList(value: unknown, least = 0): unknown[] {
  if (!Array.isArray(value) || value.length < least) throw schemaFailure();
  return value;
}

function asCode(value: unknown, allowed: Set<string>): string {
  if (typeof value !== 'string' || !allowed.has(value)) throw schemaFailure();
  return value;
}

/** 문자열 칸만 골라 옮긴다. 빈 값과 문자열이 아닌 값은 버린다 */
function copyText(row: Record<string, unknown>, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value !== '') out[key] = value;
  }
  return out;
}

const SOURCE_KEYS = [
  'base',
  'license',
  'translator',
  'note',
  'originalLabel',
  'originalText',
] as const;

/**
 * 경전 한 구절.
 *
 * 귀속(`attribution`)과 저본 문구(`source.note`)를 읽는다. 오래 이 둘을 안 읽어서,
 * 스텁 백엔드에서는 화자가 뜨는데 실제 서버에 붙이면 한 명도 안 떴다. 같은 데이터가
 * 서버에도 있었는데 스키마가 닫혀 있어 못 나왔고, 여기서도 안 읽고 있었다.
 *
 * 서버가 안 보내 주면 화면은 출처 한 줄로 물러선다(`attributionLine`). 그 방향은 늘
 * 안전한 쪽으로만 틀리므로, 없는 칸 때문에 답변 화면을 통째로 오류로 보내지 않는다.
 */
function asScripture(value: unknown): Scripture {
  const row = asRecord(value);
  const scripture: Scripture = {
    id: asText(row.id),
    citation: asText(row.citation),
    text: asText(row.text),
  };
  if (Array.isArray(row.terms)) scripture.terms = row.terms as Scripture['terms'];
  if (row.source != null) {
    scripture.source = copyText(asRecord(row.source), SOURCE_KEYS) as Scripture['source'];
  }
  if (row.attribution != null) {
    const label = asRecord(row.attribution).displayLabel;
    if (typeof label === 'string' && label !== '') scripture.attribution = { displayLabel: label };
  }
  return scripture;
}

/**
 * 서버 Quota(`ServerQuota`)를 화면이 읽는 모양(`Quota`)으로 옮긴다.
 *
 * 서버는 **쓴 횟수**를 세고(`freeUsed` · `adContinuesUsed`) 화면은 **남은 횟수**를 읽는다.
 * 뒤집는 자리는 앱 전체에서 여기 하나다. 천장은 서버가 같이 보낸 `adContinuesMax` 로 세고,
 * 문턱값을 이 파일에서 새로 정하지 않는다.
 *
 * 하루 천장은 무료 한 번 + 이어가기 전부이고 `freeUsed` 는 spec 상 1 을 넘지 않는다.
 * 그래서 「남은 이어가기가 0」이 곧 천장이라, 문턱을 두 번 세지 않는다.
 */
function toQuota(value: unknown): Quota {
  const row = asRecord(value);
  const freeUsed = asCount(row.freeUsed);
  const continuesUsed = asCount(row.adContinuesUsed);
  const continuesMax = asCount(row.adContinuesMax);
  const continuesLeft = Math.max(0, continuesMax - continuesUsed);
  const quota: Quota = {
    continuesLeft,
    continuesUsed,
    firstUsed: freeUsed > 0,
    exhausted: continuesLeft === 0,
  };
  if (typeof row.resetsAt === 'string' && row.resetsAt !== '') quota.resetsAt = row.resetsAt;
  return quota;
}

function withQuota(row: Record<string, unknown>): Record<string, unknown> {
  if (row.quota == null) return row;
  return { ...row, quota: toQuota(row.quota) };
}

function asAnalysis(value: unknown): void {
  const row = asRecord(value);
  asText(row.heading);
  asText(row.body);
}

function asAction(value: unknown): void {
  asText(asRecord(value).title);
}

function asPass2(value: unknown): Pass2 {
  const row = asRecord(value);
  if (typeof row.status !== 'string' || !PASS2_STATUS.has(row.status)) throw schemaFailure();
  if (row.status === 'done') {
    // done 이면 답변 화면이 이 네 자리를 곧바로 그린다
    asText(row.scriptureExplanation);
    asList(row.personalAnalysis).forEach(asAnalysis);
    asList(row.actions).forEach(asAction);
    asText(row.closingMessage);
  }
  return row as unknown as Pass2;
}

/**
 * 갈래마다 화면이 바로 읽는 자리를 본다. 목록은 `spec/answer.schema.json` 의
 * required · minItems 를 그대로 옮긴 것이고, 스키마에 없는 조건을 더 얹지 않는다.
 *
 * **responseType 만 보고 통과시키지 않는다.** 그러면 답을 받은 것처럼 화면을 넘어갔다가
 * 없는 자리를 읽으며 터지고, 답변 화면이 아니라 앱 전체가 오류 화면으로 간다.
 * 그 자리에는 「다시 해보기」도 적은 글도 없다. 여기서 끊으면 schema 실패로 흘러
 * 쓰던 글을 쥔 채 다시 보낼 수 있는 화면이 뜬다.
 */
const CHECK: Record<string, (row: Record<string, unknown>) => void> = {
  answer(row) {
    asText(row.answerId);
    asCode(row.route, ANSWER_ROUTES);
    asList(row.emotionTags, 1).forEach((tag) => asCode(tag, EMOTION_TAGS));
    asText(row.modernBuddhaMessage);
    asList(row.scriptures, 1).forEach(asScripture);
    asText(row.visualTheme);
    asFlag(row.extensionAvailable);
    asPass2(row.pass2);
  },
  light(row) {
    asText(row.answerId);
    asText(row.message);
    if (row.cta !== 'deeper') throw schemaFailure();
    if (row.emotionTags != null) {
      asList(row.emotionTags).forEach((tag) => asCode(tag, EMOTION_TAGS));
    }
  },
  invalid(row) {
    asCode(row.messageKey, INVALID_KEYS);
    if (row.retryAllowed !== true) throw schemaFailure();
  },
  crisis(row) {
    asList(row.channels).forEach((channel) => asCode(channel, CHANNELS));
    asCode(row.crisisLevel, CRISIS_LEVELS);
    asFlag(row.canContinue);
  },
  solace(row) {
    asText(row.opening);
    asScripture(row.scripture);
    asText(row.closing);
    asList(row.channels).forEach((channel) => asCode(channel, CHANNELS));
  },
  extension(row) {
    asText(row.answerId);
    asScripture(row.scripture);
    asAnalysis(row.alternativeAnalysis);
    asAction(row.action);
  },
};

function asApiResponse(value: unknown): ApiResponse {
  const row = asRecord(value);
  const check = typeof row.responseType === 'string' ? CHECK[row.responseType] : undefined;
  if (check === undefined) throw schemaFailure();
  check(row);
  return withQuota(row) as unknown as ApiResponse;
}

function asExtension(value: unknown): ApiExtension {
  const row = asRecord(value);
  if (row.responseType !== 'extension') throw schemaFailure();
  CHECK.extension(row);
  return row as unknown as ApiExtension;
}

function asDailyQuote(value: unknown, fallbackDate: string): DailyQuote {
  const row = asRecord(value);
  const scripture = asScripture(row.scripture);
  const day = typeof row.date === 'string' && row.date !== '' ? row.date : fallbackDate;
  // 서버는 quoteId 를 주지 않는다. 「같은 날에는 같은 구절」이 곧 id 라 날짜와 구절 id 를 잇는다
  return { quoteId: `${day}:${scripture.id}`, line: asText(row.line), scripture };
}

/** 서버가 받는 토큰 모양 그대로다. `backend/app/api/routes.py` 의 SHARE_ID 와 같다 */
const SHARE_ID = /^[A-Za-z0-9_-]{16,64}$/;

function asShareId(value: unknown): string {
  if (typeof value !== 'string' || !SHARE_ID.test(value)) throw schemaFailure();
  return value;
}

/**
 * 서버가 내려 준 랜딩 주소. 메신저에 그대로 붙으려면 절대주소여야 한다.
 *
 * 모양이 아니면 실패로 올리지 않고 `null` 로 내린다. 주소 한 칸 때문에 공유 자체가 막히는
 * 것보다, 화면이 알고 있는 자리로 물러서는 쪽이 사람에게 낫다.
 */
function asLandingUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^https?:\/\/\S+$/.test(value) ? value : null;
}

function failureForStatus(status: number): ApiFailure {
  if (status === 408 || status === 504) {
    return new ApiFailure('timeout', '서버가 제때 답하지 못했어요.');
  }
  // 오늘 자리가 닫혔다. 전역 예산 문도 사용량 천장도 여기로 온다
  if (status === 429) return new ApiFailure('budget', '지금은 더 받을 수 없어요.');
  return new ApiFailure('provider', `서버가 ${status} 로 답했어요.`);
}

/**
 * 429 는 셋이다. 전역 예산이 몰려 잠시 닫힌 것, 광고를 봐야 이어가는 것, 하루 천장에 닿은 것.
 *
 * 뒤의 둘은 서버가 오늘 사용량을 같이 보낸다(`routes.py` 의 `ad_required` · `quota_exhausted`).
 * 그 값을 들고 가야 화면이 「잠시 뒤에 다시 보내 주세요」가 아니라 이어가기 시트나
 * 「오늘은 여기까지예요」를 그릴 수 있다. 어느 쪽인지는 사용량 숫자가 말해 준다.
 * 셋을 가르지 않으면 막힌 사람은 눌러도 소용없는 「다시 해보기」 앞에 남는다.
 *
 * 본문 모양이 어긋나면 사용량 없이 그냥 429 로 둔다. 숫자를 지어내 문을 닫지 않는다.
 */
const QUOTA_MESSAGE: Record<string, string> = {
  ad_required: '이어서 들으려면 짧은 영상을 하나만 봐 주세요.',
  quota_exhausted: '오늘 나눌 수 있는 이야기를 다 나눴어요.',
};

async function failureForResponse(response: Response): Promise<ApiFailure> {
  if (response.status !== 429) return failureForStatus(response.status);
  try {
    // FastAPI 는 HTTPException 의 본문을 detail 에 담아 낸다
    const detail = asRecord(asRecord(await response.json()).detail);
    const message = typeof detail.reason === 'string' ? QUOTA_MESSAGE[detail.reason] : undefined;
    if (message === undefined) return failureForStatus(429);
    return new ApiFailure('budget', message, toQuota(detail.quota));
  } catch {
    return failureForStatus(429);
  }
}

/**
 * 이어가기 광고 자리를 지났다는 표. 다음 `/concern` 한 번만 들고 간다.
 *
 * ⚠ **「봤다」가 아니다.** 이어가기 광고는 전면형이고 답과 떼어 놓았다. 광고가 뜬 순간
 * 이 표를 세우고, 광고가 한 장도 안 온 경우(`noFill`)에도 세운다. 광고를 봐야 답을 주는
 * 구조는 보상형에만 허용되고, 우리 쪽 사정으로 사람을 막지도 않는다.
 *
 * 화면(홈)이 세우고 여기서 요청에 싣는다. 세션·대기 화면을 지나가지 않는 이유는 그 두 곳이
 * 요청을 만들지 않기 때문이다. 답이 실제로 나왔을 때 지운다. 광고 하나가 답 하나를 연다.
 * 전송이 실패해 다시 보낼 때는 그대로 남아 있어야 광고를 두 번 보게 되지 않는다.
 *
 * 서버가 이 값을 믿는 것은 보상 토큰 검증이 붙기 전까지다. 그 검증은 서버에 선다.
 */
let adWatched = false;

export function markAdWatched(): void {
  adWatched = true;
}

/**
 * 익명키가 도착할 때까지 기다린다.
 *
 * **키를 지어내지 않는다.** 아무 문자열이나 보내면 남의 사용량 칸에 들어간다.
 * - pending: 브릿지가 아직 답하지 않았다. 잠깐 기다린다.
 * - unsupported: 토스 앱이 낡아 익명키를 못 받는다.
 * - failed: 브릿지 호출이 실패했다. `IdentityProvider` 가 다시 시도 버튼을 준다.
 *
 * 뒤의 둘은 보내 봐야 서버가 401 을 준다. 요청을 만들지 않고 여기서 끝낸다.
 */
async function waitForAnonKey(getAnonKey: () => AnonKeyState): Promise<string> {
  const deadline = Date.now() + ANON_KEY_WAIT_MS;
  for (;;) {
    const state = getAnonKey();
    if (state.status === 'ready') return state.key;
    if (state.status === 'unsupported' || state.status === 'failed') {
      throw new ApiFailure('provider', '사용자 정보를 확인하지 못해 보낼 수 없어요.');
    }
    if (Date.now() >= deadline) {
      throw new ApiFailure('timeout', '사용자 정보를 기다리다 시간이 지났어요.');
    }
    await sleep(ANON_KEY_POLL_MS);
  }
}

interface Call {
  path: string;
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  timeoutMs?: number;
}

export function createHttpClient(baseUrl: string, options: ApiClientOptions): ApiClient {
  async function call({
    path,
    method,
    body,
    idempotencyKey,
    timeoutMs = CALL_TIMEOUT_MS,
  }: Call): Promise<unknown> {
    const anonKey = await waitForAnonKey(options.getAnonKey);

    const headers: Record<string, string> = { [HEADER_ANON_KEY]: anonKey };
    const zone = deviceTimezone();
    if (zone != null) headers[HEADER_TIMEZONE] = zone;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey != null && idempotencyKey !== '') {
      headers[HEADER_IDEMPOTENCY] = idempotencyKey;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        // 서버가 allow_credentials=false 다. 쿠키를 붙이면 CORS 가 통째로 막힌다
        credentials: 'omit',
        mode: 'cors',
      });
    } catch (error) {
      // fetch 는 끊긴 것도 CORS 로 막힌 것도 같은 TypeError 로 던진다. 기기가 아는 것으로 가른다
      if (controller.signal.aborted) throw new ApiFailure('timeout', '기다리다 시간이 지났어요.');
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new ApiFailure('offline', '인터넷이 닿지 않아요.');
      }
      throw new ApiFailure('provider', error instanceof Error ? error.message : '보내지 못했어요.');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw await failureForResponse(response);

    try {
      return await response.json();
    } catch {
      throw schemaFailure();
    }
  }

  return {
    async submitConcern({ text, idempotencyKey, continueToken }) {
      const body: Record<string, unknown> = { text, idempotencyKey };
      if (adWatched) body.adWatched = true;
      if (continueToken != null) body.continueToken = continueToken;
      const answer = asApiResponse(
        await call({ path: '/concern', method: 'POST', body, idempotencyKey }),
      );
      // 광고 한 장이 답 하나를 연다. 위기·가벼운 답은 오늘 횟수를 쓰지 않아 표가 그대로 남는다
      if (answer.responseType === 'answer') adWatched = false;
      return answer;
    },

    async fetchPass2({ answerId, idempotencyKey }) {
      // 원문을 다시 보내지 않는다. 서버가 pending 행에서 구절과 원문을 읽는다
      const data = await call({
        path: '/concern/pass2',
        method: 'POST',
        body: { answerId, idempotencyKey },
        idempotencyKey,
      });
      // 서버는 답변 전체를 다시 준다. 화면이 갈아 끼우는 것은 pass2 블록 하나다
      return asPass2(asRecord(data).pass2);
    },

    async continueAfterCrisis({ text }) {
      // 판정은 서버가 같은 원문으로 다시 한다. acute 면 위기 안내가 그대로 돌아온다
      return asApiResponse(
        await call({ path: '/concern/continue', method: 'POST', body: { text } }),
      );
    },

    async fetchExtension({ answerId }) {
      // 쓴 구절 목록도 원문도 보내지 않는다. 남은 후보는 서버가 pending 행으로 안다
      return asExtension(
        await call({ path: '/concern/extension', method: 'POST', body: { answerId } }),
      );
    },

    async fetchDailyQuote(dateISO) {
      const data = await call({
        path: `/daily?date=${encodeURIComponent(dateISO)}`,
        method: 'GET',
        timeoutMs: DAILY_TIMEOUT_MS,
      });
      return asDailyQuote(data, dateISO);
    },

    /**
     * 공유 링크를 연다. 카드에 실릴 것은 서버가 자기 pending 행에서 뽑는다.
     *
     * **화면이 쥔 카드 조각을 올려 보내지 않는다.** 서버가 그림을 그릴 때 쓰는 것은 서버가
     * 가진 값이라, 여기서 같은 내용을 한 벌 더 보내면 두 벌이 어긋날 자리만 생긴다.
     *
     * 메신저에 붙일 주소도 서버가 준 `landingUrl` 을 그대로 쓴다. 여기서 다시 조립하면
     * 서버가 실제로 서 있는 자리와 어긋날 수 있다.
     */
    async createShareToken({ answerId, scope }) {
      const data = asRecord(
        await call({ path: '/share', method: 'POST', body: { answerId, scope: scope ?? 'scripture' } }),
      );
      return { token: asShareId(data.shareId), landingUrl: asLandingUrl(data.landingUrl) };
    },

    /**
     * 링크를 받은 사람이 보는 카드.
     *
     * 서버에는 카드 **조각**을 JSON 으로 내주는 자리가 없다. 있는 것은 미리 그려 둔 PNG 하나다.
     * 그래서 조각을 지어내지 않고 그림 주소만 돌려주고, 그 주소가 실제로 열리는지는 화면이 본다.
     * 토큰 모양은 서버가 받는 모양(`routes.py` 의 SHARE_ID)과 같게 여기서 먼저 거른다.
     * 어긋난 토큰으로 요청을 만들면 남의 주소를 부를 자리가 생긴다.
     */
    async fetchSharedCard(token) {
      if (!SHARE_ID.test(token)) return null;
      return { kind: 'image', imageUrl: `${baseUrl}/share/${token}/card.png` };
    },
  };
}
