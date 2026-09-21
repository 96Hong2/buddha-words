import { BrowserRouter } from 'react-router';

import { SessionProvider } from './shared/session';

import { LeafSpentToast } from './domains/leaf';

import { BackHandler } from './app/BackHandler';
import { ErrorBoundary } from './app/ErrorBoundary';
import { SessionTracker } from './app/SessionTracker';
import { AppProviders } from './app/providers';
import { AppRouter } from './app/router';

export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <BrowserRouter>
          <SessionProvider>
            <BackHandler />
            <SessionTracker />
            <div className="app">
              <AppRouter />
            </div>
            {/*
              연꽃을 썼다는 알림. 라우팅 **밖**에 둔다. 쓰는 순간 화면이 바뀌는데
              (이어가기는 답을 만들러 떠나고 간직은 시트가 닫힌다) 화면 안에 두면
              알리려는 순간 함께 사라진다.
            */}
            <LeafSpentToast />
          </SessionProvider>
        </BrowserRouter>
      </AppProviders>
    </ErrorBoundary>
  );
}
