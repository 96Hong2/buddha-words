/**
 * 켜고 끄는 스위치 한 곳.
 *
 * **CX 계측 때문에 붙인 화면 요소는 전부 여기로 끌 수 있어야 한다.** 관찰은 많이 하되
 * 사용자에게 묻는 것은 적게 하는 것이 이 앱의 원칙이고, 물어보는 장치는 언제든 꺼야 한다.
 *
 * 값은 빌드 환경변수로 준다. `import.meta.env.VITE_...` 는 vite 가 빌드 때 값으로 갈아
 * 끼우므로 키를 변수로 꺼내면 치환이 안 걸린다. 그래서 여기서만 직접 적는다.
 *
 * 조용히 기본값으로 떨어지지 않게, 아는 값이 아니면 기본값을 쓰고 개발에서는 경고를 남긴다.
 */

function flag(raw: unknown, fallback: boolean): boolean {
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim().toLowerCase();
  if (value === '') return fallback;
  if (value === 'on' || value === 'true' || value === '1') return true;
  if (value === 'off' || value === 'false' || value === '0') return false;
  if (import.meta.env.DEV) console.warn(`[flags] 모르는 값이라 기본값을 쓴다: ${raw}`);
  return fallback;
}

function ratio(raw: unknown, fallback: number): number {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    if (import.meta.env.DEV) console.warn(`[flags] 0~1 이 아니라 기본값을 쓴다: ${raw}`);
    return fallback;
  }
  return value;
}

/** 온보딩을 어떻게 띄울지. `none` 은 안 띄우고 바로 입력으로 간다(B안) */
export type OnboardingVariant = 'two_step' | 'none';

function onboardingVariant(): OnboardingVariant {
  const raw = import.meta.env.VITE_ONBOARDING;
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value === 'none' || value === 'off') return 'none';
  return 'two_step';
}

export const FLAGS = {
  /**
   * 첫 실행 온보딩. 두 장을 넘기면 바로 입력 화면이다.
   *
   * 별도 실험 플랫폼이 없어 A/B 는 빌드 플래그로만 가른다. 기본값은 2단계다.
   * 판단 기준은 `concern_submit / app_open` · TTFV · D1 셋이다.
   */
  onboarding: onboardingVariant(),

  /** 답변 끝 👍👎. 누르지 않아도 되는 자리다 */
  answerFeedback: flag(import.meta.env.VITE_FLAG_ANSWER_FEEDBACK, true),

  /**
   * 👎 를 누른 사람에게 이유를 한 번 묻는다. **매번 묻지 않는다.**
   * 표본만 물어보고, 그 사람에게는 앱을 쓰는 동안 한 번만 뜬다.
   */
  negativeReasonSampling: ratio(import.meta.env.VITE_NEGATIVE_REASON_SAMPLING, 0.2),

  /** 「오늘 이것만 해볼게요」. 체크리스트를 만들지 않는다. 눌렀다는 사실만 남긴다 */
  actionCommit: flag(import.meta.env.VITE_FLAG_ACTION_COMMIT, true),

  /**
   * 답변 끝의 알림 권유. 기본은 꺼 둔다.
   *
   * 콘솔 스마트발송 템플릿 코드가 없으면 실기기에서 동의 화면 자체가 뜨지 않는다.
   * 코드가 준비되고 나서 켠다.
   */
  notificationPrompt: flag(import.meta.env.VITE_FLAG_NOTIFICATION_PROMPT, false),
} as const;

/**
 * 이 사람에게 표본 질문을 띄울까.
 *
 * 무작위로 뽑되 **한 번 뽑히면 그 값을 기억한다.** 매번 새로 뽑으면 같은 사람이 답할 때마다
 * 갈려서 「20%」가 사람 기준이 아니라 질문 기준이 된다.
 */
let sampled: boolean | null = null;

export function inNegativeReasonSample(): boolean {
  sampled ??= Math.random() < FLAGS.negativeReasonSampling;
  return sampled;
}

/** 테스트가 표본 판정을 고정할 때 쓴다 */
export function setNegativeReasonSample(value: boolean | null): void {
  sampled = value;
}
