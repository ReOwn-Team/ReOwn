import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { compressImage, MAX_IMAGES } from '../lib/images.js';

export default function PhotoPicker({ photos, onChange, maxSide = 1280, disabled }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [drag, setDrag] = useState(false);
  const latest = useRef(photos);
  useLayoutEffect(() => { latest.current = photos; });

  useEffect(() => () => latest.current.filter((p) => !p.existing).forEach((p) => URL.revokeObjectURL(p.url)), []);

  const add = async (fileList) => {
    const files = [...fileList].filter(Boolean);
    const room = MAX_IMAGES - latest.current.length;
    const errs = [];
    if (files.length > room) errs.push(`Chỉ thêm được ${room} ảnh nữa (tối đa ${MAX_IMAGES})`);
    setBusy(true);
    const next = [...latest.current];
    for (const f of files.slice(0, Math.max(0, room))) {
      try {
        const c = await compressImage(f, { maxSide, quality: maxSide > 900 ? 0.82 : 0.72 });
        next.push({ key: `${Date.now()}-${Math.random()}`, ...c, url: URL.createObjectURL(c.blob) });
      } catch (e) { errs.push(e.message); }
    }
    setBusy(false);
    setErrors(errs);
    onChange(next);
    if (input.current) input.current.value = '';
  };
  const remove = (key) => {
    const p = photos.find((x) => x.key === key);
    if (p) URL.revokeObjectURL(p.url);
    onChange(photos.filter((x) => x.key !== key));
  };
  const makeCover = (key) => onChange([photos.find((x) => x.key === key), ...photos.filter((x) => x.key !== key)]);
  const full = photos.length >= MAX_IMAGES;

  return (
    <div className="photos">
      <div className="photos-head">
        <span className="photos-label" id="photos-label">Ảnh sản phẩm</span>
        <span className="small muted">{photos.length}/{MAX_IMAGES} · ảnh đầu là ảnh bìa</span>
      </div>
      <ul className="photo-grid" aria-labelledby="photos-label">
        {photos.map((p, i) => (
          <li key={p.key} className="photo">
            <img src={p.src || p.url} alt={`Ảnh ${i + 1}`} />
            {i === 0 ? <span className="photo-cover">Ảnh bìa</span>
              : <button type="button" className="photo-act photo-make" onClick={() => makeCover(p.key)} disabled={disabled}>Đặt làm bìa</button>}
            <button type="button" className="photo-del" onClick={() => remove(p.key)} disabled={disabled} aria-label={`Xoá ảnh ${i + 1}`}><Icon name="close" size={16} /></button>
          </li>
        ))}
        {!full && (
          <li>
            <label
              className={`photo-add ${drag ? 'drag' : ''} ${busy || disabled ? 'is-busy' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy && !disabled) add(e.dataTransfer.files); }}
            >
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple className="sr-only"
                disabled={busy || disabled} onChange={(e) => add(e.target.files)} />
              <Icon name="camera" size={26} />
              <span>{busy ? 'Đang nén ảnh…' : photos.length ? 'Thêm ảnh' : 'Chọn hoặc kéo ảnh vào'}</span>
            </label>
          </li>
        )}
      </ul>
      {errors.length > 0 && <ul className="photo-errors small" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {!photos.length && <p className="small muted">Tin có ảnh thật được xem nhiều hơn. Chụp rõ cả chỗ trầy xước nếu có.</p>}
    </div>
  );
}
