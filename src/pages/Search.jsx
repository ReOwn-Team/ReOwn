import { useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import { bnplOffer } from '../../shared/scoring/engine.js';
import { MAX_BNPL_LIMIT } from '../../shared/scoring/config.js';
import { CATEGORIES } from '../data/mock.js';
import { ProductCard, Empty } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { money, short } from '../lib/format.js';
import { searchProducts } from '../../shared/search.js';

const PRICE_PRESETS = [
  { label: 'Dưới 500K', min: null, max: 500_000 },
  { label: '500K – 2 triệu', min: 500_000, max: 2_000_000 },
  { label: '2 – 5 triệu', min: 2_000_000, max: 5_000_000 },
  { label: 'Trên 5 triệu', min: 5_000_000, max: null },
];
const TRUST = [
  { v: '', label: 'Tất cả người bán' },
  { v: 'A', label: 'Chỉ hạng A' },
  { v: 'B', label: 'Từ hạng B trở lên' },
  { v: 'C', label: 'Từ hạng C trở lên' },
];
const CONDITIONS = [{ v: '', label: 'Mọi tình trạng' }, { v: '90', label: 'Như mới (từ 90%)' }, { v: '80', label: 'Từ 80%' }, { v: '70', label: 'Từ 70%' }];
const SORTS = [
  { v: '', label: 'Liên quan' }, { v: 'new', label: 'Mới đăng' }, { v: 'trust', label: 'Uy tín người bán' },
  { v: 'price-asc', label: 'Giá thấp → cao' }, { v: 'price-desc', label: 'Giá cao → thấp' },
];

const num = (v) => (v == null || v === '' ? null : Number(v));

function Filters({ params, set, onDone }) {
  const cat = params.get('cat') || '';
  const trust = params.get('trust') || '';
  const cond = params.get('cond') || '';
  const min = num(params.get('min')), max = num(params.get('max'));
  const [pmin, setPmin] = useState(min ? String(min) : '');
  const [pmax, setPmax] = useState(max ? String(max) : '');
  const applyPrice = (e) => {
    e.preventDefault();
    const a = Number(pmin.replace(/\D/g, '')) || null, b = Number(pmax.replace(/\D/g, '')) || null;
    set({ min: a && b && a > b ? b : a, max: a && b && a > b ? a : b });
  };
  return (
    <div className="filters">
      <fieldset>
        <legend>Danh mục</legend>
        <label className="opt"><input type="radio" name="cat" checked={!cat} onChange={() => set({ cat: null })} />Tất cả</label>
        {CATEGORIES.map((c) => (
          <label key={c.id} className="opt"><input type="radio" name="cat" checked={cat === c.id} onChange={() => set({ cat: c.id })} />{c.label}</label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Khoảng giá</legend>
        <div className="presets">
          {PRICE_PRESETS.map((p) => {
            const on = min === p.min && max === p.max;
            return <button type="button" key={p.label} className={`chip ${on ? 'on' : ''}`} onClick={() => { set(on ? { min: null, max: null } : { min: p.min, max: p.max }); setPmin(on || !p.min ? '' : String(p.min)); setPmax(on || !p.max ? '' : String(p.max)); }}>{p.label}</button>;
          })}
        </div>
        <form className="range" onSubmit={applyPrice}>
          <label className="sr-only" htmlFor="pmin">Giá từ</label>
          <input id="pmin" inputMode="numeric" placeholder="₫ Từ…" autoComplete="off" value={pmin ? Number(pmin.replace(/\D/g, '')).toLocaleString('vi-VN') : ''} onChange={(e) => setPmin(e.target.value.replace(/\D/g, ''))} />
          <span aria-hidden="true">–</span>
          <label className="sr-only" htmlFor="pmax">Giá đến</label>
          <input id="pmax" inputMode="numeric" placeholder="₫ Đến…" autoComplete="off" value={pmax ? Number(pmax.replace(/\D/g, '')).toLocaleString('vi-VN') : ''} onChange={(e) => setPmax(e.target.value.replace(/\D/g, ''))} />
          <button className="btn btn-sm">Áp dụng</button>
        </form>
      </fieldset>
      <fieldset>
        <legend>Uy tín người bán</legend>
        {TRUST.map((t) => (
          <label key={t.v} className="opt">
            <input type="radio" name="trust" checked={trust === t.v} onChange={() => set({ trust: t.v || null })} />
            <span className="opt-text">{t.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Tình trạng</legend>
        {CONDITIONS.map((c) => (
          <label key={c.v} className="opt"><input type="radio" name="cond" checked={cond === c.v} onChange={() => set({ cond: c.v || null })} />{c.label}</label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Thanh toán</legend>
        <label className="opt"><input type="checkbox" checked={params.get('bnpl') === '1'} onChange={(e) => set({ bnpl: e.target.checked ? '1' : null })} />Trả sau được</label>
      </fieldset>
      <div className="filters-foot">
        <button type="button" className="btn btn-outline" onClick={() => { set({ cat: null, min: null, max: null, trust: null, cond: null, bnpl: null }); setPmin(''); setPmax(''); }}>Xoá bộ lọc</button>
        {onDone && <button type="button" className="btn" onClick={onDone}>Xem kết quả</button>}
      </div>
    </div>
  );
}

export default function Search() {
  const { state, me, buyerScores, sellerScores, userById } = useStore();
  const [params, setParams] = useSearchParams();
  const [drawer, setDrawer] = useState(false);
  const q = params.get('q') || '';
  const set = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v == null || v === '' ? next.delete(k) : next.set(k, String(v))));
    setParams(next, { replace: true });
  };

  const results = useMemo(() => {
    const cat = params.get('cat'), trust = params.get('trust'), cond = num(params.get('cond'));
    const min = num(params.get('min')), max = num(params.get('max')), bnpl = params.get('bnpl') === '1';
    const sort = params.get('sort') || '';
    const bres = me ? buyerScores[me.id] : null;
    const live = state.products.filter((p) => !p.sold);
    const hits = q.trim() ? searchProducts(q, live) : live.map((product) => ({ product, score: 0 }));
    let list = hits.map(({ product: p, score }) => ({ p, rel: score, s: sellerScores[p.sellerId] }));
    if (cat) list = list.filter((x) => x.p.category === cat);
    if (min != null) list = list.filter((x) => x.p.price >= min);
    if (max != null) list = list.filter((x) => x.p.price <= max);
    if (trust) list = list.filter((x) => x.s && x.s.tier.id <= trust);
    if (cond) list = list.filter((x) => x.p.condition >= cond);
    if (bnpl) list = list.filter((x) => (me ? bnplOffer(me, x.p.price, state.plans, bres).eligible : x.p.price <= MAX_BNPL_LIMIT && x.s?.tier.id !== 'E'));
    const by = {
      '': (a, b) => b.rel - a.rel || (b.s?.policy.boost ?? 0) - (a.s?.policy.boost ?? 0) || (a.p.daysAgo ?? 0) - (b.p.daysAgo ?? 0),
      new: (a, b) => (a.p.daysAgo ?? 0) - (b.p.daysAgo ?? 0) || new Date(b.p.createdAt || 0) - new Date(a.p.createdAt || 0),
      trust: (a, b) => (b.s?.score ?? 0) - (a.s?.score ?? 0),
      'price-asc': (a, b) => a.p.price - b.p.price,
      'price-desc': (a, b) => b.p.price - a.p.price,
    }[sort] || (() => 0);
    return list.sort(by).map((x) => x.p);
  }, [params, q, state.products, state.plans, sellerScores, me, buyerScores]);

  const chips = [];
  const cat = CATEGORIES.find((c) => c.id === params.get('cat'));
  if (cat) chips.push({ k: 'cat', label: cat.short || cat.label });
  const min = num(params.get('min')), max = num(params.get('max'));
  if (min != null || max != null) chips.push({ k: ['min', 'max'], label: min && max ? `${short(min)} – ${short(max)}` : min ? `Từ ${short(min)}` : `Dưới ${short(max)}` });
  if (params.get('trust')) chips.push({ k: 'trust', label: params.get('trust') === 'A' ? 'Người bán hạng A' : `Người bán từ hạng ${params.get('trust')}` });
  if (params.get('cond')) chips.push({ k: 'cond', label: `Mới từ ${params.get('cond')}%` });
  if (params.get('bnpl')) chips.push({ k: 'bnpl', label: 'Trả sau được' });

  const heading = q ? <>Kết quả cho “<b>{q}</b>”</> : cat ? cat.label : 'Tất cả đồ cũ';

  return (
    <div className="search-page">
      <aside className="filters-side" aria-label="Bộ lọc"><Filters params={params} set={set} /></aside>
      <section className="results">
        <div className="results-head">
          <h1>{heading} <span className="muted">· {results.length} món</span></h1>
          <button className="btn btn-ghost filter-toggle" onClick={() => setDrawer(true)}><Icon name="filter" size={18} />Bộ lọc{chips.length ? ` (${chips.length})` : ''}</button>
        </div>
        <div className="sortbar" role="group" aria-label="Sắp xếp">
          <span className="muted small">Sắp xếp</span>
          {SORTS.map((s) => (
            <button key={s.v} className={`sort ${(params.get('sort') || '') === s.v ? 'on' : ''}`} onClick={() => set({ sort: s.v || null })}>{s.label}</button>
          ))}
        </div>
        {chips.length > 0 && (
          <div className="active-chips">
            {chips.map((c) => (
              <button key={c.label} className="chip on" onClick={() => set(Object.fromEntries([].concat(c.k).map((k) => [k, null])))} aria-label={`Bỏ lọc ${c.label}`}>{c.label}<Icon name="close" size={14} /></button>
            ))}
          </div>
        )}
        {results.length === 0 ? (
          <Empty title="Không tìm thấy món phù hợp" action={<Link className="btn" to="/tim-kiem">Xem tất cả</Link>}>
            Thử bỏ bớt bộ lọc hoặc dùng từ khoá ngắn hơn.
          </Empty>
        ) : (
          <div className="grid">
            {results.map((p) => <ProductCard key={p.id} product={p} seller={userById(p.sellerId)} sellerRes={sellerScores[p.sellerId]} />)}
          </div>
        )}
        {me && params.get('bnpl') && <p className="small muted">Theo hạn mức còn {money(bnplOffer(me, 0, state.plans, buyerScores[me.id]).available)}.</p>}
      </section>
      {drawer && (
        <div className="drawer" role="dialog" aria-modal="true" aria-label="Bộ lọc">
          <div className="drawer-back" aria-hidden="true" onClick={() => setDrawer(false)} />
          <div className="drawer-panel">
            <div className="drawer-head"><strong>Bộ lọc</strong><button className="linkbtn" onClick={() => setDrawer(false)}>Đóng</button></div>
            <Filters params={params} set={set} onDone={() => setDrawer(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
