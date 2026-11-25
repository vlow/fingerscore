import { Navigate, Route, Routes } from 'react-router-dom';
import Footer from './Footer';
import Header from './Header';
import { lazyModule, lazyView } from './lazy';
import { ROUTE_PAGES, type RoutePath } from './routePages';
import { ROUTE_VIEWS } from './routes';
import { ToastHost } from './Toast';

// Every page is its own chunk (src/shell/routes.tsx). The main area stays empty until a page's code has arrived, and
// shows a reload notice when it cannot arrive; the header and footer stay. Each page has its own boundary, so a failed
// page does not keep its notice on the next one.

// Dev-only renderer preview; the import is dropped from production builds.
const DevSheet = import.meta.env.DEV ? lazyView(lazyModule(() => import('../pages/DevSheet').then(m => m.default))) : null;

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Routes>
          {(Object.keys(ROUTE_PAGES) as RoutePath[]).map(path => {
            const Page = ROUTE_VIEWS[path];
            return <Route key={path} path={path} element={<Page />} />;
          })}
          {DevSheet && <Route path="/dev/sheet" element={<DevSheet />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
      <ToastHost />
    </div>
  );
}
