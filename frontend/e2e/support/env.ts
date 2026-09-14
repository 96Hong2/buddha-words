/**
 * e2e 스택 주소.
 * 손으로 띄워 둔 개발 서버(5173)를 테스트가 주워 쓰면 화면 상태가 섞인다. 포트를 가른다.
 */
export const E2E_WEB_PORT = 5183;
export const E2E_WEB_URL = `http://localhost:${E2E_WEB_PORT}`;

/** 이 주소로 요청이 나가면 개발 스택을 주워 쓴 것이다 */
export const DEV_STACK_URLS = ['http://localhost:5173'] as const;

/** 글꼴 CDN 은 못 받아도 배치가 그대로다. 이 실패만 눈감는다 */
export const FONT_CDN = /cdn\.jsdelivr\.net|fonts\.googleapis\.com|hangeul\.pstatic\.net/;
