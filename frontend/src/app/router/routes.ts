/** 화면 경로 정본. 문자열을 화면 코드에 손으로 적지 않는다 */
export const ROUTES = {
  home: '/',
  loading: '/loading',
  answer: '/answer',
  crisis: '/crisis',
  solace: '/solace',
  archive: '/archive',
  settings: '/settings',
  appInfo: '/settings/app',
  privacy: '/settings/privacy',
  helpLines: '/settings/help',
  landing: '/s/:token',
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
