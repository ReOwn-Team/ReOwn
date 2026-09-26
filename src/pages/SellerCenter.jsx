import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import Art from '../components/Art.jsx';
import ListingForm from '../components/ListingForm.jsx';
import Icon from '../components/Icon.jsx';
import { ScoreGauge, Breakdown, Reasons, ProductCard, Empty, TrustBadge } from '../components/ui.jsx';
import { money, orderStatusLabel, vnDateTime } from '../lib/format.js';
import PhotoPicker from '../components/PhotoPicker.jsx';
import { DeliveryInfo, DisputeThread, CarrierFields } from '../components/OrderBits.jsx';

const TABS = [{ v: '', label: 'Đơn bán' }, { v: 'dang-tin', label: 'Đăng tin mới' }, { v: 'tin-dang', label: 'Tin đăng' }, { v: 'uy-tin', label: 'Uy tín shop' }];

const needsAction = (o) => o.status === 'returning' || (o.status === 'disputed' && o.dispute?.status === 'open' && !o.dispute?.sellerResponse);
const SALE_TABS = [
  { v: 'can-gui', label: 'Cần gửi hàng', match: (o) => o.status === 'paid' },
  { v: 'dang-giao', label: 'Đang giao', match: (o) => o.status === 'shipped' },
  { v: 'khieu-nai', label: 'Khiếu nại & trả hàng', match: (o) => ['disputed', 'return_pending', 'returning'].includes(o.status) },
  { v: 'hoan-tat', label: 'Hoàn tất', match: (o) => o.status === 'completed' },
  { v: 'da-huy', label: 'Đã huỷ / hoàn tiền', match: (o) => ['refused_by_buyer', 'cancelled_by_seller', 'refunded'].includes(o.status) },
  { v: 'tat-ca', label: 'Tất cả', match: () => true },
];
const when = vnDateTime;

function Progress({ o }) {
  const failed = ['refused_by_buyer', 'cancelled_by_seller', 'refunded'].includes(o.status);
  const received = o.status === 'completed' || (o.status === 'disputed' && o.completedAt);
  const meetup = o.delivery === 'meetup';
  const steps = [
    { label: 'Khách đặt mua', at: o.createdAt, done: true },
    { label: meetup ? 'Hẹn giao trực tiếp' : 'Bạn gửi hàng', at: o.shippedAt, done: !!o.shippedAt },
    { label: meetup ? 'Khách nhận (nhập mã)' : 'Khách đã nhận', at: o.completedAt, done: !!received },
    { label: 'Tiền về ví', at: o.payoutStatus === 'released' ? (o.releaseAt || o.completedAt) : null, done: o.payoutStatus === 'released' },
  ];
  return (
    <ol className={`oprog ${failed ? 'failed' : ''}`} aria-label="Tiến trình đơn">
      {steps.map((st) => (
        <li key={st.label} className={st.done ? 'done' : ''}>
          <span className="oprog-dot" aria-hidden="true">{st.done && <Icon name="check" size={12} />}</span>
          <span className="oprog-label">{st.label}</span>
          {st.done && st.at && <span className="oprog-at">{when(st.at)}</span>}
        </li>
      ))}
    </ol>
  );
}

function nextStep(o) {
  if (o.status === 'paid') {
    if (o.delivery === 'meetup') return 'Nhắn khách hẹn nơi giờ giao. Khi gặp, để khách kiểm tra hàng rồi nhập mã 6 số khách đọc — tiền chuyển ngay.';
    const due = new Date(o.createdAt).getTime() + 3 * 86_400_000;
    const hours = Math.round((due - Date.now()) / 3_600_000);
    return hours > 0 ? `Đóng gói, gửi hàng và nhập mã vận đơn — còn ${hours >= 24 ? `${Math.floor(hours / 24)} ngày ${hours % 24} giờ` : `${hours} giờ`} để giữ điểm giao đúng hẹn.` : 'Đã quá hạn gửi 3 ngày — gửi ngay hoặc huỷ đơn để khách được hoàn tiền.';
  }
  if (o.status === 'shipped') return o.delivery === 'meetup' ? 'Nhập mã khách đọc khi giao để hoàn tất đơn.' : 'Đang chờ khách nhận hàng và bấm "Đã nhận hàng". Tiền đang được ReOwn giữ hộ.';
  if (o.status === 'completed') {
    if (o.refundAmount) return `Đã hoàn ${money(o.refundAmount)} cho khách sau khiếu nại, phần còn lại đã về ví của bạn.`;
    return o.payoutStatus === 'released' ? 'Khách đã nhận hàng, tiền đã về ví ReOwn của bạn.' : `Khách đã nhận hàng. Tiền về ví ${o.releaseAt ? 'ngày ' + new Date(o.releaseAt).toLocaleDateString('vi-VN') : 'sau thời hạn khiếu nại'}.`;
  }
  if (o.status === 'disputed') return o.dispute?.sellerResponse ? 'Đã gửi phản hồi — ReOwn đang đối chiếu bằng chứng của hai bên.' : 'Khách khiếu nại — tiền được giữ lại. Gửi phản hồi kèm ảnh/video đóng gói trong 48 giờ.';
  if (o.status === 'return_pending') return 'ReOwn yêu cầu khách gửi trả hàng. Bạn sẽ được báo khi khách gửi.';
  if (o.status === 'returning') return `Khách đã gửi trả qua ${o.returnInfo?.carrier || 'đơn vị vận chuyển'}${o.returnInfo?.trackingCode ? ` (mã ${o.returnInfo.trackingCode})` : ''}. Nhận được hàng thì xác nhận — quá 7 ngày ReOwn tự hoàn tiền cho khách.`;
  if (o.status === 'refused_by_buyer') return 'Khách từ chối nhận hàng, tin đã được mở bán lại.';
  if (o.status === 'cancelled_by_seller') return 'Bạn đã huỷ đơn, tiền đã hoàn cho khách.';
  if (o.status === 'refunded') return 'ReOwn đã hoàn tiền cho khách.';
  return null;
}

function ShipForm({ o, run, busy, onCancel }) {
  const [v, setV] = useState({ carrier: 'GHN', trackingCode: '' });
  return (
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); run({ type: 'shipOrder', orderId: o.id, carrier: v.carrier, trackingCode: v.trackingCode }); }}>
      <p className="small"><b>Nhập mã vận đơn</b> để khách theo dõi hàng.</p>
      <CarrierFields id={`sh-${o.id}`} value={v} onChange={setV} />
      <div className="row">
        <button className="btn btn-sm" disabled={busy || v.trackingCode.length < 4}>Xác nhận đã gửi</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={onCancel} disabled={busy}>Để sau</button>
      </div>
    </form>
  );
}

function HandoverForm({ o, run, busy }) {
  const [code, setCode] = useState('');
  return (
    <form className="inline-form hand-form" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'handover', orderId: o.id, code })) setCode(''); }}>
      <label className="small" htmlFor={`hc-${o.id}`}><b>Mã nhận hàng khách đọc</b> (6 số)</label>
      <div className="row">
        <input id={`hc-${o.id}`} className="code-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" disabled={o.handoverLocked} />
        <button className="btn btn-sm" disabled={busy || code.length !== 6 || o.handoverLocked}>Xác nhận đã giao</button>
      </div>
      {o.handoverLocked && <span className="small danger">Nhập sai quá nhiều lần — nhờ khách bấm "Đã nhận hàng" trên ứng dụng.</span>}
    </form>
  );
}

function RespondForm({ o, run, busy, mode }) {
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState([]);
  return (
    <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); await run({ type: 'respondDispute', orderId: o.id, text, photos }); }}>
      <label className="small" htmlFor={`rs-${o.id}`}><b>Phản hồi khiếu nại</b> (ít nhất 10 ký tự)</label>
      <textarea id={`rs-${o.id}`} rows={2} minLength={10} maxLength={1000} required value={text} onChange={(e) => setText(e.target.value)}
        placeholder="VD: Mình có video đóng gói, máy nguyên tem khi gửi…" />
      <PhotoPicker id={`rp-${o.id}`} photos={photos} onChange={setPhotos} maxSide={mode === 'api' ? 1280 : 800} disabled={busy}
        label="Ảnh / khung hình video đóng gói" hint="không bắt buộc, tối đa 3" cover={false} tip="Ảnh lúc đóng gói, phiếu gửi hàng hoặc tin nhắn thoả thuận giúp ReOwn xét công bằng." />
      <div className="row"><button className="btn btn-sm" disabled={busy || text.trim().length < 10}>{busy ? 'Đang gửi…' : 'Gửi phản hồi'}</button></div>
    </form>
  );
}

function SaleRow({ o, product, dispatch, mode }) {
  const [stars, setStars] = useState(5);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (a) => { setBusy(true); try { const ok = await dispatch(a); if (ok) setShipping(false); return ok; } finally { setBusy(false); } };
  const payout = { held: 'Tiền đang giữ hộ', released: 'Đã nhận tiền', refunded: 'Đã hoàn cho người mua' }[o.payoutStatus];
  const hint = nextStep(o);
  const meetup = o.delivery === 'meetup';
  return (
    <li className={`ocard ${needsAction(o) ? 'needs' : ''}`}>
      <div className="ocard-head">
        <span className="small">Người mua <b>{o.buyerName || '—'}</b> · {o.method === 'full' ? 'trả thẳng' : `trả sau ${o.method} kỳ`} · {when(o.createdAt)}</span>
        <span className={`ostatus st-${o.status}`}>{o.status === 'paid' ? (meetup ? 'Chờ giao trực tiếp' : 'Cần gửi hàng') : orderStatusLabel(o)}</span>
      </div>
      <div className="ocard-body">
        <Art product={product || { category: o.category || 'study', icon: o.icon, cover: o.cover, title: o.title }} size="xs" />
        <span className="ocard-title">{o.title}</span>
        <span className="ocard-price"><strong>{money(o.price)}</strong><span className="small muted">{payout}</span></span>
      </div>
      <DeliveryInfo o={o} />
      <Progress o={o} />
      {o.dispute && <DisputeThread d={o.dispute} viewer="seller" />}
      {o.status === 'disputed' && o.dispute?.status === 'open' && !o.dispute.sellerResponse && <RespondForm o={o} run={run} busy={busy} mode={mode} />}
      {meetup && ['paid', 'shipped'].includes(o.status) && <HandoverForm o={o} run={run} busy={busy} />}
      {shipping && <ShipForm o={o} run={run} busy={busy} onCancel={() => setShipping(false)} />}
      <div className="ocard-foot">
        {hint && <span className="small">{hint}</span>}
        {o.myStars && <span className="small muted">Bạn đã chấm người mua {o.myStars} sao</span>}
        <div className="ocard-actions">
          {o.status === 'paid' && (confirmCancel ? (
            <>
              <span className="small">Huỷ đơn và hoàn tiền cho khách?</span>
              <button className="btn btn-sm btn-outline" onClick={() => setConfirmCancel(false)} disabled={busy}>Không</button>
              <button className="btn btn-sm danger-btn" onClick={() => run({ type: 'sellerCancel', orderId: o.id })} disabled={busy}>Huỷ đơn</button>
            </>
          ) : (
            <>
              <button className="btn btn-sm btn-outline danger" onClick={() => setConfirmCancel(true)} disabled={busy}>Huỷ đơn</button>
              {!meetup && !shipping && <button className="btn btn-sm" onClick={() => setShipping(true)} disabled={busy}>Xác nhận đã gửi hàng</button>}
            </>
          ))}
          {o.status === 'returning' && <button className="btn btn-sm" onClick={() => run({ type: 'returnReceived', orderId: o.id })} disabled={busy}>Đã nhận lại hàng</button>}
          {o.status === 'completed' && !o.myStars && (
            <>
              <label className="small" htmlFor={`sb-${o.id}`}>Đánh giá người mua</label>
              <select id={`sb-${o.id}`} value={stars} onChange={(e) => setStars(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s} sao</option>)}</select>
              <button className="btn btn-sm" onClick={() => run({ type: 'review', orderId: o.id, stars })} disabled={busy}>Gửi</button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function SalesPanel({ sales, products, dispatch, mode, params, setParams }) {
  const counts = Object.fromEntries(SALE_TABS.map((t) => [t.v, sales.filter(t.match).length]));
  const urgent = sales.filter(needsAction).length;
  const fallback = counts['can-gui'] ? 'can-gui' : urgent ? 'khieu-nai' : counts['dang-giao'] ? 'dang-giao' : 'tat-ca';
  const cur = SALE_TABS.find((t) => t.v === params.get('don')) || SALE_TABS.find((t) => t.v === fallback);
  const shown = sales.filter(cur.match);
  return (
    <section className="panel">
      <div className="otabs sub" role="tablist" aria-label="Lọc đơn bán">
        {SALE_TABS.map((t) => (
          <button key={t.v} role="tab" aria-selected={cur.v === t.v} className={cur.v === t.v ? 'on' : ''} onClick={() => setParams({ don: t.v })}>
            {t.label}{t.v === 'khieu-nai' && urgent > 0 ? <span className="count-pill" aria-label={`${urgent} việc cần xử lý`}>{urgent}</span>
              : t.v !== 'tat-ca' && counts[t.v] > 0 && <span className={t.v === 'can-gui' ? 'count-pill' : 'small muted'}>{counts[t.v]}</span>}
          </button>
        ))}
      </div>
      {sales.length === 0
        ? <Empty title="Chưa có đơn bán nào">{mode === 'mock' ? 'Bản demo: đăng nhập tài khoản khác, đặt mua một món của bạn rồi quay lại đây để xử lý đơn.' : 'Khi có người đặt mua, đơn sẽ xuất hiện ở đây kèm thông báo.'}</Empty>
        : shown.length === 0
          ? <Empty title={cur.v === 'can-gui' ? 'Không có đơn nào cần gửi' : 'Không có đơn nào ở mục này'}>{cur.v === 'can-gui' ? 'Đơn mới sẽ hiện ở đây. Gửi hàng trong 3 ngày để giữ điểm uy tín.' : null}</Empty>
          : <ul className="ocards">{shown.slice(0, 50).map((o) => <SaleRow key={o.id} o={o} product={products.find((p) => p.id === o.productId)} dispatch={dispatch} mode={mode} />)}</ul>}
    </section>
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

      {tab === '' && <SalesPanel sales={sales} products={state.products} dispatch={dispatch} mode={mode} params={params} setParams={setParams} />}

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
