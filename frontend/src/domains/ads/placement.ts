/**
 * 광고를 놓는 자리. 셋이다.
 *
 * 고민 작성 중 · 위기 · 위로 · 진입 카드 · INVALID 에는 광고가 없다.
 * 자리를 늘리려면 `docs/plan/00-통합-개발-계획.md` 1.6 절을 먼저 고친다.
 *
 * ── **세 자리 모두 사람이 버튼을 눌러야 뜬다** ─────────────────────────
 *
 * 넷째 자리였던 `generation`(답을 만드는 동안 저절로 덮던 광고)은 없앴다. 실기기에서
 * 「이야기 보내기」만 눌렀는데 광고가 튀어나왔고, 그 광고를 다 본 사람에게 이어가기 시트가
 * **광고를 한 번 더** 청했다. 누르지 않은 광고는 심사에서도 걸리고 사람도 잃는다.
 *
 * 답을 만드는 시간은 여전히 비어 있지만, 그 자리는 이제 이어가기 시트가 덮는다.
 * 사람이 「답변 받기(광고)」를 누르면 광고가 떠 있는 동안 답이 만들어진다.
 */

export const AD_PLACEMENT = {
  /** 답변 7블록 아래. 다른 경전 하나 · 다른 관점 하나 · 행동 하나 */
  extension: 'extension',
  /** 같은 날 두 번째 고민. 광고가 도는 동안 답을 만든다 */
  continue: 'continue',
  /** 보관함에 간직하기 */
  save: 'save',
} as const;

export type AdPlacement = (typeof AD_PLACEMENT)[keyof typeof AD_PLACEMENT];

/**
 * 자리마다 광고 종류. **이어가기만 전면형이다.**
 *
 * 실기기에서 보상형 30초가 너무 길었다. 그래서 짧은 전면형으로 바꾸고 **답을 광고와 떼었다.**
 * 광고를 곧바로 닫아도 답은 나온다. 앱인토스 정책은 「광고 소비를 보상과 직접 연결하는 구조」를
 * 금지하고, 광고를 봐야 무언가를 주는 구조는 보상형(`userEarnedReward` 때만 지급)에만 허용된다.
 * 전면형을 쓰면서 답을 광고 시청에 묶으면 그 규칙을 피해 간 것으로 읽힌다.
 *
 * 간직하기 · 다른 관점은 끝까지 본 사람에게만 주므로 보상형 그대로 둔다.
 * 이어가기 그룹이 공용(보상형)으로 떨어지지 않는 것도 같은 이유다.
 */
export const AD_KIND: Record<AdPlacement, 'rewarded' | 'interstitial'> = {
  extension: 'rewarded',
  continue: 'interstitial',
  save: 'rewarded',
};

/**
 * 개발에서 쓰는 공식 테스트 광고 그룹. 종류마다 하나다.
 *
 * ⚠ **운영 번들에는 이 문자열이 실리면 안 된다.** 콘솔 검토는 앱을 돌려 보지 않고 번들 안을
 * 훑어서, 테스트 광고 id 가 나오면 반려한다. 1호 제품이 실제로 이것으로 반려됐다(2026-09-16).
 * 실행할 때 갈라서는 늦다. 그 판은 운영에서 안 타는 가지여도 문자열이 번들에 남는다.
 *
 * `import.meta.env.DEV` 는 vite 가 빌드 때 `false` 로 갈아 끼우므로 이 가지가 통째로 지워진다.
 * 그래서 이 비교는 변수로 빼지 않고 여기서 직접 적는다.
 */
const TEST_REWARDED = import.meta.env.DEV ? 'ait-ad-test-rewarded-id' : null;
const TEST_INTERSTITIAL = import.meta.env.DEV ? 'ait-ad-test-interstitial-id' : null;

/** 빌드 때 넣는 환경변수 이름. 값은 `frontend/.env.example` 을 본다 */
export const AD_GROUP_ENV: Record<AdPlacement, string> = {
  extension: 'VITE_AD_GROUP_EXTENSION',
  continue: 'VITE_AD_GROUP_CONTINUE',
  save: 'VITE_AD_GROUP_SAVE',
};

/** 자리마다 따로 안 줬을 때 보상형 자리가 함께 쓰는 그룹. 이어가기는 여기로 떨어지지 않는다 */
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
 * 자리마다 그룹을 따로 두면 어느 자리가 버는지 콘솔에서 바로 갈리지만, 셋을 다 만들어야
 * 쓸 수 있으면 하나만 발급된 동안 나머지 둘이 통째로 죽는다. 그래서 자리 전용 값이 없으면
 * 공용 그룹으로 떨어진다(보상형 자리만). 자리별 수익은 그때 `placement` 를 실은 우리 로그로 가른다.
 *
 * `import.meta.env.VITE_...` 는 vite 가 빌드 때 값으로 갈아 끼운다. 키를 변수로 꺼내면
 * 그 치환이 안 걸려 운영 빌드에서 값이 사라진다. 그래서 네 줄을 여기서 직접 적는다.
 */
export function adGroupId(placement: AdPlacement): string | null {
  /*
    이어가기는 공용 그룹으로 떨어지지 않는다. 공용 그룹은 보상형이라, 거기로 떨어지면
    끝까지 안 본 사람에게 답을 주는 보상형 광고가 된다. 값이 없으면 광고 없이 지나가고
    `ad_skipped(reason='no_group')` 으로 남는다. 번들 검사가 그 빌드를 막는다.
  */
  if (placement === 'continue') {
    return trimmed(import.meta.env.VITE_AD_GROUP_CONTINUE) ?? TEST_INTERSTITIAL;
  }
  const own =
    placement === 'extension'
      ? trimmed(import.meta.env.VITE_AD_GROUP_EXTENSION)
      : trimmed(import.meta.env.VITE_AD_GROUP_SAVE);
  return own ?? trimmed(import.meta.env.VITE_AD_GROUP_DEFAULT) ?? TEST_REWARDED;
}
