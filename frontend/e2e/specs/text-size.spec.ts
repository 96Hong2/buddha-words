/**
 * 글자 크기 네 단에서 화면이 안 깨진다.
 *
 * 설정의 「글자 크기」는 `<html data-text>` 하나를 바꾸고, 토큰이 그것으로 `--t-scale` 을
 * 정한다(`shared/styles/tokens.css`). **글자만 커지고 상자는 안 커지는 자리**가 그때 드러난다.
 * 실기기에서 「폰트 크게 하면 하단 네비 디자인이 깨진다」는 말을 들었고, 재 보니 두 곳이었다.
 *
 *   1. 탭바의 고른 칸이 48px 에 못 박혀 있어 아이콘이 알약 배경 위로 삐져나왔다
 *   2. 홈 제목이 `flex: none` 이라 줄지 않고 옆 부처 그림을 **화면 밖으로 62px 밀어냈다**
 *
 * 그래서 여기서 재는 것은 셋이다.
 *   - 글자가 제 상자를 벗어나지 않는다 (직계 텍스트 노드의 줄 상자로 본다)
 *   - 무엇도 화면 좌우 밖으로 나가지 않는다
 *   - `overflow: hidden` 인 상자 안에서 내용이 잘리지 않는다
 *
 * 좁은 기기(320px)도 함께 본다. 세 칸으로 나눈 탭바는 폭이 줄면 라벨부터 넘친다.
 */

import { test, expect, type Page } from '../support/fixtures';
import {
  askOnce,
  dismissEntry,
  dismissNudge,
  revealBottomBar,
  withLeaves,
  NORMAL_CONCERN,
} from '../support/flow';

const SIZES = ['s', 'm', 'l', 'xl'] as const;

/** 소수점 자리는 브라우저 반올림이라 1.5px 까지 눈감는다 */
const SLACK = 1.5;

async function setSize(page: Page, size: (typeof SIZES)[number]) {
  await page.evaluate((value) => {
    const root = document.documentElement;
    if (value === 'm') root.removeAttribute('data-text');
    else root.setAttribute('data-text', value);
  }, size);
  // 크기가 바뀌면 배치가 다시 잡힌다. 그 한 프레임을 기다린다
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));
}

/**
 * 넘친 자리를 모두 모은다.
 *
 * ⚠ **애니메이션이 끝난 뒤에 잰다.** 하단 바는 `translateY(110%)` 에서 올라오고 시트는
 * 아래에서 밀려 올라온다. 도중에 재면 「화면 밖」이 참이 되어 없는 결함이 잡힌다.
 */
async function overflows(page: Page): Promise<string[]> {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
  return page.evaluate((slack) => {
    const out: string[] = [];
    const name = (el: Element) => {
      const id = el.getAttribute('data-testid');
      const cls =
        typeof el.className === 'string'
          ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')
          : '';
      return `${el.tagName.toLowerCase()}${id ? `[${id}]` : ''}${cls ? `.${cls}` : ''}`;
    };
    const vw = document.documentElement.clientWidth;
    const range = document.createRange();

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
        continue;
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;

      // 직계 글자가 제 상자를 벗어나나. 텍스트 노드라 자식 요소 검사로는 안 잡힌다
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim() === '') continue;
        range.selectNodeContents(node);
        for (const line of Array.from(range.getClientRects())) {
          if (line.width < 1) continue;
          const over = Math.max(
            box.top - line.top,
            line.bottom - box.bottom,
            box.left - line.left,
            line.right - box.right,
          );
          if (over > slack) {
            out.push(
              `${name(el)} 글자가 상자 밖으로 ${over.toFixed(1)}px "${(node.textContent ?? '').trim().slice(0, 14)}"`,
            );
          }
        }
      }

      // 화면 좌우 밖. 스스로 화면보다 넓은 것(배경 띠)은 뺀다
      if (
        style.position !== 'fixed' &&
        box.width < vw &&
        (box.right > vw + slack || box.left < -slack)
      ) {
        out.push(
          `${name(el)} 가 화면 밖에 있다 left=${box.left.toFixed(0)} right=${box.right.toFixed(0)} (폭 ${vw})`,
        );
      }

      if (
        (style.overflowY === 'hidden' || style.overflowY === 'clip') &&
        el.scrollHeight - el.clientHeight > 1
      ) {
        out.push(`${name(el)} 세로로 ${el.scrollHeight - el.clientHeight}px 잘렸다`);
      }
      if (
        (style.overflowX === 'hidden' || style.overflowX === 'clip') &&
        el.scrollWidth - el.clientWidth > 1
      ) {
        out.push(`${name(el)} 가로로 ${el.scrollWidth - el.clientWidth}px 잘렸다`);
      }
    }
    return Array.from(new Set(out));
  }, SLACK);
}

async function everySize(page: Page, where: string) {
  for (const size of SIZES) {
    await setSize(page, size);
    expect(await overflows(page), `${where} · 글자 크기 ${size}`).toEqual([]);
  }
  await setSize(page, 'm');
}

test('홈·보관함·설정이 네 단에서 넘치지 않는다', async ({ page }) => {
  await page.goto('/');
  await dismissEntry(page);
  await everySize(page, '홈');

  await page.getByTestId('leaf-chip').click();
  await expect(page.getByTestId('leaf-sheet')).toBeVisible();
  await everySize(page, '연꽃 모으기 시트');
  await page.keyboard.press('Escape');

  await page.goto('/archive');
  await expect(page.getByTestId('archive')).toBeVisible();
  await everySize(page, '보관함');

  await page.goto('/settings');
  await expect(page.getByTestId('settings')).toBeVisible();
  await everySize(page, '설정');
});

test('답변과 아래 붙는 것들이 네 단에서 넘치지 않는다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);
  await everySize(page, '답변');

  await dismissNudge(page);
  await revealBottomBar(page);
  await everySize(page, '답변 하단 바');

  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('save-gate')).toBeVisible();
  await everySize(page, '간직 시트');
});

test('이어가기 시트가 네 단에서 넘치지 않는다', async ({ page }) => {
  await withLeaves(page, 2);
  await page.goto('/');
  await askOnce(page);
  await page.goto('/');
  await dismissEntry(page);
  await page.getByTestId('concern-field').fill(NORMAL_CONCERN);
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('continue-sheet')).toBeVisible();
  await everySize(page, '이어가기 시트(연꽃 있음)');
});

test.describe('좁은 기기', () => {
  // 320px 은 우리가 지원하는 가장 좁은 폭이다. 탭바 세 칸이 여기서 먼저 넘친다
  test.use({ viewport: { width: 320, height: 640 } });

  test('320px 에서도 네 단이 버틴다', async ({ page }) => {
    await page.goto('/');
    await dismissEntry(page);
    await everySize(page, '320px 홈');

    await page.goto('/archive');
    await expect(page.getByTestId('archive')).toBeVisible();
    await everySize(page, '320px 보관함');

    await page.goto('/settings');
    await expect(page.getByTestId('settings')).toBeVisible();
    await everySize(page, '320px 설정');
  });
});

test('탭바는 글자를 키워도 아이콘이 알약 밖으로 나가지 않는다', async ({ page }) => {
  /*
   * 실기기 신고의 그 자리다. `.tab` 이 48px 에 못 박혀 있어서, 「아주 크게」에서
   * 아이콘(24px) + 라벨이 그 높이를 넘었고 고른 칸의 알약 배경이 아이콘을 못 덮었다.
   */
  await page.goto('/');
  await dismissEntry(page);

  /*
    「넘치지 않는다」로는 못 잡는다. 고치기 전 값이 딱 0px 이었다: 아이콘 윗변과 알약
    윗변이 같은 자리라 넘치지는 않는데 숨 쉴 틈이 없었다. **여백을 잰다.**
  */
  const MIN_PAD = 1.5;

  for (const size of SIZES) {
    await setSize(page, size);
    const tabs = await page.evaluate(() => {
      const range = document.createRange();
      return Array.from(document.querySelectorAll('.tabbar .tab')).map((tab) => {
        const box = tab.getBoundingClientRect();
        const bar = tab.parentElement!.getBoundingClientRect();
        const icon = tab.querySelector('svg')!.getBoundingClientRect();
        const text = Array.from(tab.childNodes).find(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
        )!;
        range.selectNodeContents(text);
        const lines = range.getClientRects();
        return {
          label: (tab.textContent ?? '').trim(),
          lines: lines.length,
          padTop: icon.top - box.top,
          padBottom: box.bottom - lines[lines.length - 1].bottom,
          inBar: box.top >= bar.top - 0.5 && box.bottom <= bar.bottom + 0.5,
        };
      });
    });

    expect(tabs.length, '탭이 셋이어야 한다').toBe(3);
    for (const tab of tabs) {
      expect(
        tab.padTop,
        `${tab.label} 아이콘 위 여백이 없다 (글자 ${size})`,
      ).toBeGreaterThanOrEqual(MIN_PAD);
      expect(
        tab.padBottom,
        `${tab.label} 라벨 아래 여백이 없다 (글자 ${size})`,
      ).toBeGreaterThanOrEqual(MIN_PAD);
      // 라벨이 접히면 그 칸만 두 줄이 되어 바 전체가 기운다
      expect(tab.lines, `${tab.label} 이 두 줄로 접혔다 (글자 ${size})`).toBe(1);
      expect(tab.inBar, `${tab.label} 칸이 탭바를 벗어났다 (글자 ${size})`).toBe(true);
    }
  }
});
