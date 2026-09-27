import { lazy, Suspense, useState } from 'react';
import { imageSrc } from '../api/client.js';
import { money, vnDateTime } from '../lib/format.js';
import { CARRIERS } from '../../shared/policy.js';
import Icon from './Icon.jsx';

const Lightbox = lazy(() => import('./Lightbox.jsx'));

const hoursLeft = (t) => Math.round((new Date(t).getTime() - Date.now()) / 3_600_000);

export function Evidence({ urls, label }) {
  const [open, setOpen] = useState(null);
  if (!urls?.length) return null;
  return (
    <div>
      {label && <span className="small muted">{label}</span>}
      <div className="evidence">
        {urls.map((u, i) => (
          <a key={u.slice(-40) + i} href={imageSrc(u)} target="_blank" rel="noreferrer" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); setOpen(i); }}>
            <img src={imageSrc(u)} alt={`${label || 'Ảnh'} ${i + 1}`} width="96" height="96" loading="lazy" decoding="async" />
          </a>
        ))}
      </div>
      {open != null && <Suspense fallback={null}><Lightbox srcs={urls.map(imageSrc)} alt={label || 'Ảnh'} start={open} onClose={() => setOpen(null)} /></Suspense>}
    </div>
  );
}

/** Thông tin giao nhận: địa chỉ / nơi hẹn, đơn vị vận chuyển và mã vận đơn. */
export function DeliveryInfo({ o }) {
  if (!o.delivery) return null;
  return (
    <div className="odeliv small">
      <Icon name={o.delivery === 'meetup' ? 'pin' : 'truck'} size={16} />
      {o.delivery === 'meetup'
        ? <span><b>Gặp trực tiếp</b>{o.meetupNote ? ` · ${o.meetupNote}` : ' · hẹn nơi giờ qua chat'}</span>
        : <span><b>Giao tận nơi</b>{o.shipTo ? ` · ${o.shipTo}` : ''}{o.carrier && <> · <b>{o.carrier}</b> mã <code>{o.trackingCode}</code></>}</span>}
    </div>
  );
}

export function CarrierFields({ id, value, onChange, requireCode = true }) {
  return (
    <div className="carrier-fields">
      <label className="sr-only" htmlFor={`${id}-c`}>Đơn vị vận chuyển</label>
      <select id={`${id}-c`} value={value.carrier} onChange={(e) => onChange({ ...value, carrier: e.target.value })}>
        {CARRIERS.map((c) => <option key={c}>{c}</option>)}
      </select>
      <label className="sr-only" htmlFor={`${id}-t`}>Mã vận đơn</label>
      <input id={`${id}-t`} value={value.trackingCode} onChange={(e) => onChange({ ...value, trackingCode: e.target.value.replace(/\s/g, '') })}
        placeholder={requireCode ? 'Mã vận đơn' : 'Mã vận đơn (nếu có)'} maxLength={40} inputMode="text" autoComplete="off" spellCheck={false} autoCapitalize="characters" name="tracking-code" />
    </div>
  );
}

const REMEDY = {
  refund: 'ReOwn hoàn tiền cho người mua',
  return_refund: 'Người mua gửi trả hàng, hoàn tiền khi người bán nhận lại',
  partial: 'Hoàn một phần cho người mua',
};

/** Toàn bộ diễn biến khiếu nại: lý do + ảnh người mua, phản hồi + ảnh người bán, kết luận của ReOwn. */
export function DisputeThread({ d, viewer }) {
  if (!d) return null;
  const open = d.status === 'open';
  const left = d.respondBy ? hoursLeft(d.respondBy) : null;
  return (
    <div className="dthread">
      <div className="dmsg buyer">
        <span className="small muted">{viewer === 'buyer' ? 'Khiếu nại của bạn' : 'Người mua khiếu nại'}</span>
        <p>{d.reason}</p>
        <Evidence urls={d.evidence} label="Ảnh của người mua" />
      </div>
      {d.sellerResponse ? (
        <div className="dmsg seller">
          <span className="small muted">{viewer === 'seller' ? 'Phản hồi của bạn' : 'Người bán phản hồi'} · {vnDateTime(d.sellerRespondedAt)}</span>
          <p>{d.sellerResponse}</p>
          <Evidence urls={d.sellerEvidence} label="Ảnh của người bán" />
        </div>
      ) : open && left != null && (
        <p className="small muted">{left > 0 ? `Người bán còn ${left} giờ để phản hồi.` : 'Người bán không phản hồi trong 48 giờ — ReOwn xét dựa trên bằng chứng của người mua.'}</p>
      )}
      {!open && (
        <div className="dmsg verdict">
          <span className="small muted">Kết luận của ReOwn</span>
          <p><b>{d.status === 'resolved_seller' ? 'Người bán đúng - đơn hoàn tất' : d.remedy === 'partial' ? `${REMEDY.partial}: ${money(d.refundAmount || 0)}` : REMEDY[d.remedy] || 'Hoàn tiền cho người mua'}</b>{d.resolution ? `. ${d.resolution}` : ''}</p>
        </div>
      )}
    </div>
  );
}

/** Mã nhận hàng của người mua khi gặp trực tiếp. */
export function HandoverCode({ code }) {
  const [shown, setShown] = useState(false);
  if (!code) return null;
  return (
    <div className="hcode">
      <div>
        <span className="small muted">Mã nhận hàng</span>
        <strong aria-live="polite">{shown ? `${code.slice(0, 3)} ${code.slice(3)}` : '••• •••'}</strong>
      </div>
      <button type="button" className="btn btn-sm btn-outline" onClick={() => setShown(!shown)}>{shown ? 'Ẩn mã' : 'Hiện mã'}</button>
      <p className="small muted">Chỉ đọc mã cho người bán <b>sau khi đã kiểm tra hàng đúng mô tả</b>.</p>
    </div>
  );
}
