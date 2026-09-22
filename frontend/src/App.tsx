import { BrowserRouter } from 'react-router';

import { SessionProvider } from './shared/session';

import { LeafSpentToast } from './domains/leaf';
import { LeafFlight } from './shared/ui';

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
            {/*
              날아오는 연꽃 한 송이. 같은 이유로 라우팅 밖이다. 나는 자리는 홈 칩이고
              닿는 자리는 시트 안 버튼이라, 둘의 공통 조상이 여기뿐이기도 하다.
            */}
            <LeafFlight />
          </SessionProvider>
        </BrowserRouter>
      </AppProviders>
    </ErrorBoundary>
  );
}
