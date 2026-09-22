/**
 * 무료는 **사람마다 한 번**이다. 하루에 한 번이 아니다.
 *
 * 2026-09-22 에 좁혔다. 날마다 한 번씩 열리니 연꽃도 광고도 없이 답을 받는 날이 매일
 * 있었고, 실기기에서 「연꽃이 없는데도 답변을 받는다」는 말이 나왔다.
 *
 * 기기 사본은 `buddha.quota.v1` 이다. 날짜 칸(`day`)이 바뀌면 이어간 수와 LIGHT 는
 * 비워지지만 `firstUsed` 만 남는다. 여기서 재는 것이 정확히 그 한 줄이다.
 * (서버 쪽 같은 규칙은 `backend/tests/test_answer_contract.py` 의 free_once 두 건)
 */

import { test, expect, type Page } from '../support/fixtures';
import { asNewcomer, dismissEntry, todayISO, NORMAL_CONCERN } from '../support/flow';

const QUOTA_KEY = 'buddha.quota.v1';

/** 기기 사본을 직접 심는다. 어제 첫 이야기를 쓴 사람으로 만든다 */
async function seedQuota(page: Page, value: Record<string, unknown>) {
  await page.addInitScript(
    ([key, json]) => {
      try {
        localStorage.setItem(key, json);
      } catch {
        /* 못 심으면 아래 단언이 실패로 알려 준다 */
      }
    },
    [QUOTA_KEY, JSON.stringify(value)] as const,
  );
}

test('어제 첫 이야기를 썼으면 오늘은 광고 문이 선다', async ({ page }) => {
  await asNewcomer(page);
  await seedQuota(page, {
    day: todayISO(-1),
    firstUsed: true,
    continuesUsed: 3,
    lightUsed: 0,
  });

  await page.goto('/');
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(NORMAL_CONCERN);
  await page.getByTestId('submit').click();

  // 자정이 지났다고 무료가 되살아나지 않는다
  await expect(page.getByTestId('continue-sheet')).toBeVisible();
  await expect(page.getByTestId('answer')).toHaveCount(0);

  // 광고를 보고 이어간다. 그때 기기 사본이 오늘 날짜로 다시 쓰인다
  await page.getByTestId('continue-watch').click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });

  const saved = await page.evaluate((key) => localStorage.getItem(key), QUOTA_KEY);
  const state = JSON.parse(saved ?? '{}') as {
    day: string;
    firstUsed: boolean;
    continuesUsed: number;
  };
  // 무료 칸은 날짜를 넘어 남고, 이어간 수는 오늘 것부터 다시 센다(어제 3 → 오늘 1)
  expect(state.firstUsed).toBe(true);
  expect(state.day).toBe(todayISO());
  expect(state.continuesUsed).toBe(1);
});

test('한 번도 안 써 본 사람에게는 첫 이야기가 그냥 나간다', async ({ page }) => {
  await asNewcomer(page);
  await seedQuota(page, { day: todayISO(), firstUsed: false, continuesUsed: 0, lightUsed: 0 });

  await page.goto('/');
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(NORMAL_CONCERN);
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('continue-sheet')).toHaveCount(0);
});
