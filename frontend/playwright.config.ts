import { defineConfig, devices } from '@playwright/test';

import { E2E_HTTP_URL, E2E_WEB_URL } from './e2e/support/env';
import { E2E_SERVERS } from './e2e/support/servers';

/**
 * 미니앱은 토스 앱 WebView 안에서 돈다. 데스크탑 폭으로 재면 배치 확인이 거짓이 된다.
 * 검증은 e2e 한 겹이다. 목으로 격리한 단위 테스트를 만들지 않는다.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_WEB_URL,
    trace: 'on-first-retry',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 8'] },
      testIgnore: ['**/ios-layout.spec.ts', '**/api-errors.spec.ts'],
    },
    {
      name: 'ios-layout',
      // iOS 는 WKWebView 라 브라우저가 그리는 부품 크기가 다르다. 한쪽만 재면 넘치는 것을 못 본다
      use: { ...devices['iPhone 14'] },
      testMatch: '**/ios-layout.spec.ts',
    },
    {
      // 서버가 꺼졌을 때·엉뚱한 모양으로 답할 때. 실제 HTTP 클라이언트로 띄운 판을 본다
      name: 'api-errors',
      use: { ...devices['Pixel 8'], baseURL: E2E_HTTP_URL },
      testMatch: '**/api-errors.spec.ts',
    },
  ],
  webServer: E2E_SERVERS,
});
