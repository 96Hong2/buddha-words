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
 *
 * ── 이 파일이 조심하는 것 ───────────────────────────────────────────────
 *
 * **하루 첫 진입 카드가 덮은 화면도 `toBeVisible()` 은 초록이다.** Playwright 는 가려짐을
 * 보지 않는다. 이 저장소의 다른 스펙이 전부 `dismissEntry` 로 카드를 치우고 시작하는데
 * 여기만 안 치우면, 카드가 화면을 덮은 채로 다섯 건이 다 통과한다. 그래서 「눌러서 닫는다」로
 * 잰다. 가려져 있으면 클릭이 가로채여 실패한다.
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

test('시트가 같은 구절을 펼쳤으면 진입 카드는 겹쳐 서지 않는다', async ({ page }) => {
  await page.goto('/today');
  await expect(page.getByTestId('daily-sheet')).toBeVisible();

  /*
    하루 첫 진입 카드도 오늘의 한마디를 보여 준다. 시트 뒤에 같이 서면 **같은 말이 두 번**
    이고, 오버레이 스택에 늦게 들어간 카드를 뒤로가기가 먼저 닫아서 첫 뒤로가기가 화면에서
    아무 일도 안 하게 된다.
  */
  await expect(page.getByTestId('entry-card')).toHaveCount(0);
});

test('홈으로 들어오면 한마디는 카드로만 있고 저절로 펼쳐지지 않는다', async ({ page }) => {
  await page.goto('/');
  // 하루 첫 진입이라 카드가 먼저 뜬다. 눌러서 치운다. 가려져 있으면 이 클릭이 실패한다
  await page.getByTestId('entry-card-cta').click();
  await expect(page.getByTestId('entry-card')).toHaveCount(0);

  /*
    이 짝이 없으면 위 시험은 「시트가 원래 늘 떠 있다」로도 통과한다. 그러면 주요 기능
    주소가 죽어도 초록이다.
  */
  await expect(page.getByTestId('daily-card')).toBeVisible();
  await expect(page.getByTestId('daily-sheet')).toHaveCount(0);
});

test('펼쳐진 한마디를 닫으면 그 자리가 진짜 홈이다', async ({ page }) => {
  await page.goto('/today');
  await expect(page.getByTestId('daily-sheet')).toBeVisible();

  await page.getByTestId('daily-sheet').press('Escape');
  await expect(page.getByTestId('daily-sheet')).toBeHidden();

  /*
    입력칸이 보이는 것만으로는 모자라다. 경로가 `/today` 로 남아 있으면 그 다음 뒤로가기
    한 번이 **화면에서 아무 일도 안 하는 데** 쓰인다. 홈과 `/today` 가 같은 화면을 그려서
    눈으로는 그 이동이 안 보이기 때문이다. 주소까지 홈이어야 한다.
  */
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('concern-field')).toBeVisible();
  // 카드를 눌러서 다시 펼 수 있다. 딥링크로 한 번 열었다고 카드가 죽으면 안 된다
  await page.getByTestId('daily-card').click();
  await expect(page.getByTestId('daily-sheet')).toBeVisible();
});

test('저장한 말씀 보기로 들어오면 보관함이 선다', async ({ page }) => {
  await page.goto('/archive');

  await expect(page.getByTestId('archive')).toBeVisible();
  // 홈으로 떨어진 것이 아니다. 입력칸이 같이 서 있으면 주소가 죽은 것이다
  await expect(page.getByTestId('concern-field')).toHaveCount(0);
});

test('고민 상담하기로 들어오면 입력칸이 선다', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('entry-card-cta').click();

  await expect(page.getByTestId('concern-field')).toBeVisible();
});
