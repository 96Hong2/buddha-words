/**
 * 리뷰를 언제 청할까.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────────
 *
 * 앱인토스는 「추천 미니앱」을 UX · 실사용 지표 · **리뷰** · 성능 넷으로 가른다.
 * 넷을 다 채워야 하는데 이 앱은 리뷰를 한 번도 청한 적이 없어 그 칸이 비어 있었다.
 * 비어 있으면 나머지 셋을 아무리 잘 채워도 추천으로 못 간다.
 *
 * ── 언제 청하나 ───────────────────────────────────────────────────────────
 *
 * **답을 두 번 이상 받아 본 사람에게만.** 공식 가이드가 「가치를 충분히 느낀 시점」을
 * 권한다. 한 번 써 본 사람은 이 앱이 무엇인지 아직 모르고, 그 사람에게 별점을 물으면
 * 낮은 점수가 아니라 **아무 점수도** 안 나온다.
 *
 * 홈 맨 위에 카드로 선다. 시트로 덮지 않는다. 이 저장소의 절대 규칙 7번이
 * 「진입 즉시 바텀시트 없음」이고, 부탁하는 말일수록 그 선을 지켜야 한다.
 *
 * ── 한 번 청하면 끝이다 ───────────────────────────────────────────────────
 *
 * `Review.request` 는 **불러도 안 뜰 수 있다.** 토스가 사람의 피로도를 보고 정하고,
 * 우리에게는 떴는지조차 알려 주지 않는다(`Promise<void>`). 그래서 우리 쪽은 「청했다」만
 * 적고 다시 묻지 않는다. 안 떴다면 그것은 토스가 지금이 아니라고 판단한 것이고, 그
 * 판단을 카드로 덮어쓰려 들면 SDK 가이드의 「반복 호출하지 마세요」를 정면으로 어긴다.
 *
 * 「나중에」는 다르다. 사람이 직접 미룬 것이라 답을 두 번 더 받으면 한 번 더 묻는다.
 */

const KEY = 'buddha.review.v1';

/** 이만큼 답을 받아 본 사람에게 묻는다 */
export const REVIEW_AFTER_ANSWERS = 2;

/** 「나중에」를 누른 사람에게 다시 묻기까지 받아야 하는 답의 수 */
const SNOOZE_ANSWERS = 2;

export interface ReviewState {
  /** 리뷰 화면을 청한 적이 있나. 한 번이면 끝이다 */
  asked: boolean;
  /** 「나중에」를 누른 시점의 답변 수. 0 이면 미룬 적이 없다 */
  snoozedAt: number;
}

const EMPTY: ReviewState = { asked: false, snoozedAt: 0 };

let cached: ReviewState | null = null;

function read(): ReviewState {
  if (cached != null) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw != null) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed != null) {
        const item = parsed as Partial<ReviewState>;
        cached = {
          asked: item.asked === true,
          snoozedAt:
            typeof item.snoozedAt === 'number' && item.snoozedAt >= 0
              ? Math.floor(item.snoozedAt)
              : 0,
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

function write(next: ReviewState): void {
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장이 막힌 기기에서는 이 세션 동안만 기억한다
  }
}

export function readReview(): ReviewState {
  return { ...read() };
}

/**
 * 지금 리뷰 카드를 띄울까.
 *
 * @param answers 지금까지 받은 답의 수(`milestones` 의 값)
 */
export function reviewCardDue(answers: number): boolean {
  if (answers < REVIEW_AFTER_ANSWERS) return false;
  const now = read();
  if (now.asked) return false;
  if (now.snoozedAt === 0) return true;
  return answers >= now.snoozedAt + SNOOZE_ANSWERS;
}

/** 리뷰 화면을 청했다. 떴는지는 알 수 없고, 그래서 다시 묻지 않는다 */
export function markReviewAsked(): void {
  write({ ...read(), asked: true });
}

/** 「나중에」를 눌렀다. 답을 두 번 더 받으면 한 번 더 묻는다 */
export function snoozeReview(answers: number): void {
  write({ ...read(), snoozedAt: answers });
}

/** 테스트가 처음 상태로 되돌린다 */
export function resetReview(): void {
  cached = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 지울 수 없으면 캐시만 비운다
  }
}
