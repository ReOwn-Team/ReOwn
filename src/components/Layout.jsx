import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import { CATEGORIES } from '../data/mock.js';
import { Glyph } from './Art.jsx';
import { TrustBadge } from './ui.jsx';
import { money } from '../lib/format.js';
import { searchProducts } from '../../shared/search.js';
import { readHistory, pushHistory, removeHistory, clearHistory } from '../lib/searchHistory.js';
import { api } from '../api/client.js';
import { useDismiss } from '../lib/useDismiss.js';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import ThemeMenu from './ThemeMenu.jsx';
import { NotificationBell, ChatLink } from './Notifications.jsx';

const POPULAR_FALLBACK = ['laptop', 'iphone', 'giáo trình', 'tai nghe', 'nồi cơm điện', 'bàn học'];

function SearchBox() {
  const { state, sellerScores, mode } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const loc = useLocation();
  const urlQ = loc.pathname === '/tim-kiem' ? params.get('q') || '' : '';
  const routeKey = loc.pathname + '?' + params.toString();
  const [q, setQ] = useState(urlQ);
  const [seenRoute, setSeenRoute] = useState(routeKey);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [history, setHistory] = useState(readHistory);
  const [popular, setPopular] = useState(POPULAR_FALLBACK);
  const box = useRef(null);

  if (seenRoute !== routeKey) { setSeenRoute(routeKey); setQ(urlQ); setOpen(false); }
  useDismiss(box, open, useCallback(() => setOpen(false), []));
  useEffect(() => {
    if (mode !== 'api') return;
    api('/search/popular').then((r) => { if (r?.terms?.length >= 3) setPopular(r.terms); }).catch(() => {});
  }, [mode]);

  const suggestions = useMemo(() => {
    if (!q.trim()) return [];
    return searchProducts(q, state.products.filter((p) => !p.sold)).slice(0, 6).map((x) => x.product);
  }, [q, state.products]);

  const typing = q.trim().length > 0;
  const options = typing
    ? suggestions.map((p) => ({ key: p.id, run: () => { setHistory(pushHistory(q)); nav(`/san-pham/${p.id}`); } }))
    : [...history, ...popular.filter((t) => !history.includes(t))].map((t) => ({ key: t, run: () => go(t) }));

  const go = (query) => {
    setOpen(false);
    if (query) setHistory(pushHistory(query));
    nav(`/tim-kiem${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, options.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Enter' && active >= 0 && options[active]) { e.preventDefault(); setOpen(false); options[active].run(); }
  };
  const showPanel = open && (typing ? suggestions.length > 0 : history.length + popular.length > 0);
  const hIdx = (t) => options.findIndex((o) => o.key === t);

  return (
    <form className="searchbox" ref={box} role="search" onSubmit={(e) => { e.preventDefault(); go(q.trim()); }}>
      <label htmlFor="q" className="sr-only">Tìm đồ cũ</label>
      <input id="q" type="search" autoComplete="off" placeholder="Tìm laptop, điện thoại, giáo trình…" value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }} onFocus={() => { setOpen(true); setHistory(readHistory()); }} onClick={() => setOpen(true)} onKeyDown={onKey}
        role="combobox" aria-expanded={showPanel} aria-controls="q-suggest" aria-autocomplete="list"
        aria-activedescendant={active >= 0 && options[active] ? `opt-${active}` : undefined} />
      <button className="search-btn" aria-label="Tìm kiếm"><Icon name="search" size={20} /></button>
      {showPanel && (typing ? (
        <ul className="suggest" id="q-suggest" role="listbox">
          {suggestions.map((p, i) => (
            <li key={p.id} id={`opt-${i}`} role="option" aria-selected={i === active}>
              <Link to={`/san-pham/${p.id}`} className={i === active ? 'on' : ''} onClick={() => { setOpen(false); setHistory(pushHistory(q)); }}>
                <span className="sg-title">{p.title}</span>
                <span className="sg-price">{money(p.price)}</span>
                <TrustBadge result={sellerScores[p.sellerId]} />
              </Link>
            </li>
          ))}
          <li><button type="submit" className="sg-all">Xem tất cả “{q}”</button></li>
        </ul>
      ) : (
        <div className="suggest suggest-idle" id="q-suggest" role="listbox" aria-label="Gợi ý tìm kiếm">
          {history.length > 0 && (
            <div className="sg-group">
              <div className="sg-head"><span>Tìm gần đây</span><button type="button" className="linkbtn small" onClick={() => setHistory(clearHistory())}>Xoá</button></div>
              <ul className="sg-recent">
                {history.map((t) => (
                  <li key={t} id={`opt-${hIdx(t)}`} role="option" aria-selected={hIdx(t) === active} className={hIdx(t) === active ? 'on' : ''}>
                    <button type="button" className="sg-term" onClick={() => go(t)}><Icon name="clock" size={16} />{t}</button>
                    <button type="button" className="sg-x" aria-label={`Xoá “${t}” khỏi lịch sử`} onClick={() => setHistory(removeHistory(t))}><Icon name="close" size={14} /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="sg-group">
            <div className="sg-head"><span>Tìm nhiều</span></div>
            <div className="sg-chips">
              {popular.filter((t) => !history.includes(t)).map((t) => (
                <button type="button" key={t} id={`opt-${hIdx(t)}`} role="option" aria-selected={hIdx(t) === active} className={`chip ${hIdx(t) === active ? 'on' : ''}`} onClick={() => go(t)}>{t}</button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </form>
  );
}

function CatBar() {
  const loc = useLocation();
  const cur = loc.pathname === '/tim-kiem' ? new URLSearchParams(loc.search) : null;
  const on = (k, v) => cur && cur.get(k) === v;
  const items = [
    ...CATEGORIES.map((c) => ({ k: 'cat', v: c.id, label: c.short || c.label })),
    { k: 'max', v: '500000', label: 'Dưới 500K' },
    { k: 'trust', v: 'A', label: 'Người bán uy tín' },
  ];
  return (
    <nav className="catbar" aria-label="Danh mục">
      <div className="wrap catbar-in">
        {items.map((i) => <Link key={i.label} to={`/tim-kiem?${i.k}=${i.v}`} className={on(i.k, i.v) ? 'active' : ''} aria-current={on(i.k, i.v) ? 'page' : undefined}>{i.label}</Link>)}
      </div>
    </nav>
  );
}

function ProfileMenu({ me, onLogout, logoutLabel }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const loc = useLocation();
  const [seenRoute, setSeenRoute] = useState(loc.key);
  if (seenRoute !== loc.key) { setSeenRoute(loc.key); setOpen(false); }
  useDismiss(box, open, useCallback(() => setOpen(false), []));
  const first = me.name.split(' ').pop();
  const admin = me.role === 'admin';
  return (
    <div className="pmenu" ref={box}>
      <button type="button" className="hdr-act pmenu-btn" aria-haspopup="menu" aria-expanded={open} aria-controls="pmenu-pop" onClick={() => setOpen(!open)}>
        <span className="avatar">{first[0]}</span><span>{first}</span>
      </button>
      {open && (
        <div className="pmenu-pop" id="pmenu-pop" role="menu" aria-label="Tài khoản">
          <div className="pmenu-who"><span className="avatar">{first[0]}</span><span><b>{me.name}</b><span className="small muted">{admin ? 'Quản trị viên' : me.school || me.phone}</span></span></div>
          {admin ? (
            <Link role="menuitem" to="/quan-tri"><Icon name="shield" size={18} />Trang quản trị</Link>
          ) : (
            <>
              <Link role="menuitem" to="/tai-khoan"><Icon name="user" size={18} />Tài khoản của tôi</Link>
              <Link role="menuitem" to="/tai-khoan?tab=don-mua"><Icon name="bag" size={18} />Đơn mua</Link>
              <Link role="menuitem" to="/tai-khoan?tab=vi"><Icon name="wallet" size={18} />Ví ReOwn</Link>
              <Link role="menuitem" to="/kenh-nguoi-ban?don=can-gui"><Icon name="truck" size={18} />Đơn bán cần xử lý</Link>
              <Link role="menuitem" to="/kenh-nguoi-ban?tab=tin-dang"><Icon name="shop" size={18} />Kênh người bán</Link>
            </>
          )}
          <button type="button" role="menuitem" className="pm-item pm-out" onClick={() => { setOpen(false); onLogout(); }}><Icon name="logout" size={18} />{logoutLabel}</button>
        </div>
      )}
    </div>
  );
}

/** Nút quay lại trên điện thoại cho mọi trang con (trang chủ và các tab dưới cùng thì không cần). */
function BackButton() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  // Trang tài khoản tự có nút quay lại về lưới “Tôi”.
  const top = pathname === '/' || pathname === '/tin-nhan' || pathname === '/tai-khoan';
  if (top) return null;
  return (
    <button type="button" className="hdr-back" onClick={() => (window.history.state?.idx > 0 ? nav(-1) : nav('/'))} aria-label="Quay lại">
      <Icon name="back" size={22} />
    </button>
  );
}

export function Header() {
  const { me, dispatch, mode, state } = useStore();
  const loc = useLocation();
  const pending = (state.orders || []).filter((o) => o.buyerId === me?.id && ['paid', 'shipped'].includes(o.status)).length;
  const toShip = (state.sellerOrders || []).filter((o) => o.status === 'paid' || o.status === 'returning' || (o.status === 'disputed' && o.dispute?.status === 'open' && !o.dispute?.sellerResponse)).length;
  return (
    <header className="hdr">
      <div className="wrap hdr-main">
        <BackButton />
        <Link to="/" className="logo" aria-label="ReOwn — trang chủ" translate="no"><Logo /></Link>
        <SearchBox />
        <nav className="hdr-actions" aria-label="Tài khoản">
          {me?.role === 'admin' && <Link to="/quan-tri" className="hdr-act hdr-sell"><Icon name="shield" /><span>Quản trị</span></Link>}
          {me?.role !== 'admin' && <Link to={toShip ? '/kenh-nguoi-ban?don=can-gui' : '/kenh-nguoi-ban'} className="hdr-act hdr-sell">
            <span className="ic-wrap"><Icon name="shop" />{toShip > 0 && <span className="count" aria-label={`${toShip} đơn bán cần xử lý`}>{toShip}</span>}</span>
            <span>Bán đồ</span>
          </Link>}
          {me?.role !== 'admin' && <Link to="/tai-khoan?tab=don-mua" className="hdr-act">
            <span className="ic-wrap"><Icon name="bag" />{pending > 0 && <span className="count" aria-label={`${pending} đơn đang xử lý`}>{pending}</span>}</span>
            <span>Đơn mua</span>
          </Link>}
          {me ? <ProfileMenu me={me} onLogout={() => dispatch({ type: 'logout' })} logoutLabel={mode === 'api' ? 'Đăng xuất' : 'Đổi tài khoản'} />
            : <Link to="/dang-nhap" state={{ from: loc.pathname + loc.search }} className="btn btn-sm">Đăng nhập</Link>}
        </nav>
        {me && <div className="hdr-quick"><span className="hdr-chat"><ChatLink /></span><NotificationBell /></div>}
        <ThemeMenu />
      </div>
      <CatBar />
    </header>
  );
}

export function BottomNav() {
  const { me, inbox } = useStore();
  return (
    <nav className="bottomnav" aria-label="Điều hướng chính">
      <NavLink to="/" end><Icon name="home" /><span>Trang chủ</span></NavLink>
      <NavLink to="/tim-kiem"><Icon name="grid" /><span>Danh mục</span></NavLink>
      <NavLink to="/kenh-nguoi-ban?tab=dang-tin" className="bn-sell"><Icon name="plus" size={24} /><span>Đăng bán</span></NavLink>
      <NavLink to={me ? '/tin-nhan' : '/dang-nhap'}><span className="ic-wrap"><Icon name="chat" />{inbox.chats > 0 && <span className="count">{inbox.chats}</span>}</span><span>Tin nhắn</span></NavLink>
      <NavLink to={me ? '/tai-khoan' : '/dang-nhap'}><Icon name="user" /><span>Tôi</span></NavLink>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="ftr">
      <div className="wrap ftr-in">
        <div>
          <span className="logo" translate="no"><Logo size={26} /></span>
          <p className="muted small">Chợ đồ cũ cho sinh viên.</p>
        </div>
        <div>
          <strong>Mua sắm an toàn</strong>
          <Link to="/ho-tro#giu-ho">Tiền giữ hộ</Link>
          <Link to="/ho-tro#tra-sau">Trả sau 3–6 kỳ</Link>
          <Link to="/ho-tro#uy-tin">Điểm uy tín</Link>
        </div>
        <div>
          <strong>Bán đồ</strong>
          <Link to="/kenh-nguoi-ban?tab=dang-tin">Đăng bán</Link>
          <Link to="/kenh-nguoi-ban">Quản lý đơn bán</Link>
        </div>
        <div>
          <strong>Danh mục</strong>
          {CATEGORIES.slice(0, 4).map((c) => <Link key={c.id} to={`/tim-kiem?cat=${c.id}`}>{c.short || c.label}</Link>)}
        </div>
      </div>
      <div className="wrap ftr-legal small muted">ReOwn · Bản thử nghiệm</div>
    </footer>
  );
}

export function CategoryTiles() {
  return (
    <div className="cat-tiles">
      {CATEGORIES.map((c) => (
        <Link key={c.id} to={`/tim-kiem?cat=${c.id}`} className="cat-tile">
          <span className="cat-ic"><Glyph name={c.icon} /></span>
          <span>{c.short || c.label}</span>
        </Link>
      ))}
      <Link to="/tim-kiem?max=500000" className="cat-tile cat-hot">
        <span className="cat-ic cat-ic-deal"><span className="hot-badge" aria-hidden="true">HOT</span>500K</span><span>Dưới 500K</span>
      </Link>
    </div>
  );
}
