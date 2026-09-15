/** 로그에 정확한 시간을 남기지 않는다. 구간 이름은 spec/events.ts 가 정본이다 */

import { BUCKETS } from '../../shared/analytics';

const EDGES = [2000, 5000, 10000, 20000, 40000];

export function elapsedBucket(ms: number): string {
  const index = EDGES.findIndex((edge) => ms < edge);
  return BUCKETS.elapsed_ms[index === -1 ? EDGES.length : index];
}
