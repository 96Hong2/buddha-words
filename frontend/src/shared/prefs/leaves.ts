/**
 * 연꽃을 세는 자리.
 *
 * 연꽃 한 송이가 광고 한 편이다. **미리 모아 두면 그때 광고를 안 봐도 된다.**
 * 이야기를 이어갈 때와 답을 간직할 때 한 송이씩 쓴다.
 *
 * ── 왜 만들었나 ───────────────────────────────────────────────────────────
 *
 * 전에는 광고를 볼 자리가 곧 광고를 봐야 하는 자리였다. 답을 기다리는 사람 앞에
 * 30초가 서 있으면, 그 30초는 언제나 방해다. 연꽃은 그 30초를 **사람이 한가할 때로**
 * 옮긴다. 낼 값이 줄지는 않지만 내는 시점을 고를 수 있다.
 *
 * 처음 한 송이를 그냥 준다. 두 번째 이야기에서 광고 대신 연꽃이 먼저 쓰이므로,
 * 이 앱에 연꽃이라는 것이 있다는 사실을 설명이 아니라 경험으로 알게 된다.
 *
 * ── 저장 자리 ─────────────────────────────────────────────────────────────
 *
 * localStorage 다. 브릿지 저장소는 비동기라 화면이 한 번 그려진 뒤에 값이 오고,
 * 그러면 잔액이 0에서 3으로 튀거나 「연꽃으로 받기」 버튼이 깜빡 떴다 사라진다.
 * 이 값은 첫 페인트에 이미 정해져 있어야 한다. `milestones` 와 같은 이유다.
 *
 * **기기에만 있는 값이라 지우면 사라진다.** 서버가 세지 않는다. 돈을 받고 파는 것이
 * 아니라 광고 한 편을 미리 치른 표라, 잃어도 광고를 한 번 더 보면 된다. 서버에 두면
 * 익명키로 사람을 묶어 세야 하는데, 그 값어치가 이만큼 되지 않는다.
 */

const KEY = 'buddha.leaves.v1';

/** 처음 열 때 그냥 주는 몫. 설명 대신 한 번 써 보게 한다 */
export const WELCOME_LEAVES = 1;

/** 연꽃을 쓰는 자리 */
export type LeafSpend = 'continue' | 'save' | 'extension';

/** 연꽃이 들어온 길 */
export type LeafEarn = 'welcome' | 'ad';

export interface LeafState {
  /** 지금 가진 연꽃 */
  count: number;
  /** 첫 몫을 이미 줬나. 지우고 다시 받는 것을 막는다 */
  welcomed: boolean;
  /** 지금까지 모은 수. 로그에만 쓴다 */
  earned: number;
  /** 지금까지 쓴 수. 로그에만 쓴다 */
  spent: number;
}

const EMPTY: LeafState = { count: 0, welcomed: false, earned: 0, spent: 0 };

let cached: LeafState | null = null;
const listeners = new Set<() => void>();

function toCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function read(): LeafState {
  if (cached != null) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw != null) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed != null) {
        const item = parsed as Partial<LeafState>;
        cached = {
          count: toCount(item.count),
          welcomed: item.welcomed === true,
          earned: toCount(item.earned),
          spent: toCount(item.spent),
        };
        return cached;
      }
    }
  } catch {
    // 값이 깨졌거나 저장소가 막혔다. 처음으로 본다
  }
  cached = { ...EMPTY };
  return cached;
}

function write(next: LeafState): void {
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장이 막힌 기기에서는 이 세션 동안만 기억한다. 못 저장했다고 쓰던 연꽃을 뺏지 않는다
  }
  for (const listener of listeners) listener();
}

/** 잔액이 바뀔 때 알려 준다. 화면이 `useSyncExternalStore` 로 듣는다 */
export function subscribeLeaves(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readLeaves(): LeafState {
  return { ...read() };
}

/** 지금 가진 연꽃. 화면이 가장 자주 묻는 것이라 따로 둔다 */
export function leafCount(): number {
  return read().count;
}

/**
 * 첫 몫을 준다. **이미 줬으면 아무 일도 하지 않는다.**
 *
 * 앱을 열 때 한 번 부른다. 돌려주는 값이 true 면 이번에 준 것이라, 부르는 쪽이
 * 그때만 로그를 남기고 반가운 말을 한 번 건넨다.
 */
export function grantWelcome(): boolean {
  const now = read();
  if (now.welcomed) return false;
  write({
    ...now,
    count: now.count + WELCOME_LEAVES,
    welcomed: true,
    earned: now.earned + WELCOME_LEAVES,
  });
  return true;
}

/**
 * 광고를 끝까지 봤다. 그만큼 늘린다.
 *
 * 몇 송이인지는 부르는 쪽이 정한다(`LEAVES_PER_REWARDED_AD`). 여기에 박아 두면 교환비를
 * 바꿀 때 저장소까지 고쳐야 하고, 그 값이 화면이 적은 말과 어긋나도 알 길이 없다.
 */
export function earnLeaves(amount: number): number {
  const add = toCount(amount);
  if (add === 0) return read().count;
  const now = read();
  const next = { ...now, count: now.count + add, earned: now.earned + add };
  write(next);
  return next.count;
}

/**
 * 한 송이 쓴다. 없으면 false 이고 잔액은 그대로다.
 *
 * **부르는 쪽이 반드시 돌려받은 값을 본다.** 있다고 믿고 진행하면, 두 화면이 거의 같은
 * 순간에 쓰려 할 때 없는 연꽃으로 두 번 지나간다.
 */
export function spendLeaf(): boolean {
  const now = read();
  if (now.count < 1) return false;
  write({ ...now, count: now.count - 1, spent: now.spent + 1 });
  return true;
}

/** 테스트가 처음 상태로 되돌린다 */
export function resetLeaves(): void {
  cached = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 지울 수 없으면 캐시만 비운다
  }
  for (const listener of listeners) listener();
}
