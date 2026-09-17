import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { initTextSize } from './shared/prefs/textSize';
import './index.css';

// 글자 크기는 첫 페인트 전에 정해진다. 나중에 정하면 글자가 눈앞에서 한 번 커진다
initTextSize();

const container = document.getElementById('root');
if (container == null) throw new Error('#root 가 없어요.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
