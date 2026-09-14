import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'buddha-words',
  brand: {
    // gold-700. 흰 글자 대비 4.91 이라 콘솔 자동 보정에 걸리지 않는다.
    primaryColor: '#8E6B26',
  },
  permissions: [
    // 공유 카드를 앨범에 저장한다.
    { name: 'photos', access: 'write' },
  ],
  navigationBar: {
    withBackButton: true,
    withTitle: true,
    withHomeButton: false,
    theme: 'light',
  },
  webView: {
    // 당겨서 새로고침하면 SPA 가 통째로 다시 뜬다.
    pullToRefreshEnabled: false,
    allowsBackForwardNavigationGestures: false,
  },
  webBundleDir: 'dist',
});
