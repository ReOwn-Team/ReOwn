import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import Art from '../components/Art.jsx';
import ListingForm from '../components/ListingForm.jsx';
import Icon from '../components/Icon.jsx';
import { ScoreGauge, Breakdown, Reasons, ProductCard, Empty, TrustBadge } from '../components/ui.jsx';
import { money, ORDER_STATUS } from '../lib/format.js';

const TABS = [{ v: '', label: 'Đơn bán' }, { v: 'dang-tin', label: 'Đăng tin mới' }, { v: 'tin-dang', label: 'Tin đăng' }, { v: 'uy-tin', label: 'Uy tín shop' }];

function SaleRow({ o, product, dispatch }) {
  const [stars, setStars] = useState(5);
  const payout = { held: 'Tiền đang giữ hộ', released: 'Đã nhận tiền', refunded: 'Đã hoàn cho người mua' }[o.payoutStatus];
  return (
    <li className="ocard">
      <div className="ocard-head">
        <span className="small">Người mua <b>{o.buyerName || '—'}</b> · {o.method === 'full' ? 'trả thẳng' : `trả sau ${o.method} kỳ`}</span>
        <span className={`ostatus st-${o.status}`}>{ORDER_STATUS[o.status]}</span>
      </div>
      <div className="ocard-body">
        <Art product={product || { category: o.category || 'study', icon: o.icon, cover: o.cover, title: o.title }} size="xs" />
        <span className="ocard-title">{o.title}</span>
        <span className="ocard-price"><strong>{money(o.price)}</strong><span className="small muted">{payout}</span></span>
      </div>
      <div className="ocard-foot">
        {o.myStars && <span className="small muted">Bạn đã chấm người mua {o.myStars} sao</span>}
        <div className="ocard-actions">
          {o.status === 'paid' && (
            <>
              <button className="btn btn-sm btn-outline danger" onClick={() => dispatch({ type: 'sellerCancel', orderId: o.id })}>Huỷ đơn</button>
              <button className="btn btn-sm" onClick={() => dispatch({ type: 'shipOrder', orderId: o.id })}>Xác nhận đã gửi hàng</button>
            </>
          )}
          {o.status === 'completed' && !o.myStars && (
            <>
              <label className="small" htmlFor={`sb-${o.id}`}>Đánh giá người mua</label>
              <select id={`sb-${o.id}`} value={stars} onChange={(e) => setStars(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s} sao</option>)}</select>
              <button className="btn btn-sm" onClick={() => dispatch({ type: 'review', orderId: o.id, stars })}>Gửi</button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export default function SellerCenter() {
  const { state, me, sellerScores, dispatch, mode } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || '';
  const [confirmHide, setConfirmHide] = useState(null);
  const sres = sellerScores[me.id];
  const mine = state.products.filter((p) => p.sellerId === me.id).sort((a, b) => a.sold - b.sold);
  const active = mine.filter((p) => !p.sold).length;
  const sales = state.sellerOrders || [];
  const toShip = sales.filter((o) => o.status === 'paid').length;
  const editing = tab === 'sua' ? mine.find((p) => p.id === params.get('id') && !p.sold) : null;

  return (
    <div className="seller-center">
      <header className="sc-hero">
        <div>
          <h1>Kênh người bán</h1>
          <span className="muted">{me.name}</span>
          <div className="row wrap-row small">
            <TrustBadge result={sres} long /><span className="muted">{active} tin đang bán · {me.seller?.sales ?? sales.filter((o) => o.status === 'completed').length} đã bán · {toShip} đơn chờ gửi</span>
          </div>
        </div>
        <button className="btn" onClick={() => setParams({ tab: 'dang-tin' })}>+ Đăng tin mới</button>
      </header>

      <div className="otabs" role="tablist">
        {TABS.map((t) => <button key={t.v} role="tab" aria-selected={tab === t.v || (t.v === 'tin-dang' && tab === 'sua')} className={tab === t.v || (t.v === 'tin-dang' && tab === 'sua') ? 'on' : ''} onClick={() => setParams(t.v ? { tab: t.v } : {})}>{t.label}{t.v === '' && toShip ? <span className="count-pill">{toShip}</span> : null}</button>)}
      </div>

      {tab === '' && (
        <section className="panel">
          <p className="small muted">Gửi hàng trong 3 ngày để giữ điểm. Tiền về ví khi người mua xác nhận.</p>
          {sales.length === 0
            ? <Empty title="Chưa có đơn bán nào">{mode === 'mock' ? 'Bản demo không có người mua thật. Khi chạy cùng máy chủ, đơn của người mua sẽ xuất hiện ở đây.' : 'Khi có người đặt mua, đơn sẽ xuất hiện ở đây.'}</Empty>
            : <ul className="ocards">{sales.slice(0, 20).map((o) => <SaleRow key={o.id} o={o} product={state.products.find((p) => p.id === o.productId)} dispatch={dispatch} />)}</ul>}
        </section>
      )}

      {tab === 'dang-tin' && <ListingForm key="new" onDone={() => setParams({ tab: 'tin-dang' })} />}

      {tab === 'sua' && (editing
        ? <ListingForm key={editing.id} listing={editing} onDone={() => setParams({ tab: 'tin-dang' })} onCancel={() => setParams({ tab: 'tin-dang' })} />
        : <Empty title="Không sửa được tin này" action={<button className="btn" onClick={() => setParams({ tab: 'tin-dang' })}>Về danh sách tin</button>}>Tin đã có người đặt, đã bán hoặc không còn tồn tại.</Empty>)}

      {tab === 'tin-dang' && (
        <section className="panel">
          {mine.length === 0 ? <Empty title="Bạn chưa đăng tin nào" action={<button className="btn" onClick={() => setParams({ tab: 'dang-tin' })}>Đăng tin đầu tiên</button>} /> : (
            <div className="grid">
              {mine.slice(0, 48).map((p) => (
                <div key={p.id} className="my-listing">
                  <ProductCard product={p} seller={me} sellerRes={sres} />
                  {!p.sold ? (
                    confirmHide === p.id ? (
                      <div className="ml-acts confirm-hide">
                        <span className="small">Gỡ tin này?</span>
                        <button className="btn btn-sm btn-outline" onClick={() => setConfirmHide(null)}>Không</button>
                        <button className="btn btn-sm danger-btn" onClick={async () => { await dispatch({ type: 'hideListing', id: p.id }); setConfirmHide(null); }}>Gỡ</button>
                      </div>
                    ) : (
                      <div className="ml-acts">
                        <button className="btn btn-sm btn-outline" onClick={() => setParams({ tab: 'sua', id: p.id })}><Icon name="edit" size={16} />Sửa</button>
                        <button className="btn btn-sm btn-outline" onClick={() => setConfirmHide(p.id)}>Gỡ tin</button>
                      </div>
                    )
                  ) : <p className="ml-acts small muted">Đã có người đặt / đã bán — không sửa được</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'uy-tin' && (
        <section className="panel">
          <div className="score-top">
            <ScoreGauge result={sres} label="Uy tín người bán" />
            <p className="small policy"><b>Quyền lợi hạng {sres.tier.id}:</b> {sres.policy.note}</p>
          </div>
          <div className="score-grid">
            <div><h3>Thành phần điểm</h3><Breakdown parts={sres.parts} /></div>
            <div><h3>Điều ảnh hưởng tới điểm</h3><Reasons reasons={sres.reasons} /></div>
          </div>
        </section>
      )}
    </div>
  );
}
