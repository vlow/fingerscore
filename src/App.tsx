import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Footer from './ui/Footer';
import Header from './ui/Header';
import { LoadBoundary } from './ui/LoadBoundary';
import { ToastHost } from './ui/Toast';
import SheetPage from './pages/SheetPage';
import Start from './pages/Start';

// Pages besides the start page and the sheet load on demand; the main area stays empty until their code has arrived,
// and shows a reload notice when it cannot arrive (the header and footer stay). Each route keys its own boundary:
// React would otherwise reuse one boundary instance, failed state included, across these routes.
const Tracks = lazy(() => import('./pages/Tracks'));
const Scales = lazy(() => import('./pages/Scales'));
const Terms = lazy(() => import('./pages/Terms'));
const Imprint = lazy(() => import('./pages/Imprint'));
const Privacy = lazy(() => import('./pages/Privacy'));
const About = lazy(() => import('./pages/About'));
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
          <Route path="/tracks" element={<LoadBoundary key="tracks"><Suspense fallback={pageFallback}><Tracks /></Suspense></LoadBoundary>} />
          <Route path="/sheet" element={<SheetPage />} />
          <Route path="/scales" element={<LoadBoundary key="scales"><Suspense fallback={pageFallback}><Scales /></Suspense></LoadBoundary>} />
          <Route path="/terms" element={<LoadBoundary key="terms"><Suspense fallback={pageFallback}><Terms /></Suspense></LoadBoundary>} />
          <Route path="/imprint" element={<LoadBoundary key="imprint"><Suspense fallback={pageFallback}><Imprint /></Suspense></LoadBoundary>} />
          <Route path="/privacy" element={<LoadBoundary key="privacy"><Suspense fallback={pageFallback}><Privacy /></Suspense></LoadBoundary>} />
          <Route path="/about" element={<LoadBoundary key="about"><Suspense fallback={pageFallback}><About /></Suspense></LoadBoundary>} />
          {DevSheet && <Route path="/dev/sheet" element={<LoadBoundary key="dev-sheet"><Suspense fallback={null}><DevSheet /></Suspense></LoadBoundary>} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
      <ToastHost />
    </div>
  );
}
