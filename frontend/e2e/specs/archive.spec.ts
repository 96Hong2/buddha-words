/**
 * 보관함: 간직한 다음에 무슨 일이 일어나는가.
 *
 * 「이건 저장하고 싶다」가 이 제품이 노리는 감정인데, 저장한 다음이 비어 있었다.
 * 카드가 눌리지 않았고, 답변 본문이 기기에 남지 않아 앱을 닫으면 전부 사라졌고,
 * 자리가 차면 지울 길이 없었다. 이 스펙은 그 셋을 실제 화면으로 본다.
 */

import { DEEP_CONCERN, askOnce, revealBottomBar, saveAnswerFromScreen } from '../support/flow';
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

  await saveAnswerFromScreen(page);

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

test('보관함에서 다시 봐도 내일 여쭤봐 달라고 할 수 있다', async ({ page, stub }) => {
  /*
    간직해 둔 행동을 다시 읽는 순간이 「이번엔 해 보자」에 가장 가까운 자리다.
    예전에는 이 버튼이 답변 화면에만 있어서, 그 순간을 놓치면 다시 부탁할 길이 없었다.

    알림을 약속하는 문구는 `FLAGS.reminderPush` 가 켜진 빌드에서만 나온다. 여기서는 꺼져
    있으므로 화면이 알림을 말하지 않아야 한다. 지킬 수 없는 말을 먼저 내보내지 않는다.
  */
  test.setTimeout(90_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.goto('/');
  await askOnce(page);
  const action = await flat(page.locator('.acts li b').first());
  await saveAnswerFromScreen(page);

  await page.goto('/archive');
  await page.getByTestId('archive-item').click();
  const sheet = page.getByTestId('archive-detail');
  await expect(sheet).toBeVisible();

  // 간직한 그 행동이 그대로 있고, 그 아래 부탁 버튼이 선다
  expect(await flat(sheet)).toContain(action);
  const ask = sheet.getByTestId('tomorrow-ask');
  await expect(ask).toBeVisible();
  // 왜 눌러야 하는지 버튼 아래 한 줄이 말한다. 버튼만으로는 무엇이 좋아지는지 모른다
  await expect(sheet).toContainText('딱 한 번만');
  // 발송이 준비되기 전에는 알림을 약속하지 않는다
  await expect(ask, '알림을 보낼 수 없는 판에서 알림을 약속했어요').not.toContainText('알림');
  await ask.scrollIntoViewIfNeeded();
  await shot(page, '28-8 보관함 - 간직한 답에서 내일 여쭤봐 달라고 하기');

  await ask.click();
  await expect(sheet.getByTestId('tomorrow-ask-done')).toContainText('다음에 앱을 열면');
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

  // 간직한 뒤. 같은 답이 두 자리에 겹쳐 보이지 않는다.
  // 답변으로 돌아가는 길은 이 카드다. 홈의 복귀 카드는 없앴다(이미 다 보고 온 사람에게도 떴다)
  await page.getByTestId('archive-item').click();
  await expect(page.getByTestId('answer')).toBeVisible();
  await saveAnswerFromScreen(page);

  await page.getByTestId('again-button').click();
  await page.getByRole('button', { name: '보관함' }).click();
  await expect(page.getByTestId('archive')).toBeVisible();
  await expect(page.getByTestId('archive-item')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '오늘 나눈 이야기' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '간직한 말씀' })).toBeVisible();
  // 오늘 것이라는 표시는 남는다
  await expect(page.getByTestId('archive-item')).toContainText('오늘');
});

test('넷째도 그냥 간직된다. 지우는 길도 있다', async ({ page, stub }) => {
  /*
   * 예전에는 셋까지만 담기고 넷째에서 이용권 시트가 길을 막았다. 그 제한을 없앴다.
   * 간직하기는 그 말을 다시 보고 싶어서 누르는 자리라, 거기를 막으면 앱이 주려는 것 자체가
   * 막힌다. 지금 문지기는 짧은 광고 하나뿐이고 개수는 세지 않는다.
   *
   * 지우는 길은 그대로 살아 있어야 한다. 제한이 없다고 지울 수 없으면 잘못 담은 것이
   * 영영 남는다.
   */
  test.setTimeout(120_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await seedThree(page);
  await page.goto('/');
  await askOnce(page, DEEP_CONCERN);
  await saveAnswerFromScreen(page);

  // 넷째인데 막는 것이 없다. 담긴 것은 헬퍼가 완료 시트로 확인했다
  await expect(page.getByTestId('paywall')).toHaveCount(0);

  await page.getByTestId('again-button').click();
  await page.getByRole('button', { name: '보관함' }).click();
  await expect(page.getByTestId('archive-item')).toHaveCount(4);
  await expect(page.getByText('4개')).toBeVisible();

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
  await expect(page.getByText('3개')).toBeVisible();
  await shot(page, '28-4 보관함 - 하나를 지운 뒤', { fullPage: true });
});

test('간직 앞에 짧은 광고가 선다. 보고 나면 담긴다', async ({ page, stub }) => {
  /*
   * 개수 제한 대신 들어온 문지기다. 여기서 보는 것 셋:
   *   1. 누르자마자 광고가 뜨지 않는다. 무엇을 하려는지 한 장 물어본다
   *   2. 「다음에」로 물러서면 담기지 않는다
   *   3. 보고 나면 담긴다
   */
  test.setTimeout(90_000);
  await stub({ pass1Ms: 100, pass2Ms: 150 });
  await page.goto('/');
  await askOnce(page, DEEP_CONCERN);

  await revealBottomBar(page);
  await page.getByTestId('save-button').click();

  const gate = page.getByTestId('save-gate');
  await expect(gate).toBeVisible();
  // 몇 초짜리인지 적는다. 모르면 사람은 중간에 닫고, 그러면 간직도 안 된 채로 끝난다
  await expect(gate).toContainText('보관함에 간직할까요?');
  await expect(page.getByTestId('save-gate-watch')).toContainText('30초 광고 보고 간직하기');
  // 세 자리가 같은 모양이다. 「광고」는 글자이면서 배지다(토스 SSP 「Ad 표기 유지」)
  await expect(page.getByTestId('save-gate-watch').getByTestId('ad-badge')).toBeVisible();
  // 광고를 강조하지 않는다. 개수 제한이 없다는 말이 함께 있어야 무엇을 잃는지가 분명하다
  await expect(gate).toContainText('개수 제한은 없어요');
  await shot(page, '28-5 간직 - 광고를 보면 간직할 수 있어요');

  // 물러서면 아무 일도 없다. 담겼다는 말이 뜨지 않는다
  await page.getByTestId('sheet-close').click();
  await expect(gate).toHaveCount(0);
  await expect(page.getByTestId('save-done')).toHaveCount(0);

  // 같은 자리에서 다시 눌러 보고 나면 담긴다
  await page.getByTestId('save-button').click();
  await expect(gate).toBeVisible();
  await page.getByTestId('save-gate-watch').click();
  await expect(page.getByTestId('save-done')).toContainText('보관함에 간직했어요');
  // 완료 시트는 스스로 닫히지 않는다. 읽던 답에 남는 쪽을 골라 다음 걸음으로 간다
  await page.getByTestId('save-done-stay').click();

  // 기기에 실제로 남았다. 새로 띄워도 한 장이 있다
  await page.goto('/archive');
  await expect(page.getByTestId('archive-item')).toHaveCount(1);
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
  await saveAnswerFromScreen(page);

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
  await saveAnswerFromScreen(page);

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
  await expect(page.getByTestId('save-done')).toContainText('이미 보관함에 있어요');
  await page.getByTestId('save-done-stay').click();
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

/** 앞선 판에서 간직해 한 줄만 남은 것 여럿. 목록이 길어졌을 때를 재려고 심는다 */
async function seedMany(page: Page, count: number): Promise<void> {
  await page.addInitScript((n) => {
    if (localStorage.getItem('buddha.archive.v1') != null) return;
    const items = Array.from({ length: n }, (_, i) => ({
      answerId: `many-${i + 1}`,
      savedAt: Date.now() - (i + 1) * 3_600_000,
      line: `가까울수록 사이를 두어라. (${i + 1}번째로 간직한 말이에요)`,
      tags: ['fatigue'],
      visualTheme: 'rest',
    }));
    localStorage.setItem('buddha.archive.v1', JSON.stringify({ version: 1, items }));
  }, count);
}

test('보관함이 길어지면 한 쪽씩 보여 주고, 별을 켜면 즐겨찾기 탭으로 옮겨 간다', async ({
  page,
}) => {
  /*
   * 간직 개수 제한을 없애면서 목록에 끝이 없어졌다. 스무 장이 넘어가면 아래로만 긴 화면이
   * 되고, 처음 담은 것이 사실상 사라진다. 한 쪽은 열 장이다.
   *
   * 즐겨찾기는 **순서를 바꾸지 않는다.** 예전에는 별을 켜면 그 카드를 전체 목록 맨 위로
   * 끌어올렸는데, 별 하나에 시간순이 통째로 무너져 방금 담은 것이 어디 갔는지 알 수 없었다.
   * 지금은 자기 탭으로 데려가고, 전체 탭의 줄은 그대로 둔다.
   */
  await seedMany(page, 23);
  await page.goto('/archive');
  await expect(page.getByTestId('archive')).toBeVisible();

  // 스물셋을 다 그리지 않는다. 열 장과 「13개 더 보기」다
  await expect(page.getByTestId('archive-item')).toHaveCount(10);
  const more = page.getByTestId('archive-more');
  await expect(more).toContainText('13개 더 보기');
  await shot(page, '29 보관함 - 한 쪽씩 보여 준다', { fullPage: true });

  await more.click();
  await expect(page.getByTestId('archive-item')).toHaveCount(20);
  await more.click();
  await expect(page.getByTestId('archive-item')).toHaveCount(23);
  // 끝에 닿으면 버튼이 사라진다. 눌러도 아무 일이 없는 버튼을 남기지 않는다
  await expect(more).toHaveCount(0);

  /*
   * 맨 뒤(가장 오래 전에 담은 것)에 별을 켠다. 켜는 순간 즐겨찾기 탭으로 옮겨 가고
   * 그 탭 맨 위에 선다. 두 번째 쪽에 그대로 남으면 즐겨찾기가 아무 일도 안 한 것이 된다.
   */
  const last = page.getByTestId('archive-item').last();
  await expect(last).toContainText('23번째로 간직한 말이에요');
  await page.getByTestId('archive-favorite').last().click();

  // 필터는 즐겨찾기가 생긴 뒤에만 선다. 늘 비어 있는 칸은 길만 늘린다
  const filters = page.getByTestId('archive-filter');
  await expect(filters).toHaveCount(2);
  // 별을 켜자마자 그 탭으로 옮겨 왔다. 누르지 않았는데 눌린 상태다
  await expect(filters.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('archive-item')).toHaveCount(1);
  await expect(page.getByTestId('archive-item').first()).toContainText('23번째로 간직한 말이에요');
  await shot(page, '29-1 보관함 - 즐겨찾기만 보기', { fullPage: true });

  /*
   * 전체로 돌아가면 줄은 그대로다. 별을 켰다고 23번째가 맨 앞으로 오지 않는다.
   * 여기가 이번 판에서 바뀐 자리다.
   */
  await filters.nth(0).click();
  // 탭을 바꾸면 첫 쪽부터 다시 본다. 20장짜리 스크롤을 물려받으면 어디를 보고 있었는지 잃는다
  await expect(page.getByTestId('archive-item')).toHaveCount(10);
  await expect(page.getByTestId('archive-item').first()).toContainText('1번째로 간직한 말이에요');
  await page.getByTestId('archive-more').click();
  await page.getByTestId('archive-more').click();
  await expect(page.getByTestId('archive-item').last()).toContainText('23번째로 간직한 말이에요');

  /*
   * 로그는 여기서 본다. 아래 `reload` 가 창을 새로 띄우면 기록이 초기화된다.
   * 별을 켜서 옮겨진 것과 탭을 눌러 간 것을 `how` 가 가른다.
   */
  const logs = await page.evaluate(() => window.__pocketLogs ?? []);
  expect(logs.map((log) => log.name)).toContain('archive_view');
  const autoMove = logs.find((log) => log.name === 'archive_filter' && log.params.how === 'auto');
  expect(autoMove?.params.filter).toBe('favorite');
  const fav = logs.find((log) => log.name === 'archive_favorite');
  // 담은 날로부터 며칠 뒤에 별을 달았는지가 함께 실린다
  expect(fav?.params).toHaveProperty('days_since');
  expect(fav?.params).toHaveProperty('favorites_bucket');

  // 앱을 다시 열어도 별이 남는다. 다시 연 자리는 전체 탭이라 순서도 최신순 그대로다
  await page.reload();
  await expect(page.getByTestId('archive-item').first()).toContainText('1번째로 간직한 말이에요');
  await page.getByTestId('archive-filter').nth(1).click();
  await expect(page.getByTestId('archive-item')).toHaveCount(1);
  await expect(page.getByTestId('archive-item').first()).toContainText('23번째로 간직한 말이에요');

  /*
   * 마지막 별을 끄면 칩이 사라진다. 그때 필터가 'favorite' 에 남아 있으면 빈 목록에
   * 갇히고 「전체」로 돌아갈 버튼도 없다. 실제로 그렇게 됐던 자리다.
   * 끌 때는 탭을 옮기지 않는다. 목록에서 하나를 빼려는 것이지 화면을 떠나려는 것이 아니다.
   */
  await page.getByTestId('archive-favorite').first().click();
  await expect(page.getByTestId('archive-filter')).toHaveCount(0);
  await expect(page.getByTestId('archive-item')).toHaveCount(10);
  await expect(page.getByTestId('archive-item').first()).toContainText('1번째로 간직한 말이에요');
});

test('간직한 말씀은 언제든 내보낼 수 있고, 고민 원문은 따라가지 않는다', async ({ page }) => {
  /*
   * 답변 화면의 공유는 서버가 링크를 만든다. 그 링크는 방금 받은 답에만 살아 있어서,
   * 지난달에 담은 것을 그 길로 보내면 「찾을 수 없어요」가 돌아온다. 그래서 보관함은
   * 기기에 있는 것으로 글을 만들어 보낸다. 나가는 것은 경전 구절과 앱 주소뿐이다.
   */
  await seedWithOriginal(page);
  await page.goto('/archive');
  await page.getByTestId('archive-item').first().click();

  const detail = page.getByTestId('archive-detail');
  await expect(detail).toBeVisible();
  const share = page.getByTestId('archive-share');
  await expect(share).toBeVisible();
  // 시트 안쪽이 스크롤된다. 버튼 묶음이 보이는 자리까지 내려 찍는다
  await share.scrollIntoViewIfNeeded();
  await shot(page, '30 보관함 - 간직한 말씀에도 공유가 있다');

  await share.click();

  const sent = await page.evaluate(() => window.__buddhaShares ?? []);
  expect(sent).toHaveLength(1);
  // 경전 구절이 그대로 실린다
  expect(sent[0]).toContain(KEPT_ORIGINAL.text);
  // 풀이는 실리지 않는다. 그 글은 이 사람의 고민을 읽고 쓴 것이라 사정이 드러난다
  expect(sent[0]).not.toContain('밖에서 얻은 지식보다');
  expect(sent[0]).toContain('부처의 말에서 받았어요');

  const names = await page.evaluate(() => (window.__pocketLogs ?? []).map((log) => log.name));
  expect(names).toContain('archive_share_start');
  expect(names).toContain('archive_share_complete');
});

test('첫 말씀을 간직하면 앱 알리기 카드가 맨 앞에 서고, 둘째부터는 뜨지 않는다', async ({
  page,
}) => {
  /*
   * 첫 간직은 이 앱이 무엇을 해 주는지 사람이 막 알게 된 순간이라, 남에게 옮길 말이
   * 생긴 유일한 자리다. 그렇다고 매번 세우지는 않는다. 보관함은 다시 읽으러 온 자리다.
   */
  await page.addInitScript(() => {
    if (localStorage.getItem('buddha.archive.v1') != null) return;
    localStorage.setItem(
      'buddha.archive.v1',
      JSON.stringify({
        version: 1,
        items: [
          {
            answerId: 'first-one',
            savedAt: Date.now() - 60_000,
            line: '가까울수록 사이를 두어라',
            tags: ['fatigue'],
            visualTheme: 'rest',
          },
        ],
      }),
    );
    // 기본 시드는 「이미 다 권했다」 상태다. 아직 안 권한 사람으로 돌려놓는다
    localStorage.setItem(
      'buddha.milestones.v2',
      JSON.stringify({ answers: 1, homeAddShown: 0, appShareDone: false, notifyDone: false }),
    );
  });
  await page.goto('/archive');

  const card = page.getByTestId('archive-app-share');
  await expect(card).toBeVisible();
  // 목록보다 위에 선다. 아래에 있으면 첫 장을 담은 사람이 스크롤해야 본다
  const cardBox = await card.boundingBox();
  const itemBox = await page.getByTestId('archive-item').first().boundingBox();
  expect(cardBox!.y).toBeLessThan(itemBox!.y);
  await shot(page, '30-1 보관함 - 첫 간직 뒤 앱 알리기', { fullPage: true });

  await page.getByTestId('archive-app-share-send').click();
  const sent = await page.evaluate(() => window.__buddhaShares ?? []);
  expect(sent.at(-1)).toContain('부처의 말');
  // 고민도 답도 여기 없다. 앱을 알리는 자리다
  expect(sent.at(-1)).not.toContain('가까울수록');
  /*
    주소를 만들 수 없는 기기에서는 주소 줄이 통째로 없다. 한때 운영 판이 백엔드 주소를
    그대로 내보냈고, 받은 사람은 전부 `{"detail":"Not Found"}` 를 봤다.
  */
  expect(sent.at(-1)).not.toContain('http');
  expect(sent.at(-1)?.endsWith('부처의 말')).toBe(true);
  await expect(card).toHaveCount(0);

  // 다시 열어도 안 뜬다. 부탁하지 않은 말은 한 번이다
  await page.reload();
  await expect(page.getByTestId('archive-app-share')).toHaveCount(0);
});

test('앱 알리기는 토스가 만들어 준 주소만 내보낸다', async ({ page }) => {
  /*
   * 받는 사람이 열 수 있는 주소는 토스가 만든 것 하나뿐이다(`Share.createLink`).
   * 미니앱이 서는 주소는 토스 앱 밖에서 400 이고, 백엔드 주소는 앱이 아니라 API 다.
   * 우리가 조립한 주소를 내보내면 받은 사람이 막다른 곳에 선다.
   */
  const LINK = 'https://toss.im/_m/stub-app-link';
  await page.addInitScript((link) => {
    window.__buddhaBridge = { ...window.__buddhaBridge, appLink: link };
    if (localStorage.getItem('buddha.archive.v1') == null) {
      localStorage.setItem(
        'buddha.archive.v1',
        JSON.stringify({
          version: 1,
          items: [
            {
              answerId: 'first-one',
              savedAt: Date.now() - 60_000,
              line: '가까울수록 사이를 두어라',
              tags: ['fatigue'],
              visualTheme: 'rest',
            },
          ],
        }),
      );
    }
    localStorage.setItem(
      'buddha.milestones.v2',
      JSON.stringify({ answers: 1, homeAddShown: 0, appShareDone: false, notifyDone: false }),
    );
  }, LINK);
  await page.goto('/archive');

  await page.getByTestId('archive-app-share-send').click();
  const sent = await page.evaluate(() => window.__buddhaShares ?? []);
  expect(sent.at(-1)).toContain(LINK);
  // 백엔드 주소는 여기 없다
  expect(sent.at(-1)).not.toContain('localhost:5187');
});

test('경전이 없는 옛 말씀은 내보낼 수 없다. 한마디는 고민을 읽고 쓴 글이다', async ({ page }) => {
  /*
   * 앞선 판에서 담은 항목은 `line` 한 줄만 남아 있다. 그 한 줄은 이 사람의 고민을 읽고
   * 모델이 쓴 문장이라, 메신저 대화방에 펼쳐지면 받는 사람이 무슨 일인지 짐작한다.
   * 공유 랜딩 페이지가 같은 값을 빼는 것과 같은 이유다(backend/tests/test_share_landing.py).
   *
   * 경전 구절은 이 고민과 무관하게 원래 있던 글이라 아무나 받아도 사정이 안 드러난다.
   * 그래서 경전이 있는 것만 내보낸다.
   */
  await seedThree(page);
  await page.goto('/archive');
  await page.getByTestId('archive-item').first().click();

  const detail = page.getByTestId('archive-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('한마디만 남아 있어요');
  // 버튼 자체가 없다. 눌러 놓고 「안 돼요」라고 답하지 않는다
  await expect(page.getByTestId('archive-share')).toHaveCount(0);
  await expect(detail).toContainText('경전이 있는 말씀에서만');

  // 아무것도 나가지 않았다
  const sent = await page.evaluate(() => window.__buddhaShares ?? []);
  expect(sent).toHaveLength(0);
});

test('공유 시트를 못 여는 기기는 복사하고 복사했다고 말한다', async ({ page, context }) => {
  /*
   * 토스 공유 시트가 없는 기기에서는 글을 클립보드에 넣는다. 그때 **말없이 복사하지 않는다.**
   * 조용히 지나가면 사용자는 복사된 줄 알거나, 아무 일도 안 일어났다고 여긴다.
   */
  await page.addInitScript(() => {
    window.__buddhaBridge = { ...window.__buddhaBridge, share: 'unsupported' };
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedWithOriginal(page);
  await page.goto('/archive');
  await page.getByTestId('archive-item').first().click();

  await page.getByTestId('archive-share').click();
  await expect(page.getByText('보낼 글을 복사했어요')).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(KEPT_ORIGINAL.text);
  // 풀이는 클립보드에도 안 들어간다
  expect(copied).not.toContain('밖에서 얻은 지식보다');

  const method = await page.evaluate(
    () => (window.__pocketLogs ?? []).find((log) => log.name === 'archive_share_complete')?.params,
  );
  expect(method?.method).toBe('copy');
});

test('공유 시트를 스스로 닫으면 실패가 아니다. 아무 말도 하지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    window.__buddhaBridge = { ...window.__buddhaBridge, share: 'dismissed' };
  });
  await seedWithOriginal(page);
  await page.goto('/archive');
  await page.getByTestId('archive-item').first().click();

  await page.getByTestId('archive-share').click();
  // 실패 문구가 뜨지 않는다. 안내 자리는 「무엇이 나가는지」 그대로다
  await expect(page.getByText('지금은 보내지 못했어요')).toHaveCount(0);
  await expect(page.getByText('보낼 글을 복사했어요')).toHaveCount(0);
  await expect(page.getByText('경전 구절과 앱 주소만 나가요')).toBeVisible();

  const names = await page.evaluate(() => (window.__pocketLogs ?? []).map((log) => log.name));
  expect(names).toContain('archive_share_cancel');
  expect(names).not.toContain('archive_share_complete');
});

test('앱 알리기를 닫으면 답변 화면에서도 같은 부탁을 다시 하지 않는다', async ({ page }) => {
  /*
   * 같은 부탁이 두 자리에서 따로 세어지면 한 사람에게 두 번 간다. 보관함 카드와
   * 답변 화면 권유(NudgeOverlay)가 열쇠 하나(`appShareDone`)를 함께 쓴다.
   */
  // 화면을 옮길 때마다 다시 심지 않는다. 덮어쓰면 방금 찍은 「부탁 끝」 표시가 지워져,
  // 다시 뜨는 것이 버그인지 시드 탓인지 알 수 없게 된다
  await page.addInitScript(() => {
    if (localStorage.getItem('buddha.archive.v1') != null) return;
    localStorage.setItem(
      'buddha.archive.v1',
      JSON.stringify({
        version: 1,
        items: [
          {
            answerId: 'only-one',
            savedAt: Date.now() - 60_000,
            line: '가까울수록 사이를 두어라',
            tags: ['fatigue'],
            visualTheme: 'rest',
          },
        ],
      }),
    );
    // 기본 시드는 「이미 다 권했다」 상태라, 아직 안 권한 사람으로 돌려놓는다
    localStorage.setItem(
      'buddha.milestones.v2',
      JSON.stringify({ answers: 1, homeAddShown: 0, appShareDone: false, notifyDone: false }),
    );
  });
  await page.goto('/archive');

  const card = page.getByTestId('archive-app-share');
  await expect(card).toBeVisible();
  await page.getByTestId('archive-app-share-close').click();
  await expect(card).toHaveCount(0);

  const names = await page.evaluate(() => (window.__pocketLogs ?? []).map((log) => log.name));
  expect(names).toContain('archive_app_share_dismiss');

  // 답변 화면 권유 쪽 열쇠도 함께 닫혔다
  const done = await page.evaluate(() => {
    const raw = localStorage.getItem('buddha.milestones.v2');
    return raw == null ? null : (JSON.parse(raw) as { appShareDone?: boolean }).appShareDone;
  });
  expect(done).toBe(true);

  await page.reload();
  await expect(page.getByTestId('archive-app-share')).toHaveCount(0);
});
