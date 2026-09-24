import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import Art from '../components/Art.jsx';
import Icon from '../components/Icon.jsx';
import AdminHide from '../components/AdminHide.jsx';
import { Empty } from '../components/ui.jsx';
import { listingRisk } from '../../shared/scoring/engine.js';
import { searchProducts } from '../../shared/search.js';
import { money, timeAgoShort } from '../lib/format.js';

const TABS = [
  { v: '', label: 'Sản phẩm', icon: 'grid' },
  { v: 'tranh-chap', label: 'Tranh chấp', icon: 'alert', badge: true },
];

function Products() {
  const { state, sellerScores, userById } = useStore();
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('all');
  const rows = useMemo(() => {
    const live = state.products.filter((p) => !p.sold);
    const withRisk = live.map((p) => ({ p, r: listingRisk(p, sellerScores[p.sellerId], state.products) }));
    const order = { high: 0, medium: 1, low: 2 };
    return withRisk.sort((a, b) => order[a.r.level] - order[b.r.level]);
  }, [state.products, sellerScores]);
  const flagged = rows.filter((x) => x.r.level !== 'low').length;
  const matched = q.trim() ? new Set(searchProducts(q, rows.map((x) => x.p)).map((x) => x.product.id)) : null;
  const shown = rows.filter((x) => (only === 'all' || x.r.level !== 'low') && (!matched || matched.has(x.p.id)));

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Sản phẩm đang bán</h2>
        <div className="seg-mini" role="group" aria-label="Lọc">
          <button className={only === 'all' ? 'on' : ''} onClick={() => setOnly('all')}>Tất cả · {rows.length}</button>
          <button className={only === 'flag' ? 'on' : ''} onClick={() => setOnly('flag')}>Có cảnh báo · {flagged}</button>
        </div>
      </div>
      <label className="sr-only" htmlFor="aq">Tìm sản phẩm</label>
      <input id="aq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên sản phẩm" />
      {shown.length === 0 ? <p className="muted small">Không có sản phẩm nào.</p> : (
        <ul className="adm-list">
          {shown.map(({ p, r }) => (
            <li key={p.id} className="aprod">
              <Link to={`/san-pham/${p.id}`} className="aprod-art" tabIndex={-1} aria-hidden="true"><Art product={p} size="xs" /></Link>
              <div className="aprod-main">
                <Link to={`/san-pham/${p.id}`}><b>{p.title}</b></Link>
                <span className="small muted">{userById(p.sellerId)?.name || 'Người bán'} · {money(p.price)}</span>
                {r.level !== 'low' && <ul className="flags">{r.flags.map((f) => <li key={f}><Icon name="alert" size={14} />{f}</li>)}</ul>}
              </div>
              {r.level !== 'low' && <span className={`risk-pill ${r.level}`}>{r.level === 'high' ? 'Rủi ro cao' : 'Cần xem'}</span>}
              <div className="aprod-act"><AdminHide id={p.id} compact /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Disputes({ reload }) {
  const { admin } = useStore();
  const [filter, setFilter] = useState('open');
  const [items, setItems] = useState(null);
  const [now, setNow] = useState(Date.now);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(() => admin.disputes(filter).then((d) => { setItems(d); setNow(Date.now()); }).catch((e) => setErr(e.message)), [admin, filter]);
  useEffect(() => { load(); }, [load]);

  const resolve = async (d, outcome) => {
    if (note.trim().length < 5) { setErr('Ghi kết luận (ít nhất 5 ký tự) — người mua và người bán sẽ thấy lý do này.'); return; }
    setBusy(true); setErr('');
    try { await admin.resolve(d.id, outcome, note.trim()); setOpen(null); setNote(''); await load(); reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Tranh chấp</h2>
        <div className="seg-mini" role="group" aria-label="Lọc">
          {[['open', 'Đang mở'], ['all', 'Tất cả']].map(([v, l]) => <button key={v} className={filter === v ? 'on' : ''} onClick={() => setFilter(v)}>{l}</button>)}
        </div>
      </div>
      {!items ? <p className="muted">Đang tải…</p> : items.length === 0 ? <Empty title="Không có tranh chấp nào đang mở">Khi người mua khiếu nại "hàng không đúng mô tả", đơn sẽ xuất hiện ở đây và tiền được giữ lại.</Empty> : (
        <ul className="adm-list">
          {items.map((d) => {
            const hours = (now - new Date(d.created_at)) / 3_600_000;
            const isOpen = d.status === 'open';
            return (
              <li key={d.id} className={`dcard ${open === d.id ? 'expanded' : ''}`}>
                <button className="dcard-head" onClick={() => { setOpen(open === d.id ? null : d.id); setErr(''); setNote(''); }} aria-expanded={open === d.id}>
                  <Art product={d} size="xs" />
                  <span className="dcard-main">
                    <b>{d.title}</b>
                    <span className="small muted">{d.buyer_name} khiếu nại {d.seller_name} · {money(d.price)} · {d.method === 'full' ? 'trả thẳng' : `trả sau ${d.term} kỳ`}</span>
                  </span>
                  {isOpen
                    ? <span className={`sla ${hours > 48 ? 'late' : ''}`}>{hours > 48 ? 'Quá 48 giờ' : `Mở ${timeAgoShort(d.created_at)} trước`}</span>
                    : <span className={`sla done`}>{d.status === 'resolved_buyer' ? 'Đã hoàn tiền người mua' : 'Người bán đúng'}</span>}
                  <Icon name="chevron" size={18} className="dcard-chev" />
                </button>
                {open === d.id && (
                  <div className="dcard-body">
                    <blockquote className="reason"><span className="small muted">Lý do người mua</span>{d.reason}</blockquote>
                    {isOpen ? (
                      <>
                        <div className="field">
                          <label htmlFor={`note-${d.id}`}>Kết luận</label>
                          <textarea id={`note-${d.id}`} rows={2} value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} placeholder="VD: Video mở hộp cho thấy máy móp góc, không khớp ảnh đăng." maxLength={1000} />
                        </div>
                        {err && <p className="small danger" role="alert">{err}</p>}
                        <div className="row wrap-row">
                          <button className="btn" onClick={() => resolve(d, 'buyer')} disabled={busy}>Hoàn tiền cho người mua</button>
                          <button className="btn btn-outline" onClick={() => resolve(d, 'seller')} disabled={busy}>Người bán đúng — giải ngân</button>
                        </div>
                        <p className="small muted">Hoàn tiền: tiền giữ hộ trả về ví người mua (trả sau thì huỷ khoản vay), người bán bị tính một lần thua tranh chấp.</p>
                      </>
                    ) : <p className="small"><b>Kết luận:</b> {d.resolution}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MfaGate({ onDone }) {
  const { admin, mode } = useStore();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await admin.mfa(code); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <section className="panel mfa">
      <Icon name="shield" size={32} />
      <h1>Xác thực 2 lớp</h1>
      <p className="muted">Nhập mã 6 số trong ứng dụng Google Authenticator để vào trang quản trị.{mode === 'mock' && ' Bản demo: nhập 6 số bất kỳ.'}</p>
      <form onSubmit={submit} className="form">
        <label htmlFor="totp" className="sr-only">Mã xác thực</label>
        <input id="totp" className="otp" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
        {err && <p className="small danger" role="alert">{err}</p>}
        <button className="btn btn-buy" disabled={code.length !== 6 || busy}>Xác nhận</button>
      </form>
    </section>
  );
}

export default function Admin() {
  const { me, admin, mode, state } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'tranh-chap' ? 'tranh-chap' : '';
  const [open, setOpen] = useState(0);
  const [needMfa, setNeedMfa] = useState(mode === 'mock' && state.adminMfaFor !== me?.id);
  const reload = useCallback(() => admin.disputes('open').then((d) => { setOpen(d.length); setNeedMfa(false); }).catch((e) => {
    if (/2 lớp|ADMIN_TOTP/.test(e.message)) setNeedMfa(true);
  }), [admin]);
  useEffect(() => { if (!needMfa) reload(); }, [needMfa, reload]);

  if (!me || me.role !== 'admin') return <Navigate to="/" replace />;
  if (needMfa) return <MfaGate onDone={() => setNeedMfa(false)} />;
  const go = (v) => setParams(v ? { tab: v } : {});
  return (
    <div className="admin">
      <nav className="adm-nav" aria-label="Quản trị">
        <h1 className="sr-only">Quản trị</h1>
        <span className="adm-title" aria-hidden="true">Quản trị</span>
        {TABS.map((t) => (
          <button key={t.v} className={tab === t.v ? 'on' : ''} aria-current={tab === t.v ? 'page' : undefined} onClick={() => go(t.v)}>
            <Icon name={t.icon} size={18} /><span>{t.label}</span>
            {t.badge && open > 0 && <span className="conv-badge">{open}</span>}
          </button>
        ))}
      </nav>
      <div className="adm-main">
        {tab === '' && <Products />}
        {tab === 'tranh-chap' && <Disputes reload={reload} />}
      </div>
    </div>
  );
}
