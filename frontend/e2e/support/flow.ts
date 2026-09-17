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
 * 간직하기 한 번.
 *
 * 간직 앞에 짧은 광고가 서면서 누르는 곳이 둘이 됐다. 시트가 뜨면 「보고 간직하기」까지
 * 눌러 주고, 광고를 못 띄우는 판이면 시트 없이 바로 끝난다. 두 갈래를 스펙마다 적으면
 * 광고를 켜고 끌 때마다 같은 곳을 여러 번 고치게 된다.
 *
 * **게이트 자체를 보는 스펙은 이 함수를 쓰지 않는다.** 그쪽은 시트가 뜨는 것이 확인 대상이라
 * 직접 누른다.
 */
export async function saveAnswerFromScreen(page: Page): Promise<void> {
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();

  const gate = page.getByTestId('save-gate');
  // 광고를 못 띄우는 판에서는 시트 없이 곧바로 담긴다. 잠깐 기다렸다 없으면 지나간다
  if (await gate.isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.getByTestId('save-gate-watch').click();
    await expect(gate).toBeHidden();
  }
}
