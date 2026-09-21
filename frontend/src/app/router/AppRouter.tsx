import { Route, Routes } from 'react-router';

import { LoadingScreen } from '../../domains/answer/LoadingScreen';
import { ArchiveScreen } from '../../domains/archive/ArchiveScreen';
import { CrisisScreen } from '../../domains/safety/CrisisScreen';
import { SolaceScreen } from '../../domains/safety/SolaceScreen';
import { AppInfoScreen } from '../../domains/settings/AppInfoScreen';
import { DebugEventsScreen } from '../../domains/settings/DebugEventsScreen';
import { HelpLinesScreen } from '../../domains/settings/HelpLinesScreen';
import { PrivacyScreen } from '../../domains/settings/PrivacyScreen';
import { LandingScreen } from '../../domains/share/LandingScreen';
import { AnswerRoute, HomeRoute, SettingsRoute } from '../screens';

import { ROUTES } from './routes';

export function AppRouter() {
  return (
    <Routes>
      <Route path={ROUTES.home} element={<HomeRoute />} />
      <Route path={ROUTES.loading} element={<LoadingScreen />} />
      <Route path={ROUTES.answer} element={<AnswerRoute />} />
      <Route path={ROUTES.crisis} element={<CrisisScreen />} />
      <Route path={ROUTES.solace} element={<SolaceScreen />} />
      <Route path={ROUTES.archive} element={<ArchiveScreen />} />
      <Route path={ROUTES.settings} element={<SettingsRoute />} />
      <Route path={ROUTES.appInfo} element={<AppInfoScreen />} />
      <Route path={ROUTES.privacy} element={<PrivacyScreen />} />
      <Route path={ROUTES.helpLines} element={<HelpLinesScreen />} />
      {/*
        방금 나간 로그를 눈으로 보는 개발 전용 화면.
        `import.meta.env.DEV` 는 vite 가 빌드 때 false 로 굳히므로 운영 번들에서는
        이 가지가 통째로 죽은 코드가 되고 화면도 수집기도 dist 에서 빠진다.
      */}
      {import.meta.env.DEV && (
        <Route path={ROUTES.debugEvents} element={<DebugEventsScreen />} />
      )}
      <Route path={ROUTES.landing} element={<LandingScreen />} />
      <Route path="*" element={<HomeRoute />} />
    </Routes>
  );
}
