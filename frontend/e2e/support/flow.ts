/**
 * 화면을 걸어 다니는 공통 걸음.
 *
 * 홈에서 답변까지 가는 길은 어느 스펙이든 똑같다. 스펙마다 다시 적으면 진입 카드가 뜨는
 * 조건이 바뀔 때 한 군데만 고쳐지고 나머지가 조용히 어긋난다.
 */

import { expect, type Page } from '@playwright/test';

/** 팀장·동료 이야기. 세 줄이라 deep 으로 간다 */
export const DEEP_CONCERN = [
  '요즘 회사에서 팀장님이 제 의견을 계속 무시하세요.',
  '동료들 앞에서 제가 낸 안을 다른 사람 것처럼 말한 적도 있어요.',
  '그만둘까 고민이에요. 그런데 지금 나가면 다음이 없을 것 같아 무섭기도 해요.',
].join('\n');

/** 한 줄짜리 고민. 길이가 짧아 보통(normal) 답변으로 간다 */
export const NORMAL_CONCERN = '남편이 요즘 저를 피하는 것 같아요. 이야기를 꺼내야 할지 모르겠어요.';

/**
 * 하루 첫 진입 카드를 치운다.
 *
 * 카드는 오늘의 한마디 조회가 끝난 뒤에 뜬다. 뜨기 전에 지나치면 뒤늦게 올라온 딤이
 * 홈의 모든 터치를 가로챈다. 하루 첫 진입이 아니면 안 뜨므로 짧게만 기다린다.
 */
export async function dismissEntry(page: Page): Promise<void> {
  const card = page.getByTestId('entry-card');
  await card.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  if (await card.isVisible().catch(() => false)) {
    await page.getByTestId('entry-card-cta').click();
    await expect(card).toBeHidden();
  }
}

/**
 * 「쓰시던 이야기가 남아 있어요」 카드를 치운다.
 *
 * 답을 받고 홈으로 돌아왔는데 보낸 글이 입력칸에 그대로 있으면 한 번 묻는다. 새 이야기를
 * 쓰러 온 길에서는 지우는 쪽이다. 안 떠 있으면 아무 일도 하지 않는다.
 */
export async function dismissDraftConfirm(page: Page, choice: 'clear' | 'keep' = 'clear'): Promise<void> {
  const card = page.getByTestId('draft-confirm');
  if (!(await card.isVisible({ timeout: 1000 }).catch(() => false))) return;
  await page.getByTestId(choice === 'clear' ? 'draft-confirm-clear' : 'draft-confirm-keep').click();
  await expect(card).toHaveCount(0);
}

/** 하단 고정 바는 마지막 한마디까지 읽어야 올라온다 */
export async function revealBottomBar(page: Page): Promise<void> {
  await page.getByTestId('closing').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('bottom-bar')).toBeVisible();
}

export interface AskOptions {
  /** 2차 패스까지 기다린다. 기본은 기다린다 */
  waitPass2?: boolean;
}

/** 고민 하나를 보내 답변 화면까지 간다. 같은 날 두 번째부터는 이어가기 시트를 거친다 */
export async function askOnce(
  page: Page,
  text = DEEP_CONCERN,
  { waitPass2 = true }: AskOptions = {},
): Promise<void> {
  await dismissEntry(page);
  // 답을 받고 돌아온 길이면 쓰던 글을 지울지 먼저 묻는다. 새 이야기를 쓰러 왔으니 지운다
  await dismissDraftConfirm(page);
  await page.getByTestId('concern-field').fill(text);
  await page.getByTestId('submit').click();

  const sheet = page.getByTestId('continue-sheet');
  await sheet.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
  if (await sheet.isVisible().catch(() => false)) {
    await page.getByTestId('continue-watch').click();
  }

  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  if (waitPass2) await expect(page.getByTestId('analysis')).toBeVisible({ timeout: 20_000 });
}

/** 오늘(사용자 시간대) 날짜를 YYYY-MM-DD 로. 기기가 보는 날짜와 같아야 한다 */
export function todayISO(offsetDays = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * 답을 한 번도 받아 본 적 없는 사람으로 시작한다.
 *
 * 기본 출발점은 「이미 여러 번 받아 본 사람」이다(`support/storage.ts`). 첫 답에만
 * 달라지는 것 둘(광고 면제 · 권유 카드)을 재는 spec 만 이걸 부른다.
 *
 * 표를 지우는 것만으로는 모자라다. 픽스처의 씨앗은 **화면을 옮길 때마다 다시 도므로**,
 * 다음 goto 에서 횟수가 도로 9 가 된다. 그래서 sessionStorage 에 표를 세워 씨앗 쪽이
 * 그 표를 보고 건너뛰게 한다. 표는 탭이 사는 동안 남으므로 답을 받은 횟수는 쌓인다.
 */
export async function asNewcomer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('e2e.newcomer', '1');
      if (sessionStorage.getItem('e2e.newcomer.cleared') != null) return;
      sessionStorage.setItem('e2e.newcomer.cleared', '1');
      localStorage.removeItem('buddha.milestones.v2');
      localStorage.removeItem('buddha.milestones.v1');
    } catch {
      /* 지울 수 없으면 그 spec 이 실패로 알려 준다 */
    }
  });
}

/**
 * 화면 위로 올라온 권유 카드를 치운다.
 *
 * 답을 받고 나면 몇 번째냐에 따라 홈 추가·앱 알리기·알림 중 하나가 화면에 붙어 올라온다.
 * 덮개는 없지만 답변 아래쪽을 가리므로, 그 자리를 보는 스펙은 먼저 치우고 시작한다.
 * 안 떠 있으면 아무 일도 하지 않는다.
 */
export async function dismissNudge(page: Page): Promise<void> {
  const close = page.getByTestId('nudge-close');
  if (await close.isVisible({ timeout: 1000 }).catch(() => false)) {
    await close.click();
    await expect(close).toHaveCount(0);
  }
}

/**
 * 간직하기 한 번.
 *
 * 누르는 곳이 셋이 됐다. 간직 앞에 짧은 광고 시트가 서고(광고를 못 띄우는 판과 첫 답에는
 * 안 선다), 담기고 나면 「보관함 보러 가기 / 계속 보기」 시트가 뜬다. 여기서는 읽던 답에
 * 남는 쪽을 고른다. 갈래를 스펙마다 적으면 광고를 켜고 끌 때마다 같은 곳을 여러 번 고친다.
 *
 * **게이트나 완료 시트 자체를 보는 스펙은 이 함수를 쓰지 않는다.** 그쪽은 시트가 뜨는 것이
 * 확인 대상이라 직접 누른다.
 */
export async function saveAnswerFromScreen(page: Page): Promise<void> {
  await dismissNudge(page);
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();

  const gate = page.getByTestId('save-gate');
  // 광고를 못 띄우는 판과 첫 답에서는 시트 없이 곧바로 담긴다. 잠깐 기다렸다 없으면 지나간다
  if (await gate.isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.getByTestId('save-gate-watch').click();
    await expect(gate).toBeHidden();
  }

  // 담기면 반드시 뜬다. 안 뜨면 담기지 않은 것이므로 여기서 실패해야 한다
  const doneSheet = page.getByTestId('save-done');
  await expect(doneSheet).toBeVisible();
  await page.getByTestId('save-done-stay').click();
  await expect(doneSheet).toHaveCount(0);
}
