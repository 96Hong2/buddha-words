/**
 * 연꽃을 썼다는 사실을 화면 밖 한 자리에 적어 둔다.
 *
 * ── 왜 컴포넌트 상태가 아닌가 ─────────────────────────────────────────
 *
 * 연꽃을 쓰는 순간 **화면이 바뀐다.** 이어가기는 그 자리에서 답을 만들러 떠나고,
 * 간직하기는 시트가 닫힌다. 쓴 사실을 그 화면의 상태로 들고 있으면 알리려는 순간
 * 화면과 함께 사라져서, 사람은 잔액만 조용히 줄어든 것을 나중에 발견한다.
 *
 * 그래서 신호를 라우팅 밖에 둔다. 앱 껍데기에 한 번 마운트된 토스트가 이걸 듣는다.
 *
 * 저장소(`shared/prefs/leaves`)와 나누어 둔 이유: 저쪽은 **얼마 남았나**를 기억하는
 * 자리라 앱을 다시 열어도 살아 있어야 하고, 이쪽은 **방금 무슨 일이 있었나**라서
 * 한 번 읽히면 사라져야 한다. 한 파일에 두면 새로고침한 사람에게 지난번 토스트가 뜬다.
 */

import type { LeafSpend } from '../../shared/prefs/leaves';

export interface LeafSpentNotice {
  placement: LeafSpend;
  /** 쓰고 난 잔액 */
  balance: number;
  /** 같은 자리에서 연달아 써도 새 알림으로 읽히게 하는 일련번호 */
  seq: number;
}

let current: LeafSpentNotice | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) listener();
}

/** 한 송이 썼다. 화면이 바뀌어도 이 사실은 남는다 */
export function announceLeafSpend(placement: LeafSpend, balance: number): void {
  seq += 1;
  current = { placement, balance, seq };
  publish();
}

/** 다 알렸다. 토스트가 사라질 때 부른다 */
export function clearLeafSpend(): void {
  if (current == null) return;
  current = null;
  publish();
}

export function readLeafSpend(): LeafSpentNotice | null {
  return current;
}

export function subscribeLeafSpend(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
