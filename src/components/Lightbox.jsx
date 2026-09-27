import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const MAX = 4;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Xem ảnh toàn màn hình: vuốt/phím mũi tên để chuyển ảnh, chạm đúp · lăn chuột · chụm hai ngón · nút +/- để phóng to,
 * kéo để di chuyển khi đang phóng. Vị trí phóng giữ trong ref (không render lại mỗi lần di chuyển ngón tay).
 */
export default function Lightbox({ srcs, alt = '', start = 0, onClose }) {
  const dlg = useRef(null);
  const stage = useRef(null);
  const img = useRef(null);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const ptrs = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(0);
  const [i, setI] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const n = srcs.length;

  useEffect(() => {
    const d = dlg.current;
    if (!d.open) d.showModal();
    return () => { if (d.open) d.close(); };
  }, []);

  // Vẽ lại transform trực tiếp; `animate` bật chuyển động mượt cho thao tác rời rạc (chạm đúp, nút bấm).
  const paint = (animate) => {
    const el = img.current;
    if (!el) return;
    const { s, x, y } = view.current;
    el.classList.toggle('is-gliding', !!animate);
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
  };
  const setView = (s, x, y, animate) => {
    const el = img.current;
    s = clamp(s, 1, MAX);
    const mx = el ? (el.offsetWidth * (s - 1)) / 2 : 0;
    const my = el ? (el.offsetHeight * (s - 1)) / 2 : 0;
    view.current = { s, x: s === 1 ? 0 : clamp(x, -mx, mx), y: s === 1 ? 0 : clamp(y, -my, my) };
    paint(animate);
    setZoomed(s > 1.01);
  };
  // Phóng quanh một điểm (toạ độ so với tâm ảnh) để điểm đó đứng yên dưới ngón tay / con trỏ.
  const zoomAt = (s2, cx, cy, animate) => {
    const { s, x, y } = view.current;
    const k = clamp(s2, 1, MAX) / s;
    setView(s * k, cx - (cx - x) * k, cy - (cy - y) * k, animate);
  };
  const center = (e) => {
    const r = stage.current.getBoundingClientRect();
    return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
  };

  const go = (d) => {
    if (n < 2) return;
    view.current = { s: 1, x: 0, y: 0 };
    setZoomed(false);
    setI((k) => (k + d + n) % n);
  };
  const step = (dir) => zoomAt(view.current.s * (dir > 0 ? 1.6 : 1 / 1.6), 0, 0, true);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === '+' || e.key === '=') step(1);
    else if (e.key === '-') step(-1);
    else if (e.key === '0') setView(1, 0, 0, true);
    else return;
    e.preventDefault();
  };

  const onPointerDown = (e) => {
    if (e.target.closest('button')) return;
    stage.current.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...ptrs.current.values()];
    const { s, x, y } = view.current;
    if (pts.length === 2) {
      const [a, b] = pts;
      gesture.current = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s, x, y, mid: center({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }) };
    } else {
      gesture.current = { kind: 'drag', sx: e.clientX, sy: e.clientY, x, y, moved: false };
    }
  };
  const onPointerMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch') {
      const [a, b] = [...ptrs.current.values()];
      const k = clamp((g.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.d, 1, MAX) / g.s;
      setView(g.s * k, g.mid[0] - (g.mid[0] - g.x) * k, g.mid[1] - (g.mid[1] - g.y) * k);
      return;
    }
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true;
    if (view.current.s > 1) setView(view.current.s, g.x + dx, g.y + dy);
    else if (img.current) {
      // Chưa phóng: kéo ngang để chuyển ảnh, kéo xuống để đóng (ảnh mờ dần theo ngón tay).
      const down = Math.abs(dy) > Math.abs(dx) && dy > 0;
      img.current.classList.remove('is-gliding');
      img.current.style.transform = down ? `translate3d(0, ${dy}px, 0) scale(${1 - Math.min(dy, 300) / 1200})` : `translate3d(${dx}px, 0, 0)`;
      img.current.style.opacity = down ? String(1 - Math.min(dy, 300) / 450) : '';
    }
  };
  const onPointerUp = (e) => {
    ptrs.current.delete(e.pointerId);
    const g = gesture.current;
    if (ptrs.current.size > 0) {
      // Còn một ngón sau khi chụm: tiếp tục kéo từ vị trí hiện tại.
      const [p] = [...ptrs.current.values()];
      gesture.current = { kind: 'drag', sx: p.x, sy: p.y, x: view.current.x, y: view.current.y, moved: true };
      return;
    }
    gesture.current = null;
    if (!g || g.kind !== 'drag') return;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (view.current.s === 1 && g.moved) {
      if (dy > 110 && dy > Math.abs(dx)) return onClose();
      if (img.current) img.current.style.opacity = '';
      if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
      else paint(true);
      return;
    }
    if (g.moved) return;
    // Chạm / bấm không kéo: chạm đúp để phóng; chạm nền (ngoài ảnh) để đóng.
    const now = e.timeStamp;
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      const [cx, cy] = center(e);
      if (view.current.s > 1) setView(1, 0, 0, true); else zoomAt(2.5, cx, cy, true);
    } else {
      lastTap.current = now;
      if (e.target === stage.current && view.current.s === 1) onClose();
    }
  };
  const onWheel = (e) => {
    const [cx, cy] = center(e);
    zoomAt(view.current.s * Math.exp(-e.deltaY * 0.0022), cx, cy);
  };

  return (
    <dialog ref={dlg} className="lb" aria-label={alt ? `Ảnh: ${alt}` : 'Xem ảnh'} onCancel={(e) => { e.preventDefault(); onClose(); }} onKeyDown={onKeyDown}>
      <div className="lb-bar">
        <span className="lb-count" aria-live="polite">{n > 1 ? `${i + 1} / ${n}` : ''}</span>
        <div className="lb-tools">
          <button type="button" className="lb-btn" onClick={() => step(-1)} disabled={!zoomed} aria-label="Thu nhỏ"><Icon name="zoomOut" size={22} /></button>
          <button type="button" className="lb-btn" onClick={() => step(1)} aria-label="Phóng to"><Icon name="zoomIn" size={22} /></button>
          <button type="button" className="lb-btn" onClick={onClose} aria-label="Đóng" autoFocus><Icon name="close" size={22} /></button>
        </div>
      </div>
      <div
        ref={stage}
        className={`lb-stage ${zoomed ? 'is-zoomed' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <img key={i} ref={img} src={srcs[i]} alt={alt} className="lb-img" draggable="false" decoding="async" />
        {n > 1 && <>
          <button type="button" className="lb-nav prev" onClick={() => go(-1)} aria-label="Ảnh trước"><Icon name="chevronLeft" size={26} /></button>
          <button type="button" className="lb-nav next" onClick={() => go(1)} aria-label="Ảnh sau"><Icon name="chevron" size={26} /></button>
        </>}
      </div>
      {n > 1 && (
        <div className="lb-thumbs">
          {srcs.map((s, k) => (
            <button key={s + k} type="button" className={k === i ? 'on' : ''} aria-label={`Xem ảnh ${k + 1}`} aria-current={k === i} onClick={() => go(k - i)}>
              <img src={s} alt="" loading="lazy" decoding="async" width="56" height="56" />
            </button>
          ))}
        </div>
      )}
      <p className="lb-hint" aria-hidden="true">{zoomed ? 'Kéo để xem · chạm đúp để thu nhỏ' : 'Chạm đúp hoặc chụm để phóng to · vuốt xuống để đóng'}</p>
    </dialog>
  );
}
