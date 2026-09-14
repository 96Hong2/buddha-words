import type { PlaywrightTestConfig } from '@playwright/test';

import { E2E_WEB_PORT, E2E_WEB_URL } from './env';

/**
 * e2e 는 개발 서버를 그대로 쓴다. 백엔드는 아직 없고 스텁 클라이언트가 앱 안에서 돈다.
 * 실제 백엔드가 붙으면 여기에 uvicorn 을 한 줄 더 넣는다.
 */
export const E2E_SERVERS: PlaywrightTestConfig['webServer'] = [
  {
    command: `npx vite --port ${E2E_WEB_PORT} --strictPort`,
    url: E2E_WEB_URL,
    // 개발 서버를 주워 쓰지 않는다. 늘 새로 띄운다.
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 90_000,
  },
];
