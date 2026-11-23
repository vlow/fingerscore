import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';
import { hydrate } from './state/store';

hydrate();

// Development only: the PDF proof of src/pdf/spike.ts, loaded on first call (e2e/pdf-spike.spec.ts).
if (import.meta.env.DEV) {
  Object.assign(window, { fingerscorePdfSpike: () => import('./pdf/spike') });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
