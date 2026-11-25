import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import '../styles/global.css';
import { routeModule } from './routes';
import { initTheme } from './theme';

initTheme();

// Development only: the PDF test hook of src/pdf/devHook.ts, loaded on first call (e2e/pdf-content.spec.ts).
if (import.meta.env.DEV) {
  Object.assign(window, { fingerscorePdf: () => import('../pdf/devHook') });
}

const render = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// The current page's code is already on its way (the preload script of index.html, written by scripts/bundle-layers).
// Waiting for it means the first render shows the page, not the header above an empty main area. A page that cannot
// load renders anyway and shows the reload notice.
routeModule(location.pathname).load().catch(() => {}).finally(render);
