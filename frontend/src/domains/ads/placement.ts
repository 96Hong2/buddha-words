/**
 * 광고를 놓는 자리. 넷이다.
 *
 * 고민 작성 중 · 위기 · 위로 · 진입 카드 · INVALID 에는 광고가 없다.
 * 자리를 늘리려면 `docs/plan/00-통합-개발-계획.md` 1.6 절을 먼저 고친다.
 *
 * ── **네 자리 모두 사람이 버튼을 눌러야 뜬다** ─────────────────────────
 *
 * 다섯째 자리였던 `generation`(답을 만드는 동안 저절로 덮던 광고)은 없앴다. 실기기에서
 * 「이야기 보내기」만 눌렀는데 광고가 튀어나왔고, 그 광고를 다 본 사람에게 이어가기 시트가
 * **광고를 한 번 더** 청했다. 누르지 않은 광고는 심사에서도 걸리고 사람도 잃는다.
 *
 * 답을 만드는 시간은 여전히 비어 있다. 그 자리를 광고로 덮는 판을 만들었다가 되돌렸다:
 * 광고를 안 본 사람에게도 답이 나가는 구조가 되어 보상형 규칙에 어긋났다.
 */

export const AD_PLACEMENT = {
  /** 답변 7블록 아래. 다른 경전 하나 · 다른 관점 하나 · 행동 하나 */
  extension: 'extension',
  /** 같은 날 두 번째 고민. 끝까지 본 사람만 이어간다 */
  continue: 'continue',
  /** 보관함에 간직하기 */
  save: 'save',
  /**
   * 연꽃 모으기. **하려던 일이 없을 때 스스로 여는 자리다.**
   *
   * 앞의 셋은 무언가를 하려는 길목에 선다. 이 자리만 다르다: 사람이 한가할 때 미리 보고
   * 연꽃을 쌓아 두면, 정작 답을 기다릴 때는 광고를 안 봐도 된다. 낼 값은 같고 내는
   * 시점만 사람이 고른다.
   */
  collect: 'collect',
} as const;

export type AdPlacement = (typeof AD_PLACEMENT)[keyof typeof AD_PLACEMENT];

/**
 * 길목 셋(`extension` · `continue` · `save`)에 서는 광고. **짧은 전면형이다.**
 *
 * ── 왜 보상형 30초를 길목에서 내렸나 ────────────────────────────────────
 *
 * 한때 네 자리가 다 보상형 30초였다. 사용자가 실기기에서 겪고 「30초 광고는 너무 긴 것
 * 같다」고 했다(2026-09-24). 답을 받으려던 사람 앞에 30초가 서면, 그 30초는 언제나 방해다.
 *
 * 2026-09-20 에도 같은 이유로 이어가기 하나를 전면형으로 바꿨다가 같은 날 되돌렸다.
 * 되돌린 이유는 **광고를 볼 이유가 함께 사라진다**는 것이었다: 닫아도 답이 나오면 사람은
 * 뜨자마자 닫고, 노출은 남아도 시청이 없다.
 *
 * **이번에는 그 이유를 다른 자리로 옮긴다.** 연꽃(`collect`)이 그 자리다. 길목에서는 짧은
 * 광고로 지나가고, 30초를 참을 뜻이 있는 사람은 연꽃 모으기에서 한 편에 두 송이를 받는다.
 * 그때 되돌린 판에는 연꽃이 아예 없었다. 그래서 전면형이 곧 「볼 이유 없음」이었다.
 *
 * 되돌릴 통로를 남긴다. `VITE_AD_GATE_KIND=rewarded` 를 주면 길목 셋이 보상형으로 돌아간다.
 * 지우면 비교하려 할 때 다시 만들어야 한다.
 */
type AdKind = 'rewarded' | 'interstitial';

function gateKind(): AdKind {
  const raw = import.meta.env.VITE_AD_GATE_KIND;
  return typeof raw === 'string' && raw.trim() === 'rewarded' ? 'rewarded' : 'interstitial';
}

const GATE_KIND = gateKind();

/**
 * 자리마다 광고 종류.
 *
 * 연꽃 모으기만 언제나 보상형이다. 끝까지 본 사람에게만 주므로 보상 이벤트가 있어야 한다.
 * 전면형에는 그 이벤트가 없다.
 */
export const AD_KIND: Record<AdPlacement, AdKind> = {
  extension: GATE_KIND,
  continue: GATE_KIND,
  save: GATE_KIND,
  collect: 'rewarded',
};

export function adIsRewarded(placement: AdPlacement): boolean {
  return AD_KIND[placement] === 'rewarded';
}

/**
 * 버튼에서 「광고」 배지 **앞**에 서는 말.
 *
 * 보상형은 끝까지 봐야 하므로 얼마나 참아야 하는지 적는다(실기기 실측 30초). 전면형은
 * 길이가 문서에 없어 적지 않는다. **근거 없는 수치를 화면이 말하게 두지 않는다.**
 */
export function adLead(placement: AdPlacement): string | undefined {
  return adIsRewarded(placement) ? '30초' : undefined;
}

/**
 * 보상형 광고 한 편에 주는 연꽃.
 *
 * 연꽃 한 송이가 길목 한 번이다. 그래서 이 값이 곧 **교환비**다: 30초 한 편이 짧은 광고
 * 두 편을 대신한다.
 *
 * 왜 둘인가. 토스 공식 가이드의 단가 등급이 보상형 「가장 높음」, 전면형 「중간」이다.
 * 두 배 안쪽으로 보는 것이 안전하다. 셋으로 올리면 사람이 길목 광고를 아예 안 보게 되어
 * **노출 횟수 자체가 준다.** 버는 것은 단가가 아니라 노출 × 단가다.
 */
export const LEAVES_PER_REWARDED_AD = 2;

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
  collect: 'VITE_AD_GROUP_COLLECT',
};

/**
 * 전면형 자리가 함께 쓰는 그룹. **보상형 그룹과 이름을 따로 둔다.**
 *
 * 한 이름에 두 종류를 담으면, 종류가 어긋난 그룹으로 광고를 부르게 된다. 콘솔이 발급한
 * 그룹 하나에는 종류가 박혀 있고 그것을 코드가 고를 수 없다.
 */
export const AD_GROUP_INTERSTITIAL_ENV = 'VITE_AD_GROUP_INTERSTITIAL';

/** 자리마다 따로 안 줬을 때 보상형 자리가 함께 쓰는 그룹 */
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
 * 쓸 수 있으면 하나만 발급된 동안 나머지가 통째로 죽는다. 그래서 자리 전용 값이 없으면
 * 공용 그룹으로 떨어진다. 자리별 수익은 그때 `placement` 를 실은 우리 로그로 가른다.
 *
 * `import.meta.env.VITE_...` 는 vite 가 빌드 때 값으로 갈아 끼운다. 키를 변수로 꺼내면
 * 그 치환이 안 걸려 운영 빌드에서 값이 사라진다. 그래서 줄마다 여기서 직접 적는다.
 */
export function adGroupId(placement: AdPlacement): string | null {
  /*
    전면형 자리는 전면형 그룹만 쓴다. 보상형 공용 그룹으로 떨어지면 종류가 어긋나
    광고가 아예 안 뜨거나 30초짜리가 나온다. 값이 없으면 광고 없이 지나가고
    `ad_skipped(reason='no_group')` 으로 남는다. 번들 검사가 그 빌드를 막는다.
  */
  if (AD_KIND[placement] === 'interstitial') {
    return trimmed(import.meta.env.VITE_AD_GROUP_INTERSTITIAL) ?? TEST_INTERSTITIAL;
  }

  // 보상형 자리는 모양이 같다. 자리 전용 값이 없으면 공용 그룹으로 간다
  const own =
    placement === 'extension'
      ? trimmed(import.meta.env.VITE_AD_GROUP_EXTENSION)
      : placement === 'continue'
        ? trimmed(import.meta.env.VITE_AD_GROUP_CONTINUE)
        : placement === 'collect'
          ? trimmed(import.meta.env.VITE_AD_GROUP_COLLECT)
          : trimmed(import.meta.env.VITE_AD_GROUP_SAVE);
  return own ?? trimmed(import.meta.env.VITE_AD_GROUP_DEFAULT) ?? TEST_REWARDED;
}
