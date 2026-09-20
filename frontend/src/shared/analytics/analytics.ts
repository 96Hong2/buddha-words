/**
 * 행동 로그를 보내는 유일한 자리.
 *
 * 화면은 `useAnalytics()` 로 이 객체를 받아 이름과 값만 넘긴다. 어디로 나가는지는
 * `providers.ts` 가 정하고 화면도 여기도 모른다.
 *
 * 여기가 붙이는 공통 값:
 * - `event_id`    같은 로그가 두 번 도착해도 하나로 셀 수 있게. 중복 제거의 열쇠다
 * - `session_id`  세션 하나. 마지막 활동에서 30분이 지나면 새 세션이 열린다
 * - `flow_id`     기록 시작부터 저장까지. 흐름을 잇는 값이라 화면이 넘겨 준다
 * - `app_version` · `os` · `env` · `variants`  어느 판에서 난 일인지
 *
 * 발생 시각은 SDK 가 붙이고, 서버 수신 시각은 수집기가 붙인다. 우리가 지어내지 않는다.
 * 분석용 사용자 ID(`anonymous_key`)도 SDK 가 자동으로 넣는다.
 *
 * **고민 원문 · 답변 본문 · 경전 본문은 어떤 이벤트에도 싣지 않는다.** 싣는 것은 id ·
 * 열거값 · 숫자 구간뿐이다. 이 규칙은 `tools/check_spec.mjs` 가 이름으로, 사람이 리뷰로 지킨다.
 *
 * **로그가 실패해도 아무 일도 일어나지 않는다.** 대기열도 재시도도 두지 않는다.
 * 기록이 로그 때문에 늦거나 막히면 그 순간 이 앱은 존재 이유를 잃는다.
 */

import type { AnalyticsKind, AnalyticsParams, MiniAppBridge } from '../toss';

import type { EventName } from './events';
import {
  FanoutProvider,
  TossAnalyticsProvider,
  debugSink,
  type AnalyticsProvider,
} from './providers';
import { sessionBucket } from './buckets';

/** 흐름 하나를 가리키는 값. 기록 시작부터 저장까지 같은 값을 물고 간다. */
export type FlowId = string;

export interface LogOptions {
  /** 이 로그가 속한 흐름. 없으면 흐름 밖에서 난 일이다. */
  flowId?: FlowId;
  /** screen·click·impression 중 하나. 안 주면 그 밖의 사실(event)이다. */
  kind?: AnalyticsKind;
  /**
   * 같은 사실을 두 번 세지 않게 하는 열쇠.
   *
   * 스크롤 50% 나 광고 노출처럼 re-render·SDK 콜백 때문에 여러 번 불릴 수 있는 자리에 쓴다.
   * 세션 안에서 같은 열쇠로는 한 번만 나간다.
   */
  once?: string;
}

/** 마지막 활동에서 이만큼 지나면 다음 로그는 새 세션이다 */
const SESSION_IDLE_MS = 30 * 60 * 1000;

/**
 * 앱을 연 로그를 기다려 주는 시간.
 *
 * `app_open` 은 방문 이력을 저장소에서 읽어야 값이 채워져서 한 틱 늦게 나간다. 그 사이에
 * 첫 화면이 그린 로그가 먼저 나가면 스트림의 첫 줄이 `app_open` 이 아니게 되고,
 * 「열고 나서 몇 %가 입력했나」 같은 질문이 첫 칸부터 어긋난다.
 *
 * 그래서 그때까지 잠깐만 붙들어 둔다. 붙들다 잃는 일이 없도록 이 시간이 지나면 그냥 내보낸다.
 * 공유 링크처럼 `app_open` 을 부르지 않는 화면도 있기 때문이다.
 */
const OPEN_WAIT_MS = 3000;

/**
 * 무작위 id.
 *
 * `crypto.randomUUID` 가 없는 환경(오래된 WebView·비보안 출처)이 있어 대비를 둔다.
 * 이 값으로 무엇을 지키는 것이 아니라 세는 것뿐이라 대비 쪽 품질로도 충분하다.
 */
function newId(): string {
  const generator = globalThis.crypto;
  if (generator != null && typeof generator.randomUUID === 'function') {
    return generator.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class Analytics {
  private readonly bridge: MiniAppBridge;
  private readonly provider: AnalyticsProvider;

  private sessionId = newId();
  private sessionStartedAt = Date.now();
  private lastActivityAt = Date.now();
  /** 세션이 끝날 때 함께 보내는 값. 이 세션에서 답을 몇 번 받았고 광고를 몇 번 봤나 */
  private sessionAnswers = 0;
  private sessionAds = 0;
  /** 이 세션에서 session_start 를 이미 보냈나 */
  private sessionAnnounced = false;

  /** 앱을 연 로그는 세션당 한 번이다. 화면이 다시 마운트돼도 늘지 않는다. */
  private opened = false;
  /** 한 번만 보낼 것들. 세션이 바뀌면 비운다 */
  private seen = new Set<string>();
  /** 실험 배정. 모든 이벤트에 실린다 */
  private variants: Record<string, string> = {};
  /** app_open 을 기다리는 동안 붙들어 둔 로그. 비면 그냥 보낸다 */
  private held: Array<() => void> | null = [];

  constructor(bridge: MiniAppBridge, provider?: AnalyticsProvider) {
    this.bridge = bridge;
    // 붙들기가 영영 풀리지 않는 일이 없게 한다. 못 기다리면 순서를 포기하고 내보낸다
    setTimeout(() => this.release(), OPEN_WAIT_MS);
    this.provider =
      provider ??
      (debugSink == null
        ? new TossAnalyticsProvider(bridge)
        : new FanoutProvider([new TossAnalyticsProvider(bridge), debugSink]));
  }

  /** 새 흐름을 연다. 돌려준 값을 그 흐름의 모든 로그에 넘긴다. */
  startFlow(): FlowId {
    return newId();
  }

  /** 실험 배정을 알려 준다. 이후 모든 이벤트에 `variants` 로 실린다 */
  setVariant(experiment: string, variant: string): void {
    this.variants = { ...this.variants, [experiment]: variant };
  }

  /** 지금 세션 id. 화면이 중복 방지 열쇠를 만들 때 쓴다 */
  get session(): string {
    return this.sessionId;
  }

  log(name: EventName, params: AnalyticsParams = {}, options: LogOptions = {}): void {
    this.rollSessionIfIdle();

    if (options.once != null) {
      if (this.seen.has(options.once)) return;
      this.seen.add(options.once);
    }

    // 앱을 연 로그와 세션 시작은 줄을 서지 않는다. 그 둘이 줄의 맨 앞이다
    const first = name === 'app_open' || name === 'session_start';
    if (!first && this.held != null) {
      this.held.push(() => this.send(name, params, options));
      return;
    }

    this.send(name, params, options);
  }

  private send(name: EventName, params: AnalyticsParams, options: LogOptions): void {

    if (name === 'answer_generated') this.sessionAnswers += 1;
    /*
      이 세션에서 광고가 몇 편 떴나. **`ad_close` 하나로만 센다.**

      그 이벤트는 자리도 종류도 가리지 않고 광고가 실제로 화면을 덮었을 때 한 번씩 찍힌다.
      완주 여부는 `rewarded_ad_complete` 와 `rewarded_ad_fail` 이 따로 지므로 여기서 또 묻지 않는다.

      ⚠ 한때 이 자리가 이어가기를 **두 번 셌다.** 「이어가기는 전면형이라 보상 완료가 없다」는
      전제로 `rewarded_ad_complete` 와 `ad_close(continue)` 를 나란히 세고 있었는데,
      이어가기가 보상형으로 돌아온 뒤에도 그대로 남아 완주 한 편이 양쪽에 걸렸다.
      **세는 자리를 둘로 나누면 어느 한쪽이 바뀔 때 조용히 어긋난다.**
    */
    if (name === 'ad_close') this.sessionAds += 1;

    this.provider.send(options.kind ?? 'event', name, {
      event_id: newId(),
      session_id: this.sessionId,
      flow_id: options.flowId,
      app_version: __APP_VERSION__,
      os: this.bridge.platform,
      // 운영과 테스트를 갈라 놓지 않으면 QR 로 눌러 본 것이 지표에 섞인다.
      env: this.bridge.environment,
      variants: Object.keys(this.variants).length === 0 ? undefined : JSON.stringify(this.variants),
      ...params,
    });
  }

  /** 앱을 연 사실. 두 번째부터는 아무 일도 하지 않는다. */
  appOpen(name: EventName, params: AnalyticsParams = {}): void {
    if (this.opened) return;
    this.opened = true;
    this.log(name, params);
    this.announceSession('open', params);
    this.release();
  }

  /** 붙들어 둔 로그를 순서대로 내보낸다. 두 번 불러도 한 번만 푼다 */
  private release(): void {
    const waiting = this.held;
    if (waiting == null) return;
    this.held = null;
    for (const run of waiting) run();
  }

  /**
   * 세션이 끝났다. 앱이 뒤로 갈 때 부른다.
   *
   * **여기서 동기 요청을 만들지 않는다.** 나가는 길을 붙잡으면 앱이 느리게 닫힌다.
   * 못 보내고 끝난 세션은 다음 세션의 `session_start` 로 이어 붙여 읽는다.
   */
  endSession(reason: 'background' | 'timeout'): void {
    if (!this.sessionAnnounced) return;
    this.sessionAnnounced = false;
    this.provider.send('event', 'session_end', {
      event_id: newId(),
      session_id: this.sessionId,
      app_version: __APP_VERSION__,
      os: this.bridge.platform,
      env: this.bridge.environment,
      reason,
      duration_bucket_s: sessionBucket(Date.now() - this.sessionStartedAt),
      answers: this.sessionAnswers,
      ads: this.sessionAds,
    });
  }

  /** 앱이 다시 앞으로 왔다. 30분이 지났으면 새 세션이 열린다 */
  resume(facts: AnalyticsParams = {}): void {
    if (Date.now() - this.lastActivityAt < SESSION_IDLE_MS) {
      this.lastActivityAt = Date.now();
      if (!this.sessionAnnounced) this.announceSession('resume', facts);
      return;
    }
    this.rollSession();
    this.announceSession('resume', facts);
  }

  private announceSession(reason: 'open' | 'resume', facts: AnalyticsParams): void {
    if (this.sessionAnnounced) return;
    this.sessionAnnounced = true;
    this.log('session_start', {
      reason,
      is_first_open: facts.is_first_open,
      days_since_last_open: facts.days_since_last_open,
    });
  }

  /** 마지막 활동에서 30분이 지났으면 세션을 갈아 끼운다 */
  private rollSessionIfIdle(): void {
    const now = Date.now();
    if (now - this.lastActivityAt >= SESSION_IDLE_MS) this.rollSession();
    this.lastActivityAt = now;
  }

  private rollSession(): void {
    this.endSession('timeout');
    this.sessionId = newId();
    this.sessionStartedAt = Date.now();
    this.lastActivityAt = Date.now();
    this.sessionAnswers = 0;
    this.sessionAds = 0;
    this.seen = new Set<string>();
  }
}
