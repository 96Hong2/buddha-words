import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './index.css';

const container = document.getElementById('root');
if (container == null) throw new Error('#root 가 없어요.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
