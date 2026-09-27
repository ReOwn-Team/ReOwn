import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import { recommend, effectiveIncome } from '../../shared/scoring/engine.js';
import { INCOME_CAP } from '../../shared/scoring/config.js';
import { CATEGORIES } from '../data/mock.js';
import { ProductCard } from '../components/ui.jsx';
import { CategoryTiles } from '../components/Layout.jsx';
import Art from '../components/Art.jsx';
import Icon from '../components/Icon.jsx';
import { api } from '../api/client.js';
import { money, short, parseMoney } from '../lib/format.js';

const GUEST = {
  id: 'guest', name: 'Khách', verify: { phone: true, cccd: true }, accountAgeMonths: 0,
  finance: { monthlyIncome: 2_000_000, savings: 800_000 },
  buyer: { orders: 0, boms: 0, repayment: { onTime: 0, late: 0, severe: 0, defaults: 0 } },
};
const showMoney = (n) => (n ? n.toLocaleString('vi-VN') : '');

const PROMISES = [
  { icon: 'calendar', title: 'Trả sau 3 kỳ 0% phí' },
  { icon: 'shield', title: 'Tiền giữ hộ đến khi nhận hàng' },
  { icon: 'check', title: 'Người bán xếp hạng A–E' },
];

function Hero({ sample, sampleSeller, sampleScore }) {
  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="hero-copy">
        <h1 id="hero-h">Đồ cũ vừa túi tiền,<br />trả dần từng tháng</h1>
        <p>Biết trước mỗi tháng góp bao nhiêu và người bán có đáng tin không.</p>
        <div className="hero-actions">
          <a href="#tui-tien" className="btn btn-lg" onClick={(e) => { e.preventDefault(); document.getElementById('tui-tien')?.scrollIntoView({ behavior: 'smooth' }); }}>Tìm món vừa túi tiền</a>
        </div>
        <ul className="promises">
          {PROMISES.map((x) => (
            <li key={x.title}><Icon name={x.icon} size={20} /><span><b>{x.title}</b></span></li>
          ))}
        </ul>
      </div>
      {sample && (
        <div className="hero-sample" aria-label="Ví dụ một món đang bán">
          <ProductCard product={sample} seller={sampleSeller} sellerRes={sampleScore} />
        </div>
      )}
    </section>
  );
}

function Shelf({ title, to, items, sellerScores, userById }) {
  if (!items.length) return null;
  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2>{title}</h2>
        {to && <Link to={to} className="see-all">Xem tất cả<Icon name="chevron" size={16} /></Link>}
      </div>
      <div className="scroller">
        {items.map((p) => <ProductCard key={p.id} product={p} seller={userById(p.sellerId)} sellerRes={sellerScores[p.sellerId]} />)}
      </div>
    </section>
  );
}

function BudgetPicker() {
  const { state, me, sellerScores, dispatch, pastOrders, mode } = useStore();
  const user = me || GUEST;
  const [income, setIncome] = useState(user.finance.monthlyIncome);
  const [savings, setSavings] = useState(user.finance.savings);
  const [category, setCategory] = useState('');
  const [seenUser, setSeenUser] = useState(me?.id);
  if (me && seenUser !== me.id) { setSeenUser(me.id); setIncome(me.finance.monthlyIncome); setSavings(me.finance.savings); }

  const localRec = useMemo(
    () => recommend({ user, plans: state.plans, products: state.products, sellerScores, orders: pastOrders, income, savings, category }),
    [user, state.plans, state.products, sellerScores, pastOrders, income, savings, category],
  );
  const [apiRec, setApiRec] = useState(null);
  useEffect(() => {
    if (mode !== 'api') return;
    const t = setTimeout(() => {
      api('/recommendations', { method: 'POST', body: { income, savings, category: category || null } })
        .then((r) => setApiRec({ ...r, items: r.items.map((x) => ({ ...x, product: { ...x.product, sold: false } })) }))
        .catch(() => setApiRec(null));
    }, 300);
    return () => clearTimeout(t);
  }, [mode, income, savings, category, me?.id, state.products.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const rec = mode === 'api' && apiRec ? apiRec : localRec;

  const save = () => {
    if (!me) return;
    if (mode === 'api') { if (income !== me.finance.monthlyIncome) dispatch({ type: 'updateFinance', finance: { monthlyIncome: income } }); }
    else dispatch({ type: 'updateFinance', finance: { monthlyIncome: income, savings } });
  };
  const counted = effectiveIncome({ ...user, finance: { ...user.finance, monthlyIncome: income } });
  const room = Math.max(0, counted * 0.3 - (rec.buyer.obligations || 0));

  return (
    <section className="budget" id="tui-tien" aria-labelledby="budget-h">
      <div className="budget-form">
        <h2 id="budget-h">Món vừa túi tiền của bạn</h2>
        <div className="budget-fields">
          <div className="field">
            <label htmlFor="income">Thu nhập/tháng</label>
            <div className="money"><input id="income" inputMode="numeric" value={showMoney(income)} onChange={(e) => setIncome(parseMoney(e.target.value))} onBlur={save} /><span>₫</span></div>
          </div>
          <div className="field">
            <label htmlFor="savings">Tiền đang có</label>
            <div className="money"><input id="savings" inputMode="numeric" value={showMoney(savings)} onChange={(e) => setSavings(parseMoney(e.target.value))} onBlur={save} /><span>₫</span></div>
          </div>
        </div>
        <div className="chips" role="group" aria-label="Bạn đang cần">
          <button type="button" className={`chip ${!category ? 'on' : ''}`} onClick={() => setCategory('')}>Gì cũng được</button>
          {CATEGORIES.map((c) => <button type="button" key={c.id} className={`chip ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)}>{c.short || c.label}</button>)}
        </div>
        {counted < income && <p className="small muted">Thu nhập được tính tối đa {money(counted)}{counted === INCOME_CAP.selfDeclared ? ' khi chưa xác thực ngân hàng' : ''}.</p>}
        <p className="small budget-note">
          Góp tối đa <b>{money(room)}</b>/tháng · {rec.totalAffordable} món vừa túi tiền
          {!me && <> · <Link to="/dang-nhap">Đăng nhập</Link> để xem hạn mức</>}
        </p>
      </div>
      <ol className="budget-list">
        {rec.items.length === 0 && <li className="muted small">Chưa có món vừa túi tiền. Thử danh mục khác.</li>}
        {rec.items.map(({ product: p, payFull, plans }) => (
          <li key={p.id}>
            <Link to={`/san-pham/${p.id}`} className="bl-item">
              <Art product={p} size="sm" />
              <div className="bl-main">
                <span className="bl-title">{p.title}</span>
                <span className="price">{money(p.price)}</span>
                <span className="bl-why">{payFull ? 'Đủ tiền trả thẳng' : `${plans[0].down ? `Trả trước ${short(plans[0].down)}, g` : 'G'}óp ${short(plans[0].monthly)}/tháng × ${plans[0].term} kỳ`}</span>
              </div>
              <Icon name="chevron" size={18} className="bl-go" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Home() {
  const { state, sellerScores, userById } = useStore();
  const [more, setMore] = useState(12);
  const live = state.products.filter((p) => !p.sold);
  const ok = (p) => (sellerScores[p.sellerId]?.score ?? 0) >= 50;
  const rank = (p) => (sellerScores[p.sellerId]?.policy?.boost ?? 1) * 100 - (p.daysAgo ?? 0);
  const feed = [...live].sort((a, b) => rank(b) - rank(a));
  const bnpl = live.filter((p) => p.price >= 900_000 && p.price <= 6_000_000 && ok(p)).sort((a, b) => a.price - b.price).slice(0, 10);
  const cheap = live.filter((p) => p.price < 500_000 && ok(p)).sort((a, b) => a.price - b.price).slice(0, 10);
  const sample = bnpl.find((p) => sellerScores[p.sellerId]?.tier.id === 'A') || bnpl[0];

  return (
    <div className="home">
      <Hero sample={sample} sampleSeller={sample && userById(sample.sellerId)} sampleScore={sample && sellerScores[sample.sellerId]} />
      <CategoryTiles />
      <BudgetPicker />
      <Shelf title="Trả sau 0% trong 3 kỳ" to="/tim-kiem?min=900000&sort=price-asc" items={bnpl} sellerScores={sellerScores} userById={userById} />
      <Shelf title="Dưới 500K" to="/tim-kiem?max=500000&sort=price-asc" items={cheap} sellerScores={sellerScores} userById={userById} />
      <section className="shelf">
        <div className="shelf-head"><h2>Gợi ý hôm nay</h2></div>
        <div className="grid">
          {feed.slice(0, more).map((p) => <ProductCard key={p.id} product={p} seller={userById(p.sellerId)} sellerRes={sellerScores[p.sellerId]} />)}
        </div>
        {more < feed.length && <button className="btn btn-ghost more" onClick={() => setMore(more + 12)}>Xem thêm món</button>}
      </section>
    </div>
  );
}
