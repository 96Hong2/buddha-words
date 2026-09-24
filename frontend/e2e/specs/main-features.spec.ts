/**
 * 미니앱 상세의 「주요 기능」이 보내는 세 자리.
 *
 * 콘솔에 등록한 주요 기능은 홈을 거치지 않고 그 화면으로 바로 들어온다. 앱인토스 가이드가
 * **「주요 기능 URL 에 정상 접속되지 않으면 반려」** 라고 못박고 있어서, 주소가 살아 있는지가
 * 곧 심사 통과 여부다. 우리 라우터는 모르는 경로를 홈으로 떨어뜨리므로 404 가 안 나고,
 * 그래서 **「홈이 떴다」와 「그 화면이 떴다」를 눈으로는 구분할 수 없다.** 여기서 가른다.
 *
 * 세 자리가 각각 무엇을 보여야 하는지:
 *
 *   고민 상담하기   `/`         입력칸
 *   오늘의 말씀 보기 `/today`   오늘의 한마디 시트가 **펼쳐진 채로**
 *   저장한 말씀 보기 `/archive` 보관함
 */

import { test, expect } from '../support/fixtures';

test('오늘의 말씀 보기로 들어오면 한마디가 펼쳐진 채로 선다', async ({ page }) => {
  await page.goto('/today');

  /*
    홈에 내려놓고 카드를 한 번 더 찾게 하면 그 이름이 거짓이 된다. 목록에서 이름만 보고
    누른 사람이라 「오늘의 말씀」이 바로 눈앞에 있어야 한다.
  */
  await expect(page.getByTestId('daily-sheet')).toBeVisible();
  // 경전 원문과 출처가 시트 안에 있다. 풀어 쓴 한 줄만 보여 주면 인용이 아니라 표어가 된다
  await expect(page.getByTestId('daily-sheet')).toContainText('경전 원문');
});

test('홈으로 들어오면 한마디는 카드로만 있고 저절로 펼쳐지지 않는다', async ({ page }) => {
  await page.goto('/');

  /*
    이 짝이 없으면 위 시험은 「시트가 원래 늘 떠 있다」로도 통과한다. 그러면 주요 기능
    주소가 죽어도 초록이다.
  */
  await expect(page.getByTestId('daily-card')).toBeVisible();
  await expect(page.getByTestId('daily-sheet')).toHaveCount(0);
});

test('펼쳐진 한마디를 닫으면 그 자리가 홈이다', async ({ page }) => {
  await page.goto('/today');
  await expect(page.getByTestId('daily-sheet')).toBeVisible();

  // 닫고 나서 아무것도 없는 화면에 남으면, 바로 들어온 사람은 나갈 길을 잃는다
  await page.getByTestId('daily-sheet').press('Escape');
  await expect(page.getByTestId('concern-field')).toBeVisible();
});

test('저장한 말씀 보기로 들어오면 보관함이 선다', async ({ page }) => {
  await page.goto('/archive');

  await expect(page.getByTestId('archive')).toBeVisible();
  // 홈으로 떨어진 것이 아니다. 입력칸이 같이 서 있으면 주소가 죽은 것이다
  await expect(page.getByTestId('concern-field')).toHaveCount(0);
});

test('고민 상담하기로 들어오면 입력칸이 선다', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('concern-field')).toBeVisible();
});
