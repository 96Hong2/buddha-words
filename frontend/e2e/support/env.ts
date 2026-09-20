/**
 * e2e 스택 주소.
 * 손으로 띄워 둔 개발 서버(5173)를 테스트가 주워 쓰면 화면 상태가 섞인다. 포트를 가른다.
 */
export const E2E_WEB_PORT = 5183;
export const E2E_WEB_URL = `http://localhost:${E2E_WEB_PORT}`;

/**
 * 서버가 끊기거나 엉뚱한 모양으로 답하는 자리를 보려면 스텁이 아니라 **진짜 HTTP 클라이언트**가
 * 돌아야 한다. 스텁은 네트워크를 지나가지 않아 그 실패를 흉내조차 못 낸다.
 * 그래서 같은 앱을 `VITE_API_MODE=http` 로 한 벌 더 띄운다.
 */
export const E2E_HTTP_PORT = 5186;
export const E2E_HTTP_URL = `http://localhost:${E2E_HTTP_PORT}`;

/**
 * 그 판이 부르는 백엔드 주소.
 *
 * 여기에는 아무도 떠 있지 않다. 요청은 전부 Playwright 가 가로채 답을 고른다.
 * 진짜 백엔드를 띄워 두고 그때그때 죽이는 방법보다 훨씬 정확하게 「끊김」과 「모양이 다름」을
 * 갈라 볼 수 있다. 5183 판과 포트를 달리해 두 실행이 서로의 요청을 보지 않게 한다.
 */
export const E2E_HTTP_API_URL = 'http://localhost:5187';

/**
 * 이 주소로 요청이 나가면 개발 스택을 주워 쓴 것이다.
 *
 * 백엔드 주소가 함께 있는 이유: e2e 는 스텁 클라이언트로 돈다. 누가 `.env.local` 에
 * `VITE_API_MODE=http` 를 적어 두면 테스트가 조용히 실제 백엔드로 끌려가고, 그러면 스텁의
 * 결정론에 기대는 단언들이 영문 모를 곳에서 깨진다. 여기서 먼저 잡아 어디로 샜는지 보이게 한다.
 */
export const DEV_STACK_URLS = ['http://localhost:5173', 'http://localhost:8000'] as const;
