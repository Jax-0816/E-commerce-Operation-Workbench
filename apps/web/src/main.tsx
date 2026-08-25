import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/noto-sans-sc/wght.css';

import { App } from './app.js';
import './styles.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('找不到应用根节点。');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
