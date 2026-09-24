import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/useStore.js';

const HIDE_REASONS = ['Yêu cầu chuyển khoản / đặt cọc ngoài ReOwn', 'Hàng giả, hàng nhái', 'Giá ảo để lừa', 'Hàng cấm, không được bán', 'Ảnh / mô tả không đúng sự thật'];
const OTHER = 'Khác';

export default function AdminHide({ id, onDone, compact = false }) {
  const { admin } = useStore();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(HIDE_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [custom, setCustom] = useState('');
  const other = reason === OTHER;
  const finalReason = other ? custom.trim() : reason;

  const hide = async () => {
    if (other && finalReason.length < 5) { setErr('Nhập lý do gỡ (ít nhất 5 ký tự)'); return; }
    setBusy(true); setErr('');
    try { await admin.hide(id, finalReason); setOpen(false); onDone?.(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!open) {
    return <button type="button" className={`btn ${compact ? 'btn-sm' : ''} danger-btn`} onClick={() => setOpen(true)}>Gỡ tin</button>;
  }
  return (
    <div className="hide-form">
      <label className="small" htmlFor={`hr-${id}`}>Lý do gỡ (người bán sẽ thấy)</label>
      <select id={`hr-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus>
        {[...HIDE_REASONS, OTHER].map((r) => <option key={r}>{r}</option>)}
      </select>
      {other && (
        <>
          <label className="sr-only" htmlFor={`hc-${id}`}>Lý do khác</label>
          <textarea id={`hc-${id}`} rows={2} maxLength={300} value={custom} autoFocus placeholder="Nhập lý do gỡ tin…"
            onChange={(e) => { setCustom(e.target.value); setErr(''); }} />
        </>
      )}
      {err && <p className="small danger" role="alert">{err}{/2 lớp/.test(err) && <> · <Link to="/quan-tri">Xác thực tại trang quản trị</Link></>}</p>}
      <div className="row">
        <button type="button" className="btn btn-sm btn-outline" onClick={() => { setOpen(false); setErr(''); setCustom(''); setReason(HIDE_REASONS[0]); }} disabled={busy}>Huỷ</button>
        <button type="button" className="btn btn-sm danger-btn" onClick={hide} disabled={busy}>{busy ? 'Đang gỡ…' : 'Xác nhận gỡ'}</button>
      </div>
    </div>
  );
}
