/**
 * 전면 광고 한 편이 **언제 끝나는지** 가르는 표.
 *
 * 화면을 띄우지 않는다. 여기서 재는 것은 순수 함수이고, 그 함수가 틀리면 화면은
 * 「아무 일도 안 일어난다」로 보인다. 그 사고는 실기기에서만 나오고 재현도 어려워서,
 * 배선에서 떼어 내 표로 잰다.
 *
 * ── 왜 만들었나 ─────────────────────────────────────────────────────────
 *
 * 2026-09-24 사용자 신고: 「30초 광고 보고 답변받기」를 눌렀더니 「5초 후 리워드 제공」이
 * 뜨는 광고가 나왔는데 **그대로 멈췄다.** 원인은 둘이 겹친 것이다.
 *
 *   ① 광고가 떴다는 신호를 `show` 하나로만 읽었다. `impression` 부터 주는 조합에서는
 *      닫힘 폴백(`visibilitychange`)이 아예 안 걸린다
 *   ② 광고가 뜨면 불러오기 시간 제한이 풀리는데, **그 뒤로 아무 제한도 없었다.**
 *      끝 신호가 한 번도 안 오면 영원히 기다린다
 *
 * 아래가 ①을 지킨다. ②는 `tossBridge` 가 `FULL_SCREEN_SHOW_TIMEOUT_MS` 로 건다.
 */

import { expect, test } from '@playwright/test';

import {
  adEventResult,
  DISMISS_FALLBACK_MS,
  FULL_SCREEN_LOAD_TIMEOUT_MS,
  FULL_SCREEN_SHOW_TIMEOUT_MS,
  marksAdOnScreen,
} from '../../src/shared/toss/fullScreenAdFlow';
import { clearAdOnScreen, markAdOnScreen, takeStuckAd } from '../../src/shared/lib/stuckAd';

test('광고가 떴다는 신호를 셋 다 받는다', () => {
  /*
    셋 중 무엇이 먼저 오든 뜻은 하나다: 광고가 사람 눈앞에 있다. `show` 하나만 보면
    `impression` 부터 주는 기기에서 닫힘 폴백이 안 걸리고, 그 기기가 `dismissed` 도
    안 주는 버전이면(Android 토스앱 5.255.0) 화면이 영영 멈춘다.
  */
  expect(marksAdOnScreen('show'), 'show 를 못 읽는다').toBe(true);
  expect(marksAdOnScreen('impression'), 'impression 을 못 읽는다').toBe(true);
  expect(marksAdOnScreen('clicked'), 'clicked 를 못 읽는다').toBe(true);
});

test('아직 뜨지도 않은 신호를 떴다고 읽지 않는다', () => {
  // `requested` 는 부탁만 한 것이다. 이때 「떴다」로 읽으면 광고가 뜨기 전에 화면이 넘어간다
  expect(marksAdOnScreen('requested')).toBe(false);
  expect(marksAdOnScreen('loaded')).toBe(false);
  expect(marksAdOnScreen('dismissed')).toBe(false);
});

test('보상은 userEarnedReward 하나에서만 나온다', () => {
  /*
    뜨자마자 닫은 사람에게 보상을 주면 무효 트래픽으로 잡혀 광고 계정이 막힌다.
    떴다 · 노출됐다 · 눌렸다는 보상이 아니다. 이 표가 느슨해지면 그 사고가 조용히 난다.
  */
  expect(adEventResult('userEarnedReward')).toBe('watched');
  for (const type of ['show', 'impression', 'clicked', 'requested']) {
    expect(adEventResult(type), `${type} 를 보상으로 읽는다`).toBeNull();
  }
});

test('닫힘과 못 띄움을 갈라서 돌려준다', () => {
  // 사람이 닫은 것과 광고가 안 온 것은 대책이 다르다. 한 덩어리로 만들면 둘 다 안 보인다
  expect(adEventResult('dismissed')).toBe('dismissed');
  expect(adEventResult('failedToShow')).toBe('noFill');
});

test('광고가 뜬 뒤에도 시간 제한이 있고, 불러오기보다 훨씬 길다', () => {
  /*
    **이 단언이 이번 사고의 핵심이다.** 노출 제한이 없으면(0 이거나 빠지면) 끝 신호가
    안 오는 기기에서 화면이 영영 멈춘다. 불러오기 제한과 같거나 짧으면 30초 광고를
    끝까지 보던 사람을 중간에 끊는다.
  */
  expect(FULL_SCREEN_SHOW_TIMEOUT_MS).toBeGreaterThan(FULL_SCREEN_LOAD_TIMEOUT_MS);
  // 보상형 실측 30초에 끝 화면이 붙는다. 두 배 아래로 내리면 진짜로 보던 사람을 끊는다
  expect(FULL_SCREEN_SHOW_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  // 닫힘 폴백은 화면이 돌아온 뒤 잠깐이다. 길면 닫고 나서 멍하니 기다리게 된다
  expect(DISMISS_FALLBACK_MS).toBeLessThan(FULL_SCREEN_LOAD_TIMEOUT_MS);
});

/*
  ── 광고가 뜬 채로 앱이 끝난 것을 다음 실행에서 센다 ──────────────────────

  2026-09-25 신고: 직접 눌러서 하는 광고가 멈췄고 닫기 X 도 안 먹어 **앱을 껐다.**
  그 광고를 닫는 길은 우리에게 없다(토스 앱이 띄운 화면이고 SDK 에 닫는 함수가 없다).
  우리가 할 수 있는 것은 얼마나 자주 나는지 세는 것뿐인데, 그마저도 못 세고 있었다:
  갇힌 사람은 우리 시간 제한(90초)이 `show_timeout` 을 찍기 전에 앱을 끈다.

  그래서 광고가 뜰 때 미리 적고 끝나면 지운다. 다음 실행에 표가 남아 있으면 그 판이다.

  ⚠ **실제 「앱이 죽었다 다시 열림」은 여기서 못 잰다.** 목 브릿지의 저장소가 메모리라
  다시 열면 함께 사라진다. 그 한 겹은 실기기 확인 항목으로 남는다. 여기서 재는 것은
  표를 적고 지우고 꺼내는 규칙이다.
*/

/** 실기기 저장소를 흉내 낸다. `broken` 이면 모든 호출이 던진다 */
function fakeStore(broken = false) {
  const box = new Map<string, string>();
  return {
    box,
    get: (key: string) =>
      broken ? Promise.reject(new Error('막힘')) : Promise.resolve(box.get(key) ?? null),
    set: (key: string, value: string) => {
      if (broken) return Promise.reject(new Error('막힘'));
      box.set(key, value);
      return Promise.resolve();
    },
    remove: (key: string) => {
      if (broken) return Promise.reject(new Error('막힘'));
      box.delete(key);
      return Promise.resolve();
    },
  };
}

test('정상적으로 끝난 광고는 다음 실행에 표를 안 남긴다', async () => {
  const store = fakeStore();
  await markAdOnScreen(store, 'save');
  await clearAdOnScreen(store);

  expect(await takeStuckAd(store)).toBeNull();
});

test('광고가 뜬 채로 끝나면 그 자리 이름이 다음 실행에 남는다', async () => {
  const store = fakeStore();
  await markAdOnScreen(store, 'extension');
  // `clearAdOnScreen` 이 안 돈다. 앱이 죽어 `finally` 까지 못 간 판이다

  expect(await takeStuckAd(store)).toBe('extension');
});

test('한 번 꺼내면 두 번째는 없다. 한 사고가 여러 번으로 세어지지 않는다', async () => {
  const store = fakeStore();
  await markAdOnScreen(store, 'continue');

  expect(await takeStuckAd(store)).toBe('continue');
  /*
    꺼내면서 지우지 않으면 그 뒤 앱을 열 때마다 계속 찍힌다. 한 사람의 한 번이
    열 번으로 불어나면 이 수로는 아무것도 못 정한다.
  */
  expect(await takeStuckAd(store)).toBeNull();
});

test('저장소가 막힌 기기에서도 광고를 막지 않는다', async () => {
  const broken = fakeStore(true);
  /*
    계측 하나 때문에 사람이 하려던 일이 멈추면 안 된다. 셋 다 던지지 않고 조용히 넘어간다.
    그 기기의 판은 못 세는 것으로 둔다.
  */
  await markAdOnScreen(broken, 'collect');
  await clearAdOnScreen(broken);
  expect(await takeStuckAd(broken)).toBeNull();
});
