/**
 * 숫자를 구간 이름으로 바꾼다. **로그에 정확한 값을 남기지 않는다.**
 *
 * 정확한 값을 남기면 그 값이 사람을 가리키게 된다. 217자를 쓴 사람은 그날 한 명이고,
 * 실행 횟수 217 도 한 명이다. 구간 이름은 `spec/events.ts` 의 BUCKETS 가 정본이고
 * 여기서는 경계만 정한다. 경계를 고치면 옛 데이터와 이어지지 않으니 함부로 고치지 않는다.
 */

import { BUCKETS } from './events';

/** 경계 배열과 이름 배열을 짝지어 고른다. 이름이 경계보다 하나 많다 */
function pick(edges: readonly number[], names: readonly string[], value: number): string {
  const index = edges.findIndex((edge) => value < edge);
  return names[index === -1 ? edges.length : index];
}

/** 글자 수. 0 은 따로 둔다. 빈 글과 짧은 글은 다른 일이다 */
export function charsBucket(chars: number): string {
  if (chars <= 0) return BUCKETS.chars[0];
  return pick([15, 40, 120, 300], BUCKETS.chars.slice(1), chars);
}

/** 줄 수 */
export function linesBucket(lines: number): string {
  return pick([2, 3, 5], BUCKETS.lines, Math.max(1, lines));
}

/** 걸린 시간(ms) */
export function elapsedBucket(ms: number): string {
  return pick([2000, 5000, 10000, 20000, 40000], BUCKETS.elapsed_ms, ms);
}

/** 머문 시간(초) */
export function dwellBucket(ms: number): string {
  return pick([3000, 10000, 30000, 90000], BUCKETS.dwell_s, ms);
}

/** 세션 길이(초) */
export function sessionBucket(ms: number): string {
  return pick([10000, 60000, 180000, 600000], BUCKETS.session_s, ms);
}

/** 글을 쓴 시간(ms) */
export function typingBucket(ms: number): string {
  return pick([5000, 20000, 60000], BUCKETS.typing_ms, ms);
}

/** 「곧바로」를 재는 짧은 자(ms). 마찰 신호 전용 */
export function immediateBucket(ms: number): string {
  return pick([2000, 10000], BUCKETS.immediate_s, ms);
}

/** 답변 본문 길이(글자) */
export function answerLengthBucket(chars: number): string {
  return pick([600, 1200, 2000], BUCKETS.answer_len, chars);
}

/** 보관함에 든 개수 */
export function itemsBucket(count: number): string {
  if (count <= 0) return BUCKETS.items[0];
  return pick([4, 10], BUCKETS.items.slice(1), count);
}

/** 문장 수를 센다. 마침표가 없어도 줄바꿈이면 한 문장으로 본다 */
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/[.!?。\n]+/).filter((part) => part.trim() !== '').length || 1;
}
