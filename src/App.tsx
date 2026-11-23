import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Footer from './ui/Footer';
import Header from './ui/Header';
import { ToastHost } from './ui/Toast';
import SheetPage from './pages/SheetPage';
import Start from './pages/Start';

// Pages besides the start page and the sheet load on demand; the main area stays empty until their code has arrived.
const Tracks = lazy(() => import('./pages/Tracks'));
const Scales = lazy(() => import('./pages/Scales'));
const pageFallback = <div aria-busy="true" />;

// Dev-only renderer preview; the import is dropped from production builds.
const DevSheet = import.meta.env.DEV ? lazy(() => import('./pages/DevSheet')) : null;

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Start />} />
          <Route path="/tracks" element={<Suspense fallback={pageFallback}><Tracks /></Suspense>} />
          <Route path="/sheet" element={<SheetPage />} />
          <Route path="/scales" element={<Suspense fallback={pageFallback}><Scales /></Suspense>} />
          {DevSheet && <Route path="/dev/sheet" element={<Suspense fallback={null}><DevSheet /></Suspense>} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
      <ToastHost />
    </div>
  );
}
