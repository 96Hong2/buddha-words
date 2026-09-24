/** 화면 경로 정본. 문자열을 화면 코드에 손으로 적지 않는다 */
export const ROUTES = {
  home: '/',
  loading: '/loading',
  answer: '/answer',
  crisis: '/crisis',
  solace: '/solace',
  archive: '/archive',
  /**
   * 오늘의 한마디를 펼친 채로 여는 자리. 홈과 같은 화면이고 시트만 먼저 열려 있다.
   *
   * 콘솔 「주요 기능」이 미니앱 상세에서 이리로 바로 보낸다. 그 목록은 이름만 보고 누르는
   * 자리라, 누른 뒤에 한 번 더 찾아야 하면 이름이 거짓이 된다.
   */
  today: '/today',
  settings: '/settings',
  appInfo: '/settings/app',
  privacy: '/settings/privacy',
  helpLines: '/settings/help',
  landing: '/s/:token',
  /** 개발에서만 열린다. 운영 번들에는 이 화면이 실리지 않는다 */
  debugEvents: '/settings/debug-events',
} as const;

export type RouteKey = keyof typeof ROUTES;

/** 뒤로가기가 앱을 닫아도 되는 자리. 홈이 유일하다 */
export function isTabRoot(path: string): boolean {
  return path === ROUTES.home;
}

/** 뒤로가기가 갈 상위 화면. 없으면 홈으로 */
export function parentOf(path: string): string {
  if (path.startsWith('/settings/')) return ROUTES.settings;
  return ROUTES.home;
}
