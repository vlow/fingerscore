import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';
import { hydrate } from './state/store';

hydrate();

// Development only: the PDF test hook of src/pdf/devHook.ts, loaded on first call (e2e/pdf-content.spec.ts).
if (import.meta.env.DEV) {
  Object.assign(window, { fingerscorePdf: () => import('./pdf/devHook') });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
