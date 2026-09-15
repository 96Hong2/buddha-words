import type { PlaywrightTestConfig } from '@playwright/test';

import { E2E_HTTP_API_URL, E2E_HTTP_PORT, E2E_HTTP_URL, E2E_WEB_PORT, E2E_WEB_URL } from './env';

/**
 * e2e 는 개발 서버를 그대로 쓴다. 대부분의 스펙은 앱 안의 스텁 클라이언트로 돈다.
 *
 * 두 번째 판(`E2E_HTTP_*`)은 같은 앱을 실제 HTTP 클라이언트로 띄운 것이다.
 * 서버가 꺼졌을 때와 서버가 엉뚱한 모양으로 답할 때를 보려면 요청이 실제로 나가야 한다.
 * 그 요청은 Playwright 가 가로채므로 백엔드를 띄우지 않는다.
 */
export const E2E_SERVERS: PlaywrightTestConfig['webServer'] = [
  {
    command: `npx vite --port ${E2E_WEB_PORT} --strictPort`,
    url: E2E_WEB_URL,
    // 개발 서버를 주워 쓰지 않는다. 늘 새로 띄운다.
    reuseExistingServer: false,
    // 이용권 판매는 기본이 꺼짐이다. 파는 화면을 보려면 켜고 띄워야 한다.
    // 꺼진 판이 어떻게 보이는지는 specs 가 창에 플래그를 얹어서 따로 본다.
    env: { VITE_IAP_ARCHIVE_PASS: 'on' },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 90_000,
  },
  {
    command: `npx vite --port ${E2E_HTTP_PORT} --strictPort`,
    url: E2E_HTTP_URL,
    reuseExistingServer: false,
    env: {
      VITE_API_MODE: 'http',
      VITE_API_BASE_URL: E2E_HTTP_API_URL,
      VITE_IAP_ARCHIVE_PASS: 'on',
    },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 90_000,
  },
];
