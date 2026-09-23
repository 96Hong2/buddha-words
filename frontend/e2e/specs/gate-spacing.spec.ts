/**
 * 광고 문 두 자리의 **빈칸**을 잰다.
 *
 * ── 왜 이걸 재나 ──────────────────────────────────────────────────────
 *
 * 이어가기 시트와 간직 시트는 같은 순서로 서 있다: 주 버튼 → 광고 버튼 → 안내 한 줄 →
 * 연꽃 모으기 카드. 그 「안내 한 줄」은 평소 비어 있는데, 아래 것들이 뛰지 않게 하려고
 * 빈 채로도 한 줄 높이를 잡고 있었다. 간직 시트에는 그 위에 「다음에」 버튼까지 있었다.
 *
 * 그 둘이 겹쳐서, 늘 보이는 화면에 **눌러야 할 것이 하나도 없는 빈칸**이 60px 가까이
 * 섰다. 실기기에서 그대로 보였다(2026-09-23: 「여백이 너무 많아. UI/UX 제대로 고려한
 * 거 맞아?」). 값을 재 두지 않으면 다음 사람이 안내 줄을 하나 더 얹을 때 아무것도 안 걸린다.
 *
 * 재는 것은 문구가 아니라 **픽셀**이다. 같은 자리를 문구로 단언하는 검사는 ad-wording
 * 쪽에 있다. 둘은 서로를 대신하지 못한다.
 */

import { test, expect, type Page } from '../support/fixtures';
import {
  askOnce,
  dismissDraftConfirm,
  dismissEntry,
  dismissNudge,
  revealBottomBar,
  withLeaves,
} from '../support/flow';
import { shot } from '../support/shots';

/**
 * 빈칸의 상한.
 *
 * 두 시트 모두 실측 12px 이다(모으기 카드가 스스로 지는 margin-top). 반올림과 초점
 * 테두리를 감안해 여유를 둔다. 안내 줄이 빈 채로 한 줄을 다시 잡으면(18px + 여백 16)
 * 여기서 걸린다.
 */
const MAX_GAP = 20;

/** 위 것의 아래 모서리부터 아래 것의 윗 모서리까지 */
async function gapBetween(page: Page, above: string, below: string): Promise<number> {
  const top = await page.getByTestId(above).boundingBox();
  const bottom = await page.getByTestId(below).boundingBox();
  if (top === null || bottom === null) throw new Error(`자리를 못 쟀어요: ${above} / ${below}`);
  return bottom.y - (top.y + top.height);
}

test('이어가기 시트: 광고 버튼과 연꽃 모으기 사이에 빈칸이 남지 않는다', async ({ page }) => {
  await withLeaves(page, 0);
  await page.goto('/');
  // 오늘 첫 이야기를 보내고 홈으로 돌아온다. 두 번째부터 광고 문이 선다
  await askOnce(page);
  await dismissNudge(page);
  await page.goBack();
  await dismissEntry(page);
  await dismissDraftConfirm(page);

  await page.getByTestId('concern-field').fill('회사에서 실수를 했는데 계속 생각나요.');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('continue-sheet')).toBeVisible();
  await expect(page.getByTestId('leaf-collect-cta')).toBeVisible();

  const gap = await gapBetween(page, 'continue-watch', 'leaf-collect-cta');
  expect(gap, '광고 버튼과 모으기 카드 사이가 비어 있어요').toBeLessThanOrEqual(MAX_GAP);
  await shot(page, '01 이어가기 시트 - 빈칸을 걷어낸 뒤');
});

test('간직 시트: 「다음에」가 없고 손잡이가 닫기다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await askOnce(page);
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();

  const gate = page.getByTestId('save-gate');
  await expect(gate).toBeVisible();
  await expect(page.getByTestId('leaf-collect-cta')).toBeVisible();

  /*
    나가는 길은 손잡이·바깥·뒤로가기 셋이다. 넷째를 세우면 눌러야 할 버튼 하나가
    둘 중 하나로 보이고, 그 버튼이 차지하던 높이가 그대로 빈칸이 된다.
  */
  await expect(gate.getByText('다음에', { exact: true })).toHaveCount(0);

  const gap = await gapBetween(page, 'save-gate-watch', 'leaf-collect-cta');
  expect(gap, '간직 버튼과 모으기 카드 사이가 비어 있어요').toBeLessThanOrEqual(MAX_GAP);
  await shot(page, '02 간직 시트 - 빈칸을 걷어낸 뒤');

  // 손잡이를 누르면 닫힌다. 키보드·낭독기로도 잡히는 자리여야 한다
  await expect(gate.getByTestId('sheet-close')).toHaveAttribute('aria-label', '닫기');
  await gate.getByTestId('sheet-close').click();
  await expect(gate).toHaveCount(0);
});

test('간직 시트: 아래로 밀면 닫힌다', async ({ page }) => {
  /*
    ⚠ 「다음에」를 빼면서 눈에 보이는 닫기 표가 손잡이 하나로 줄었다. 사용자는 이 시트를
    **창 내리듯** 닫을 수 있다고 보고 있었는데, 이 시트만 공용 바텀시트를 안 써서 그
    손짓이 아무 반응도 없었다(2026-09-23). 바로 앞뒤 시트(연꽃 모으기·이어가기)에서는
    되던 손짓이다. 한 곳에서만 안 되면 사람은 「이 앱은 가끔 안 닫힌다」로 읽는다.
  */
  test.setTimeout(90_000);
  await page.goto('/');
  await askOnce(page);
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();

  const gate = page.getByTestId('save-gate');
  await expect(gate).toBeVisible();

  /*
    ⚠ **올라오는 애니메이션이 끝나기를 기다린다.** 시트가 올라오는 중에 재면 손잡이 자리가
    한 프레임 만에 옛 값이 되고, 손가락이 시트 아래 허공을 누른다. 그러면 손짓이 아무
    데도 안 닿는데 검사는 「안 닫힌다」로 읽는다(처음에 그렇게 빨갛게 나왔다).
  */
  await gate.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished));
  });

  const handle = gate.getByTestId('sheet-close');
  const box = await handle.boundingBox();
  if (box === null) throw new Error('손잡이 자리를 못 쟀어요');

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // 한 번에 옮기면 끌기로 안 잡힌다. SLOP 을 넘기며 몇 걸음에 나눠 내린다
  for (const step of [20, 60, 110, 160]) await page.mouse.move(x, y + step);
  await page.mouse.up();

  await expect(gate).toHaveCount(0);
  // 무른 것이지 담은 것이 아니다
  await expect(page.getByTestId('save-done')).toHaveCount(0);
});
