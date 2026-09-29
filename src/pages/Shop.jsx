import { useParams, Link } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import { ProductCard, TrustBadge, Stars, Breakdown, Reasons, Empty } from '../components/ui.jsx';

export default function Shop() {
  const { id } = useParams();
  const { state, sellerScores, userById } = useStore();
  const u = userById(id);
  const s = sellerScores[id];
  const items = state.products.filter((p) => p.sellerId === id && !p.sold);
  if (!u || !s) return <Empty title="Không tìm thấy người bán" action={<Link to="/" className="btn">Về trang chủ</Link>} />;
  return (
    <div className="shop">
      <header className="shop-hero">
        <span className="avatar xl">{u.name.split(' ').pop()[0]}</span>
        <div className="shop-id">
          <h1>{u.name}</h1>
          <span className="small muted">{u.school}</span>
          <div className="row wrap-row"><TrustBadge result={s} long />{s.reviewCount > 0 && <Stars value={s.adjAvg} count={s.reviewCount} />}</div>
        </div>
        <dl className="shop-stats">
          <div><dt>Đang bán</dt><dd>{items.length}</dd></div>
          <div><dt>Điểm uy tín</dt><dd>{s.score}/100</dd></div>
          <div><dt>Nhận tiền</dt><dd>{`sau ${s.policy.escrowDays} ngày`}</dd></div>
        </dl>
      </header>
      {s.tier.id >= 'D' && <div className="alert alert-high">Người bán {s.tier.id === 'E' ? 'rủi ro cao' : 'cần lưu ý'}. Chỉ thanh toán trong ReOwn.</div>}
      <details className="panel why-tier">
        <summary>Vì sao hạng {s.tier.id}?</summary>
        <div className="score-grid"><Breakdown parts={s.parts} /><Reasons reasons={s.reasons} /></div>
      </details>
      <section className="shelf">
        <div className="shelf-head"><h2>Sản phẩm của shop</h2></div>
        {items.length === 0 ? <Empty title="Shop chưa có món nào đang bán" /> : (
          <div className="grid">{items.map((p) => <ProductCard key={p.id} product={p} seller={u} sellerRes={s} />)}</div>
        )}
      </section>
    </div>
  );
}
