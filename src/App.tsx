import { Navigate, Route, Routes } from 'react-router-dom';
import Footer from './ui/Footer';
import Header from './ui/Header';
import SheetPage from './pages/SheetPage';
import Start from './pages/Start';
import Tracks from './pages/Tracks';

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Start />} />
          <Route path="/tracks" element={<Tracks />} />
          <Route path="/sheet" element={<SheetPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
