import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import { listingRisk } from '../../shared/scoring/engine.js';
import { UNVERIFIED_SELLER_MAX_LISTINGS } from '../../shared/scoring/config.js';
import { CATEGORIES } from '../data/mock.js';
import PhotoPicker from './PhotoPicker.jsx';
import { ProductCard, Slider } from './ui.jsx';
import { money, parseMoney } from '../lib/format.js';
import { imageSrc } from '../api/client.js';

const EMPTY = { title: '', category: 'study', price: 0, condition: 85, description: '', location: '' };

export default function ListingForm({ listing, onDone, onCancel }) {
  const { state, me, sellerScores, dispatch, mode } = useStore();
  const editing = !!listing;
  const [f, setF] = useState(() => (editing
    ? { title: listing.title, category: listing.category, price: listing.price, condition: listing.condition, description: listing.desc || '', location: listing.location || '' }
    : EMPTY));
  const [photos, setPhotos] = useState(() => (listing?.images || []).map((u, i) => ({ key: `old-${i}`, url: u, src: imageSrc(u), existing: true })));
  const [progress, setProgress] = useState(null);
  const sres = sellerScores[me.id];
  const active = state.products.filter((p) => p.sellerId === me.id && !p.sold).length;
  const capped = !editing && !me.verify.cccd && active >= UNVERIFIED_SELLER_MAX_LISTINGS;
  const draftRisk = f.title.length >= 5 || f.description ? listingRisk({ ...f, desc: f.description, id: listing?.id || 'draft' }, sres, state.products) : null;
  const blocked = !!draftRisk?.blocked;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const photoChanged = editing && (photos.length !== listing.images?.length || photos.some((p, i) => !p.existing || p.url !== listing.images[i]));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.title || !f.price || capped || blocked || progress) return;
    const fresh = photos.filter((p) => !p.existing).length;
    setProgress([0, fresh]);
    const product = { ...f, refPrice: draftRisk?.ref?.price, location: f.location || undefined };
    const ok = await dispatch(editing
      ? { type: 'editListing', id: listing.id, product, photos: photoChanged ? photos : undefined, onProgress: (d, t) => setProgress([d, t]) }
      : { type: 'addListing', photos, product, onProgress: (d, t) => setProgress([d, t]) });
    setProgress(null);
    if (ok) {
      photos.filter((p) => !p.existing).forEach((p) => URL.revokeObjectURL(p.url));
      onDone?.();
    }
  };

  const busyLabel = progress && (progress[1] && progress[0] < progress[1] ? `Đang tải ảnh ${progress[0] + 1}/${progress[1]}…` : editing ? 'Đang lưu…' : 'Đang đăng…');
  return (
    <div className="sell-grid">
      <form className="panel form" onSubmit={submit}>
        <h2>{editing ? 'Sửa tin' : 'Đăng tin mới'}</h2>
        <PhotoPicker photos={photos} onChange={setPhotos} maxSide={mode === 'api' ? 1280 : 800} disabled={!!progress} />
        <div className="field"><label htmlFor="t">Tên sản phẩm</label><input id="t" value={f.title} onChange={set('title')} placeholder="VD: Laptop Asus Vivobook 14 i3 / 8GB" minLength={5} maxLength={120} required /></div>
        <div className="two">
          <div className="field">
            <label htmlFor="c">Danh mục</label>
            <select id="c" value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="loc">Khu vực giao nhận</label><input id="loc" value={f.location} onChange={set('location')} placeholder="VD: Tân Phú" maxLength={40} /></div>
        </div>
        <div className="field">
          <label htmlFor="pr">Giá bán</label>
          <div className="money"><input id="pr" inputMode="numeric" value={f.price ? f.price.toLocaleString('vi-VN') : ''} onChange={(e) => setF({ ...f, price: parseMoney(e.target.value) })} required /><span>₫</span></div>
          {editing && f.price < listing.price && f.price > 0 && <span className="small ok-text">Giảm {money(listing.price - f.price)} — người đã nhắn hỏi món này sẽ được báo.</span>}
          {draftRisk?.ref && <span className="small muted">Giá tham khảo ReOwn cho món này: <b>{money(draftRisk.ref.price)}</b></span>}
        </div>
        <Slider id="cond" label="Độ mới" value={f.condition} min={30} max={100} onChange={(v) => setF({ ...f, condition: v })} format={(v) => `${v}%`} />
        <div className="field"><label htmlFor="d">Mô tả</label><textarea id="d" rows="4" value={f.description} onChange={set('description')} placeholder="Tình trạng, phụ kiện kèm theo, lý do bán…" maxLength={2000} /></div>
        {draftRisk && draftRisk.level !== 'low' && <div className={`alert alert-${draftRisk.level}`} role="alert"><strong>{blocked ? 'Chưa đăng được: tin kéo giao dịch ra ngoài ReOwn' : 'Tin này sẽ bị gắn cảnh báo'}</strong><ul>{draftRisk.flags.map((x) => <li key={x}>{x}</li>)}</ul>{blocked && <p className="small">Bỏ phần yêu cầu chuyển khoản / đặt cọc riêng. Người mua luôn thanh toán qua ReOwn.</p>}</div>}
        {capped && <div className="alert alert-medium">Chưa xác thực CCCD chỉ được đăng tối đa {UNVERIFIED_SELLER_MAX_LISTINGS} tin cùng lúc. <Link to="/tai-khoan?tab=xac-thuc">Xác thực ngay</Link></div>}
        <div className={editing ? 'form-acts' : ''}>
          {editing && <button type="button" className="btn btn-outline" onClick={onCancel} disabled={!!progress}>Huỷ</button>}
          <button className="btn btn-buy" disabled={capped || blocked || !!progress}>{busyLabel || (editing ? 'Lưu thay đổi' : 'Đăng tin')}</button>
        </div>
        {!editing && <p className="small muted">Phí 4% chỉ thu khi bán thành công.</p>}
      </form>
      <aside className="panel preview">
        <h3>Xem trước tin đăng</h3>
        <ProductCard product={{ id: 'preview', title: f.title || 'Tên sản phẩm của bạn', category: f.category, price: f.price || 0, condition: f.condition, location: f.location, icon: listing?.icon, cover: photos.length ? null : listing?.cover, daysAgo: 0, images: photos.map((p) => p.url) }} seller={me} sellerRes={sres} />
      </aside>
    </div>
  );
}
