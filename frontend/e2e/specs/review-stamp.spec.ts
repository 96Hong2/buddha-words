/**
 * 감수 도장을 아무 구절에나 찍지 않는가.
 *
 * 시드 399구절 가운데 문헌 감수를 통과한 것은 16구절이다. 나머지는 아직 초안인데,
 * 공유 카드와 공유 링크 첫 화면은 구절을 가리지 않고 「경전 원문은 사람이 감수했어요」를
 * 적고 있었다. 카드는 앱 밖으로 나가 「부처의 말」 워드마크와 나란히 놓이는 그림이라
 * 한 번 나가면 되돌릴 방법이 없다.
 *
 * 여기서 보는 것은 셋이다.
 *   1. 초안 구절에는 감수했다는 말이 어떤 모양으로도 남지 않는가
 *   2. 감수를 통과한 구절에는 그대로 감수했다고 적는가
 *   3. 문구가 길어져 카드가 넘치거나 잘리지 않는가
 *
 * 스텁은 백엔드와 같은 `data/scriptures/seed.json` 을 읽는다. 화면에 뜬 문장을 그 시드에서
 * 되찾아 감수 상태를 확인하고, 그 상태와 카드에 적힌 말이 맞는지 본다.
 */

import { readFileSync } from 'node:fs';

import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../support/fixtures';
import { askOnce, revealBottomBar, DEEP_CONCERN } from '../support/flow';

interface SeedItem {
  id: string;
  text: string;
  review: { status: string };
}

const SEED = new URL('../../../data/scriptures/seed.json', import.meta.url);
const ITEMS: SeedItem[] = (JSON.parse(readFileSync(SEED, 'utf8')) as { items: SeedItem[] }).items;

/** 카드 소표기 두 갈래. 서버가 그리는 카드와 같은 문장이다 */
const REVIEWED_NOTE = '경전 원문은 사람이 감수했어요 · 한 줄 풀이는 AI 생성';
const DRAFT_NOTE = '문헌 감수는 아직 받지 않은 구절이에요 · 한 줄 풀이는 AI 생성';

/**
 * 감수를 통과한 구절로 떨어지도록 맞춰 둔 고민문.
 *
 * 스텁은 글자에서 뽑은 해시로 구절을 고르므로 아무 글이나 쓰면 초안 구절로 떨어진다.
 * 이 글은 육조단경 행유품(`maha.platform.3`)으로 떨어지도록 꼬리 숫자까지 맞춘 것이다.
 * 경전 시드가 바뀌면 이 테스트가 그 자리에서 실패한다. 그때 글을 다시 고른다.
 */
const APPROVED_CONCERN = [
  '어느 쪽을 골라야 할지 몇 달째 정하지 못하고 있어요.',
  '남의 기준을 자꾸 모으다 보니 제 방향을 잃은 것 같아요.',
  '(156번 고쳐 적어요)',
].join('\n');

/** 화면에 뜬 경전 문장을 시드에서 되찾는다. 감수 상태의 정본은 시드 하나다 */
function findByText(shown: string): SeedItem {
  const found = ITEMS.find((item) => item.text.trim() === shown);
  expect(found, `화면의 경전 문장이 시드에 없어요:\n${shown}`).toBeTruthy();
  return found as SeedItem;
}

/** 고민을 보내 공유 카드를 열고, 카드에 실린 구절이 무엇인지 함께 돌려준다 */
async function openShareCard(page: Page, concern: string): Promise<[Locator, SeedItem]> {
  await page.goto('/');
  await askOnce(page, concern);
  const item = findByText((await page.getByTestId('scripture-text').innerText()).trim());

  await revealBottomBar(page);
  await page.getByTestId('share-button').click();
  const card = page.getByTestId('share-card');
  await expect(card).toBeVisible();
  return [card, item];
}

test('초안 구절 카드에는 감수했다고 적지 않는다', async ({ page }) => {
  const [card, item] = await openShareCard(page, DEEP_CONCERN);
  expect(item.review.status, '이 고민문이 더는 초안 구절로 떨어지지 않아요').toBe('needs_review');

  const note = card.locator('.sh-card__ai');
  await expect(note).toHaveText(DRAFT_NOTE);
  // 「감수했」이 어떤 모양으로도 남으면 안 된다. 카드 전체를 훑는다
  expect((await card.innerText()).includes('감수했'), '초안 구절에 감수 도장이 찍혔어요').toBe(
    false,
  );
});

test('감수를 통과한 구절 카드에는 그대로 감수했다고 적는다', async ({ page }) => {
  const [card, item] = await openShareCard(page, APPROVED_CONCERN);
  expect(item.id, '이 고민문이 더는 육조단경 행유품으로 떨어지지 않아요').toBe('maha.platform.3');
  expect(item.review.status).toBe('approved');

  await expect(card.locator('.sh-card__ai')).toHaveText(REVIEWED_NOTE);
});

test('길어진 소표기가 카드를 넘치게 하지 않는다', async ({ page }) => {
  const [card] = await openShareCard(page, DEEP_CONCERN);

  // 카드 안쪽은 overflow: hidden 이라 넘치면 소리 없이 잘린다. 자른 자리를 눈으로 못 본다
  const { client, scroll } = await card.locator('.sh-card__body').evaluate((el) => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
  }));
  expect(scroll, `공유 카드가 ${scroll - client}px 넘쳐서 아래가 잘렸어요`).toBeLessThanOrEqual(
    client,
  );

  // 소표기 줄이 카드 상자 안에 다 들어와 있다
  const box = await card.boundingBox();
  const noteBox = await card.locator('.sh-card__ai').boundingBox();
  expect(box).toBeTruthy();
  expect(noteBox).toBeTruthy();
  const outer = box as NonNullable<typeof box>;
  const inner = noteBox as NonNullable<typeof noteBox>;
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 0.5);
});

test('공유 링크 첫 화면이 초안 구절에 감수했다고 적지 않는다', async ({ page }) => {
  await openShareCard(page, DEEP_CONCERN);

  // 주소는 토큰이 생긴 뒤에 붙는다. 붙기 전에 읽으면 늘 만료 화면으로 간다
  const linkButton = page.getByTestId('share-link');
  await expect(linkButton).toHaveAttribute('data-share-url', /\/s\/.+/);
  await page.goto((await linkButton.getAttribute('data-share-url')) ?? '/s/none');

  const landing = page.getByTestId('landing');
  await expect(landing).toBeVisible();
  const note = page.locator('.sh-land__ai');
  await expect(note).toContainText('문헌 감수를 아직 받지 않았고');
  await expect(note).toContainText('풀이는 AI 가 썼어요');
  expect((await landing.innerText()).includes('감수했'), '초안 구절에 감수 도장이 찍혔어요').toBe(
    false,
  );
});

test('위로 화면은 감수 도장 없이 경전 원문이라고만 적는다', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('entry-card-cta').click();
  await page
    .getByTestId('concern-field')
    .fill('요즘 정말 죽고 싶어요. 아무것도 하기 싫고 매일이 버거워요.');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('crisis')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('crisis-continue').click();
  const solace = page.getByTestId('solace');
  await expect(solace).toBeVisible({ timeout: 15_000 });

  // 인용부 안의 글이 경전이라는 표시는 그대로 두고, 감수 여부만 말하지 않는다.
  // 이 화면에 오르는 구절도 초안일 수 있어 고정 문구로 감수를 적을 수 없다
  const cite = solace.locator('.sf-sc-cite');
  await expect(cite).toContainText('경전 원문');
  expect((await solace.innerText()).includes('감수'), '위로 화면에 감수 도장이 찍혔어요').toBe(
    false,
  );
});
