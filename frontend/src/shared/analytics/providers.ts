/**
 * 로그가 실제로 나가는 자리. 갈아 끼울 수 있게 뒤에 둔다.
 *
 * 화면도 `Analytics` 도 어느 프로바이더인지 모른다. 수집처가 바뀌어도 이 파일 하나만 는다.
 *
 * - `TossAnalyticsProvider`  운영. 토스 공식 Analytics 하나로 보낸다
 * - `DebugAnalyticsProvider` 개발. 콘솔에 찍고 최근 것을 기억해 둔다(디버그 화면이 읽는다)
 * - `FanoutProvider`         둘 이상에 같이 보낸다. 개발에서 토스 + 디버그를 함께 쓴다
 *
 * **여기서 던지지 않는다.** 로그가 실패해서 기록·저장·답변이 막히면 그 순간 이 앱은
 * 존재 이유를 잃는다. 모든 구현이 실패를 삼키고 아무 일도 없던 것처럼 돌아간다.
 */

import type { AnalyticsKind, AnalyticsParams, MiniAppBridge } from '../toss';

export interface AnalyticsProvider {
  send(kind: AnalyticsKind, name: string, params: AnalyticsParams): void;
}

/** 운영 수집 경로. 토스 브릿지가 실패를 삼킨다 */
export class TossAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly bridge: MiniAppBridge) {}

  send(kind: AnalyticsKind, name: string, params: AnalyticsParams): void {
    try {
      this.bridge.analytics.log(kind, name, params);
    } catch {
      // 수집 경로가 죽어도 앱은 그대로 돈다
    }
  }
}

export interface DebugRecord {
  kind: AnalyticsKind;
  name: string;
  params: AnalyticsParams;
  at: number;
}

/** 개발에서 눈으로 보는 자리. 최근 것만 들고 있어 메모리가 늘지 않는다 */
export class DebugAnalyticsProvider implements AnalyticsProvider {
  private readonly records: DebugRecord[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly limit = 200) {}

  send(kind: AnalyticsKind, name: string, params: AnalyticsParams): void {
    this.records.unshift({ kind, name, params, at: Date.now() });
    if (this.records.length > this.limit) this.records.length = this.limit;
    for (const listener of this.listeners) listener();
  }

  /** 최신이 앞이다 */
  list(): readonly DebugRecord[] {
    return this.records;
  }

  clear(): void {
    this.records.length = 0;
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** 여럿에 같이 보낸다. 하나가 죽어도 나머지는 간다 */
export class FanoutProvider implements AnalyticsProvider {
  constructor(private readonly targets: readonly AnalyticsProvider[]) {}

  send(kind: AnalyticsKind, name: string, params: AnalyticsParams): void {
    for (const target of this.targets) {
      try {
        target.send(kind, name, params);
      } catch {
        // 한 곳이 막혀도 나머지는 보낸다
      }
    }
  }
}

/**
 * 개발에서만 사는 디버그 수집기. 디버그 화면이 이 값을 읽는다.
 *
 * `import.meta.env.DEV` 는 vite 가 빌드 때 `false` 로 갈아 끼우므로 운영 번들에서는
 * 이 객체도 디버그 화면도 통째로 지워진다. 그래서 이 비교는 여기서 직접 적는다.
 */
export const debugSink = import.meta.env.DEV ? new DebugAnalyticsProvider() : null;
