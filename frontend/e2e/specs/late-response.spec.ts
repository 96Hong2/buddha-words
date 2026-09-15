/**
 * 늦게 온 응답이 다음 이야기를 덮어쓰지 않는가.
 *
 * 요청2는 답변 화면으로 넘어간 뒤에도 최대 60초를 기다린다. 그 사이에 사람이 홈으로 돌아가
 * 두 번째 이야기를 보내면, 늦게 도착한 첫 이야기의 답이 방금 받은 답변을 밀어낼 수 있다.
 */

import { test, expect } from '../support/fixtures';
import { dismissEntry } from '../support/flow';

/** 화가 난 이야기. 스텁이 anger 테마로 읽는다 */
const ANGER = [
  '어제 회의에서 크게 싸웠고 아직도 화가 나요.',
  '제 의견이 무시당한 게 억울해서 조금도 가라앉지 않아요.',
  '이 감정을 어떻게 다뤄야 할지 모르겠어요.',
].join('\n');

/** 불안한 이야기. 스텁이 anxiety 테마로 읽는다 */
const ANXIETY = [
  '요즘 자꾸 불안해서 아무것도 손에 안 잡혀요.',
  '앞으로 어떻게 될지 걱정이 많아 하루가 길어요.',
  '마음을 어떻게 다잡아야 할지 모르겠어요.',
].join('\n');

const ANGER_LINE = '불을 불로 끄려 하지 마라';
const ANXIETY_LINE = '오지 않은 일을 미리 앓지 마라';

test('첫 이야기의 요청2가 늦게 도착해도 두 번째 답변을 덮어쓰지 않는다', async ({ page, stub }) => {
  // 첫 이야기의 요청2는 8초 뒤에 온다. 그 전에 두 번째 이야기가 끝나 있을 만큼 느리게 둔다
  await stub({ pass1Ms: 300, pass2Ms: 8000 });
  await page.goto('/');
  await dismissEntry(page);

  await page.getByTestId('concern-field').fill(ANGER);
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('buddha-message')).toContainText(ANGER_LINE);

  // 두 번째 이야기는 요청2까지 금방 끝난다. 늦게 오는 쪽이 첫 이야기 하나가 되게 한다
  await page.evaluate(() => {
    (window as unknown as { __buddhaStub: { pass1Ms: number; pass2Ms: number } }).__buddhaStub = {
      pass1Ms: 300,
      pass2Ms: 300,
    };
  });

  // 첫 답변의 요청2를 기다리지 않고 홈으로 돌아가 두 번째 이야기를 보낸다
  await page.goBack();
  await expect(page.getByTestId('home')).toBeVisible();
  await page.getByTestId('concern-field').fill(ANXIETY);
  await page.getByTestId('submit').click();
  const sheet = page.getByTestId('continue-sheet');
  await expect(sheet).toBeVisible({ timeout: 5000 });
  await page.getByTestId('continue-watch').click();

  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('buddha-message')).toContainText(ANXIETY_LINE);
  await expect(page.getByTestId('analysis')).toBeVisible({ timeout: 20_000 });

  // 첫 이야기의 요청2가 도착할 때까지 지켜본다. 한 번이라도 옛 답변으로 돌아가면 실패다
  for (let i = 0; i < 20; i += 1) {
    await expect(page.getByTestId('buddha-message')).not.toContainText(ANGER_LINE);
    await page.waitForTimeout(500);
  }
  await expect(page.getByTestId('buddha-message')).toContainText(ANXIETY_LINE);
});
