import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { StoreProvider } from './state/store.jsx';
import { useStore } from './state/useStore.js';
import { Header, BottomNav, Footer } from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Search from './pages/Search.jsx';
import Product from './pages/Product.jsx';
import NotificationsPage from './components/Notifications.jsx';

const Account = lazy(() => import('./pages/Account.jsx'));
const SellerCenter = lazy(() => import('./pages/SellerCenter.jsx'));
const Shop = lazy(() => import('./pages/Shop.jsx'));
const Help = lazy(() => import('./pages/Help.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Messages = lazy(() => import('./pages/Messages.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/** Trang cần đăng nhập: chuyển tới đăng nhập, xong quay lại đúng trang này. */
function Guard({ children }) {
  const { me } = useStore();
  const loc = useLocation();
  return me ? children : <Navigate to="/dang-nhap" replace state={{ from: loc.pathname + loc.search }} />;
}

function Shell() {
  const { state, ready } = useStore();
  const { pathname } = useLocation();
  const bare = pathname === '/dang-nhap';
  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Bỏ qua, tới nội dung chính</a>
      {!bare && <Header />}
      <main id="main" tabIndex={-1} className={`wrap page ${bare ? 'page-bare' : ''}`}>
        {!ready ? <p className="muted loading">Đang tải…</p> : (
          <Suspense fallback={<p className="muted loading">Đang tải…</p>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tim-kiem" element={<Search />} />
            <Route path="/san-pham/:id" element={<Product />} />
            <Route path="/shop/:id" element={<Shop />} />
            <Route path="/ho-tro" element={<Help />} />
            <Route path="/tai-khoan" element={<Guard><Account /></Guard>} />
            <Route path="/kenh-nguoi-ban" element={<Guard><SellerCenter /></Guard>} />
            <Route path="/tin-nhan" element={<Guard><Messages /></Guard>} />
            <Route path="/tin-nhan/:id" element={<Guard><Messages /></Guard>} />
            <Route path="/thong-bao" element={<Guard><NotificationsPage /></Guard>} />
            <Route path="/quan-tri" element={<Guard><Admin /></Guard>} />
            <Route path="/dang-nhap" element={<Login />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          </Suspense>
        )}
      </main>
      {!bare && <Footer />}
      {!bare && !pathname.startsWith('/san-pham') && !/^\/tin-nhan\/./.test(pathname) && <BottomNav />}
      <div className="toast-region" role="status" aria-live="polite">{state.toast && <div className="toast">{state.toast}</div>}</div>
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <ScrollTop />
        <Shell />
      </HashRouter>
    </StoreProvider>
  );
}
