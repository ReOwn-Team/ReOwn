import { useState } from 'react';
import { imageSrc } from '../api/client.js';
import { coverSrc } from '../lib/photos.js';
const G = {
  laptop: <><rect x="20" y="24" width="60" height="38" rx="3" className="f" /><rect x="25" y="29" width="50" height="28" rx="1" className="s" /><path d="M12 66h76l-5 8H17z" className="f" /></>,
  monitor: <><rect x="14" y="20" width="72" height="44" rx="3" className="f" /><rect x="19" y="25" width="62" height="34" className="s" /><path d="M44 64h12l3 10H41z" className="f" /><path d="M34 76h32" /></>,
  phone: <><rect x="34" y="14" width="32" height="70" rx="6" className="f" /><rect x="38" y="22" width="24" height="52" rx="2" className="s" /><path d="M46 79h8" /></>,
  tablet: <><rect x="22" y="16" width="56" height="70" rx="6" className="f" /><rect x="27" y="22" width="46" height="56" rx="2" className="s" /><circle cx="50" cy="82" r="1.6" /></>,
  headphones: <><path d="M24 58V48a26 26 0 0 1 52 0v10" /><rect x="18" y="54" width="14" height="24" rx="5" className="f" /><rect x="68" y="54" width="14" height="24" rx="5" className="f" /></>,
  speaker: <><rect x="18" y="32" width="64" height="40" rx="18" className="f" /><circle cx="50" cy="52" r="12" className="s" /><circle cx="50" cy="52" r="4" /><path d="M40 28h20" /></>,
  calculator: <><rect x="28" y="14" width="44" height="72" rx="5" className="f" /><rect x="33" y="20" width="34" height="14" rx="2" className="s" /><path d="M37 44h4M49 44h4M61 44h2M37 54h4M49 54h4M61 54h2M37 64h4M49 64h4M61 64h2M37 74h4M49 74h4M61 74h2" /></>,
  book: <><path d="M16 26h28c4 0 6 3 6 6v46c0-3-2-5-6-5H16z" className="f" /><path d="M84 26H56c-4 0-6 3-6 6v46c0-3 2-5 6-5h28z" className="f" /><path d="M24 38h16M24 46h16M60 38h16M60 46h16" /></>,
  desk: <><path d="M12 48h76v6H12z" className="f" /><path d="M20 54v26M80 54v26M26 54l8 18M74 54l-8 18" /><path d="M64 48V34l10-10" /><path d="M70 20l10 6-4 6z" className="f" /></>,
  lamp: <><path d="M30 84h40" /><path d="M50 84V52L34 34" /><path d="M24 30l18-10 8 14-18 8z" className="f" /><circle cx="50" cy="52" r="3" /></>,
  jacket: <path d="M36 16l-20 10 6 24 8-4v36h40V46l8 4 6-24-20-10c-2 6-7 10-14 10s-12-4-14-10z" className="f" />,
  shoes: <><path d="M10 62c0-10 4-24 12-26l8 10c8 6 22 6 30 10 10 4 22 4 28 10v8H10z" className="f" /><path d="M10 72h78M30 46l6-6M38 52l6-6" /></>,
  backpack: <><rect x="26" y="26" width="48" height="58" rx="12" className="f" /><path d="M40 26v-6a10 10 0 0 1 20 0v6" /><rect x="34" y="54" width="32" height="18" rx="4" className="s" /></>,
  ricecooker: <><path d="M20 46h60v28a8 8 0 0 1-8 8H28a8 8 0 0 1-8-8z" className="f" /><path d="M18 46c4-12 18-18 32-18s28 6 32 18z" className="s" /><path d="M44 22h12" /><circle cx="50" cy="64" r="4" /></>,
  fan: <><circle cx="50" cy="40" r="26" className="f" /><circle cx="50" cy="40" r="5" /><path d="M50 35c-4-10 2-16 8-14M55 42c10 2 12 10 8 14M45 43c-8 6-16 2-16-4" /><path d="M50 66v14M36 84h28" /></>,
  kettle: <><path d="M28 38h40l4 42H24z" className="f" /><path d="M68 44c10 0 12 18 2 22" /><path d="M28 38l-10-8" /><path d="M40 30h16" /></>,
  keyboard: <><rect x="10" y="32" width="80" height="36" rx="5" className="f" /><path d="M18 42h4M28 42h4M38 42h4M48 42h4M58 42h4M68 42h4M78 42h4M20 51h4M30 51h4M40 51h4M50 51h4M60 51h4M70 51h4M28 60h44" /></>,
};
const BY_CAT = { laptop: 'laptop', phone: 'phone', study: 'book', fashion: 'jacket', home: 'ricecooker' };

export function Glyph({ name, className = '' }) {
  return (
    <svg className={`glyph ${className}`} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      {G[name] || G.book}
    </svg>
  );
}


export default function Art({ product, size = 'md', index = 0, onBroken, children }) {
  const uploaded = product.images?.[index];
  const src = uploaded ? imageSrc(uploaded) : index === 0 && product.cover ? coverSrc(product.cover) : null;
  const [broken, setBroken] = useState(null);
  const photo = src && broken !== src;
  return (
    <div className={`art art-${size} ${photo ? 'has-photo' : ''}`}>
      {photo
        ? <img src={src} alt={product.title || ''} loading={size === 'lg' ? 'eager' : 'lazy'} decoding="async" draggable="false" onError={() => { setBroken(src); onBroken?.(src); }} />
        : <Glyph name={product.icon || BY_CAT[product.category]} />}
      {children}
    </div>
  );
}
