/**
 * 광고를 놓는 자리. 넷이다.
 *
 * 고민 작성 중 · 위기 · 위로 · 진입 카드 · INVALID 에는 광고가 없다.
 * 자리를 늘리려면 `docs/plan/00-통합-개발-계획.md` 1.6 절을 먼저 고친다.
 *
 * ── 왜 `generation` 과 `save` 가 늘었나 ──────────────────────────────
 *
 * 둘 다 **사람이 이미 기다리거나 멈춰 서는 자리**다. 답을 만드는 20초는 원래 비어 있었고,
 * 간직하기는 누른 뒤 곧바로 끝나 다음 화면이 없다. 그 두 곳에 놓으면 광고가 흐름을
 * 끊는 대신 빈 시간을 메운다. 읽는 도중이나 쓰는 도중에는 여전히 광고가 없다.
 */

export const AD_PLACEMENT = {
  /** 답을 만드는 동안. 요청은 뒤에서 이미 돌고 있고 광고가 그 시간을 덮는다 */
  generation: 'generation',
  /** 답변 7블록 아래. 다른 경전 하나 · 다른 관점 하나 · 행동 하나 */
  extension: 'extension',
  /** 같은 날 두 번째 고민. 이야기 이어가기 */
  continue: 'continue',
  /** 보관함에 간직하기 */
  save: 'save',
} as const;

export type AdPlacement = (typeof AD_PLACEMENT)[keyof typeof AD_PLACEMENT];

/**
 * 개발에서 쓰는 공식 테스트 보상형 광고 그룹.
 *
 * ⚠ **운영 번들에는 이 문자열이 실리면 안 된다.** 콘솔 검토는 앱을 돌려 보지 않고 번들 안을
 * 훑어서, 테스트 광고 id 가 나오면 반려한다. 1호 제품이 실제로 이것으로 반려됐다(2026-09-16).
 * 실행할 때 갈라서는 늦다. 그 판은 운영에서 안 타는 가지여도 문자열이 번들에 남는다.
 *
 * `import.meta.env.DEV` 는 vite 가 빌드 때 `false` 로 갈아 끼우므로 이 가지가 통째로 지워진다.
 * 그래서 이 비교는 변수로 빼지 않고 여기서 직접 적는다.
 */
const TEST_GROUP = import.meta.env.DEV ? 'ait-ad-test-rewarded-id' : null;

/** 빌드 때 넣는 환경변수 이름. 값은 `frontend/.env.example` 을 본다 */
export const AD_GROUP_ENV: Record<AdPlacement, string> = {
  generation: 'VITE_AD_GROUP_GENERATION',
  extension: 'VITE_AD_GROUP_EXTENSION',
  continue: 'VITE_AD_GROUP_CONTINUE',
  save: 'VITE_AD_GROUP_SAVE',
};

/** 자리마다 따로 안 줬을 때 넷이 함께 쓰는 그룹 */
export const AD_GROUP_FALLBACK_ENV = 'VITE_AD_GROUP_DEFAULT';

function trimmed(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

/**
 * 이 자리에 띄울 광고 그룹 id. 없으면 null 이고, 그러면 화면이 광고 없이 지나간다.
 *
 * **레포가 public 이라 실제 id 를 코드에 적지 않는다.** 빌드할 때 환경변수로만 준다.
 * 콘솔이 발급하기 전까지는 운영 번들에도 값이 없고, 그 동안은 광고를 본 사람이 0 명이다.
 * 그 상태로 수익 로그를 읽으면 안 된다.
 *
 * 자리마다 그룹을 따로 두면 어느 자리가 버는지 콘솔에서 바로 갈리지만, 넷을 다 만들어야
 * 쓸 수 있으면 하나만 발급된 동안 나머지 셋이 통째로 죽는다. 그래서 자리 전용 값이 없으면
 * 공용 그룹으로 떨어진다. 자리별 수익은 그때 `placement` 를 실은 우리 로그로 가른다.
 *
 * `import.meta.env.VITE_...` 는 vite 가 빌드 때 값으로 갈아 끼운다. 키를 변수로 꺼내면
 * 그 치환이 안 걸려 운영 빌드에서 값이 사라진다. 그래서 다섯 줄을 여기서 직접 적는다.
 */
export function adGroupId(placement: AdPlacement): string | null {
  const own =
    placement === 'generation'
      ? trimmed(import.meta.env.VITE_AD_GROUP_GENERATION)
      : placement === 'extension'
        ? trimmed(import.meta.env.VITE_AD_GROUP_EXTENSION)
        : placement === 'continue'
          ? trimmed(import.meta.env.VITE_AD_GROUP_CONTINUE)
          : trimmed(import.meta.env.VITE_AD_GROUP_SAVE);
  return own ?? trimmed(import.meta.env.VITE_AD_GROUP_DEFAULT) ?? TEST_GROUP;
}
