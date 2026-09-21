/**
 * 리뷰 청하기 카드.
 *
 * 앱인토스가 「추천 미니앱」을 UX · 실사용 지표 · **리뷰** · 성능 넷으로 가르는데
 * 그 셋째 칸이 비어 있었다. 여기서 재는 것은 넷이다.
 *
 *   누구에게  답을 두 번 이상 받아 본 사람에게만
 *   몇 번     한 번 청하면 끝이다. 다시 열어도 안 뜬다
 *   미루기    「나중에」는 답을 두 번 더 받으면 되돌아온다
 *   실패      못 여는 기기·못 연 경우에도 홈이 멀쩡하다
 *
 * `Review.request` 는 **떴는지 알려 주지 않는다.** 그래서 목 브릿지가 「몇 번 불렸나」만
 * 창에 남기고, 여기서는 그 숫자를 본다.
 */

import { test, expect, type Page } from '../support/fixtures';
import { asNewcomer, asReviewCandidate, askOnce, dismissEntry, dismissNudge } from '../support/flow';
import { shot } from '../support/shots';
import type { MockScenario } from '../../src/shared/toss/mockBridge';

async function withBridge(page: Page, scenario: MockScenario) {
  await page.addInitScript((value) => {
    window.__buddhaBridge = { ...window.__buddhaBridge, ...value };
  }, scenario);
}

/** 리뷰 화면을 몇 번 청했나 */
async function reviewCalls(page: Page): Promise<number> {
  return page.evaluate(() => window.__buddhaReviews ?? 0);
}

/** 답을 몇 번 받아 본 사람으로 만든다 */
async function withAnswers(page: Page, answers: number) {
  await page.addInitScript((n) => {
    try {
      localStorage.setItem(
        'buddha.milestones.v2',
        JSON.stringify({
          answers: n,
          lastCountedId: 'seed',
          homeAddShown: 2,
          homeAddDone: true,
          appShareDone: true,
          notifyDone: true,
        }),
      );
    } catch {
      /* 심을 수 없으면 그 단언이 알려 준다 */
    }
  }, answers);
}

test('답을 두 번 이상 받아 본 사람에게 홈 맨 앞에 선다', async ({ page }) => {
  await asReviewCandidate(page);
  await withAnswers(page, 2);
  await page.goto('/');
  await dismissEntry(page);

  const card = page.getByTestId('review-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('여기서 만난 말이 도움이 되었나요?');

  // 입력칸 위다. 이야기를 쓰러 온 사람의 길을 막지 않는다
  await expect(page.getByTestId('concern-field')).toBeVisible();
  await shot(page, '12 리뷰 - 홈 맨 앞 카드', { fullPage: true });
});

test('답을 한 번밖에 못 받아 본 사람에게는 묻지 않는다', async ({ page }) => {
  await asReviewCandidate(page);
  await asNewcomer(page);
  await withAnswers(page, 1);
  await page.goto('/');
  await dismissEntry(page);

  // 한 번 써 본 사람은 이 앱이 무엇인지 아직 모른다. 그 사람에게 별점을 물으면
  // 낮은 점수가 아니라 아무 점수도 안 나온다
  await expect(page.getByTestId('review-card')).toHaveCount(0);
});

test('별점 남기기를 누르면 한 번 청하고 다시 묻지 않는다', async ({ page }) => {
  await asReviewCandidate(page);
  await withAnswers(page, 3);
  await page.goto('/');
  await dismissEntry(page);

  await page.getByTestId('review-card-accept').click();

  await expect(page.getByTestId('review-card')).toHaveCount(0);
  expect(await reviewCalls(page)).toBe(1);

  /*
    다시 열어도 안 뜬다. `Review.request` 는 불러도 안 뜰 수 있고 토스가 피로도를 보고
    정하는데, 그 판단을 카드로 덮어쓰려 들면 SDK 가이드의 「반복 호출하지 마세요」를
    정면으로 어긴다.
  */
  await page.reload();
  await dismissEntry(page);
  await expect(page.getByTestId('review-card')).toHaveCount(0);
});

test('나중에를 누르면 물러났다가 답을 두 번 더 받으면 되돌아온다', async ({ page }) => {
  await asReviewCandidate(page);
  await withAnswers(page, 2);
  await page.goto('/');
  await dismissEntry(page);

  await page.getByTestId('review-card-later').click();
  await expect(page.getByTestId('review-card')).toHaveCount(0);
  // 미룬 것이지 청한 것이 아니다. 리뷰 화면을 열지 않았다
  expect(await reviewCalls(page)).toBe(0);

  // 한 번 더 받아서는 아직이다(2 → 3)
  await page.reload();
  await dismissEntry(page);
  await expect(page.getByTestId('review-card')).toHaveCount(0);

  // 두 번 더 받은 사람. 사람이 직접 미룬 것이라 한 번 더 묻는다
  await withAnswers(page, 4);
  await page.reload();
  await dismissEntry(page);
  await expect(page.getByTestId('review-card')).toBeVisible();
});

test('리뷰를 못 쓰는 토스 앱에서는 카드를 아예 세우지 않는다', async ({ page }) => {
  await asReviewCandidate(page);
  await withAnswers(page, 2);
  await withBridge(page, { review: 'unsupported' });
  await page.goto('/');
  await dismissEntry(page);

  /*
    눌러도 아무 일이 없는 버튼을 세우지 않는다. **우리가 미리 아는 막다른 길**이다.
    「불러도 안 뜰 수 있다」와는 다르다. 저쪽은 토스가 피로도를 보고 정하는 것이고
    이쪽은 지원 여부라 호출 전에 알 수 있다.
  */
  await expect(page.getByTestId('review-card')).toHaveCount(0);
  await expect(page.getByTestId('concern-field')).toBeVisible();
  expect(await reviewCalls(page)).toBe(0);

  // 기회를 영영 버리지도 않는다. 토스 앱을 올리면 그때 묻는다
  await expect(page.evaluate(() => localStorage.getItem('buddha.review.v1'))).resolves.toBe(null);
});

test('리뷰 화면을 못 열면 우리 쪽 사정이므로 기회를 되돌려 준다', async ({ page }) => {
  await asReviewCandidate(page);
  await withAnswers(page, 2);
  await withBridge(page, { review: 'failed' });
  await page.goto('/');
  await dismissEntry(page);

  await page.getByTestId('review-card-accept').click();
  await expect(page.getByTestId('review-card')).toHaveCount(0);
  // 불리기는 했다. 던진 것이 우리 쪽에서 막힌 것이다
  expect(await reviewCalls(page)).toBe(1);

  // 영영 안 묻는 대신 답을 두 번 더 받으면 한 번 더 묻는다
  await withAnswers(page, 4);
  await page.reload();
  await dismissEntry(page);
  await expect(page.getByTestId('review-card')).toBeVisible();
});

test('되짚기 질문이 있는 날에는 리뷰가 물러난다', async ({ page }) => {
  await asReviewCandidate(page);
  await withAnswers(page, 3);
  await page.addInitScript(() => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const pad = (n: number) => `${n}`.padStart(2, '0');
    const date = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
    localStorage.setItem(
      'pocket:mock:recall-last',
      JSON.stringify({ answerId: 'seed-recall-1', date, firstActionTitle: '전화 한 통 걸어 보기' }),
    );
  });
  await page.goto('/');
  await dismissEntry(page);

  // 되짚기는 사람이 「내일 물어봐 주세요」를 눌러 청한 것이고 리뷰는 우리가 하는 부탁이다.
  // 둘이 한 화면에 쌓이면 이야기를 쓰러 온 사람 앞에 카드가 두 장 선다
  await expect(page.getByTestId('recall-sheet')).toBeVisible();
  await expect(page.getByTestId('review-card')).toHaveCount(0);
});

test('리뷰 카드가 떠 있어도 이야기는 그대로 보낼 수 있다', async ({ page }) => {
  await asReviewCandidate(page);
  await withAnswers(page, 2);
  await page.goto('/');
  await dismissEntry(page);
  await expect(page.getByTestId('review-card')).toBeVisible();

  // 카드는 부탁일 뿐이다. 하려던 일을 막으면 안 된다
  await askOnce(page);
  await dismissNudge(page);
  await expect(page.getByTestId('answer')).toBeVisible();
});

test('두 번째 답을 실제로 받고 나면 그 길로 카드가 선다', async ({ page }) => {
  /*
    다른 테스트는 답 횟수를 저장소에 직접 심는다. 그것만으로는 **제품이 임계를 넘는 길**
    (`countAnswer` → 홈 재마운트 → `reviewCardDue`)이 한 번도 안 돈다. 그 길이 끊기면
    아무에게도 카드가 안 뜨는데 나머지 테스트는 전부 초록이다.
  */
  await asReviewCandidate(page);
  await asNewcomer(page);
  await page.goto('/');

  // 첫 답. 아직 안 뜬다
  await askOnce(page);
  await dismissNudge(page);
  await page.goBack();
  await dismissEntry(page);
  await expect(page.getByTestId('review-card')).toHaveCount(0);

  // 두 번째 답
  await askOnce(page, '요즘 사람 만나는 게 버거워요.');
  await dismissNudge(page);
  await page.goBack();
  await dismissEntry(page);

  await expect(page.getByTestId('review-card')).toBeVisible();
});

test('세 번을 그냥 지나가면 더 묻지 않는다', async ({ page }) => {
  await asReviewCandidate(page);
  await withAnswers(page, 2);
  await page.goto('/');

  // 누르지도 미루지도 않고 세 번 지나간다. 셋까지는 뜬다
  for (const _ of [1, 2, 3]) {
    await dismissEntry(page);
    await expect(page.getByTestId('review-card')).toBeVisible();
    await page.reload();
  }

  // 네 번째. 세 번을 무시한 사람은 네 번째에도 안 누른다
  await dismissEntry(page);
  await expect(page.getByTestId('review-card')).toHaveCount(0);
});

test('되짚기를 닫아도 그날은 리뷰가 올라오지 않는다', async ({ page }) => {
  await asReviewCandidate(page);
  await withAnswers(page, 3);
  await page.addInitScript(() => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const pad = (n: number) => `${n}`.padStart(2, '0');
    const date = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
    localStorage.setItem(
      'pocket:mock:recall-last',
      JSON.stringify({ answerId: 'seed-recall-2', date, firstActionTitle: '창문 열고 숨 고르기' }),
    );
  });
  await page.goto('/');
  await dismissEntry(page);
  await expect(page.getByTestId('recall-sheet')).toBeVisible();

  // 되짚기를 치운다
  await page.getByTestId('recall-sheet').getByTestId('sheet-close').click();
  await expect(page.getByTestId('recall-sheet')).toHaveCount(0);

  // 방금 하나를 치운 사람 앞에 부탁이 연달아 두 번 서면 안 된다
  await expect(page.getByTestId('review-card')).toHaveCount(0);
});
