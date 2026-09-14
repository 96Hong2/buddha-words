import { Route, Routes } from 'react-router';

import { AnswerScreen } from '../../domains/answer/AnswerScreen';
import { LoadingScreen } from '../../domains/answer/LoadingScreen';
import { ArchiveScreen } from '../../domains/archive/ArchiveScreen';
import { HomeScreen } from '../../domains/concern/HomeScreen';
import { CrisisScreen } from '../../domains/safety/CrisisScreen';
import { SolaceScreen } from '../../domains/safety/SolaceScreen';
import { AppInfoScreen } from '../../domains/settings/AppInfoScreen';
import { HelpLinesScreen } from '../../domains/settings/HelpLinesScreen';
import { PrivacyScreen } from '../../domains/settings/PrivacyScreen';
import { SettingsScreen } from '../../domains/settings/SettingsScreen';
import { LandingScreen } from '../../domains/share/LandingScreen';

import { ROUTES } from './routes';

export function AppRouter() {
  return (
    <Routes>
      <Route path={ROUTES.home} element={<HomeScreen />} />
      <Route path={ROUTES.loading} element={<LoadingScreen />} />
      <Route path={ROUTES.answer} element={<AnswerScreen />} />
      <Route path={ROUTES.crisis} element={<CrisisScreen />} />
      <Route path={ROUTES.solace} element={<SolaceScreen />} />
      <Route path={ROUTES.archive} element={<ArchiveScreen />} />
      <Route path={ROUTES.settings} element={<SettingsScreen />} />
      <Route path={ROUTES.appInfo} element={<AppInfoScreen />} />
      <Route path={ROUTES.privacy} element={<PrivacyScreen />} />
      <Route path={ROUTES.helpLines} element={<HelpLinesScreen />} />
      <Route path={ROUTES.landing} element={<LandingScreen />} />
      <Route path="*" element={<HomeScreen />} />
    </Routes>
  );
}
