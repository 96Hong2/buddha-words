/**
 * 이용권 결제 증명.
 *
 * 목 브릿지의 주문서를 실제로 눌러 성공·취소·실패 세 갈래를 다 본다. 실기기 샌드박스 결제는
 * 여기서 못 한다. 여기서 지키는 것은 「주문서가 끝난 뒤 화면이 어떻게 되는가」다.
 */

import { test, expect, type Page } from '../support/fixtures';
import { askOnce, revealBottomBar } from '../support/flow';
import { shot } from '../support/shots';
import type { MockScenario } from '../../src/shared/toss/mockBridge';

/** 이미 간직해 둔 세 개. 보관함이 비어 있으면 「간직할 자리」 안내가 아예 안 그려진다 */
const SAVED = [1, 2, 3].map((n) => ({
  answerId: `seed-${n}`,
  savedAt: Date.now() - n * 60_000,
  line: `마음에 남은 말 ${n}`,
  tags: ['anxiety'],
  visualTheme: 'choice',
}));

/**
 * 간직 시트 맨 아래의 파는 말. 이 버튼이 Paywall 을 연다.
 *
 * 간직 개수 제한이 없어지면서 보관함에 있던 「간직할 자리」 안내가 사라졌다. 이용권이 지금
 * 파는 것은 간직할 때 보는 짧은 광고를 건너뛰는 것 하나다. 그래서 파는 자리도 광고를 보기
 * 싫은 사람이 서 있는 곳, 곧 간직 시트 안으로 옮겼다.
 */
const BUY_LINK = '기다리지 않고 간직하기';
/** 이용권을 가진 뒤 보관함이 하는 말 */
const OPEN_NOTE = /기다리지 않고 바로 간직할 수 있어요/;
/** 결제가 끝나지 않았을 때 사람이 읽는 문구 */
const FAIL_NOTICE = '결제를 끝내지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
/** 주문서를 못 여는 앱 버전에서 사람이 읽는 문구 */
const UNSUPPORTED_NOTICE = '토스 앱을 최신 버전으로 업데이트하면 이용권을 살 수 있어요.';
/** 주문 이력을 못 읽어서 산 사람인지 아닌지 모르는 상태에서 읽는 문구 */
const UNVERIFIED_NOTICE =
  '지금은 이용권을 확인하지 못했어요. 이미 사셨다면 잠시 뒤에 다시 열어 주세요.';

/** 앱이 이용권 보유를 적어 두는 기기 캐시. 주문 이력과 다른 자리다 */
const PASS_CACHE_KEY = 'pocket:mock:archive-pass';

/**
 * 시트에 절대 새면 안 되는 말.
 *
 * 앞의 넷은 제품 규칙의 금지 어휘이고, 뒤는 개발자용 오류 문자열이다. 결제가 틀어졌을 때가
 * 이런 것이 화면으로 새기 가장 쉬운 자리라 실패 갈래마다 이 검사를 건다.
 */
const FORBIDDEN_COPY = /상담|치료|진단|처방|목:|BridgeError|UNSUPPORTED|UNKNOWN|undefined|Error/;

interface Setup {
  scenario?: MockScenario;
  archivePassFlag?: boolean;
}

async function openArchive(page: Page, setup: Setup = {}) {
  await page.addInitScript(
    (init) => {
      if (init.scenario != null) window.__buddhaBridge = init.scenario;
      if (init.archivePassFlag != null) {
        (window as unknown as { __buddhaFlags: unknown }).__buddhaFlags = {
          iap: { archivePass: init.archivePassFlag },
        };
      }
      // 처음 한 번만 깔아 둔다. 페이지를 열 때마다 덮으면 테스트가 앱이 담은 것을 지운다
      if (localStorage.getItem('buddha.archive.v1') == null) {
        localStorage.setItem(
          'buddha.archive.v1',
          JSON.stringify({ version: 1, items: init.items }),
        );
      }
    },
    { ...setup, items: SAVED },
  );

  await page.goto('/archive');
  await expect(page.getByTestId('archive')).toBeVisible();
}

/**
 * 간직 시트까지 걸어가 「광고 없이 간직하기」로 Paywall 을 연다.
 *
 * 보관함이 아니라 답변 화면에서 간다. 파는 자리가 그리로 옮겨 갔다.
 */
async function openPaywall(page: Page) {
  await page.goto('/');
  await askOnce(page);
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('save-gate')).toBeVisible();
  await page.getByTestId('save-gate-buy').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
}

/** 목 브릿지 시나리오와 이용권 플래그만 깔고 앱을 연다. 보관함으로 가지 않는다 */
async function primeApp(page: Page, setup: Setup = {}) {
  await page.addInitScript(
    (init) => {
      if (init.scenario != null) window.__buddhaBridge = init.scenario;
      if (init.archivePassFlag != null) {
        (window as unknown as { __buddhaFlags: unknown }).__buddhaFlags = {
          iap: { archivePass: init.archivePassFlag },
        };
      }
    },
    { ...setup },
  );
}

/** 창에 쌓인 행동 로그 이름만 뽑는다 */
async function logNames(page: Page): Promise<string[]> {
  return page.evaluate(() => (window.__pocketLogs ?? []).map((log) => log.name));
}

/** 지금 시트에 떠 있는 글에 금지 어휘나 개발자용 문자열이 섞였는지 본다 */
async function expectReadableCopy(page: Page) {
  const text = await page.getByTestId('paywall').innerText();
  expect(text).not.toMatch(FORBIDDEN_COPY);
}

test('파는 말은 간직 시트 맨 아래 한 줄이다', async ({ page }) => {
  /*
   * 파는 자리가 보관함에서 간직 시트로 옮겨 왔다. 광고를 보기 싫은 사람이 지금 정확히
   * 거기 서 있어서다.
   *
   * 여기서 보는 것은 **크기**다. 이 시트의 기본 길은 광고를 보는 쪽이고 파는 말은 곁길이다.
   * 파는 말이 큰 버튼이 되면 간직하려던 사람이 매번 결제 권유부터 만난다.
   */
  await page.goto('/');
  await askOnce(page);
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();

  const gate = page.getByTestId('save-gate');
  await expect(gate).toBeVisible();
  const watch = page.getByTestId('save-gate-watch');
  const buy = page.getByTestId('save-gate-buy');
  await expect(watch).toBeVisible();
  await expect(buy).toContainText(BUY_LINK);

  // 광고를 보는 버튼이 파는 줄보다 크다
  const watchBox = await watch.boundingBox();
  const buyBox = await buy.boundingBox();
  expect(watchBox!.height).toBeGreaterThan(buyBox!.height);
  await shot(page, '30 이용권 - 간직 시트 맨 아래의 파는 줄');
});

test('구매 성공: 주문서를 끝내면 간직 개수 제한이 풀린다', async ({ page }) => {
  // 주문서를 눌러서 끝낼 때까지 붙들어 둔다. 시간으로 닫히게 두면 화면을 찍는 사이에
  // 사라져서, 「주문서」라고 이름 붙인 그림에 엉뚱한 화면이 담긴다
  await openArchive(page, { scenario: { purchase: 'ok', purchaseHold: true } });
  await openPaywall(page);

  await page.getByTestId('paywall-buy').click();

  // 주문서가 실제로 떴다. 여기가 토스 결제 화면 자리다
  const order = page.getByTestId('mock-order-sheet');
  await expect(order).toBeVisible();
  // 실기기에서는 여기에 토스 결제창이 뜬다. 브라우저에는 그 자리를 대신하는 목 판이 뜬다
  await shot(page, '30 이용권 - 결제창이 뜨는 자리(브라우저에서는 목 화면)');
  // 찍은 그림에 주문서가 담겼는지 확인한다. 이 줄이 없으면 증거가 조용히 거짓이 된다
  await expect(order).toBeVisible();

  // 주문서를 끝낸다
  await order.click();
  await expect(order).toBeHidden();

  // 시트는 닫히고, 사려던 이유였던 간직이 그 자리에서 끝난다
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  await expect(page.getByTestId('save-done')).toContainText('보관함에 간직했어요');
  // 완료 시트는 스스로 닫히지 않는다. 읽던 답에 남는 쪽을 골라 다음 걸음으로 간다
  await page.getByTestId('save-done-stay').click();

  // 로그는 판을 옮기기 전에 읽는다. goto 는 창을 새로 띄워 쌓인 로그를 지운다
  const names = await logNames(page);
  expect(names).toContain('purchase_start');
  expect(names).toContain('purchase_complete');
  expect(names).not.toContain('purchase_fail');

  // 보관함은 이제 광고 없이 간직한다고 알린다
  await page.goto('/archive');
  await expect(page.getByText(OPEN_NOTE)).toBeVisible();
  await shot(page, '31 이용권 - 사고 나서 열린 보관함', { fullPage: true });
});

test('구매 취소: 아무 일도 일어나지 않는다', async ({ page }) => {
  await openArchive(page, { scenario: { purchase: 'cancel' } });
  await openPaywall(page);

  await page.getByTestId('paywall-buy').click();
  await expect(page.getByTestId('mock-order-sheet')).toHaveCount(0);

  // 시트는 그대로 열려 있고, 취소는 사용자가 고른 것이라 오류 문구를 띄우지 않는다
  await expect(page.getByTestId('paywall')).toBeVisible();
  await expect(page.getByTestId('paywall-buy')).toBeEnabled();
  await expect(page.getByText(FAIL_NOTICE)).toHaveCount(0);
  await shot(page, '32 이용권 - 결제를 취소했을 때');
  await expectReadableCopy(page);

  await page.getByTestId('sheet-close').first().click();
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  // 못 샀으면 보관함에 이용권 표시가 없다
  await expect(page.getByText(OPEN_NOTE)).toHaveCount(0);
  await expect(page.getByText(OPEN_NOTE)).toHaveCount(0);

  const names = await logNames(page);
  expect(names).toContain('purchase_start');
  expect(names).toContain('purchase_fail');
  expect(names).not.toContain('purchase_complete');
});

test('구매 실패: 읽을 수 있는 문구가 뜨고 보관함은 잠긴 채로 남는다', async ({ page }) => {
  await openArchive(page, { scenario: { purchase: 'failed' } });
  await openPaywall(page);

  await page.getByTestId('paywall-buy').click();

  await expect(page.getByText(FAIL_NOTICE)).toBeVisible();
  await expect(page.getByTestId('paywall')).toBeVisible();
  await shot(page, '33 이용권 - 결제가 실패했을 때');
  await expectReadableCopy(page);

  // 다시 눌러 볼 수 있어야 한다. 실패가 버튼을 죽이면 안 된다
  await expect(page.getByTestId('paywall-buy')).toBeEnabled();

  await page.getByTestId('sheet-close').first().click();
  // 못 샀으면 보관함에 이용권 표시가 없다
  await expect(page.getByText(OPEN_NOTE)).toHaveCount(0);
});

test('미지원 기기: 다시 시도하라 하지 않고 할 수 있는 일을 알려 준다', async ({ page }) => {
  await openArchive(page, { scenario: { purchase: 'unsupported' } });
  await openPaywall(page);

  await page.getByTestId('paywall-buy').click();

  // 주문서가 뜰 수 없는 버전이다. 뜬 척하지 않는다
  await expect(page.getByTestId('mock-order-sheet')).toHaveCount(0);
  await expect(page.getByText(UNSUPPORTED_NOTICE)).toBeVisible();
  // 다시 눌러도 결과가 같은 자리다. 「잠시 뒤에 다시」라고 말하면 헛되이 돌린다
  await expect(page.getByText(FAIL_NOTICE)).toHaveCount(0);
  await expect(page.getByTestId('paywall-buy')).toBeDisabled();
  await expectReadableCopy(page);
  await shot(page, '34 이용권 - 주문서를 못 여는 기기');

  const names = await logNames(page);
  expect(names).toContain('purchase_fail');
  expect(names).not.toContain('purchase_complete');

  // 보관함은 잠긴 채로 남는다
  await page.getByTestId('sheet-close').first().click();
  // 못 샀으면 보관함에 이용권 표시가 없다
  await expect(page.getByText(OPEN_NOTE)).toHaveCount(0);
});

test('구매 뒤 새로고침해도 이용권이 남는다. 되살리는 것은 기기 캐시가 아니라 주문 이력이다', async ({
  page,
}) => {
  await openArchive(page, { scenario: { purchase: 'ok' } });
  await openPaywall(page);

  await page.getByTestId('paywall-buy').click();
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  await page.goto('/archive');
  await expect(page.getByText(OPEN_NOTE)).toBeVisible();

  // 기기 캐시를 지운다. 이게 남아 있으면 복원이 실제로 돌았는지 알 수 없다
  await page.evaluate((key) => localStorage.removeItem(key), PASS_CACHE_KEY);
  await page.reload();

  await expect(page.getByTestId('archive')).toBeVisible();
  await expect(page.getByText(OPEN_NOTE)).toBeVisible();
  await shot(page, '36 이용권 - 새로고침 뒤에도 남는다', { fullPage: true });
});

test('복원: 기기에 아무것도 없어도 토스에 산 기록이 있으면 열려 있다', async ({ page }) => {
  // 앱을 지웠다 다시 깐 상태다. 기기 저장은 비어 있고 주문 이력만 남아 있다
  await openArchive(page, { scenario: { purchaseOwned: ['archive_pass'] } });

  await expect(page.getByText(OPEN_NOTE)).toBeVisible();
  await shot(page, '35 이용권 - 다시 깔아도 복원된다', { fullPage: true });
});

test('복원 실패: 주문 이력을 못 읽으면 산 적 없는 것으로 치지 않는다', async ({ page }) => {
  // 기기 캐시에 이용권이 있는데 이력 조회가 실패한 상황. 캐시를 덮어쓰면 이용권이 사라진다
  await page.addInitScript(() => {
    localStorage.setItem('pocket:mock:archive-pass', '1');
  });
  await openArchive(page, { scenario: { purchaseRestore: 'failed' } });

  await expect(page.getByText(OPEN_NOTE)).toBeVisible();
});

test('플래그를 끄면 파는 줄이 아예 서지 않는다', async ({ page }) => {
  await primeApp(page, { archivePassFlag: false });
  await page.goto('/');
  await askOnce(page);
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();

  const gate = page.getByTestId('save-gate');
  await expect(gate).toBeVisible();
  // 팔지 않는 판에서는 파는 줄이 없다. 광고를 보는 길만 남는다
  await expect(page.getByTestId('save-gate-buy')).toHaveCount(0);
  await expect(page.getByTestId('save-gate-watch')).toBeVisible();
  await shot(page, '37 이용권 - 파는 기능을 껐을 때');
});

test('이력을 못 읽었을 때: 산 사람이 또 사지 않도록 확인하지 못했다고 말한다', async ({ page }) => {
  // 앱을 다시 깐 기기다. 기기 캐시가 비어 있는데 이력 조회까지 실패하면 산 것도 안 산 것도 아니다.
  // 토스에는 산 기록이 남아 있는 사람인데, 파는 말만 보여 주면 가진 것을 또 산다
  await openArchive(page, {
    scenario: { purchaseRestore: 'failed', purchaseOwned: ['archive_pass'] },
  });
  await openPaywall(page);

  await expect(page.getByTestId('paywall')).toContainText(UNVERIFIED_NOTICE);
  // 결제를 못 여는 낡은 앱도 같은 자리에 머문다. 버튼을 지우면 아직 안 산 사람이 살 길이 막힌다
  await expect(page.getByTestId('paywall-buy')).toBeEnabled();
  await expectReadableCopy(page);
  await shot(page, '38 이용권 - 산 기록을 못 읽었을 때');
});

test('이력을 읽었으면 확인하지 못했다는 말이 없다', async ({ page }) => {
  // 산 적이 없다고 확인된 사람이다. 여기까지 와서 「확인하지 못했어요」를 읽으면 안 된다
  await openArchive(page);
  await openPaywall(page);

  await expect(page.getByTestId('paywall')).toContainText('₩4,900');
  await expect(page.getByTestId('paywall')).not.toContainText(UNVERIFIED_NOTICE);
});

/* ── 파는 것과 주는 것이 같은가 ───────────────────────────────────────── */

test('시트는 지금 실제로 되는 것만 판다', async ({ page }) => {
  await openArchive(page);
  await openPaywall(page);
  const wall = page.getByTestId('paywall');

  // 이용권이 실제로 여는 것은 간직 자리 제한 하나다
  await expect(wall).toContainText('기다리지 않고 바로 간직해요');
  await expect(wall).toContainText('앱을 다시 깔아도 이용권 그대로');

  // 이 판에 없는 기능은 적지 않는다. 지난 고민 열람·즐겨찾기·태그별 모아보기는 아직 없다
  await expect(wall).not.toContainText('지난 고민');
  await expect(wall).not.toContainText('즐겨찾기');
  await expect(wall).not.toContainText('태그별');

  // 못 하는 것을 사기 전에 말한다. 답변을 서버에 남기지 않아 지나간 이야기는 못 되살린다
  await expect(wall).toContainText('간직하지 않고 지나간 이야기는 다시 불러올 수 없어요');

  // 공유 링크를 만들면 카드의 한 줄 풀이가 서버에 30일 남는다. 돈을 받기 직전이라 그 예외까지
  // 적어야 하고, 공유한 적 없는 사람에게는 해당되지 않는다는 것이 「만들었을 때만」으로 읽혀야 한다
  await expect(wall).toContainText(
    '공유 링크를 만들었을 때만 그 링크에 담길 내용이 30일 동안 남고',
  );
  await expect(wall).toContainText('적으신 고민 글은 그때도 함께 가지 않아요');

  await expectReadableCopy(page);
  await shot(page, '30-1 이용권 - 시트가 파는 것');
});

test('간직 시트에서 사면 하려던 일이 끝난다', async ({ page, stub }) => {
  // 답변을 한 번 받아야 간직할 것이 생긴다. 답변 생성은 여기서 볼 것이 아니라 빠르게 넘긴다
  test.setTimeout(120_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await openArchive(page, { scenario: { purchase: 'ok' } });

  await openPaywall(page);
  await page.getByTestId('paywall-buy').click();
  await expect(page.getByTestId('paywall')).toHaveCount(0);

  // 사려던 이유가 이 답변을 간직하는 것이었다. 시트만 닫히고 끝나면 안 된다
  await expect(page.getByTestId('save-done')).toContainText('보관함에 간직했어요');
  // 완료 시트는 스스로 닫히지 않는다. 읽던 답에 남는 쪽을 골라 다음 걸음으로 간다
  await page.getByTestId('save-done-stay').click();
  await shot(page, '31-1 이용권 - 사고 나서 그 답변이 간직됐다');

  // 앞서 깔아 둔 셋에 방금 담은 하나가 더해졌다
  await page.goto('/archive');
  await expect(page.getByTestId('archive-item')).toHaveCount(4);
  await shot(page, '28-1 보관함 - 이용권으로 넷째까지 간직했다', { fullPage: true });
});

/* ── 산 사람이 자기 것을 확인하는 자리 ───────────────────────────────── */

test('설정: 이용권 상태를 보고, 다시 깐 뒤에도 복원으로 되찾는다', async ({ page }) => {
  await openArchive(page, { scenario: { purchase: 'ok' } });

  // 사기 전에는 없다고 적힌다. 모르는 것과 없는 것을 갈라 적는다
  await page.goto('/settings');
  await expect(page.getByTestId('archive-pass')).toContainText('없음');

  await openPaywall(page);
  await page.getByTestId('paywall-buy').click();
  await expect(page.getByTestId('paywall')).toHaveCount(0);

  // 산 사람이 자기가 무엇을 샀는지 확인하는 자리
  await page.goto('/settings');
  const pass = page.getByTestId('archive-pass');
  await expect(pass).toContainText('마음 보관함 이용권');
  await expect(pass).toContainText('있음');
  await shot(page, '41-1 설정 - 이용권을 산 뒤');

  // 새로고침해도 남는다
  await page.reload();
  await expect(page.getByTestId('archive-pass')).toContainText('있음');

  // 앱을 다시 깐 기기처럼 기기 캐시를 지우고 스스로 되찾는다
  await page.evaluate((key) => localStorage.removeItem(key), PASS_CACHE_KEY);
  await page.getByTestId('archive-pass-restore').click();
  await expect(page.getByText('이용권을 찾았어요. 기다리지 않고 간직할 수 있어요.')).toBeVisible();
  await expect(page.getByTestId('archive-pass')).toContainText('있음');
  await shot(page, '41-2 설정 - 구매 내역을 다시 확인했다');
});

test('설정: 산 적이 없으면 없다고 말한다. 없는 것을 찾은 척하지 않는다', async ({ page }) => {
  await openArchive(page);
  await page.goto('/settings');

  await page.getByTestId('archive-pass-restore').click();
  await expect(page.getByText('이 토스 계정으로 산 이용권이 없어요.')).toBeVisible();
  await expect(page.getByTestId('archive-pass')).toContainText('없음');
});

test('설정: 구매 내역을 못 읽으면 없다고 하지 않는다', async ({ page }) => {
  // 이력 조회가 막힌 상태다. 「없음」으로 단정하면 산 사람의 이용권이 사라진 것처럼 읽힌다
  await openArchive(page, { scenario: { purchaseRestore: 'failed' } });
  await page.goto('/settings');

  await page.getByTestId('archive-pass-restore').click();
  await expect(
    page.getByText('구매 내역을 확인하지 못했어요. 잠시 뒤에 다시 눌러 주세요.'),
  ).toBeVisible();
  await expect(page.getByTestId('archive-pass')).not.toContainText('없음');
});

test('판매를 끈 빌드에는 이용권을 파는 자리도 확인하는 자리도 없다', async ({ page }) => {
  // 사업자·정산 승인 전에 심사를 내는 빌드다. 살 수 없는 것을 자리만 만들어 두지 않는다
  await openArchive(page, { archivePassFlag: false });

  await page.goto('/settings');
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByTestId('archive-pass')).toHaveCount(0);
  await expect(page.getByTestId('settings')).not.toContainText('이용권');

  // 보관함에도 파는 자리가 없다. 간직은 광고 하나로 그냥 된다
  await page.goto('/archive');
  await expect(page.getByTestId('archive')).toBeVisible();
  await expect(page.getByTestId('archive')).not.toContainText('이용권');
});
