import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { coverSrc } from '../lib/photos.js';

const SLIDES = [
  { id: 'bnpl', tone: 'blue', title: 'Trả sau 3 kỳ 0% phí', sub: 'Laptop, điện thoại chia nhỏ theo tháng', cta: 'Xem món trả sau', to: '/tim-kiem?bnpl=1', img: 'dell-latitude-7490.jpg', tag: 'Ưu đãi' },
  { id: 'cheap', tone: 'orange', title: 'Đồ học tập dưới 500K', sub: 'Máy tính, giáo trình, đèn học', cta: 'Săn ngay', to: '/tim-kiem?max=500000&sort=price-asc', img: 'casio-fx-580vn-x.jpg', tag: 'Từ 120K' },
  { id: 'phone', tone: 'green', title: 'Điện thoại cũ, giá mềm', sub: 'Người bán xếp hạng A–E minh bạch', cta: 'Xem điện thoại', to: '/tim-kiem?cat=phone', img: 'redmi-note-11.jpg', tag: 'Hạng A–E' },
  { id: 'safe', tone: 'violet', title: 'Giữ tiền đến khi nhận hàng', sub: 'Sai mô tả? Hoàn tiền trong 3 ngày', cta: 'Tìm hiểu', to: '/ho-tro#giu-ho', img: 'sony-wh-ch520.jpg', tag: 'An toàn' },
];
const DELAY = 5000;

const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Banner khuyến mãi tự chuyển: vuốt / chấm / mũi tên để chuyển, dừng khi rê chuột, focus, chạm hoặc bấm tạm dừng. */
export default function HeroCarousel({ onBudget }) {
  const track = useRef(null);
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false); // tạm dừng do rê chuột / focus / chạm
  const [stopped, setStopped] = useState(prefersReduced); // người dùng bấm dừng, hoặc máy bật giảm chuyển động
  const n = SLIDES.length;
  const playing = !hold && !stopped;

  const show = useCallback((k) => {
    const el = track.current;
    if (!el) return;
    const next = (k + n) % n;
    el.scrollTo({ left: next * el.clientWidth, behavior: prefersReduced() ? 'auto' : 'smooth' });
  }, [n]);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => { if (!document.hidden) show(i + 1); }, DELAY);
    return () => clearTimeout(t);
  }, [playing, i, show]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    const k = Math.round(el.scrollLeft / el.clientWidth);
    if (k !== i) setI(k);
  };

  return (
    <section className="promo" aria-labelledby="promo-h">
      <h1 id="promo-h" className="sr-only">ReOwn — chợ đồ cũ cho sinh viên, trả dần từng tháng</h1>
      <div
        className={`carousel ${playing ? 'is-playing' : ''}`}
        aria-roledescription="carousel"
        aria-label="Ưu đãi nổi bật"
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHold(true); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHold(false); }}
        onTouchStart={() => setHold(true)}
        onTouchEnd={() => setTimeout(() => setHold(false), 1500)}
        onFocus={() => setHold(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHold(false); }}
      >
        <div className="car-track" ref={track} onScroll={onScroll} aria-live={playing ? 'off' : 'polite'}>
          {SLIDES.map((s, k) => (
            <div key={s.id} className={`slide tone-${s.tone}`} role="group" aria-roledescription="slide" aria-label={`${k + 1} / ${n}: ${s.title}`}>
              <div className="slide-copy">
                <span className="slide-tag">{s.tag}</span>
                <h2 className="slide-title">{s.title}</h2>
                <p className="slide-sub">{s.sub}</p>
                <Link to={s.to} className="slide-cta" tabIndex={k === i ? 0 : -1}>{s.cta}<Icon name="chevron" size={16} /></Link>
              </div>
              <div className="slide-art" aria-hidden="true">
                <span className="slide-plate"><img src={coverSrc(s.img)} alt="" width="220" height="220" loading={k === 0 ? 'eager' : 'lazy'} fetchPriority={k === 0 ? 'high' : 'auto'} decoding="async" draggable="false" /></span>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="car-nav prev" onClick={() => show(i - 1)} aria-label="Ưu đãi trước"><Icon name="chevronLeft" size={20} /></button>
        <button type="button" className="car-nav next" onClick={() => show(i + 1)} aria-label="Ưu đãi sau"><Icon name="chevron" size={20} /></button>
        <div className="car-foot">
          <div className="car-dots">
            {SLIDES.map((s, k) => (
              <button key={s.id} type="button" className={k === i ? 'on' : ''} onClick={() => show(k)} aria-label={`Xem ưu đãi ${k + 1}: ${s.title}`} aria-current={k === i}>
                {k === i && <span key={i} className="car-fill" style={{ animationDuration: `${DELAY}ms` }} />}
              </button>
            ))}
          </div>
          <button type="button" className="car-play" onClick={() => setStopped(!stopped)} aria-label={stopped ? 'Tự chuyển ưu đãi' : 'Dừng tự chuyển ưu đãi'}>
            <Icon name={stopped ? 'play' : 'pause'} size={14} />
          </button>
        </div>
      </div>

      <div className="promo-side">
        <a href="#tui-tien" className="side-ban tone-ink" onClick={(e) => { e.preventDefault(); onBudget(); }}>
          <span><b>Món vừa túi tiền</b><small>Nhập thu nhập, xem góp mỗi tháng</small></span>
          <Icon name="wallet" size={28} />
        </a>
        <Link to="/kenh-nguoi-ban?tab=dang-tin" className="side-ban tone-soft">
          <span><b>Bán đồ cũ</b><small>Phí 4% chỉ khi bán được</small></span>
          <Icon name="plus" size={28} />
        </Link>
      </div>
    </section>
  );
}
