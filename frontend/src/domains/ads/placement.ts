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
 * 이어가기 자리를 어떤 광고로 돌리나. **기본은 보상형이다.**
 *
 * 공식 문서가 보상형의 대표 쓰임으로 「이어하기」를 든다. 조건은 하나, `userEarnedReward`
 * 가 왔을 때만 주는 것이다. 정책이 막는 「광고 소비를 보상과 직접 연결」은 **누르면 즉시
 * 보상** 같은 부당한 연결이지, 끝까지 본 사람에게 주는 정식 보상형 구조가 아니다.
 *
 * 한때 이 자리를 전면형으로 바꿨다. 30초가 길다는 실기기 반응 때문이었는데, 전면형에는
 * 보상 이벤트가 없어 답을 광고와 떼어 놓아야 했고 그만큼 광고를 볼 이유도 사라졌다.
 * 단가도 전면형이 「중간」, 보상형이 「가장 높음」이다. 그래서 보상형으로 되돌린다.
 *
 * **전면형은 버리지 않고 스위치로 남긴다.** 콘솔에 전면형 그룹을 등록해 두고, 이 값만
 * 바꿔 빌드하면 자리 하나가 통째로 전면형으로 돈다. 어느 쪽이 나은지는 지표로 가른다.
 */
type AdKind = 'rewarded' | 'interstitial';

function continueKind(): AdKind {
  const raw = import.meta.env.VITE_AD_CONTINUE_KIND;
  return typeof raw === 'string' && raw.trim() === 'interstitial' ? 'interstitial' : 'rewarded';
}

/**
 * 자리마다 광고 종류.
 *
 * 간직하기 · 다른 관점은 끝까지 본 사람에게만 주므로 언제나 보상형이다.
 * 이어가기만 빌드 환경변수로 갈린다.
 */
export const AD_KIND: Record<AdPlacement, AdKind> = {
  extension: 'rewarded',
  continue: continueKind(),
  save: 'rewarded',
  // 끝까지 본 사람에게만 연꽃을 준다. 전면형에는 보상 이벤트가 없어 쓸 수 없다
  collect: 'rewarded',
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
  collect: 'VITE_AD_GROUP_COLLECT',
};

/**
 * 전면형으로 돌릴 때만 쓰는 이어가기 그룹. **이름을 따로 둔다.**
 *
 * 한 이름에 두 종류를 담으면, 보상형 판에서 그 값을 주고도 아무 데도 안 쓰이는 일이 생긴다.
 * 실제로 그럴 뻔했다: 보상형 판에서 `VITE_AD_GROUP_CONTINUE` 만 주고 공용 그룹을 빠뜨리면
 * 이어가기가 광고 없이 지나가는데 번들 검사는 통과했다.
 */
export const AD_GROUP_CONTINUE_INTERSTITIAL_ENV = 'VITE_AD_GROUP_CONTINUE_INTERSTITIAL';

/** 자리마다 따로 안 줬을 때 보상형 자리가 함께 쓰는 그룹. 전면형 판의 이어가기만 예외다 */
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
    전면형으로 돌리는 판만 전용 그룹을 쓴다. 공용 그룹은 보상형이라 거기로 떨어지면 종류가
    어긋난다. 값이 없으면 광고 없이 지나가고 `ad_skipped(reason='no_group')` 으로 남는다.
    번들 검사가 그 빌드를 막는다.
  */
  if (placement === 'continue' && AD_KIND.continue === 'interstitial') {
    return trimmed(import.meta.env.VITE_AD_GROUP_CONTINUE_INTERSTITIAL) ?? TEST_INTERSTITIAL;
  }

  // 보상형 네 자리는 모양이 같다. 자리 전용 값이 없으면 공용 그룹으로 간다
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
