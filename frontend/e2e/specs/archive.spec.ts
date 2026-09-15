/**
 * 보관함: 간직한 다음에 무슨 일이 일어나는가.
 *
 * 「이건 저장하고 싶다」가 이 제품이 노리는 감정인데, 저장한 다음이 비어 있었다.
 * 카드가 눌리지 않았고, 답변 본문이 기기에 남지 않아 앱을 닫으면 전부 사라졌고,
 * 자리가 차면 지울 길이 없었다. 이 스펙은 그 셋을 실제 화면으로 본다.
 */

import { DEEP_CONCERN, askOnce, revealBottomBar } from '../support/flow';
import { expect, test, type Page } from '../support/fixtures';
import { shot } from '../support/shots';

/**
 * 여백·줄바꿈을 지운 비교용 문자열.
 *
 * `textContent` 로 읽는다. `innerText` 는 배치를 타서, 풀이 안의 낱말 버튼처럼 인라인 요소가
 * 섞이면 답변 화면과 보관함에서 다른 문자열이 나온다.
 */
async function flat(locator: { textContent(): Promise<string | null> }): Promise<string> {
  return ((await locator.textContent()) ?? '').replace(/\s+/g, ' ').trim();
}

/** 앞선 판에서 간직해 한 줄만 남은 것 셋. 자리를 채워 놓고 시작할 때 쓴다 */
async function seedThree(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const items = [1, 2, 3].map((n) => ({
      answerId: `seed-${n}`,
      savedAt: Date.now() - n * 3_600_000,
      line: `가까울수록 사이를 두어라. 나무도 붙어 자라면 함께 시든다. (${n}번째로 간직한 말이에요)`,
      tags: ['fatigue', 'confusion'],
      visualTheme: 'rest',
    }));
    // 화면을 옮길 때마다 다시 심지 않는다. 덮어쓰면 그 뒤에 간직한 것이 조용히 사라져,
    // 마지막에 재는 「다시 간직됐다」가 실은 다시 심은 값을 보는 것이 된다
    if (localStorage.getItem('buddha.archive.v1') == null) {
      localStorage.setItem('buddha.archive.v1', JSON.stringify({ version: 1, items }));
    }
  });
}

test('간직한 답변을 보관함에서 다시 펼친다. 앱을 새로 열어도 남는다', async ({ page, stub }) => {
  test.setTimeout(90_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.goto('/');
  await askOnce(page);

  // 답변 화면에 나온 값을 적어 둔다. 보관함이 이것을 그대로 다시 보여 줘야 한다
  const line = await flat(page.getByTestId('buddha-message').locator('blockquote'));
  const scripture = await flat(page.getByTestId('scripture-text').first());
  const explanation = await flat(page.getByTestId('explanation').locator('p.body').first());
  const action = await flat(page.locator('.acts li b').first());
  const closing = await flat(page.getByTestId('closing').locator('p'));

  // 간직하기 전에 이 답이 어디까지 남는지 화면이 먼저 말한다
  await expect(page.getByTestId('keep-note')).toContainText('앱을 닫으면 사라져요');

  await revealBottomBar(page);
  await page.getByTestId('save-button').click();
  await expect(page.getByText('보관함에 간직했어요. 앱을 닫아도 남아요')).toBeVisible();

  // goto 는 판을 새로 띄운다. 세션의 답변은 사라지고 기기에 남은 것만 남는다
  await page.goto('/archive');
  await expect(page.getByTestId('archive')).toBeVisible();
  const card = page.getByTestId('archive-item');
  await expect(card).toHaveCount(1);

  // 예전에는 article 이라 role 도 tabindex 도 없었다. 눌러도 아무 일이 없었다
  await expect(card).toHaveJSProperty('tagName', 'BUTTON');
  await expect(card).toContainText('답변 다시 보기');
  await shot(page, '28-1 보관함 - 간직한 말씀 한 장', { fullPage: true });

  await card.click();
  const sheet = page.getByTestId('archive-detail');
  await expect(sheet).toBeVisible();

  const shown = await flat(sheet);
  expect(shown).toContain(line);
  expect(shown).toContain(scripture);
  expect(shown).toContain(explanation);
  expect(shown).toContain(action);
  expect(shown).toContain(closing);
  await shot(page, '28-2 보관함 - 간직한 답변을 눌러 다시 보기');

  /*
    적은 글은 보관함 저장값에 들어가지 않는다.

    여기서 보는 것은 앱이 고민 글을 저장값에 **따로 담지 않는다**는 것뿐이다. 답변 본문은
    모델이 쓴 글이라 그 안에서 고민을 되짚어 말할 수 있고, 그 대목은 답변의 일부로 함께
    남는다. 스텁 답변에는 그런 문장이 없어서 이 단언만으로는 그 자리를 못 본다.
  */
  expect(shown).not.toContain('팀장님');
  expect(shown).not.toContain('그만둘까');
  const stored = await page.evaluate(() => localStorage.getItem('buddha.archive.v1'));
  expect(stored).not.toContain('팀장님');
  expect(stored).not.toContain('그만둘까');

  /*
    그렇다고 기기에 아무것도 안 남는 것은 아니다. 입력칸에 적던 글은 보낸 뒤에도 임시저장으로
    하루 남아서, 앱을 다시 열면 입력칸에 그대로 있다. 개인정보 안내가 그렇게 적어 두었다.
    이 줄이 없으면 위의 단언이 「고민 글은 기기 어디에도 안 남는다」로 넓게 읽힌다.
  */
  const draft = await page.evaluate(() => localStorage.getItem('buddha.draft.v1'));
  expect(draft).toContain('팀장님');

  // 닫는 길은 셋이다
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await card.click();

  /*
    시트는 바닥에서 올라와 화면의 대부분을 덮는다. 「바깥 어두운 곳」은 그 위에 남는 띠라
    거기를 누른다. 화면 한가운데는 시트 안이라 눌러도 안 닫히는 것이 맞다.
    시트 머리 위에 누를 만한 자리가 실제로 남는지 먼저 잰다. 이 자리가 없으면 시트에 적어 둔
    「바깥 어두운 곳으로 나갈 수 있어요」가 거짓이 된다.
  */
  const box = await sheet.boundingBox();
  expect(box?.y ?? 0).toBeGreaterThan(44);
  await page.getByTestId('sheet-dim').click({ position: { x: 20, y: 20 } });
  await expect(sheet).toHaveCount(0);
  await card.click();
  await page.getByTestId('sheet-close').click();
  await expect(sheet).toHaveCount(0);

  // 앱을 다시 열어도 그대로 있다
  await page.reload();
  await expect(page.getByTestId('archive-item')).toHaveCount(1);
  await page.getByTestId('archive-item').click();
  await expect(page.getByTestId('archive-detail')).toContainText(scripture);
});

test('오늘 받은 답을 간직하면 보관함에 한 장만 남는다', async ({ page, stub }) => {
  test.setTimeout(90_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.goto('/');
  await askOnce(page);

  // 간직하기 전. 오늘 나눈 이야기 한 장과 사라진다는 안내가 있다
  await page.getByTestId('again-button').click();
  await page.getByRole('button', { name: '보관함' }).click();
  await expect(page.getByTestId('archive')).toBeVisible();
  await expect(page.getByRole('heading', { name: '오늘 나눈 이야기' })).toBeVisible();
  await expect(page.getByText('이 답변은 앱을 닫으면 사라져요')).toBeVisible();
  await expect(page.getByTestId('archive-item')).toHaveCount(1);

  // 간직한 뒤. 같은 답이 두 자리에 겹쳐 보이지 않는다
  await page.getByRole('button', { name: '이야기하기' }).click();
  await page.getByTestId('return-card').getByRole('button').click();
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();

  await page.getByTestId('again-button').click();
  await page.getByRole('button', { name: '보관함' }).click();
  await expect(page.getByTestId('archive')).toBeVisible();
  await expect(page.getByTestId('archive-item')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '오늘 나눈 이야기' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '간직한 말씀' })).toBeVisible();
  // 오늘 것이라는 표시는 남는다
  await expect(page.getByTestId('archive-item')).toContainText('오늘');
});

test('자리가 차도 막다른 곳이 아니다. 하나를 지우면 다시 간직할 수 있다', async ({
  page,
  stub,
}) => {
  test.setTimeout(120_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await seedThree(page);
  await page.goto('/');
  await askOnce(page, DEEP_CONCERN);
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();

  // 네 번째다. 여기서 「하나를 지워 주세요」라고 하면서 지울 자리가 없었다
  const wall = page.getByTestId('paywall');
  await expect(wall).toBeVisible();
  await page.getByTestId('sheet-close').click();
  await expect(wall).toHaveCount(0);

  await page.getByTestId('again-button').click();
  await page.getByRole('button', { name: '보관함' }).click();
  // 간직한 셋에 아직 간직하지 않은 오늘 이야기 한 장이 더 있다
  await expect(page.getByTestId('archive-item')).toHaveCount(4);
  await expect(page.getByText('3 / 3')).toBeVisible();

  // 지우는 길. 되돌릴 수 없으니 한 번 더 묻는다
  await page.getByTestId('archive-item').filter({ hasText: '1번째로 간직한 말이에요' }).click();
  // 앞선 판에서 간직해 조각이 없는 항목이다. 없는 것을 있는 척 그리지 않고 사실대로 말한다
  const empty = page.getByTestId('archive-detail');
  await expect(empty).toContainText('한마디만 남아 있어요');
  await expect(empty.getByRole('button', { name: '원문 보기' })).toHaveCount(0);
  await page.getByTestId('archive-delete').click();
  await expect(page.getByText('지우면 이 답변은 다시 볼 수 없어요')).toBeVisible();
  await shot(page, '28-3 보관함 - 지우기 전에 한 번 더 묻는다');

  await page.getByTestId('archive-delete-confirm').click();
  await expect(page.getByTestId('archive-detail')).toHaveCount(0);
  await expect(page.getByTestId('archive-item')).toHaveCount(3);
  await expect(page.getByText('2 / 3')).toBeVisible();
  await shot(page, '28-4 보관함 - 하나를 지운 뒤', { fullPage: true });

  // 지운 자리가 실제로 비었다. 다시 간직할 수 있다
  await page.getByRole('button', { name: '이야기하기' }).click();
  await page.getByTestId('return-card').getByRole('button').click();
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  await expect(page.getByText('보관함에 간직했어요. 앱을 닫아도 남아요')).toBeVisible();

  await page.goto('/archive');
  await expect(page.getByTestId('archive-item')).toHaveCount(3);
  await expect(page.getByText('3 / 3')).toBeVisible();
});

/**
 * 간직해 둔 한 장이 기기에 실제로 어떤 모양으로 남아 있나.
 *
 * 보관함은 무엇을 하나 담을 때마다 **목록 전체를 다시 쓴다.** 그래서 읽는 쪽이 못 읽는 칸은
 * 그다음 저장에서 기기에서도 사라진다. 아래 두 스펙은 그 자리를 본다.
 */
interface StoredItem {
  answerId: string;
  detail?: {
    scripture?: {
      text?: string;
      source?: { base?: string; note?: string; originalLabel?: string; originalText?: string };
    };
    extension?: {
      scripture?: { text?: string };
      alternativeAnalysis?: { heading?: string };
      action?: { title?: string };
    };
  };
}

async function storedItems(page: Page): Promise<StoredItem[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('buddha.archive.v1');
    if (raw == null) return [];
    return ((JSON.parse(raw) as { items?: unknown[] }).items ?? []) as StoredItem[];
  });
}

/** 육조단경 한 장. 한문 원문과 저본 문구까지 갖춘, 지금 판이 간직하는 것과 같은 모양이다 */
const KEPT_ORIGINAL = {
  base: '《육조단경》 행유품 한문 원문',
  note: '고전 한문 원문을 저본으로 삼아 한국어로 새로 옮긴 문장이에요. 외부 문헌 감수에서 출처와 화자를 확인했어요.',
  originalLabel: '한문 원문',
  originalText: '不識本心 學法無益 若識自本心 見自本性 即名丈夫 天人師 佛',
  text: '본래 마음을 알지 못하면 법을 배워도 이익이 없다. 만일 자기 본래 마음을 알고 자기 본성을 본다면, 그를 대장부이자 천인사이며 부처라고 한다.',
};

async function seedWithOriginal(page: Page): Promise<void> {
  await page.addInitScript((kept) => {
    const items = [
      {
        answerId: 'seed-origin',
        savedAt: Date.now() - 7_200_000,
        line: '본래 마음을 모르면 아무리 배워도 남는 것이 없어요',
        tags: ['confusion'],
        visualTheme: 'rest',
        detail: {
          scripture: {
            id: 'maha.platform.3',
            citation: '육조단경 행유품, 본래 마음과 본성을 알아보라는 대목',
            text: kept.text,
            source: {
              base: kept.base,
              translator: '부처의 말 자체 번역',
              note: kept.note,
              originalLabel: kept.originalLabel,
              originalText: kept.originalText,
            },
          },
          explanation: '밖에서 얻은 지식보다 자기 마음을 먼저 보라는 말이에요.',
        },
      },
    ];
    // 화면을 옮길 때마다 다시 심지 않는다. 덮어쓰면 그 뒤에 간직한 것이 조용히 사라진다
    if (localStorage.getItem('buddha.archive.v1') == null) {
      localStorage.setItem('buddha.archive.v1', JSON.stringify({ version: 1, items }));
    }
  }, KEPT_ORIGINAL);
}

test('다른 답을 간직해도 앞서 간직한 저본과 한문 원문이 지워지지 않는다', async ({
  page,
  stub,
}) => {
  test.setTimeout(90_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await seedWithOriginal(page);
  await page.goto('/');
  await askOnce(page);

  // 오늘 받은 답을 간직한다. 이때 앞서 간직해 둔 것까지 통째로 다시 쓰인다
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();
  await expect(page.getByText('보관함에 간직했어요. 앱을 닫아도 남아요')).toBeVisible();

  const kept = (await storedItems(page)).find((item) => item.answerId === 'seed-origin');
  const source = kept?.detail?.scripture?.source;
  expect(source?.base).toBe(KEPT_ORIGINAL.base);
  expect(source?.note).toBe(KEPT_ORIGINAL.note);
  expect(source?.originalLabel).toBe(KEPT_ORIGINAL.originalLabel);
  expect(source?.originalText).toBe(KEPT_ORIGINAL.originalText);

  // 앱을 다시 열어도 그 한 장이 그대로 펼쳐진다
  await page.goto('/archive');
  await page.getByTestId('archive-item').filter({ hasText: '본래 마음을 모르면' }).click();
  const sheet = page.getByTestId('archive-detail');
  await expect(sheet).toContainText(KEPT_ORIGINAL.text);

  /*
    기기에 남아 있어도 화면이 안 그리면 없는 것과 같다. 한동안 보관함 상세에는 「원문 보기」
    버튼조차 없어서, 간직해 둔 저본과 한문 원문을 다시 볼 길이 아예 없었다.
  */
  await sheet.getByRole('button', { name: '원문 보기' }).click();
  const origin = sheet.locator('.sheet');
  await expect(origin).toBeVisible();
  await expect(sheet.getByTestId('scripture-original')).toContainText(KEPT_ORIGINAL.originalText);
  await expect(sheet.getByTestId('scripture-credit')).toContainText(KEPT_ORIGINAL.base);
  await expect(sheet.getByTestId('scripture-credit')).toContainText(KEPT_ORIGINAL.note);
  await shot(page, '28-6 보관함 - 간직한 답의 경전 원문 보기');

  // 원문을 한 번 보려다 상세까지 닫히면 안 된다. Esc 는 위에 뜬 시트만 닫는다
  await page.keyboard.press('Escape');
  await expect(origin).toHaveCount(0);
  await expect(sheet).toBeVisible();
});

test('광고를 보고 받은 다른 관점도 간직한 답에 함께 남는다', async ({ page, stub }) => {
  test.setTimeout(120_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.goto('/');
  await askOnce(page);

  // 먼저 간직하고 광고는 그 뒤에 본다. 카드가 마지막 한마디 아래에 있어 이 순서가 자연스럽다
  await revealBottomBar(page);
  await page.getByTestId('save-button').click();
  await expect(page.getByText('보관함에 간직했어요. 앱을 닫아도 남아요')).toBeVisible();

  await page.getByTestId('extension-card').scrollIntoViewIfNeeded();
  await page.getByTestId('extension-cta').click();
  await expect(page.getByTestId('mock-fullscreen-ad')).toBeHidden({ timeout: 10_000 });

  const result = page.getByTestId('extension-result');
  await expect(result).toBeVisible({ timeout: 20_000 });
  const otherScripture = await flat(result.locator('.scripture .text'));
  const otherHeading = await flat(result.locator('.sub h3'));
  const otherAction = await flat(result.locator('ol.acts li b'));
  expect(otherScripture).not.toBe('');

  // 이미 간직한 답이라 자리를 더 쓰지 않는다. 그래도 그새 받은 관점은 마저 담긴다
  await page.getByTestId('save-button').click();
  await expect(page.getByText('이미 보관함에 있어요')).toBeVisible();
  await shot(page, '28-5 답변 - 광고로 받은 다른 관점을 간직한 뒤');

  const [kept] = await storedItems(page);
  expect(kept.detail?.extension?.scripture?.text).toBe(otherScripture);
  expect(kept.detail?.extension?.alternativeAnalysis?.heading).toBe(otherHeading);
  expect(kept.detail?.extension?.action?.title).toBe(otherAction);
  // 다시 쓰는 길을 한 번 지났다. 저본 문구도 그대로 남아 있어야 한다
  expect(kept.detail?.scripture?.source?.note).toContain('저본으로 삼');

  // 앱을 새로 열어도 기기에 그대로 있다
  await page.goto('/archive');
  await expect(page.getByTestId('archive-item')).toHaveCount(1);
  const [reread] = await storedItems(page);
  expect(reread.detail?.extension?.scripture?.text).toBe(otherScripture);

  /*
    그리고 그것이 화면에 보인다. 기기에만 남아 있고 상세가 안 그리면 사용자에게는
    아무것도 달라지지 않는다. 광고를 끝까지 보고 받은 자리라 가장 아깝다.
  */
  await page.getByTestId('archive-item').click();
  const sheet = page.getByTestId('archive-detail');
  const other = sheet.getByTestId('extension-result');
  await expect(other).toContainText(otherScripture);
  await expect(other).toContainText(otherHeading);
  await expect(other).toContainText(otherAction);
  // 다른 관점에 붙은 경전도 답변 화면과 같은 모양이다. 그 위 경전은 원문까지 열린다
  await expect(sheet.getByRole('button', { name: '원문 보기' })).toBeVisible();
  await shot(page, '28-7 보관함 - 간직한 답에 다른 관점까지 그대로');

  // 좁은 화면에서도 시트 안이 가로로 밀리지 않는다
  await page.setViewportSize({ width: 390, height: 844 });
  const width = await page.evaluate(() => {
    const el = document.querySelector('.ad-sheet');
    return {
      scroll: el?.scrollWidth ?? 0,
      client: el?.clientWidth ?? 0,
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    };
  });
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  expect(width.doc).toBeLessThanOrEqual(width.win);
});
