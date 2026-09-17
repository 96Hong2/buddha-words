import { BrowserRouter } from 'react-router';

import { SessionProvider } from './shared/session';

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
          </SessionProvider>
        </BrowserRouter>
      </AppProviders>
    </ErrorBoundary>
  );
}
