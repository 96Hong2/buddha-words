/**
 * 광고가 화면에 떠 있다는 표. **앱이 죽어도 남는다.**
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────
 *
 * 직접 눌러서 하는 광고가 멈춰서 닫기 X 도 안 먹는 일이 있다(2026-09-25 신고). 그 광고를
 * 닫는 길은 우리에게 없다. 토스 앱이 띄운 화면이고 SDK 에 닫는 함수가 없다. 그래서 우리가
 * 할 수 있는 일은 **얼마나 자주 나는지 세는 것**뿐인데, 그마저도 못 세고 있었다.
 *
 * 갇힌 사람은 앱을 끄고 나간다. 우리 쪽 시간 제한(`FULL_SCREEN_SHOW_TIMEOUT_MS`, 90초)이
 * `show_timeout` 을 찍기 전에 웹뷰가 죽으므로 **그 판은 로그를 한 줄도 안 남긴다.**
 * 가장 나쁜 결말이 통계에서 통째로 빠져 있었다.
 *
 * 그래서 순서를 뒤집는다: 광고가 뜨는 순간 미리 적어 두고, 끝나면 지운다. 다음에 앱을
 * 열었을 때 표가 남아 있으면 지난번이 그 판이다.
 *
 * ── 제한을 시간 제한으로 대신하지 않은 이유 ────────────────────────────
 *
 * 90초를 짧게 줄이면 로그는 남지만 두 가지를 잃는다. 정상적으로 광고를 보던 사람을
 * 중간에 끊게 되고(직접 조작하는 광고는 사람이 원하는 만큼 길어진다), 그렇게 끊긴 판과
 * 진짜 고장 난 판이 같은 이벤트로 섞여 **근거로 쓸 수 없는 수**가 된다.
 */

import type { KeyValueStore } from '../toss';

const KEY = 'ad-on-screen';

/**
 * 광고가 떴다고 적는다. 실패해도 조용히 넘어간다.
 *
 * 이 표가 없다고 광고를 막으면 안 된다. 계측 하나 때문에 사람이 하려던 일이 멈추는 것이
 * 훨씬 나쁘다.
 */
export async function markAdOnScreen(store: KeyValueStore, placement: string): Promise<void> {
  try {
    await store.set(KEY, placement);
  } catch {
    // 저장소가 막힌 기기다. 그 판은 못 세는 것으로 둔다
  }
}

/** 광고가 정상적으로 끝났다. 표를 지운다 */
export async function clearAdOnScreen(store: KeyValueStore): Promise<void> {
  try {
    await store.remove(KEY);
  } catch {
    /*
      ⚠ 여기서 실패한 표는 다음 실행에 남아 **멀쩡히 끝난 광고가 갇힘으로 잡힌다.**
      지울 수 없는 저장소는 적을 수도 없어서 애초에 표가 안 남는 쪽이 보통이다.
      둘 중 하나만 되는 기기가 있다면 그 수는 부풀지만, 광고를 막는 것보다는 낫다.
    */
  }
}

/**
 * 지난번에 광고가 뜬 채로 끝났나. 그랬으면 그 자리 이름을, 아니면 null 을 준다.
 *
 * **읽으면서 지운다.** 남겨 두면 다음 실행에서 또 찍혀 한 번의 사고가 여러 번으로 센다.
 */
export async function takeStuckAd(store: KeyValueStore): Promise<string | null> {
  try {
    const placement = await store.get(KEY);
    if (placement == null || placement === '') return null;
    await store.remove(KEY);
    return placement;
  } catch {
    return null;
  }
}
