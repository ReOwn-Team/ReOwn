import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import { outstanding, bnplOffer } from '../../shared/scoring/engine.js';
import { BUYER_IDENTITY_POINTS, THIN_FILE_MIN_ONTIME, BNPL_POLICY, TIERS } from '../../shared/scoring/config.js';
import Art from '../components/Art.jsx';
import Icon from '../components/Icon.jsx';
import PhotoPicker from '../components/PhotoPicker.jsx';
import { ScoreGauge, TierScale, Breakdown, Reasons, TrustBadge, Empty } from '../components/ui.jsx';
import { money, TIER_LABEL, ORDER_STATUS } from '../lib/format.js';

const VERIFY_LABEL = { phone: 'Số điện thoại', cccd: 'CCCD gắn chip', bank: 'Tài khoản ngân hàng', student: 'Thẻ sinh viên' };
const VERIFY_HINT = { phone: 'Xác thực khi đăng nhập', cccd: 'Bắt buộc để dùng trả sau', bank: 'Nhận tiền bán hàng', student: 'Ưu đãi sinh viên' };
const date = (t) => new Date(t).toLocaleDateString('vi-VN');
const ORDER_TABS = [
  { v: 'all', label: 'Tất cả', match: () => true },
  { v: 'paid', label: 'Chờ gửi hàng', match: (o) => o.status === 'paid' },
  { v: 'shipped', label: 'Đang giao', match: (o) => o.status === 'shipped' },
  { v: 'completed', label: 'Hoàn tất', match: (o) => o.status === 'completed' },
  { v: 'closed', label: 'Huỷ / hoàn tiền', match: (o) => ['refused_by_buyer', 'cancelled_by_seller', 'disputed', 'refunded'].includes(o.status) },
];
const lateLabel = (i) => (i.daysLate ? `Trễ ${i.daysLate} ngày` : 'Đúng hạn');

function DisputeForm({ orderId, dispatch, onDone, mode }) {
  const [reason, setReason] = useState('');
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!photos.length) { setErr('Thêm ít nhất 1 ảnh chụp tình trạng hàng khi nhận (tem, vết lỗi, hộp…)'); return; }
    setBusy(true); setErr('');
    try { if (await dispatch({ type: 'openDispute', orderId, reason, photos })) onDone(); } finally { setBusy(false); }
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      <label className="small" htmlFor={`dr-${orderId}`}>Mô tả vấn đề (ít nhất 10 ký tự)</label>
      <textarea id={`dr-${orderId}`} rows="2" value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} required />
      <PhotoPicker id={`dp-${orderId}`} photos={photos} onChange={(p) => { setPhotos(p); setErr(''); }} maxSide={mode === 'api' ? 1280 : 800} disabled={busy}
        label="Ảnh bằng chứng (bắt buộc)" hint="tối thiểu 1 ảnh" cover={false}
        tip="Chụp rõ chỗ lỗi, tem, hộp và phiếu giao hàng lúc nhận để ReOwn xử lý nhanh." />
      {err && <p className="small danger" role="alert">{err}</p>}
      <div className="row"><button className="btn btn-sm" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi khiếu nại'}</button><button type="button" className="btn btn-sm btn-outline" onClick={onDone} disabled={busy}>Huỷ</button></div>
    </form>
  );
}

function OrderCard({ o, product, dispatch, mode }) {
  const [stars, setStars] = useState(5);
  const [disputing, setDisputing] = useState(false);
  const method = o.method === 'full' ? 'Trả thẳng' : `Trả sau ${o.method} kỳ`;
  const canDispute = o.status === 'shipped' || (o.status === 'completed' && o.payoutStatus === 'held');
  return (
    <li className="ocard">
      <div className="ocard-head">
        <span className="small">{o.sellerName ? <>Người bán <b>{o.sellerName}</b></> : 'Đơn hàng'} · {date(o.createdAt)}</span>
        <span className={`ostatus st-${o.status}`}>{ORDER_STATUS[o.status]}</span>
      </div>
      <Link to={`/san-pham/${o.productId}`} className="ocard-body">
        <Art product={product || { category: o.category || 'study', icon: o.icon, cover: o.cover, title: o.title }} size="xs" />
        <span className="ocard-title">{o.title}</span>
        <span className="ocard-price"><strong>{money(o.price)}</strong><span className="small muted">{method}</span></span>
      </Link>
      <div className="ocard-foot">
        {o.status === 'paid' && <span className="small muted">Tiền đang giữ hộ · chờ người bán xác nhận gửi (trong 3 ngày)</span>}
        {o.dispute && <span className="small muted">Khiếu nại: {o.dispute.status === 'open' ? 'đang chờ ReOwn xử lý' : o.dispute.status === 'resolved_buyer' ? 'bạn thắng, đã hoàn tiền' : 'người bán thắng'}</span>}
        {o.myStars && <span className="small muted">Bạn đã đánh giá {o.myStars} sao</span>}
        <div className="ocard-actions">
          {canDispute && !disputing && <button className="btn btn-sm btn-outline" onClick={() => setDisputing(true)}>Hàng không đúng mô tả</button>}
          {o.status === 'shipped' && (
            <>
              <button className="btn btn-sm btn-outline" onClick={() => dispatch({ type: 'bomOrder', orderId: o.id })}>Từ chối nhận</button>
              <label className="sr-only" htmlFor={`st-${o.id}`}>Đánh giá người bán</label>
              <select id={`st-${o.id}`} value={stars} onChange={(e) => setStars(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s} sao</option>)}</select>
              <button className="btn btn-sm" onClick={() => dispatch({ type: 'confirmReceived', orderId: o.id, stars })}>Đã nhận hàng</button>
            </>
          )}
          {o.status === 'completed' && !o.myStars && mode === 'api' && (
            <>
              <select aria-label="Số sao" value={stars} onChange={(e) => setStars(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s} sao</option>)}</select>
              <button className="btn btn-sm" onClick={() => dispatch({ type: 'review', orderId: o.id, stars })}>Đánh giá</button>
            </>
          )}
        </div>
      </div>
      {disputing && <DisputeForm orderId={o.id} dispatch={dispatch} mode={mode} onDone={() => setDisputing(false)} />}
    </li>
  );
}

const VERIFY_FIELDS = {
  cccd: [{ k: 'number', label: 'Số CCCD (12 số)', pattern: '\\d{12}', inputMode: 'numeric' }],
  bank: [{ k: 'bankCode', label: 'Mã ngân hàng (VD: VCB)', pattern: '[A-Z]{2,12}' }, { k: 'accountNumber', label: 'Số tài khoản', pattern: '\\d{6,19}', inputMode: 'numeric' }],
  student: [{ k: 'school', label: 'Trường' }, { k: 'studentId', label: 'Mã sinh viên', pattern: '[A-Za-z0-9]{4,20}' }],
};

function VerifyItem({ k, pts, done, mode, dispatch }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const submit = async (e) => { e.preventDefault(); if (await dispatch({ type: 'verify', key: k, data: form })) setOpen(false); };
  return (
    <li>
      <span className={`vdot ${done ? 'ok' : ''}`}>{done && <Icon name="check" size={14} />}</span>
      <span className="v-main"><b>{VERIFY_LABEL[k]}</b><span className="small muted">{VERIFY_HINT[k]} · +{pts} điểm</span></span>
      {done ? <span className="small ok-text">Đã xác thực</span>
        : <button className="btn btn-sm btn-outline" onClick={() => (mode === 'api' ? setOpen(!open) : dispatch({ type: 'verify', key: k }))}>Xác thực</button>}
      {open && !done && (
        <form className="inline-form" onSubmit={submit}>
          {VERIFY_FIELDS[k].map((f) => (
            <div className="field" key={f.k}>
              <label htmlFor={`v-${k}-${f.k}`}>{f.label}</label>
              <input id={`v-${k}-${f.k}`} required pattern={f.pattern} inputMode={f.inputMode} value={form[f.k] || ''}
                onChange={(e) => setForm({ ...form, [f.k]: f.k === 'bankCode' ? e.target.value.toUpperCase() : e.target.value })} />
            </div>
          ))}
          <button className="btn btn-sm">Gửi xác thực</button>
        </form>
      )}
    </li>
  );
}

const MENU = [
  { v: '', label: 'Tổng quan' }, { v: 'don-mua', label: 'Đơn mua' }, { v: 'tra-sau', label: 'Trả sau' },
  { v: 'vi', label: 'Ví ReOwn' }, { v: 'uy-tin', label: 'Điểm uy tín' }, { v: 'xac-thuc', label: 'Xác thực tài khoản' },
];

export default function Account() {
  const { state, me, buyerScores, dispatch, mode, devTools } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || '';
  const [otab, setOtab] = useState('all');
  const res = buyerScores[me.id];
  const policy = bnplOffer(me, 0, state.plans, res);
  const used = outstanding(me, state.plans);
  const plans = state.plans.filter((p) => p.userId === me.id);
  const orders = state.orders.filter((o) => o.buyerId === me.id);
  const productById = (id) => state.products.find((p) => p.id === id);
  const shownOrders = orders.filter(ORDER_TABS.find((t) => t.v === otab).match);
  const nextDue = plans.flatMap((p) => p.installments.filter((i) => i.status !== 'paid').slice(0, 1).map((i) => ({ ...i, title: p.title }))).sort((a, b) => a.due - b.due)[0];
  const go = (v) => setParams(v ? { tab: v } : {});
  const verifiedCount = Object.values(me.verify).filter(Boolean).length;

  return (
    <div className="account">
      <aside className="acc-side">
        <h1 className="sr-only">Tài khoản của tôi</h1>
        <div className="acc-me">
          <span className="avatar lg">{me.name.split(' ').pop()[0]}</span>
          <div><strong>{me.name}</strong><span className="small muted">{me.school}</span></div>
        </div>
        <nav className="acc-menu" aria-label="Mục tài khoản">
          {MENU.map((m) => <button key={m.v} className={tab === m.v ? 'on' : ''} onClick={() => go(m.v)}>{m.label}</button>)}
          <Link to="/kenh-nguoi-ban">Kênh người bán<Icon name="chevron" size={14} /></Link>
          {me.role === 'admin' && <Link to="/quan-tri">Trang quản trị<Icon name="chevron" size={14} /></Link>}
          <button className="acc-out" onClick={() => dispatch({ type: 'logout' })}>{mode === 'api' ? 'Đăng xuất' : 'Đổi tài khoản'}<Icon name="logout" size={16} /></button>
        </nav>
      </aside>

      <div className="acc-main">
        {tab === '' && (
          <>
            <section className="acc-cards">
              <button className="acard" onClick={() => go('vi')}><span className="small muted">Ví ReOwn</span><strong>{money(me.finance.savings)}</strong><span className="small link">Xem ví</span></button>
              <button className="acard" onClick={() => go('tra-sau')}><span className="small muted">Hạn mức trả sau còn</span><strong>{policy.limit ? money(Math.max(0, policy.limit - used)) : 'Chưa mở'}</strong><span className="small link">{policy.maxTerm ? `Tối đa ${policy.maxTerm} kỳ` : 'Xem cách mở'}</span></button>
              <button className="acard" onClick={() => go('tra-sau')}><span className="small muted">Kỳ thanh toán tới</span><strong>{nextDue ? money(nextDue.amount) : '—'}</strong><span className="small link">{nextDue ? (nextDue.status === 'overdue' ? 'Đang quá hạn' : `Hạn ${date(nextDue.due)}`) : 'Không có khoản nào'}</span></button>
              <button className="acard" onClick={() => go('uy-tin')}><span className="small muted">Điểm uy tín</span><strong>{res.score} · Hạng {res.tier.id}</strong><span className="small link">{TIER_LABEL[res.tier.id]}</span></button>
            </section>
            {(!me.verify.cccd || policy.thinFile) && (
              <div className="notice">
                {!me.verify.cccd
                  ? <>Xác thực CCCD để mở trả sau và cộng 10 điểm uy tín. <button className="linkbtn strong" onClick={() => go('xac-thuc')}>Xác thực ngay</button></>
                  : <>Tài khoản mới: hạn mức tạm tính theo hạng C cho tới khi bạn trả đúng hạn {THIN_FILE_MIN_ONTIME} kỳ (hiện có {me.buyer.repayment.onTime}).</>}
              </div>
            )}
            <section className="panel">
              <div className="panel-head"><h2>Đơn mua</h2><button className="linkbtn" onClick={() => go('don-mua')}>Xem tất cả<Icon name="chevron" size={14} /></button></div>
              <div className="ostats">
                {ORDER_TABS.slice(1).map((t) => (
                  <button key={t.v} onClick={() => { setOtab(t.v); go('don-mua'); }}>
                    <strong>{orders.filter(t.match).length}</strong><span className="small">{t.label}</span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === 'don-mua' && (
          <section className="panel">
            <h2>Đơn mua</h2>
            <div className="otabs" role="tablist">
              {ORDER_TABS.map((t) => (
                <button key={t.v} role="tab" aria-selected={otab === t.v} className={otab === t.v ? 'on' : ''} onClick={() => setOtab(t.v)}>
                  {t.label}<span className="muted"> {orders.filter(t.match).length}</span>
                </button>
              ))}
            </div>
            {shownOrders.length === 0
              ? <Empty title="Chưa có đơn nào" action={<Link to="/" className="btn">Mua sắm ngay</Link>} />
              : <ul className="ocards">{shownOrders.slice(0, 20).map((o) => <OrderCard key={o.id} o={o} product={productById(o.productId)} dispatch={dispatch} mode={mode} />)}</ul>}
          </section>
        )}

        {tab === 'tra-sau' && (
          <section className="panel">
            <h2>Trả sau</h2>
            <div className="limit-bar">
              <div><span className="small muted">Hạn mức còn lại</span><strong>{money(Math.max(0, policy.limit - used))}</strong><span className="small muted">trên {money(policy.limit)}</span></div>
              <div className="bar big"><div style={{ width: `${policy.limit ? Math.min(100, (used / policy.limit) * 100) : 0}%` }} /></div>
              <span className="small muted">Góp tối đa {money(policy.monthlyRoom)}/tháng (30% thu nhập) · kỳ hạn tối đa {policy.maxTerm || 0} kỳ{policy.downRate != null ? ` · trả trước ${Math.round(policy.downRate * 100)}%` : ''}</span>
            </div>
            {policy.blockers.length > 0 && <p className="notice small">{policy.blockers.join('. ')}.</p>}
            {plans.length === 0 ? <Empty title="Chưa có khoản trả sau nào" action={<Link to="/tim-kiem?bnpl=1" className="btn">Tìm món trả sau được</Link>} /> : (
              <div className="plans">
                {plans.map((pl) => {
                  const next = pl.installments.find((i) => i.status !== 'paid');
                  const paid = pl.installments.filter((i) => i.status === 'paid').length;
                  return (
                    <div key={pl.id} className="plan">
                      <div className="plan-head"><strong>{pl.title}</strong><span className="small muted">Đã trả {paid}/{pl.installments.length} kỳ · tổng góp {money(pl.total)}{pl.down ? ` · đã trả trước ${money(pl.down)}` : ''}</span></div>
                      <ol className="sched">
                        {pl.installments.map((i) => (
                          <li key={i.n} className={`sch sch-${i.status} ${next && next.n === i.n ? 'current' : ''}`}>
                            <span>Kỳ {i.n}</span><b>{money(i.amount)}</b>
                            <span className="small">{i.status === 'paid' ? lateLabel(i) : i.status === 'overdue' ? 'Quá hạn >30 ngày' : `Hạn ${date(i.due)}`}</span>
                          </li>
                        ))}
                      </ol>
                      {next && (
                        <div className="row wrap-row">
                          {next.status === 'overdue'
                            ? <button className="btn btn-sm" onClick={() => dispatch({ type: 'payInstallment', planId: pl.id, n: next.n, mode: 'clearDefault' })}>Thanh toán kỳ quá hạn</button>
                            : <button className="btn btn-sm" onClick={() => dispatch({ type: 'payInstallment', planId: pl.id, n: next.n, mode: 'onTime' })}>Thanh toán kỳ {next.n} · {money(next.amount)}</button>}
                          {devTools && next.status !== 'overdue' && (
                            <details className="demo-tools">
                              <summary className="small">Công cụ demo</summary>
                              <div className="row wrap-row">
                                <button className="btn btn-sm btn-outline" onClick={() => dispatch({ type: 'devDueIn', planId: pl.id, n: next.n, days: 2 })}>Còn 2 ngày đến hạn (xem nhắc hạn)</button>
                                <button className="btn btn-sm btn-outline" onClick={() => dispatch({ type: 'payInstallment', planId: pl.id, n: next.n, mode: 'late' })}>Trả trễ 5 ngày</button>
                                <button className="btn btn-sm btn-outline" onClick={() => dispatch({ type: 'payInstallment', planId: pl.id, n: next.n, mode: 'severe' })}>Trả trễ 15 ngày</button>
                                <button className="btn btn-sm btn-outline danger" onClick={() => dispatch({ type: 'payInstallment', planId: pl.id, n: next.n, mode: 'default' })}>Quá hạn 30+ ngày</button>
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'vi' && (
          <section className="panel">
            <h2>Ví ReOwn</h2>
            <div className="wallet-hero"><span className="small">Số dư khả dụng</span><strong>{money(me.finance.savings)}</strong></div>
            {devTools && (
              <div className="row wrap-row">
                <span className="small muted">Nạp tiền (giả lập cổng thanh toán):</span>
                {[500_000, 2_000_000].map((v) => <button key={v} className="btn btn-sm btn-outline" onClick={() => dispatch({ type: 'topup', amount: v })}>+{money(v)}</button>)}
              </div>
            )}
          </section>
        )}

        {tab === 'uy-tin' && (
          <section className="panel">
            <h2>Điểm uy tín của bạn</h2>
            <div className="score-top">
              <ScoreGauge result={res} label="Khi mua hàng" />
              <div className="score-side">
                <TierScale score={res.score} />
                <p className="small muted">Điểm càng cao, hạn mức trả sau càng lớn.</p>
              </div>
            </div>
            <div className="score-grid">
              <div><h3>Thành phần điểm</h3><Breakdown parts={res.parts} /></div>
              <div><h3>Điều ảnh hưởng tới điểm</h3><Reasons reasons={res.reasons} /></div>
            </div>
            <table className="specs tier-table">
              <thead><tr><th>Hạng</th><th>Điểm</th><th>Trả sau</th></tr></thead>
              <tbody>
                {TIERS.map((t, i) => (
                  <tr key={t.id} className={t.id === res.tier.id ? 'cur' : ''}>
                    <td><TrustBadge result={{ tier: t, score: t.min }} long /></td>
                    <td>{t.min}–{i === 0 ? 100 : TIERS[i - 1].min - 1}</td>
                    <td>{BNPL_POLICY[t.id].limit ? `${money(BNPL_POLICY[t.id].limit)} · ${BNPL_POLICY[t.id].maxTerm} kỳ` : 'Chỉ trả thẳng'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'xac-thuc' && (
          <section className="panel">
            <h2>Xác thực tài khoản <span className="muted small">· {verifiedCount}/4</span></h2>
            <ul className="verify">
              {Object.entries(BUYER_IDENTITY_POINTS).map(([k, pts]) => <VerifyItem key={k} k={k} pts={pts} done={!!me.verify[k]} mode={mode} dispatch={dispatch} />)}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
