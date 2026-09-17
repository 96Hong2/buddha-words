/**
 * 「몇 번째인가」로 한 번만 권하는 것들.
 *
 * 홈에 추가하기와 앱 권하기는 둘 다 **사용자가 부탁하지 않은 말**이다. 그런 말은 한 번만
 * 하고, 그 한 번을 아무 때나 쓰지 않는다. 언제 썼는지 기억하는 자리가 여기다.
 *
 * 저장은 localStorage 다. 브릿지 저장소는 비동기라 화면이 한 번 그려진 뒤에 값이 오고,
 * 그러면 안 떠야 할 권유가 깜빡 떴다 사라진다. 이 값들은 첫 페인트에 이미 정해져 있어야 한다.
 *
 * 저장이 막힌 기기에서는 그 세션만 기억한다. 그래서 다음에 열면 한 번 더 볼 수 있는데,
 * 못 저장했다고 영영 못 보게 만드는 쪽보다 낫다.
 */

const KEY = 'buddha.milestones.v1';

/** 앱 권하기를 띄우는 자리. 세 번째 답을 받고 나서다 */
export const APP_SHARE_AT = 3;

interface Milestones {
  /** 지금까지 받은 답의 수. 하루 사용량(quota)과 달리 날짜로 리셋되지 않는다 */
  answers: number;
  /** 홈에 추가 안내를 닫았나 */
  homeAddDone: boolean;
  /** 앱 권하기를 띄웠나 */
  appShareDone: boolean;
}

const EMPTY: Milestones = { answers: 0, homeAddDone: false, appShareDone: false };

let cached: Milestones | null = null;

function read(): Milestones {
  if (cached != null) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw != null) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed != null) {
        const item = parsed as Partial<Milestones>;
        cached = {
          answers: typeof item.answers === 'number' && item.answers >= 0 ? item.answers : 0,
          homeAddDone: item.homeAddDone === true,
          appShareDone: item.appShareDone === true,
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

export function markHomeAddDone(): void {
  write({ ...read(), homeAddDone: true });
}

export function markAppShareDone(): void {
  write({ ...read(), appShareDone: true });
}

/**
 * 앱 권하기를 지금 띄울까.
 *
 * 세 번째 답을 받은 **그 순간 한 번**이다. 그보다 이르면 아직 이 앱이 무엇인지 모르는
 * 사람에게 남에게 권하라고 하는 셈이고, 매번 띄우면 답을 받을 때마다 부탁을 받는다.
 */
export function shouldOfferAppShare(answers: number): boolean {
  return answers === APP_SHARE_AT && !read().appShareDone;
}

/** 테스트가 처음 상태로 되돌린다 */
export function resetMilestones(): void {
  cached = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 지울 수 없으면 캐시만 비운다
  }
}
