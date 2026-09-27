import { Link } from 'react-router-dom';
import Art from './Art.jsx';
import Icon from './Icon.jsx';
import { installmentSchedule, listingRisk } from '../../shared/scoring/engine.js';
import { TIERS, MAX_BNPL_LIMIT } from '../../shared/scoring/config.js';
import { money, short, TIER_LABEL } from '../lib/format.js';

const fromMonthly = (price) => (price > MAX_BNPL_LIMIT ? null : installmentSchedule(price, 6).amounts[0]);

const tone = (id) => (id <= 'B' ? 'good' : id === 'C' ? 'neutral' : 'risk');

export function TrustBadge({ result, long }) {
  if (!result) return null;
  const id = result.tier.id;
  return (
    <span className={`trust trust-${tone(id)}`} title={`Người bán hạng ${id} · ${TIER_LABEL[id]} · ${result.score}/100`}>
      <Icon name={tone(id) === 'risk' ? 'alert' : 'shield'} size={14} />
      <span>{long ? `Hạng ${id} · ${TIER_LABEL[id]}` : `Hạng ${id}`}</span>
    </span>
  );
}

export function Stars({ value, count }) {
  if (value == null) return null;
  return (
    <span className="stars" aria-label={`${value.toFixed(1)} trên 5 sao${count ? `, ${count} đánh giá` : ''}`}>
      <Icon name="star" size={14} fill="currentColor" />{value.toFixed(1)}{count ? <span className="muted"> ({count})</span> : null}
    </span>
  );
}

export function ProductCard({ product: p, seller, sellerRes }) {
  const monthly = fromMonthly(p.price);
  const risk = sellerRes ? listingRisk(p, sellerRes) : { level: 'low' };
  const place = p.location || seller?.school?.split('·')[0]?.trim();
  return (
    <Link to={`/san-pham/${p.id}`} className={`pcard ${p.sold ? 'is-sold' : ''}`}>
      <Art product={p}>{p.sold && <span className="sold-flag">Đã bán</span>}</Art>
      <div className="pcard-body">
        <span className="pcard-title">{p.title}</span>
        <div className="pcard-price">
          <strong className="price">{money(p.price)}</strong>
        </div>
        <span className="pcard-bnpl">{monthly ? <>hoặc <b>{short(monthly)}</b>/tháng</> : 'Chỉ trả thẳng'}</span>
        <div className="pcard-meta">
          {risk.level !== 'low'
            ? <span className="trust trust-risk"><Icon name="alert" size={14} /><span>Cần cẩn trọng</span></span>
            : <TrustBadge result={sellerRes} />}
          {place && <span className="pcard-place">{place}</span>}
        </div>
      </div>
    </Link>
  );
}

const TONE_COLOR = { good: 'var(--good)', neutral: 'var(--muted)', risk: 'var(--risk)' };
export function ScoreGauge({ result, label, size = 120 }) {
  const r = 52, c = 2 * Math.PI * r, arc = c * 0.75;
  const val = (result.score / 100) * arc;
  return (
    <div className="gauge">
      <svg viewBox="0 0 128 118" width={size} role="img" aria-label={`${label}: ${result.score} trên 100, hạng ${result.tier.id}`}>
        <g transform="rotate(135 64 64)">
          <circle cx="64" cy="64" r={r} className="gauge-track" strokeDasharray={`${arc} ${c}`} />
          <circle cx="64" cy="64" r={r} stroke={TONE_COLOR[tone(result.tier.id)]} className="gauge-val" strokeDasharray={`${val} ${c}`} />
        </g>
        <text x="64" y="66" textAnchor="middle" className="gauge-num">{result.score}</text>
        <text x="64" y="86" textAnchor="middle" className="gauge-sub">/ 100</text>
      </svg>
      <div className="gauge-cap">
        <span className="gauge-label">{label}</span>
        <strong className={`trust-${tone(result.tier.id)}`}>Hạng {result.tier.id} · {TIER_LABEL[result.tier.id]}</strong>
      </div>
    </div>
  );
}

export function TierScale({ score }) {
  const asc = [...TIERS].reverse();
  return (
    <div className="tier-wrap">
      <div className="tier-scale" role="img" aria-label={`Điểm ${score} trên thang 0–100`}>
        <div className="tier-fill" style={{ width: `${score}%` }} />
        <i style={{ left: `${score}%` }} />
      </div>
      <div className="tier-ticks" aria-hidden="true">
        {asc.map((t, i) => {
          const next = asc[i + 1]?.min ?? 101;
          return <span key={t.id} style={{ flex: next - t.min }} className={score >= t.min && score < next ? 'on' : ''}>{t.id}</span>;
        })}
      </div>
    </div>
  );
}

export function Breakdown({ parts }) {
  return (
    <ul className="breakdown">
      {parts.map((p) => (
        <li key={p.key}>
          <div className="bd-row"><span>{p.label}</span><span className="num">{p.pts.toFixed(1)}/{p.max}</span></div>
          <div className="bar"><div style={{ width: `${(p.pts / p.max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

const ICON = { good: 'check', bad: 'minus', warn: 'alert', tip: 'arrowUp', info: 'info' };
export function Reasons({ reasons, limit }) {
  const list = limit ? reasons.slice(0, limit) : reasons;
  if (!list.length) return null;
  return (
    <ul className="reasons">
      {list.map((r, i) => <li key={i} className={`r-${r.type}`}><span className="r-ic"><Icon name={ICON[r.type]} size={13} /></span>{r.text}</li>)}
    </ul>
  );
}

export function Slider({ id, label, value, min, max, step = 1, onChange, format = (v) => v }) {
  return (
    <div className="slider">
      <label htmlFor={id}><span>{label}</span><b className="num">{format(value)}</b></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="skel" role="status" aria-label="Đang tải…">
      <div className="skel-block skel-hero" />
      <div className="skel-grid">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skel-block skel-card" />)}</div>
    </div>
  );
}
