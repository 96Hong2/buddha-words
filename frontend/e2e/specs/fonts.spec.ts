/**
 * 글꼴이 실제로 걸렸는지, 그리고 바깥에서 받아 오지는 않는지 본다.
 *
 * 글꼴이 빠져도 글자는 폴백으로 그려지니 배치 단언은 전부 초록이고, 콘솔 오류도 fixtures 가
 * 눈감아 준다. 그래서 한때 경전 글꼴이 통째로 빠진 채 e2e 61건이 전부 통과하고 있었다
 * (남이 올려 둔 미러 저장소가 사라져 404).
 *
 * 서버가 그리는 공유 카드는 마루 부리 파일을 배포에 넣어 들고 다닌다. 앱 화면만 폴백으로
 * 떨어지면 같은 경전이 카드에서는 부리, 화면에서는 시스템 명조로 갈린다. 그 갈림을 첫 검사가 잡는다.
 *
 * 둘째 검사는 반대쪽이다. 한때 본문 글꼴을 cdn.jsdelivr.net 에서 **렌더를 막는 방식으로**
 * 받고 마루 부리 세 굵기를 네이버 주소에서 받았다. 홈 화면 한 장에 외부 글꼴만 671KB 가
 * 내려왔고, 미니앱 최초 접속이 20초를 넘어 심사에서 반려됐다. 지금은 본문이 기기 글꼴로 가고
 * 마루 부리만 번들 안에 있다. 누가 편하다고 CDN 링크를 다시 넣으면 여기서 걸린다.
 */

import { test, expect } from '../support/fixtures';
import { askOnce } from '../support/flow';

/** 그 요소를 브라우저가 실제로 어떤 글꼴 파일로 그렸는지 묻는다. 선언이 아니라 결과다 */
async function renderedFonts(page: import('@playwright/test').Page, selector: string) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  expect(nodeId, `${selector} 를 못 찾았어요`).toBeTruthy();
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  await cdp.detach();
  return fonts.map((f) => f.familyName);
}

test('경전 글은 마루 부리로 그려진다', async ({ page }) => {
  await page.goto('/');
  await askOnce(page);

  await expect(page.getByTestId('scripture-text')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  // font-display: swap 이라 처음 한 번은 폴백으로 그려졌다가 바뀐다. 바뀔 때까지만 기다린다
  await expect
    .poll(() => renderedFonts(page, '[data-testid="scripture-text"]'), { timeout: 10_000 })
    .toContain('MaruBuri');
});

test('첫 화면은 바깥 주소에서 아무것도 받지 않는다', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (req) => {
    const host = new URL(req.url()).host;
    if (host !== new URL(page.url() || 'http://localhost').host && !host.startsWith('localhost')) {
      outside.push(req.url());
    }
  });

  await page.goto('/');
  await expect(page.getByTestId('concern-field')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  expect(outside, `첫 화면이 바깥에서 받고 있어요:\n${outside.join('\n')}`).toEqual([]);
});
