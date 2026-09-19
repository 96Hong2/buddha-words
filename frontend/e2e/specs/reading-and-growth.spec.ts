/**
 * 읽기 편함과 권유 자리.
 *
 *   글자 크기 네 단      어른이 쓸 수도 있다. 눌러서 실제로 커지는지
 *   첫 사용 광고 면제     답을 한 번도 못 받은 사람에게는 광고를 덮지 않는다
 *   권유 시간표          1 홈 추가 · 2 앱 알리기 · 3 알림 · 4 홈 추가 다시. 한 번에 하나뿐
 *
 * 셋 다 사람이 부탁하지 않은 것을 화면에 더한다. 그래서 **무엇을 가리지 않는가**를 함께 본다.
 */

import { expect, test } from '../support/fixtures';
import {
  DEEP_CONCERN,
  asNewcomer,
  askOnce,
  dismissDraftConfirm,
  dismissEntry,
  revealBottomBar,
} from '../support/flow';
import { shot } from '../support/shots';
import type { MockScenario } from '../../src/shared/toss/mockBridge';

/** 본문 글자 크기. 토큰 하나가 화면 전체를 끌고 간다 */
async function bodyPx(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
}

/** 지금까지 보낸 로그 이름 전부 */
async function logNames(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => (window.__pocketLogs ?? []).map((log) => log.name));
}

test('글자 크기를 키우면 화면 전체가 함께 커지고, 다시 열어도 그대로다', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('settings')).toBeVisible();

  const base = await bodyPx(page);
  await shot(page, '42 설정 - 글자 크기 고르기');

  // 「아주 크게」까지 네 단. 칸마다 자기 크기로 「가」를 보여 준다
  const options = page.getByTestId('text-size-option');
  await expect(options).toHaveCount(4);
  await options.nth(3).click();

  const bigger = await bodyPx(page);
  expect(bigger, '글자 크기를 골랐는데 본문이 그대로예요').toBeGreaterThan(base);
  await shot(page, '42-1 설정 - 아주 크게');

  // 답변 화면도 같은 토큰을 쓴다. 설정 화면에서만 커지면 아무 소용이 없다
  await page.goto('/');
  expect(await bodyPx(page)).toBe(bigger);

  // 앱을 새로 띄워도 고른 크기가 남는다
  await page.reload();
  expect(await bodyPx(page)).toBe(bigger);

  // 되돌릴 수도 있다
  await page.goto('/settings');
  await page.getByTestId('text-size-option').nth(1).click();
  expect(await bodyPx(page)).toBe(base);
});

test('이야기를 보내도 광고가 저절로 뜨지 않는다', async ({ page, stub }) => {
  /*
   * 실기기에서 「이야기 보내기만 눌렀는데 광고가 떴다」는 말을 들었다. 답을 만드는 동안
   * 저절로 화면을 덮는 광고가 있었기 때문이다. 버튼 라벨에 광고라는 글자가 없는데 광고가
   * 뜨는 것이라 앱인토스 UX Red Rule 에도 닿았고, 그 광고를 다 본 사람에게 이어가기 시트가
   * **광고를 한 번 더** 청했다.
   *
   * 그 자리를 없앴다. 남은 세 자리는 전부 사람이 버튼을 눌러야 뜬다.
   */
  await asNewcomer(page);
  await stub({ pass1Ms: 300, pass2Ms: 400 });
  await page.goto('/');
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(DEEP_CONCERN);

  const startedAt = Date.now();
  await page.getByTestId('submit').click();
  // 대기 화면에서 광고가 덮는 일이 없어야 한다
  await expect(page.getByTestId('mock-fullscreen-ad')).toHaveCount(0);
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  const elapsed = Date.now() - startedAt;

  expect(elapsed, '첫 답이 광고를 기다린 것처럼 늦게 왔어요').toBeLessThan(15_000);

  // 몇 번째 답인지는 요청2까지 끝나야 세어진다. 그전에 세면 답을 못 본 사람까지 셈에 든다
  await expect(page.getByTestId('analysis')).toBeVisible({ timeout: 20_000 });

  const names = await logNames(page);
  expect(names).toContain('answer_generated');
  // 누르지 않았으니 광고를 부르지도 않는다
  expect(names).not.toContain('rewarded_ad_start');
  // 광고가 화면을 덮은 것을 앱을 떠난 것으로 세지 않는다. 세면 이탈 지표가 통째로 망가진다
  expect(names).not.toContain('friction_generation_abandon');

  // 몇 번째 답인지는 남는다. 두 번째 사용 전환율의 분모다
  const milestone = await page.evaluate(() =>
    (window.__pocketLogs ?? []).find((log) => log.name === 'answer_milestone'),
  );
  expect(milestone?.params).toMatchObject({ answers_total: 1, is_first: true });
});

test('두 번째 이야기는 눌러야 광고가 돌고, 광고가 도는 동안 답을 만든다', async ({
  page,
  stub,
}) => {
  /*
   * 예전에는 광고를 **끝까지 본 뒤에** 요청을 보냈다. 30초를 보고 답을 또 기다리는 셈이라
   * 광고를 다 본 사람이 빈 화면 앞에 한 번 더 섰다. 지금은 광고를 틀어 놓고 답을 만든다.
   */
  test.setTimeout(120_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await asNewcomer(page);

  await page.goto('/');
  await askOnce(page, `${DEEP_CONCERN}\n(1번째 이야기예요)`);

  await page.goto('/');
  await dismissEntry(page);
  await dismissDraftConfirm(page);
  await page.getByTestId('concern-field').fill(`${DEEP_CONCERN}\n(2번째 이야기예요)`);
  await page.getByTestId('submit').click();

  // 시트가 서 있는 동안에는 아직 광고가 없다. 사람이 누르는 것이 먼저다
  const sheet = page.getByTestId('continue-sheet');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  expect(await logNames(page)).not.toContain('rewarded_ad_start');
  await expect(page.getByTestId('mock-fullscreen-ad')).toHaveCount(0);

  // 몇 초짜리인지 라벨이 말한다. 모르면 사람은 중간에 닫는다
  const cta = page.getByTestId('continue-watch');
  await expect(cta).toContainText('30초');
  await expect(cta).toContainText('광고');
  // 닫기·오늘 답변 다시 보기는 없앴다. 바깥을 누르면 닫히는 시트에 닫기 버튼을 또 두지 않는다
  await expect(sheet).not.toContainText('오늘 답변 다시 보기');
  await expect(sheet).not.toContainText('닫아도 적은 글은');

  await cta.click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 20_000 });

  const started = await page.evaluate(() =>
    (window.__pocketLogs ?? [])
      .filter((log) => log.name === 'rewarded_ad_start')
      .map((log) => (log.params as Record<string, unknown>).placement),
  );
  expect(started, '눌렀는데 이어가기 광고가 안 돌았어요').toContain('continue');

  // 광고가 도는 동안 답을 먼저 만들기 시작했다는 표
  expect(await logNames(page)).toContain('ad_answer_early_start');
});

/** 목 브릿지에 시나리오를 심는다. 광고가 어떻게 끝나는지를 여기서 정한다 */
async function withBridge(page: import('@playwright/test').Page, scenario: MockScenario) {
  await page.addInitScript((value) => {
    window.__buddhaBridge = value;
  }, scenario);
}

/** 오늘 한 번 이야기한 사람으로 만들고, 두 번째 전송까지 눌러 이어가기 시트를 연다 */
async function openContinueSheet(page: import('@playwright/test').Page) {
  await page.goto('/');
  await askOnce(page, `${DEEP_CONCERN}\n(1번째 이야기예요)`);
  await page.goto('/');
  await dismissEntry(page);
  await dismissDraftConfirm(page);
  await page.getByTestId('concern-field').fill(`${DEEP_CONCERN}\n(2번째 이야기예요)`);
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('continue-sheet')).toBeVisible({ timeout: 10_000 });
}

test('광고가 끝나기 전에 답을 만들기 시작한다', async ({ page, stub }) => {
  /*
    이 브랜치의 핵심이다. 광고가 아직 화면을 덮고 있는 동안 답 생성이 시작돼야,
    광고가 끝났을 때 기다릴 것이 없다. 목 광고를 9초짜리로 길게 틀어 그 사이를 본다.
  */
  test.setTimeout(150_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await asNewcomer(page);
  await withBridge(page, { fullScreenAdMs: 9000 });

  await openContinueSheet(page);
  await page.getByTestId('continue-watch').click();

  // 광고가 아직 떠 있는데 답 생성이 시작됐다
  const ad = page.getByTestId('mock-fullscreen-ad');
  await expect(ad).toBeVisible();
  await expect
    .poll(() => logNames(page).then((names) => names.includes('ad_answer_early_start')), {
      timeout: 9000,
    })
    .toBe(true);
  await expect(ad, '답을 만들기 시작했는데 광고가 벌써 사라졌어요').toBeVisible();

  // 광고가 끝나면 답이 보인다
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 30_000 });
});

test('광고를 5초 안에 닫으면 답을 만들지 않는다', async ({ page, stub }) => {
  /*
    「5초 이내로 나가면 진행하지 마라」가 이 테스트다. 보기 싫어 닫은 사람의 답을 만들어
    두는 것은 비용만 쓰고 아무도 읽지 않는다.
  */
  test.setTimeout(150_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await asNewcomer(page);
  await withBridge(page, { fullScreenAd: 'dismissed', fullScreenAdMs: 400 });

  await openContinueSheet(page);
  await page.getByTestId('continue-watch').click();

  // 시트에 그대로 남고, 나갈 길을 함께 알려 준다
  await expect(page.getByText('아직 답변을 만들지 않았어요')).toBeVisible();
  await expect(page.getByText('빈 곳을 눌러 닫으세요')).toBeVisible();
  await expect(page.getByTestId('answer')).toHaveCount(0);

  const names = await logNames(page);
  expect(names).toContain('ad_bail_early');
  expect(names).not.toContain('ad_answer_early_start');
});

test('광고가 한 장도 안 오면 막지 않고 그냥 이어간다', async ({ page, stub }) => {
  /*
    광고가 안 오는 것은 **우리 쪽 사정**이다. 여기서 멈추면 광고를 못 받는 기기에서는
    같은 버튼을 몇 번 눌러도 답을 못 받고 시트 앞에 갇힌다. 막다른 구조가 된다.
  */
  test.setTimeout(150_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await asNewcomer(page);
  await withBridge(page, { fullScreenAd: 'noFill' });

  await openContinueSheet(page);
  await page.getByTestId('continue-watch').click();

  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 30_000 });

  const skipped = await page.evaluate(() =>
    (window.__pocketLogs ?? [])
      .filter((log) => log.name === 'ad_skipped')
      .map((log) => log.params as Record<string, unknown>),
  );
  expect(skipped.some((p) => p.placement === 'continue' && p.reason === 'no_fill')).toBe(true);
});

test('첫 답은 광고 없이 간직되고, 담고 나면 갈 곳 둘을 남긴다', async ({ page, stub }) => {
  test.setTimeout(90_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await asNewcomer(page);
  await page.goto('/');
  await askOnce(page);

  // 1회차에 뜨는 홈 추가 권유를 먼저 치운다. 간직 버튼 위를 덮지는 않지만 화면을 정리한다
  await page.getByTestId('nudge-close').click();

  await revealBottomBar(page);
  await page.getByTestId('save-button').click();

  // 첫 답이라 광고 시트가 서지 않는다
  await expect(page.getByTestId('save-gate')).toHaveCount(0);

  const done = page.getByTestId('save-done');
  await expect(done).toBeVisible();
  await expect(done).toContainText('보관함에 간직했어요');
  await shot(page, '45 답변 - 간직 완료');

  // 토스트 한 줄로 끝나던 자리다. 담은 것을 보러 갈 길이 없었다
  await page.getByTestId('save-done-archive').click();
  await expect(page.getByTestId('archive')).toBeVisible();
  await expect(page.getByTestId('archive-item')).toHaveCount(1);

  const params = await page.evaluate(() =>
    (window.__pocketLogs ?? [])
      .filter((log) => log.name === 'save_complete')
      .map((log) => (log.params as Record<string, unknown>).gate),
  );
  expect(params).toContain('first_use');
});

test('권유는 한 번에 하나씩, 정해진 차례에만 뜬다', async ({ page, stub }) => {
  test.setTimeout(180_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await asNewcomer(page);

  // ① 첫 답 뒤에는 홈 추가. 답을 한 번 받아 본 사람에게 하는 첫 부탁이다
  await page.goto('/');
  await askOnce(page, `${DEEP_CONCERN}\n(1번째 이야기예요)`);
  const homeAdd = page.getByTestId('home-add');
  await expect(homeAdd).toBeVisible();
  await expect(homeAdd).toContainText('홈 화면에 추가하기');
  // 겹치지 않는다. 한 화면에 부탁이 둘이면 답변이 아니라 부탁이 화면의 주인이 된다
  await expect(page.getByTestId('app-share')).toHaveCount(0);
  await expect(page.getByTestId('notify-nudge')).toHaveCount(0);
  // 답을 덮지 않는다. 공유·간직 버튼도 그대로 손에 닿는다
  await revealBottomBar(page);
  await expect(page.getByTestId('save-button')).toBeVisible();
  await shot(page, '43 답변 - 첫 답 뒤 홈 추가 권유');
  await page.getByTestId('nudge-close').click();

  // ② 두 번째에는 앱 알리기
  await page.goto('/');
  await askOnce(page, `${DEEP_CONCERN}\n(2번째 이야기예요)`);
  const appShare = page.getByTestId('app-share');
  await expect(appShare).toBeVisible();
  await expect(appShare).toContainText('친구에게 앱 알려주기');
  await expect(page.getByTestId('home-add')).toHaveCount(0);
  await shot(page, '44 답변 - 두 번째 뒤 앱 알리기');

  // 실제로 나가는 글에 고민도 답도 없다
  await page.getByTestId('app-share-send').click();
  const sent = await page.evaluate(() => window.__buddhaShares ?? []);
  expect(sent).toHaveLength(1);
  expect(sent[0]).not.toContain('팀장님');
  expect(sent[0]).not.toContain('그만둘까');

  // ③ 세 번째에는 알림
  await page.goto('/');
  await askOnce(page, `${DEEP_CONCERN}\n(3번째 이야기예요)`);
  const notify = page.getByTestId('notify-nudge');
  await expect(notify).toBeVisible();
  await expect(notify).toContainText('매일 하루를 돌아봐요');
  await expect(page.getByTestId('app-share')).toHaveCount(0);
  await shot(page, '46 답변 - 세 번째 뒤 알림 권유');
  await page.getByTestId('notify-nudge-accept').click();
  await expect.poll(() => logNames(page)).toContain('notification_permission');

  // ④ 네 번째에는 홈 추가가 한 번 더. 다시 오는 사람에게는 그 말이 쓸모가 있다
  await page.goto('/');
  await askOnce(page, `${DEEP_CONCERN}\n(4번째 이야기예요)`);
  await expect(page.getByTestId('home-add')).toBeVisible();
  await page.getByTestId('nudge-close').click();

  // ⑤ 다섯 번째에는 아무것도 묻지 않는다
  await page.goto('/');
  await askOnce(page, `${DEEP_CONCERN}\n(5번째 이야기예요)`);
  await expect(page.getByTestId('home-add')).toHaveCount(0);
  await expect(page.getByTestId('app-share')).toHaveCount(0);
  await expect(page.getByTestId('notify-nudge')).toHaveCount(0);
});

test('설정에서도 알림과 홈 추가를 찾을 수 있다', async ({ page }) => {
  /*
   * 권유는 한 사람에게 한 번씩만 뜨고 사라진다. 그 한 번을 놓쳤거나 나중에 마음이 바뀐
   * 사람이 찾아올 자리가 없으면, 그 기능은 사실상 없는 것이 된다.
   */
  await page.goto('/settings');
  await expect(page.getByTestId('settings')).toBeVisible();

  const homeAdd = page.getByTestId('settings-home-add');
  await expect(homeAdd).toBeVisible();
  await homeAdd.click();
  // API 가 없어 사람이 직접 눌러야 한다. 되지도 않는 버튼 대신 어디를 누르는지 가리킨다
  await expect(page.getByText('홈 화면에 추가하기')).toBeVisible();

  const notify = page.getByTestId('settings-notify');
  await expect(notify).toBeVisible();
  await notify.click();
  await expect(page.getByText('알림을 받기로 했어요')).toBeVisible();
  /*
   * 켠 뒤에도 다시 누를 수 있다. SDK 는 지금 상태를 되묻는 길을 안 줘서, 사람이 토스
   * 설정에서 끈 것을 우리는 모른다. 그 상태에서 버튼까지 막으면 앱 안에서 다시 켤 길이 없다.
   */
  await expect(notify).toBeEnabled();
  await expect(notify).toContainText('받기로 함');
  await shot(page, '47 설정 - 알림과 홈 추가');
});

test('설정 맨 위가 토스 홈에 추가하기다', async ({ page }) => {
  /*
   * 이 앱은 토스 안에 있어서, 홈에 두지 않으면 다시 오려면 미니앱 목록을 뒤져야 한다.
   * 다시 오는 길을 만드는 유일한 줄이라 가장 먼저 보여야 하고, 다른 줄과 같은 모양이면
   * 찾는 사람만 찾는다. 예전에는 글자 크기와 이용권 아래에 파묻혀 있었다.
   */
  await page.goto('/settings');
  await expect(page.getByTestId('settings')).toBeVisible();

  const groups = page.locator('.set-group');
  await expect(groups.first()).toHaveText('바로 열기');

  // 홈 추가가 글자 크기보다 위에 있다. 화면 좌표로 확인한다
  const homeAdd = await page.getByTestId('settings-home-add').boundingBox();
  const textSize = await page.getByTestId('text-size').boundingBox();
  expect(homeAdd).not.toBeNull();
  expect(textSize).not.toBeNull();
  expect(homeAdd!.y).toBeLessThan(textSize!.y);

  // 알림은 홈 추가 바로 아래다. 둘 다 「다시 오는 길」이라 같이 읽힌다
  const notify = await page.getByTestId('settings-notify').boundingBox();
  expect(notify!.y).toBeGreaterThan(homeAdd!.y);
  expect(notify!.y).toBeLessThan(textSize!.y);

  await shot(page, '47-1 설정 - 홈 추가가 맨 위에 선다', { fullPage: true });
});

test('설정에 알림 자리가 늘 있고 받고 싶은 시간을 고를 수 있다', async ({ page }) => {
  /*
   * 예전에는 콘솔 템플릿 코드가 없으면 알림 줄을 통째로 감췄고, 시각 줄은 동의를 받은
   * 뒤에만 그렸다. 실기기에서 그 둘이 겹쳐 **설정에 알림이 아예 없어** 보였다.
   * 지금은 자리를 늘 두고, 아직 못 보낸다는 사실을 그 자리에 적는다.
   */
  await page.goto('/settings');
  // 화면이 실제로 섰는지 먼저 본다. 이 줄이 없으면 빈 페이지에서도 「있다」가 흐려진다
  await expect(page.getByTestId('settings')).toBeVisible();

  const notifyRow = page.getByTestId('settings-notify');
  await expect(notifyRow).toBeVisible();
  await expect(notifyRow).toContainText('매일 마음을 기록해 보세요');

  const timeRow = page.getByTestId('settings-notify-time');
  // 동의 전에도 시각을 고를 수 있다. 켜야만 보이면 못 켜는 판에서 영영 안 보인다
  await expect(timeRow).toBeVisible();

  await notifyRow.click();
  await expect(timeRow).toBeVisible();
  // 기본은 밤 9시다. 하루를 덮고 마음을 들여다보는 시간대다
  await expect(timeRow).toContainText('오후 9시');

  await timeRow.click();
  const options = page.getByTestId('settings-notify-time-option');
  await expect(options.first()).toBeVisible();
  // 새벽은 없다. 그 시각에 오는 알림은 도움이 아니라 방해다
  await expect(page.getByRole('radio', { name: '오전 3시' })).toHaveCount(0);

  await page.getByRole('radio', { name: '오전 8시' }).click();
  await expect(timeRow).toContainText('오전 8시');
  // 지킬 수 있는 말만 한다. 발송이 아직 없다는 것을 그 자리에서 밝힌다
  await expect(page.getByText('아직은 보내드리지 않아요')).toBeVisible();
  await shot(page, '47-2 설정 - 알림 받을 시간 고르기', { fullPage: true });

  // 다시 열어도 고른 값이 남는다
  await page.reload();
  await expect(page.getByTestId('settings-notify-time')).toContainText('오전 8시');

  const names = await page.evaluate(() => (window.__pocketLogs ?? []).map((log) => log.name));
  expect(names).toContain('settings_view');
});

test('같은 답으로 왕복해도 답 수가 늘지 않는다', async ({ page, stub }) => {
  /*
   * 답을 몇 번 받았나는 광고 면제와 권유 시간표를 **둘 다** 쥔다. 그런데 세는 자리가
   * 답변 화면 안의 ref 였다. 답변 화면은 떠날 때 언마운트되고, 보관함의 「오늘 나눈 이야기」를
   * 누르면 같은 답으로 다시 들어온다. 그 길을 두 번 왕복하면 답 하나가 셋으로 세어져,
   * 한 번밖에 안 받은 사람이 권유 세 장을 다 쓰고 광고 면제도 잃었다.
   *
   * 지금은 마지막으로 센 답변 아이디를 저장소가 들고 있다.
   */
  test.setTimeout(120_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await asNewcomer(page);

  await page.goto('/');
  await askOnce(page);
  await expect(page.getByTestId('home-add')).toBeVisible();
  await page.getByTestId('nudge-close').click();

  // 답변 → 홈 → 보관함 → 같은 답으로 복귀. 두 번 왕복한다
  for (let i = 0; i < 2; i += 1) {
    await page.getByTestId('again-button').click();
    await page.getByRole('button', { name: '보관함' }).click();
    await expect(page.getByTestId('archive')).toBeVisible();
    await page.getByTestId('archive-item').click();
    await expect(page.getByTestId('answer')).toBeVisible();
    await expect(page.getByTestId('analysis')).toBeVisible({ timeout: 20_000 });
  }

  const answers = await page.evaluate(() => {
    const raw = localStorage.getItem('buddha.milestones.v2');
    return raw == null ? null : (JSON.parse(raw) as { answers: number }).answers;
  });
  expect(answers, '같은 답으로 돌아왔는데 답 수가 늘었어요').toBe(1);

  // 그래서 권유도 그대로 첫 자리다. 앱 알리기·알림이 앞당겨지지 않는다
  await expect(page.getByTestId('app-share')).toHaveCount(0);
  await expect(page.getByTestId('notify-nudge')).toHaveCount(0);

  // 첫 답이라 간직도 여전히 광고 없이 된다
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('save-gate')).toHaveCount(0);
  await expect(page.getByTestId('save-done')).toBeVisible();
});
