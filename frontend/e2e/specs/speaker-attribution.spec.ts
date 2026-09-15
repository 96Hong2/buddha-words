/**
 * 화면이 누구의 말이라고 적는가.
 *
 * 앱 이름이 「부처의 말」이라 경전 카드에 뜨는 문장을 전부 부처가 한 말로 읽기 쉽다.
 * 그런데 시드 399구절 가운데 부처의 직접 발언은 둘뿐이다. 나머지는 전승 게송이거나
 * 제자·장로니·선사·저자가 한 말이다. 화면이 그 구분을 지우면 앱이 없는 말을 지어낸 것이 된다.
 *
 * 여기서 보는 것은 네 가지다.
 *   1. 카드에 뜬 문장이 시드에 그대로 있는 문장인가 (모델이 경전을 짓지 않았나)
 *   2. 그 구절의 화자가 부처가 아닌데 화면이 부처의 말이라고 적지 않았나
 *   3. 저본 표기가 사실인가 (한문 문헌에 「영역본」, 미감수 구절에 「감수했다」가 붙지 않나)
 *   4. 스텁과 실제 서버가 같은 문장을 쓰는가
 *
 * 스텁은 백엔드와 같은 `data/scriptures/seed.json` 을 읽으므로, 여기서 고른 구절과
 * 서버가 고르는 구절은 같은 문장 풀에서 나온다.
 */

import { readFileSync } from 'node:fs';

import type { Page } from '@playwright/test';

import { test, expect } from '../support/fixtures';
import { askOnce, DEEP_CONCERN, NORMAL_CONCERN } from '../support/flow';

interface SeedItem {
  id: string;
  citation: string;
  text: string;
  speaker_kind: string;
  speaker_name: string;
  text_type: string;
  source_language: string;
  source_text: string;
  review: { status: string };
  attribution: { is_direct_buddha_speech: boolean; display_label: string };
}

const SEED = new URL('../../../data/scriptures/seed.json', import.meta.url);
const ITEMS: SeedItem[] = (JSON.parse(readFileSync(SEED, 'utf8')) as { items: SeedItem[] }).items;

/**
 * 감수를 통과한 구절을 화면에 올리려고 고른 고민문.
 *
 * 스텁은 글자에서 뽑은 해시로 구절을 고르므로 아무 글이나 쓰면 화자가 아직 없는(미감수)
 * 구절로 떨어진다. 그러면 화자 줄이 출처와 같아져 이 검사가 아무것도 못 본다.
 * 이 글은 테리가타 12.1(뿐니까 장로니)로 떨어지도록 「(7번 고쳐 적어요)」까지 맞춰 둔 것이다.
 * 경전 시드가 바뀌면 이 테스트가 그 자리에서 실패한다. 그때 글을 다시 고른다.
 */
const PUNNIKA_CONCERN = [
  '친구들은 다 자리를 잡았는데 저만 뒤처진 것 같아요.',
  '남들 소식을 볼 때마다 제가 초라하게 느껴져요.',
  '(7번 고쳐 적어요)',
].join('\n');

/**
 * 「부처가 직접 그렇게 말했다」로 읽히는 문구.
 *
 * 「— 부처,」 는 쉼표까지 본다. 법화경 신해품은 화자를 「— 부처의 제자들, …」 이라고 적는데
 * 쉼표를 빼고 재면 그 줄이 부처의 직접 발언으로 잘못 걸린다.
 */
const BUDDHA_VOICE = [
  '— 부처,',
  '부처가 말',
  '부처께서',
  '부처님께서',
  '부처님이 말',
  '부처님 말씀',
  '부처의 말씀',
];

/** 카드에 뜬 문장으로 시드 구절을 되찾는다. 못 찾으면 화면의 문장이 시드 밖에서 온 것이다 */
function findByText(shown: string): SeedItem {
  const found = ITEMS.find((item) => item.text.trim() === shown);
  expect(found, `화면의 경전 문장이 시드에 없어요:\n${shown}`).toBeTruthy();
  return found as SeedItem;
}

/**
 * 귀속 줄에 무엇이 떠야 하나. 시드가 적어 둔 문구가 있으면 그것, 없으면 출처 한 줄이다.
 * 화면이 화자 이름을 조합하기 시작하면 「부처의 말」이라는 이름에 끌려 남의 말이 부처의 말이 된다.
 */
function attributionLine(item: SeedItem): string {
  const label = item.attribution.display_label;
  return label !== '' ? label : item.citation;
}

function assertNoBuddhaVoice(where: string, shown: string, item: SeedItem): void {
  if (item.speaker_kind === 'buddha') {
    expect(item.attribution.is_direct_buddha_speech).toBe(true);
    return;
  }
  const hits = BUDDHA_VOICE.filter((phrase) => shown.includes(phrase));
  expect(
    hits,
    `${where}: ${item.id} 의 화자는 ${item.speaker_kind} 인데 부처의 말로 적혔어요 (${hits.join(', ')})`,
  ).toEqual([]);
}

test('경전 카드는 시드의 문장 그대로를 보여 주고, 화자를 부처로 바꾸지 않는다', async ({
  page,
}) => {
  await page.goto('/');
  await askOnce(page, DEEP_CONCERN);

  const shown = (await page.getByTestId('scripture-text').innerText()).trim();
  const item = findByText(shown);

  // 귀속 줄도 시드가 적어 둔 그대로다. 화면에서 다시 지어 쓰지 않는다
  await expect(page.getByTestId('scripture-citation')).toHaveText(attributionLine(item));

  const card = (await page.getByTestId('scripture-card').innerText()).trim();
  assertNoBuddhaVoice('경전 카드', card, item);
});

test('감수가 화자를 밝힌 구절은 그 화자의 이름으로 뜬다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page, PUNNIKA_CONCERN);

  const shown = (await page.getByTestId('scripture-text').innerText()).trim();
  const item = findByText(shown);
  expect(item.id, '이 고민문이 더는 테리가타 12.1 로 떨어지지 않아요').toBe('thig.12.1');

  // 뿐니까 장로니가 브라만에게 한 말이다. 부처의 직접 발언이 아니다
  expect(item.speaker_kind).toBe('nun');
  expect(item.attribution.is_direct_buddha_speech).toBe(false);

  const line = page.getByTestId('scripture-citation');
  await expect(line).toHaveText(attributionLine(item));
  await expect(line).toContainText('뿐니까');

  const card = (await page.getByTestId('scripture-card').innerText()).trim();
  assertNoBuddhaVoice('경전 카드', card, item);
});

test('원문 시트를 열어도 화자가 부처로 바뀌지 않는다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page, NORMAL_CONCERN);

  const shown = (await page.getByTestId('scripture-text').innerText()).trim();
  const item = findByText(shown);

  await page.getByRole('button', { name: '원문 보기' }).first().click();
  const sheet = page.getByRole('dialog', { name: '경전 원문' });
  await expect(sheet).toBeVisible();

  // 시트가 펼치는 것도 시드의 같은 문장이다
  await expect(sheet).toContainText(item.text);
  await expect(sheet).toContainText(item.citation);

  assertNoBuddhaVoice('경전 원문 시트', (await sheet.innerText()).trim(), item);
});

/**
 * 한문 문헌으로 떨어지도록 맞춰 둔 고민문.
 *
 * 육조단경 행유품(`maha.platform.3`)은 한문 원문에서 바로 옮긴 글이고 감수를 통과했으며
 * 원문이 데이터에 실려 있다. 저본 표기·감수 표기·원문 표시 셋을 한 화면에서 다 볼 수 있는
 * 유일한 자리라 이 구절로 못 박는다. 경전 시드가 바뀌면 여기서 먼저 실패한다.
 */
const PLATFORM_CONCERN = [
  '어느 쪽을 골라야 할지 몇 달째 정하지 못하고 있어요.',
  '남의 기준을 자꾸 모으다 보니 제 방향을 잃은 것 같아요.',
  '(156번 고쳐 적어요)',
].join('\n');

/** 원문 시트를 열고, 그 안에 뜬 구절을 시드에서 되찾는다 */
async function openOriginSheet(page: Page, concern: string) {
  await page.goto('/');
  await askOnce(page, concern);
  const item = findByText((await page.getByTestId('scripture-text').innerText()).trim());
  await page.getByRole('button', { name: '원문 보기' }).first().click();
  const sheet = page.getByRole('dialog', { name: '경전 원문' });
  await expect(sheet).toBeVisible();
  return { sheet, item };
}

test('한문 문헌에 「영역본을 옮겼다」고 적지 않는다', async ({ page }) => {
  const { sheet, item } = await openOriginSheet(page, PLATFORM_CONCERN);
  expect(item.id, '이 고민문이 더는 육조단경 행유품으로 떨어지지 않아요').toBe('maha.platform.3');
  expect(item.source_language).toBe('zh');

  const credit = page.getByTestId('scripture-credit');
  await expect(credit).toContainText('고전 한문 원문');
  // 육조단경은 영역본을 거치지 않았다. 이 낱말이 다시 붙으면 앱이 거짓을 적는 것이다
  await expect(credit).not.toContainText('영역');
  await expect(sheet).not.toContainText('영역본');
});

test('감수를 통과한 구절에만 감수했다고 적는다', async ({ page }) => {
  const approved = await openOriginSheet(page, PLATFORM_CONCERN);
  expect(approved.item.review.status).toBe('approved');
  await expect(page.getByTestId('scripture-credit')).toContainText('감수에서 출처와 화자를 확인');

  const draft = await openOriginSheet(page, DEEP_CONCERN);
  expect(draft.item.review.status, '이 고민문이 더는 미감수 구절로 떨어지지 않아요').toBe(
    'needs_review',
  );
  const credit = page.getByTestId('scripture-credit');
  await expect(credit).toContainText('팔리 원문');
  await expect(credit).toContainText('아직 받지 않은');
  await expect(credit).not.toContainText('확인했어요');
});

test('데이터에 원문이 있으면 화면에도 원문이 뜬다', async ({ page }) => {
  const { item } = await openOriginSheet(page, PLATFORM_CONCERN);
  expect(item.source_text, '이 구절에는 한문 원문이 실려 있어야 한다').not.toBe('');

  const original = page.getByTestId('scripture-original');
  await expect(original).toBeVisible();
  await expect(original).toHaveText(item.source_text);
  // 무엇을 보고 있는지 화면이 말해 준다. 번역과 원문이 한 덩어리로 보이면 안 된다
  await expect(page.getByRole('dialog', { name: '경전 원문' })).toContainText('한문 원문');
  await expect(page.getByRole('dialog', { name: '경전 원문' })).toContainText('한국어 번역');
});

test('원문이 없는 구절에는 원문 자리를 만들지 않는다', async ({ page }) => {
  const { item } = await openOriginSheet(page, DEEP_CONCERN);
  expect(item.source_text).toBe('');
  await expect(page.getByTestId('scripture-original')).toHaveCount(0);
});

/**
 * 스텁과 실제 서버가 같은 문장을 쓰는지.
 *
 * 저본 문구는 두 곳에 있다. 서버가 payload 에 실어 보내는 값(`repo.py`)과 스텁 백엔드가
 * 같은 규칙으로 만드는 값(`stubData.ts`)이다. 한쪽만 고치면 개발에서 본 화면과 배포된
 * 화면이 다른 말을 적는데, 화면 검사로는 어느 쪽도 안 걸린다. 둘을 나란히 놓고 글자까지 본다.
 */
test('저본 문구가 서버와 스텁에서 같다', () => {
  const py = readFileSync(
    new URL('../../../backend/app/domains/scripture/repo.py', import.meta.url),
    'utf8',
  );
  const ts = readFileSync(new URL('../../src/shared/api/stubData.ts', import.meta.url), 'utf8');

  function fromPython(pattern: RegExp): string {
    const found = py.match(pattern);
    expect(found, `repo.py 에서 ${pattern} 을 못 찾았어요`).toBeTruthy();
    return (found as RegExpMatchArray)[1];
  }
  function fromStub(key: string): string {
    const found = ts.match(new RegExp(`\\n  ${key}: '([^']+)'`));
    expect(found, `stubData.ts 의 SOURCE_NOTES 에 ${key} 가 없어요`).toBeTruthy();
    return (found as RegExpMatchArray)[1];
  }

  expect(fromStub('pli')).toBe(fromPython(/"pli": "([^"]+)"/));
  expect(fromStub('zh')).toBe(fromPython(/"zh": "([^"]+)"/));
  expect(fromStub('unknown')).toBe(fromPython(/_SOURCE_BASE_UNKNOWN = "([^"]+)"/));
  expect(fromStub('reviewed')).toBe(fromPython(/_REVIEW_DONE = "([^"]+)"/));
  expect(fromStub('unreviewed')).toBe(fromPython(/_REVIEW_PENDING = "([^"]+)"/));
  expect(fromStub('license')).toBe(fromPython(/source\["license"\] = "([^"]+)"/));
});
