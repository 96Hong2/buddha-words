import { defineConfig, devices } from '@playwright/test';

/**
 * 화면 증명 전용 실행. `npm run e2e:shots` 가 이 설정을 쓴다.
 *
 * 판정은 `playwright.config.ts` 쪽이 한다. 여기는 **증거를 남기는 실행**이라 다르게 돈다.
 *
 * 1. 포트를 가른다(5184). 판정용 실행(5183)이나 손으로 띄운 개발 서버(5173)와 겹치면
 *    두 실행이 같은 앱 상태를 나눠 쓰다가 캡쳐에 남의 화면이 섞인다.
 * 2. 한 번에 하나씩 돈다. 여러 테스트가 `e2e/shots/` 에 동시에 쓰면 어느 회차의 그림인지
 *    알 수 없게 된다. 순서가 곧 번호(01~30)라 순서가 흔들리면 증거가 흔들린다.
 * 3. 영상을 남긴다. 눌러서 이어지는 길은 그림 한 장으로 증명되지 않는다.
 * 4. 다시 시도하지 않는다. 두 번째 시도가 첫 번째 그림을 덮어쓰면 실패한 화면이 사라진다.
 *
 * 찍는 대상은 그림을 남기는 스펙들이다. `wide-viewport.spec.ts` 는 치수를 재기만 하고
 * 그림을 남기지 않으므로 빠져 있다. 넓은 화면 그림은 `wide-shots.spec.ts` 가 남긴다.
 * `recordings.spec.ts` 도 빠진다. 그쪽은 컨텍스트를 스스로 열어 영상을 이름 붙여 저장하므로
 * 여기서 한 번 더 찍으면 같은 흐름이 두 벌로 남는다.
 * `api-errors.spec.ts` 는 실제 HTTP 클라이언트 판이 필요해 판정용 설정에서만 돈다.
 *
 * 그림이 어디로 갈지는 `BUDDHA_SHOTS_DIR` · `BUDDHA_WIDE_DIR` 로 정한다(`e2e/support/shots.ts`).
 */

/** 판정용 실행(5183)·개발 서버(5173)와 겹치지 않는 자리 */
const SHOTS_PORT = 5184;
const SHOTS_URL = `http://localhost:${SHOTS_PORT}`;

export default defineConfig({
  testDir: './e2e/specs',
  testMatch: [
    'screens.spec.ts',
    'home-cards.spec.ts',
    'answer-detail.spec.ts',
    'extension.spec.ts',
    'flows.spec.ts',
    'purchase.spec.ts',
    'failures.spec.ts',
    'wide-shots.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // 영상과 흔적은 그림 옆에 모은다. `e2e/shots/` 는 통째로 gitignore 라 저장소에 남지 않는다
  outputDir: 'e2e/shots/_runs',
  use: {
    baseURL: SHOTS_URL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    video: 'on',
    trace: 'off',
  },
  projects: [
    {
      // 판정용 실행과 같은 기기다. 기기가 다르면 증거와 판정이 다른 화면을 본다
      name: 'shots',
      use: { ...devices['Pixel 8'] },
    },
  ],
  webServer: [
    {
      command: `npx vite --port ${SHOTS_PORT} --strictPort`,
      url: SHOTS_URL,
      reuseExistingServer: false,
      // 파는 화면을 찍으려면 이용권 판매를 켜고 띄워야 한다. 기본은 꺼짐이다
      env: { VITE_IAP_ARCHIVE_PASS: 'on' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 90_000,
    },
  ],
});
