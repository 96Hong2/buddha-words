/**
 * 연꽃 한 송이가 버튼으로 날아가는 짧은 장면.
 *
 * ── 왜 만들었나 ────────────────────────────────────────────────────────
 *
 * 연꽃으로 지나가면 광고가 안 뜬다. 그 조용함 때문에 **한 송이가 쓰였다는 사실이
 * 그 순간에는 안 읽힌다.** 지나고 나서 뜨는 알림(`domains/leaf/spentNotice`)은 「썼다」를
 * 말하지만, 쓰는 장면 자체가 없어서 「고민을 보낼 때마다 하나씩 쓰인다」는 규칙이
 * 몸에 남지 않는다. 홈 위쪽 칩에서 버튼으로 꽃 한 송이가 건너가는 것을 보여 준다.
 *
 * ── 왜 컴포넌트 밖인가 ──────────────────────────────────────────────────
 *
 * 나는 자리는 홈 칩이고 닿는 자리는 시트 안 버튼이라, 둘의 공통 조상은 앱 껍데기다.
 * 시트가 닫히는 중에도 끝까지 날아야 해서 포털로 띄운다. `spentNotice` 와 같은 결이되,
 * 저쪽은 **쓴 뒤에** 남는 말이고 이쪽은 **쓰는 동안**의 그림이라 따로 둔다.
 */

/** 화면이 움직이지 않기를 바라는 사람에게는 날리지 않는다 */
export function prefersStill(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 꽃이 날아가는 시간 */
export const LEAF_FLIGHT_MS = 420;

/**
 * 꽃이 닿은 뒤 **줄어든 숫자를 보여 주는 시간.**
 *
 * 닿자마자 다음 화면으로 넘기면 숫자가 바뀐 것을 아무도 못 본다. 그러면 장면의 절반이
 * 없는 셈이라 「하나씩 쓰인다」가 안 남는다. 버튼을 누른 뒤 실제 동작은
 * `LEAF_FLIGHT_MS + LEAF_LAND_HOLD_MS` 만큼 늦는다.
 */
export const LEAF_LAND_HOLD_MS = 160;

export interface LeafFlight {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  seq: number;
}

let current: LeafFlight | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) listener();
}

function centerOf(el: Element | null): { x: number; y: number } | null {
  if (el == null) return null;
  const box = el.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/**
 * 칩에서 버튼으로 한 송이를 날린다. **날렸으면 true 다.**
 *
 * 칩이 화면에 없으면(간직 시트는 답변 화면 위에 선다) 버튼 바로 위에서 내려앉게 한다.
 * 아예 안 보여 주는 것보다는 낫고, 출발점이 없다고 동작을 멈출 이유는 없다.
 */
export function flyLeafTo(target: Element | null): boolean {
  if (prefersStill()) return false;
  const to = centerOf(target);
  if (to == null) return false;
  const from = centerOf(document.querySelector('[data-testid="leaf-chip"]')) ?? {
    x: to.x,
    y: Math.max(24, to.y - 140),
  };
  seq += 1;
  current = { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, seq };
  publish();
  return true;
}

export function clearLeafFlight(): void {
  if (current == null) return;
  current = null;
  publish();
}

export function readLeafFlight(): LeafFlight | null {
  return current;
}

export function subscribeLeafFlight(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
