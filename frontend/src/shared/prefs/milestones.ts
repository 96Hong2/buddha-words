/**
 * 「몇 번째인가」로 정해지는 것들. 두 가지를 쥔다.
 *
 *   1. 광고를 언제부터 띄울까      첫 이야기에는 안 띄운다
 *   2. 권유를 언제 한 번씩 띄울까   홈 추가 · 앱 알리기 · 알림
 *
 * 권유는 셋 다 **사용자가 부탁하지 않은 말**이다. 그런 말은 한 번씩만 하고, 한 화면에
 * 둘을 겹쳐 띄우지 않는다. 몇 번째 답에서 무엇을 말할지 여기 한 곳에서 정한다.
 *
 * 저장은 localStorage 다. 브릿지 저장소는 비동기라 화면이 한 번 그려진 뒤에 값이 오고,
 * 그러면 안 떠야 할 권유가 깜빡 떴다 사라진다. 이 값들은 첫 페인트에 이미 정해져 있어야 한다.
 *
 * 저장이 막힌 기기에서는 그 세션만 기억한다. 그래서 다음에 열면 한 번 더 볼 수 있는데,
 * 못 저장했다고 영영 못 보게 만드는 쪽보다 낫다.
 */

const KEY = 'buddha.milestones.v2';
/** v1 에는 `answers` 와 권유 두 개만 있었다. 쓰던 사람의 횟수를 0 으로 되돌리지 않는다 */
const KEY_V1 = 'buddha.milestones.v1';

/**
 * 답 하나하나에 붙는 권유 시간표.
 *
 * 홈 추가가 두 번인 이유: 처음 한 번은 아직 이 앱을 계속 쓸지 모르는 사람에게 하는 말이라
 * 흘려 듣기 쉽다. 네 번째까지 온 사람은 다시 올 사람이고, 그 사람에게는 같은 말이 쓸모가 있다.
 */
export const NUDGE_AT = {
  homeAddFirst: 1,
  appShare: 2,
  notify: 3,
  homeAddSecond: 4,
} as const;

/** 답변 화면 위에 한 번씩 올라오는 권유 */
export type Nudge = 'home_add' | 'app_share' | 'notify';

interface Milestones {
  /** 지금까지 받은 답의 수. 하루 사용량(quota)과 달리 날짜로 리셋되지 않는다 */
  answers: number;
  /** 홈 추가를 몇 번 띄웠나. 위 시간표대로 최대 둘이다 */
  homeAddShown: number;
  /** 「이미 추가했어요」를 눌렀다. 그러면 두 번째 자리에서도 안 뜬다 */
  homeAddDone: boolean;
  /** 앱 알리기를 띄웠나 */
  appShareDone: boolean;
  /** 알림 권유를 띄웠나 */
  notifyDone: boolean;
}

const EMPTY: Milestones = {
  answers: 0,
  homeAddShown: 0,
  homeAddDone: false,
  appShareDone: false,
  notifyDone: false,
};

let cached: Milestones | null = null;

function fromRaw(raw: string): Milestones | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null) return null;
    const item = parsed as Partial<Milestones>;
    return {
      answers: typeof item.answers === 'number' && item.answers >= 0 ? item.answers : 0,
      homeAddShown:
        typeof item.homeAddShown === 'number' && item.homeAddShown >= 0 ? item.homeAddShown : 0,
      homeAddDone: item.homeAddDone === true,
      appShareDone: item.appShareDone === true,
      notifyDone: item.notifyDone === true,
    };
  } catch {
    return null;
  }
}

function read(): Milestones {
  if (cached != null) return cached;
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(KEY_V1);
    const parsed = raw == null ? null : fromRaw(raw);
    if (parsed != null) {
      cached = parsed;
      return cached;
    }
  } catch {
    // 값이 깨졌거나 저장소가 막혔다. 처음으로 본다
  }
  cached = { ...EMPTY };
  return cached;
}

function write(next: Milestones): void {
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 이 세션 동안은 위의 캐시가 들고 있는다
  }
}

export function readMilestones(): Milestones {
  return { ...read() };
}

/** 답을 하나 받았다. 같은 답변으로 두 번 세지 않는 일은 부르는 쪽이 한다 */
export function countAnswer(): number {
  const now = read();
  const next = { ...now, answers: now.answers + 1 };
  write(next);
  return next.answers;
}

/**
 * 아직 답을 한 번도 못 받았나. **지금 만드는 것이 이 사람의 첫 답이다.**
 *
 * 대기 화면이 광고를 띄우기 전에 이 값을 본다. 앱이 무엇을 해 주는지 아직 못 본 사람에게
 * 첫 화면부터 전면 광고를 덮으면, 그 사람이 본 것은 광고 하나뿐이고 답은 보기 전에 나간다.
 * 값을 한 번 받아 본 사람에게만 값을 받으라고 한다.
 */
export function isFirstStory(): boolean {
  return read().answers === 0;
}

/** 홈 추가를 「이미 했다」고 말했다. 두 번째 자리에서도 다시 묻지 않는다 */
export function markHomeAddDone(): void {
  write({ ...read(), homeAddDone: true });
}

/** 홈 추가를 한 번 띄웠다. 닫아도 센다. 시간표의 두 자리를 이 수로 가른다 */
export function markHomeAddShown(): void {
  const now = read();
  write({ ...now, homeAddShown: now.homeAddShown + 1 });
}

export function markAppShareDone(): void {
  write({ ...read(), appShareDone: true });
}

export function markNotifyDone(): void {
  write({ ...read(), notifyDone: true });
}

/**
 * 이번 답에서 무엇을 권할까. 없으면 null 이고 화면에는 아무것도 뜨지 않는다.
 *
 * **한 번에 하나다.** 겹치면 답을 읽으러 온 사람 앞에 부탁이 두 장 쌓인다.
 */
export function nudgeFor(answers: number): Nudge | null {
  const now = read();
  if (answers === NUDGE_AT.homeAddFirst && !now.homeAddDone && now.homeAddShown < 1) {
    return 'home_add';
  }
  if (answers === NUDGE_AT.appShare && !now.appShareDone) return 'app_share';
  if (answers === NUDGE_AT.notify && !now.notifyDone) return 'notify';
  if (answers === NUDGE_AT.homeAddSecond && !now.homeAddDone && now.homeAddShown < 2) {
    return 'home_add';
  }
  return null;
}

/** 테스트가 처음 상태로 되돌린다 */
export function resetMilestones(): void {
  cached = null;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_V1);
  } catch {
    // 지울 수 없으면 캐시만 비운다
  }
}
