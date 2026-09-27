import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import { outstanding, bnplOffer } from '../../shared/scoring/engine.js';
import { BUYER_IDENTITY_POINTS, THIN_FILE_MIN_ONTIME, BNPL_POLICY, TIERS } from '../../shared/scoring/config.js';
import Art from '../components/Art.jsx';
import Icon from '../components/Icon.jsx';
import PhotoPicker from '../components/PhotoPicker.jsx';
import { ScoreGauge, TierScale, Breakdown, Reasons, TrustBadge, Empty } from '../components/ui.jsx';
import { money, TIER_LABEL, orderStatusLabel, parseMoney } from '../lib/format.js';
import { WITHDRAW_MIN, LATE_FEE, LATE_FEE_GRACE_DAYS, lateFeeFor } from '../../shared/policy.js';
import { DeliveryInfo, DisputeThread, HandoverCode, CarrierFields } from '../components/OrderBits.jsx';

const VERIFY_LABEL = { phone: 'Số điện thoại', cccd: 'CCCD gắn chip', bank: 'Tài khoản ngân hàng', student: 'Thẻ sinh viên' };
const VERIFY_HINT = { phone: 'Xác thực khi đăng nhập', cccd: 'Bắt buộc để dùng trả sau', bank: 'Nhận tiền bán hàng', student: 'Ưu đãi sinh viên' };
const date = (t) => new Date(t).toLocaleDateString('vi-VN');
const ORDER_TABS = [
  { v: 'all', label: 'Tất cả', match: () => true },
  { v: 'paid', label: 'Chờ gửi hàng', icon: 'clock', match: (o) => o.status === 'paid' },
  { v: 'shipped', label: 'Đang giao', icon: 'truck', match: (o) => o.status === 'shipped' },
  { v: 'completed', label: 'Hoàn tất', icon: 'check', match: (o) => o.status === 'completed' },
  { v: 'closed', label: 'Khiếu nại / hoàn tiền', icon: 'alert', match: (o) => ['refused_by_buyer', 'cancelled_by_seller', 'disputed', 'return_pending', 'returning', 'refunded'].includes(o.status) },
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

function ReturnForm({ o, dispatch }) {
  const [v, setV] = useState({ carrier: 'GHN', trackingCode: '' });
  const [busy, setBusy] = useState(false);
  const meetup = v.carrier === 'Khác';
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!meetup && v.trackingCode.length < 4) { setErr('Nhập mã vận đơn (ít nhất 4 ký tự) — hoặc chọn "Khác" nếu trả tận tay'); e.currentTarget.querySelector('input')?.focus(); return; }
    setBusy(true); setErr('');
    try { await dispatch({ type: 'returnShip', orderId: o.id, carrier: meetup ? 'Gặp trực tiếp / khác' : v.carrier, trackingCode: v.trackingCode || undefined }); } finally { setBusy(false); }
  };
  const due = o.returnInfo?.dueAt;
  return (
    <form className="inline-form" onSubmit={submit}>
      <p className="small"><b>Gửi trả hàng cho người bán</b>{due ? ` trước ${date(due)}` : ''}. Quá hạn không gửi, đơn được tính là hoàn tất.</p>
      <CarrierFields id={`rt-${o.id}`} value={v} onChange={(x) => { setV(x); setErr(''); }} requireCode={!meetup} />
      {err && <span className="small danger" role="alert">{err}</span>}
      <div className="row"><button className="btn btn-sm" disabled={busy}>{busy ? 'Đang gửi…' : 'Đã gửi trả'}</button></div>
    </form>
  );
}

function OrderCard({ o, product, dispatch, mode }) {
  const [stars, setStars] = useState(5);
  const [disputing, setDisputing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const method = o.method === 'full' ? 'Trả thẳng' : `Trả sau ${o.method} kỳ`;
  const meetup = o.delivery === 'meetup';
  const canReceive = o.status === 'shipped' || (meetup && o.status === 'paid');
  const canDispute = (o.status === 'shipped' && !meetup) || (o.status === 'completed' && o.payoutStatus === 'held');
  return (
    <li className="ocard">
      <div className="ocard-head">
        <span className="small">{o.sellerName ? <>Người bán <b>{o.sellerName}</b></> : 'Đơn hàng'} · {date(o.createdAt)}</span>
        <span className={`ostatus st-${o.status}`}>{orderStatusLabel(o)}</span>
      </div>
      <Link to={`/san-pham/${o.productId}`} className="ocard-body">
        <Art product={product || { category: o.category || 'study', icon: o.icon, cover: o.cover, title: o.title }} size="xs" />
        <span className="ocard-title">{o.title}</span>
        <span className="ocard-price"><strong>{money(o.price)}</strong><span className="small muted">{method}</span></span>
      </Link>
      <DeliveryInfo o={o} />
      {meetup && canReceive && <HandoverCode code={o.handoverCode} />}
      {o.dispute && <DisputeThread d={o.dispute} viewer="buyer" />}
      {o.status === 'return_pending' && <ReturnForm o={o} dispatch={dispatch} />}
      <div className="ocard-foot">
        {o.status === 'paid' && !meetup && <span className="small muted">Tiền đang giữ hộ · chờ người bán gửi hàng (trong 3 ngày)</span>}
        {o.status === 'returning' && <span className="small muted">Đã gửi trả qua {o.returnInfo?.carrier}{o.returnInfo?.trackingCode ? ` · mã ${o.returnInfo.trackingCode}` : ''}. Tự hoàn tiền nếu người bán không xác nhận trong 7 ngày.</span>}
        {o.refundAmount > 0 && <span className="small muted">Đã hoàn {money(o.refundAmount)} về ví</span>}
        {o.myStars && <span className="small muted">Bạn đã đánh giá {o.myStars} sao</span>}
        <div className="ocard-actions">
          {canDispute && !disputing && <button className="btn btn-sm btn-outline" onClick={() => setDisputing(true)}>Hàng không đúng mô tả</button>}
          {canReceive && (confirm ? (
            <>
              <span className="small">{confirm === 'refuse' ? 'Từ chối nhận? Tiền được hoàn, lượt từ chối tính vào điểm uy tín.' : 'Xác nhận đã nhận đúng hàng? Tiền sẽ được chuyển cho người bán.'}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setConfirm(null)}>Quay lại</button>
              <button className={`btn btn-sm ${confirm === 'refuse' ? 'danger-btn' : ''}`}
                onClick={() => { dispatch(confirm === 'refuse' ? { type: 'bomOrder', orderId: o.id } : { type: 'confirmReceived', orderId: o.id, stars }); setConfirm(null); }}>
                {confirm === 'refuse' ? 'Từ chối nhận' : `Xác nhận · ${stars} sao`}
              </button>
            </>
          ) : (
            <>
              {!meetup && <button className="btn btn-sm btn-outline" onClick={() => setConfirm('refuse')}>Từ chối nhận</button>}
              <label className="sr-only" htmlFor={`st-${o.id}`}>Đánh giá người bán</label>
              <select id={`st-${o.id}`} value={stars} onChange={(e) => setStars(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s} sao</option>)}</select>
              <button className={`btn btn-sm ${meetup ? 'btn-outline' : ''}`} onClick={() => setConfirm('receive')}>Đã nhận hàng</button>
            </>
          ))}
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

function WalletPanel({ me, dispatch, devTools, walletInfo, go }) {
  const [info, setInfo] = useState(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const balance = me.finance.savings;
  const refresh = useCallback(() => walletInfo().then(setInfo).catch(() => setInfo({ entries: [], withdrawals: [], bankLast4: null })), [walletInfo]);
  useEffect(() => { refresh(); }, [refresh, balance]);
  const submit = async (e) => {
    e.preventDefault();
    const v = parseMoney(amount);
    if (v < WITHDRAW_MIN) { setErr(`Nhập số tiền từ ${money(WITHDRAW_MIN)} trở lên`); document.getElementById('wd-amount')?.focus(); return; }
    if (v > balance) { setErr(`Vượt số dư khả dụng — tối đa ${money(balance)}`); document.getElementById('wd-amount')?.focus(); return; }
    setBusy(true); setErr('');
    try { if (await dispatch({ type: 'withdraw', amount: v })) { setAmount(''); refresh(); } } finally { setBusy(false); }
  };
  return (
    <section className="panel">
      <h2>Ví ReOwn</h2>
      <div className="wallet-hero"><span className="small">Số dư khả dụng</span><strong>{money(balance)}</strong></div>
      {devTools && (
        <div className="row wrap-row">
          <span className="small muted">Nạp tiền (giả lập cổng thanh toán):</span>
          {[500_000, 2_000_000].map((v) => <button key={v} className="btn btn-sm btn-outline" onClick={() => dispatch({ type: 'topup', amount: v })}>+{money(v)}</button>)}
        </div>
      )}
      <h3>Rút về ngân hàng</h3>
      {info && !info.bankLast4 ? (
        <p className="notice small">Xác thực tài khoản ngân hàng để rút tiền bán hàng. <button className="linkbtn strong" onClick={() => go('xac-thuc')}>Xác thực ngay</button></p>
      ) : (
        <form className="withdraw" onSubmit={submit}>
          <label htmlFor="wd-amount" className="small">Số tiền rút về tài khoản ****{info?.bankLast4 || '····'}</label>
          <div className="row wrap-row">
            <input id="wd-amount" name="withdraw-amount" autoComplete="off" inputMode="numeric" value={amount} placeholder={`Tối thiểu ${money(WITHDRAW_MIN)}`}
              onChange={(e) => { const v = parseMoney(e.target.value); setAmount(v ? v.toLocaleString('vi-VN') : ''); setErr(''); }} aria-invalid={!!err} />
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setAmount(balance.toLocaleString('vi-VN'))} disabled={!balance}>Rút hết</button>
            <button className="btn btn-sm" disabled={busy}>{busy ? 'Đang chuyển…' : 'Rút tiền'}</button>
          </div>
          {err && <span className="small danger" role="alert">{err}</span>}
          <span className="small muted">Miễn phí · tối đa 3 lần/ngày</span>
        </form>
      )}
      {info?.withdrawals?.length > 0 && (
        <>
          <h3>Lịch sử rút tiền</h3>
          <ul className="txlist">
            {info.withdrawals.map((w) => (
              <li key={w.id}><span><b>-{money(w.amount)}</b><span className="small muted"> về ****{w.bankLast4} · {w.reference}</span></span><span className="small muted">{date(w.createdAt)} · {w.status === 'paid' ? 'Thành công' : 'Thất bại'}</span></li>
            ))}
          </ul>
        </>
      )}
      {info?.entries?.length > 0 && (
        <>
          <h3>Biến động số dư</h3>
          <ul className="txlist">
            {info.entries.slice(0, 20).map((t, i) => (
              <li key={i}><span className={t.amount > 0 ? 'ok-text' : ''}><b>{t.amount > 0 ? '+' : ''}{money(t.amount)}</b></span><span className="small muted">{t.memo} · {date(t.created_at)}</span></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Lộ trình mở / nâng trả sau cho tài khoản mới: từng bước cụ thể, đã xong hay chưa. */
function BnplRoadmap({ me, res, policy, go }) {
  const onTime = me.buyer?.repayment?.onTime || 0;
  const steps = [
    { done: true, text: 'Xác thực số điện thoại' },
    { done: !!me.verify.cccd, text: `Xác thực CCCD gắn chip (+${BUYER_IDENTITY_POINTS.cccd} điểm) — bắt buộc để trả sau`, act: 'xac-thuc' },
    { done: !!me.verify.student && !!me.verify.bank, text: `Xác thực thẻ sinh viên và tài khoản ngân hàng (+${BUYER_IDENTITY_POINTS.student + BUYER_IDENTITY_POINTS.bank} điểm)`, act: 'xac-thuc' },
    { done: (me.finance.monthlyIncome || 0) > 0, text: 'Khai thu nhập / trợ cấp hằng tháng để tính mức góp phù hợp', act: 'thu-nhap' },
    { done: res.score >= TIERS.find((t) => t.id === 'C').min, text: `Đạt ${TIERS.find((t) => t.id === 'C').min} điểm (hạng C) để mở trả sau ${money(BNPL_POLICY.C.limit)}, 3 kỳ — hiện ${res.score} điểm` },
    { done: onTime >= THIN_FILE_MIN_ONTIME, text: `Trả đúng hạn ${THIN_FILE_MIN_ONTIME} kỳ để mở hạn mức theo hạng thật (tới ${money(BNPL_POLICY.A.limit)}, 6 kỳ) — đã có ${Math.min(onTime, THIN_FILE_MIN_ONTIME)}/${THIN_FILE_MIN_ONTIME}` },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  if (doneCount === steps.length && !policy.thinFile) return null;
  return (
    <div className="roadmap">
      <div className="roadmap-head"><b>Lộ trình mở trả sau</b><span className="small muted">{doneCount}/{steps.length} bước</span></div>
      <div className="bar"><div style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <ol>
        {steps.map((st) => (
          <li key={st.text} className={st.done ? 'done' : ''}>
            <span className="vdot" aria-hidden="true">{st.done && <Icon name="check" size={12} />}</span>
            <span>{st.text}</span>
            {!st.done && st.act === 'xac-thuc' && <button className="linkbtn small" onClick={() => go('xac-thuc')}>Làm ngay</button>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function IncomeForm({ me, dispatch }) {
  const [v, setV] = useState(me.finance.monthlyIncome ? me.finance.monthlyIncome.toLocaleString('vi-VN') : '');
  return (
    <form className="row wrap-row income-form" onSubmit={(e) => { e.preventDefault(); dispatch({ type: 'updateFinance', finance: { monthlyIncome: parseMoney(v) } }); }}>
      <label htmlFor="income" className="small">Thu nhập / trợ cấp mỗi tháng</label>
      <input id="income" inputMode="numeric" value={v} onChange={(e) => { const n = parseMoney(e.target.value); setV(n ? n.toLocaleString('vi-VN') : ''); }} placeholder="VD: 3.000.000…" autoComplete="off" name="monthly-income" />
      <button className="btn btn-sm btn-outline">Lưu</button>
    </form>
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
  { v: '', label: 'Tổng quan', icon: 'grid' }, { v: 'don-mua', label: 'Đơn mua', icon: 'bag' }, { v: 'tra-sau', label: 'Trả sau', icon: 'calendar' },
  { v: 'vi', label: 'Ví ReOwn', icon: 'wallet' }, { v: 'uy-tin', label: 'Điểm uy tín', icon: 'star' }, { v: 'xac-thuc', label: 'Xác thực tài khoản', short: 'Xác thực', icon: 'shield' },
];
const MenuLabel = ({ icon, label, short }) => (
  <><span className="acc-ic"><Icon name={icon} size={22} /></span><span className="acc-lb">{short ? <><span className="acc-long">{label}</span><span className="acc-short">{short}</span></> : label}</span></>
);

export default function Account() {
  const { state, me, buyerScores, dispatch, mode, devTools, walletInfo } = useStore();
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
  const upcoming = plans.flatMap((p) => p.installments.filter((i) => i.status !== 'paid').map((i) => {
    const lateDays = Math.floor((Date.now() - new Date(i.due).getTime()) / 86_400_000);
    return { ...i, due: new Date(i.due).getTime(), title: p.title, of: p.installments.length, overdue: lateDays > 0, lateDays, fee: lateFeeFor(i.due) };
  })).sort((x, y) => x.due - y.due).slice(0, 6);
  const verifiedCount = Object.values(me.verify).filter(Boolean).length;

  return (
    <div className={`account ${tab ? 'has-tab' : ''}`}>
      <aside className="acc-side">
        <h1 className="sr-only">Tài khoản của tôi</h1>
        <div className="acc-me">
          <span className="avatar lg">{me.name.split(' ').pop()[0]}</span>
          <div><strong>{me.name}</strong><span className="small">{me.school}</span></div>
          <span className={`acc-tier trust-${res.tier.id <= 'B' ? 'good' : 'neutral'}`}>Hạng {res.tier.id}</span>
        </div>
        <nav className="acc-menu" aria-label="Mục tài khoản">
          {MENU.map((m) => (
            <button key={m.v} className={tab === m.v ? 'on' : ''} aria-current={tab === m.v ? 'page' : undefined} onClick={() => go(m.v)}>
              <MenuLabel {...m} />
              {m.v === 'don-mua' && orders.some((o) => ['paid', 'shipped'].includes(o.status)) && <span className="acc-dot" aria-hidden="true" />}
            </button>
          ))}
          <Link to="/kenh-nguoi-ban"><MenuLabel icon="shop" label="Kênh người bán" short="Bán hàng" /></Link>
          {me.role === 'admin' && <Link to="/quan-tri"><MenuLabel icon="shield" label="Trang quản trị" short="Quản trị" /></Link>}
          <button className="acc-out" onClick={() => dispatch({ type: 'logout' })}><MenuLabel icon="logout" label={mode === 'api' ? 'Đăng xuất' : 'Đổi tài khoản'} /></button>
        </nav>
      </aside>

      <div className="acc-main">
        {tab && (
          <div className="acc-subhead">
            <button type="button" className="linkbtn" onClick={() => go('')}><Icon name="back" size={20} />Tài khoản</button>
          </div>
        )}
        {tab === '' && (
          <>
            <section className="acc-cards">
              <button className="acard" onClick={() => go('vi')}><span className="small muted">Ví ReOwn</span><strong>{money(me.finance.savings)}</strong><span className="small link">Xem ví</span></button>
              <button className="acard" onClick={() => go('tra-sau')}><span className="small muted">Hạn mức trả sau còn</span><strong>{policy.limit ? money(Math.max(0, policy.limit - used)) : 'Chưa mở'}</strong><span className="small link">{policy.maxTerm ? `Tối đa ${policy.maxTerm} kỳ` : 'Xem cách mở'}</span></button>
              <button className="acard" onClick={() => go('tra-sau')}><span className="small muted">Kỳ thanh toán tới</span><strong>{nextDue ? money(nextDue.amount) : '—'}</strong><span className="small link">{nextDue ? (nextDue.status === 'overdue' ? 'Đang quá hạn' : `Hạn ${date(nextDue.due)}`) : 'Không có khoản nào'}</span></button>
              <button className="acard" onClick={() => go('uy-tin')}><span className="small muted">Điểm uy tín</span><strong>{res.score} · Hạng {res.tier.id}</strong><span className="small link">{TIER_LABEL[res.tier.id]}</span></button>
            </section>
            {(!me.verify.cccd || policy.thinFile || policy.blockers.length > 0) && <BnplRoadmap me={me} res={res} policy={policy} go={go} />}
            <section className="panel">
              <div className="panel-head"><h2>Đơn mua</h2><button className="linkbtn" onClick={() => go('don-mua')}>Xem tất cả<Icon name="chevron" size={14} /></button></div>
              <div className="ostats">
                {ORDER_TABS.slice(1).map((t) => (
                  <button key={t.v} onClick={() => { setOtab(t.v); go('don-mua'); }}>
                    <span className="ostat-ic"><Icon name={t.icon} size={24} />{orders.filter(t.match).length > 0 && <span className="count">{orders.filter(t.match).length}</span>}</span>
                    <span className="small">{t.label}</span>
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
            <BnplRoadmap me={me} res={res} policy={policy} go={go} />
            {!(me.finance.monthlyIncome > 0) && <IncomeForm me={me} dispatch={dispatch} />}
            {upcoming.length > 0 && (
              <div className="upcoming">
                <h3>Lịch trả sắp tới</h3>
                <ul>
                  {upcoming.map((i) => (
                    <li key={i.id} className={i.overdue ? 'late' : ''}>
                      <span><b>{money(i.amount)}</b>{i.fee ? <span className="small danger"> + {money(i.fee)} phí trễ</span> : null}</span>
                      <span className="small">{i.title} · kỳ {i.n}/{i.of}</span>
                      <span className="small muted">{i.overdue ? `Quá hạn ${i.lateDays} ngày` : `Hạn ${date(i.due)}`}</span>
                    </li>
                  ))}
                </ul>
                <p className="small muted">Trễ quá {LATE_FEE_GRACE_DAYS} ngày cộng phí {money(LATE_FEE)}/kỳ và bị trừ điểm uy tín.</p>
              </div>
            )}
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
                            <span className="small">{i.status === 'paid' ? lateLabel(i) : i.status === 'overdue' ? 'Quá hạn >30 ngày' : `Hạn ${date(i.due)}`}{i.lateFee ? ` · phí trễ ${money(i.lateFee)}` : ''}</span>
                          </li>
                        ))}
                      </ol>
                      {next && (
                        <div className="row wrap-row">
                          {next.status === 'overdue'
                            ? <button className="btn btn-sm" onClick={() => dispatch({ type: 'payInstallment', planId: pl.id, n: next.n, mode: 'clearDefault' })}>Thanh toán kỳ quá hạn</button>
                            : <button className="btn btn-sm" onClick={() => dispatch({ type: 'payInstallment', planId: pl.id, n: next.n, mode: 'onTime' })}>Thanh toán kỳ {next.n} · {money(next.amount + lateFeeFor(next.due))}</button>}
                          {pl.installments.filter((i) => i.status !== 'paid').length > 1 && (
                            <button className="btn btn-sm btn-outline" onClick={() => dispatch({ type: 'payoff', planId: pl.id })}>
                              Tất toán sớm · {money(pl.installments.filter((i) => i.status !== 'paid').reduce((sum, i) => sum + i.amount + lateFeeFor(i.due), 0))}
                            </button>
                          )}
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

        {tab === 'vi' && <WalletPanel me={me} dispatch={dispatch} devTools={devTools} walletInfo={walletInfo} go={go} />}

        {tab === 'uy-tin' && (
          <section className="panel">
            <h2>Điểm uy tín của bạn</h2>
            <div className="score-top">
              <ScoreGauge result={res} label="Khi mua hàng" />
              <div className="score-side">
                <TierScale score={res.score} />
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
