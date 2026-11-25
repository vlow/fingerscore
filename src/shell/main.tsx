import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import '../styles/global.css';
import { routeModule } from './routes';
import { stylesheetsReady } from './stylesheets';
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

// The current page's code and styles are already on their way (the preload script of index.html, written by
// scripts/bundle-layers). Waiting for them means the first render shows the styled page, not the header above an empty
// main area. A page that cannot load renders anyway and shows the reload notice.
Promise.all([routeModule(location.pathname).load().catch(() => {}), stylesheetsReady()]).finally(render);
