/**
 * 이벤트 이름 정본은 `spec/events.ts` 다. 여기서 이름을 새로 만들지 않는다.
 * 목록에 없는 이름을 보내면 타입이 막는다.
 */

export { EVENTS, BUCKETS, KPI, COHORTS } from '@spec/events.ts';
export type { EventName } from '@spec/events.ts';
