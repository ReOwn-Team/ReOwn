import { fold as norm } from '../search.js';

const REFERENCE_CATALOG = [
  { label: 'Dell Latitude 7490', match: ['latitude 7490'], price: 3_800_000 },
  { label: 'ThinkPad T480', match: ['thinkpad t480'], price: 5_000_000 },
  { label: 'MacBook Air 2017', match: ['macbook air 2017'], price: 5_500_000 },
  { label: 'HP EliteBook 840 G5', match: ['elitebook 840 g5'], price: 4_200_000 },
  { label: 'iPhone XR 64GB', match: ['iphone xr'], price: 3_300_000 },
  { label: 'Galaxy A52', match: ['galaxy a52'], price: 2_500_000 },
  { label: 'Redmi Note 11', match: ['redmi note 11'], price: 1_800_000 },
  { label: 'Casio fx-580VN X', match: ['580vn'], price: 450_000 },
  { label: 'Uniqlo Ultra Light Down', match: ['ultra light down'], price: 500_000 },
  { label: 'Converse Chuck 70', match: ['chuck 70'], price: 700_000 },
  { label: 'Sony WH-CH520', match: ['ch520'], price: 800_000 },
  { label: 'Dell P2419H', match: ['p2419h'], price: 2_000_000 },
  { label: 'Akko 3068', match: ['akko 3068'], price: 850_000 },
  { label: 'iPad Gen 9', match: ['ipad gen 9'], price: 4_800_000 },
  { label: 'JBL Go 3', match: ['jbl go 3'], price: 650_000 },
  { label: 'Galaxy Tab A7 Lite', match: ['tab a7 lite'], price: 2_300_000 },
  { label: 'Giáo trình kinh tế', match: ['giao trinh kinh te'], price: 180_000 },
  { label: 'Bộ IELTS Cambridge', match: ['ielts cambridge'], price: 240_000 },
  { label: 'Bàn học gấp', match: ['ban hoc gap'], price: 350_000 },
  { label: 'Đèn học', match: ['den hoc'], price: 210_000 },
  { label: 'Nồi cơm điện 1L', match: ['noi com dien'], price: 320_000 },
  { label: 'Quạt đứng', match: ['quat dung'], price: 240_000 },
  { label: 'Ấm siêu tốc', match: ['am sieu toc'], price: 260_000 },
  { label: 'Balo laptop', match: ['balo laptop'], price: 350_000 },
];

const STOP = new Set(['va', 'cho', 'con', 'moi', 'ban', 'size', 'kem', 'the', 'gb', 'wifi', 'wi', 'fi', '+', '/', '-']);
const tokens = (t) => norm(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w));
const tokenCache = new Map();
function tokensOf(title) {
  let t = tokenCache.get(title);
  if (!t) {
    if (tokenCache.size > 5000) tokenCache.clear();
    t = tokens(title);
    tokenCache.set(title, t);
  }
  return t;
}

function catalogMatch(title) {
  const hay = ` ${norm(title).split(/[^a-z0-9]+/).filter(Boolean).join(' ')} `;
  return REFERENCE_CATALOG.find((e) => e.match.some((phrase) => hay.includes(` ${phrase} `)));
}

function overlap(words, set) {
  let n = 0;
  for (const w of words) if (set.has(w) && ++n >= 2) break;
  return n;
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

export function referencePrice(product, peers = []) {
  if (!product?.title) return null;
  const hit = catalogMatch(product.title);
  if (hit) return { price: hit.price, source: 'catalog', label: hit.label };
  if (product.refPrice) return { price: product.refPrice, source: 'stored', label: 'Giá tham khảo ReOwn' };
  const mine = new Set(tokensOf(product.title));
  const similar = peers.filter((p) => p.id !== product.id && p.category === product.category && p.price > 0
    && overlap(tokensOf(p.title), mine) >= 2);
  if (similar.length >= 3) return { price: median(similar.map((p) => p.price)), source: 'peers', label: `Trung vị ${similar.length} tin tương tự`, n: similar.length };
  return null;
}

const TEXT_RULES = [
  { code: 'offplatform_pay', severe: true, text: 'Yêu cầu chuyển khoản / đặt cọc ngoài ReOwn',
    re: /(chuyen khoan|chuyen tien|\bck\b|dat coc|\bcoc\b)[^.\n]{0,20}(truoc|giu hang|giu do)|coc truoc|thanh toan ngoai|giao dich ngoai|ngoai (san|app|ung dung|reown)|khong qua (san|app|ung dung|reown)/ },
  { code: 'contact', severe: false, text: 'Để lại liên hệ ngoài ứng dụng (SĐT, Zalo, Facebook…)',
    re: /zalo|telegram|messenger|facebook|\bfb\b|\binbox\b|\bib\b|lien he rieng|nhan tin rieng/ },
  { code: 'phone', severe: false, text: 'Có số điện thoại trong tin', raw: /(\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}/ },
  { code: 'link', severe: false, text: 'Có đường link ra ngoài', raw: /https?:\/\/|www\.|bit\.ly|tinyurl|\.com\b|\.vn\b/i },
  { code: 'urgency', severe: false, text: 'Lời lẽ hối thúc (bán gấp, giá sốc…)', re: /can tien gap|ban gap|gia soc|xa kho|chot nhanh|chi hom nay/ },
];

export function scanListingText(product) {
  const raw = `${product.title || ''}\n${product.desc || product.description || ''}`;
  const n = norm(raw);
  return TEXT_RULES.filter((r) => (r.re ? r.re.test(n) : r.raw.test(raw))).map(({ code, severe, text }) => ({ code, severe, text }));
}

export function scanMessage(body) {
  const hits = scanListingText({ title: '', desc: body }).filter((h) => h.code !== 'urgency');
  return { blocked: hits.some((h) => h.severe), flags: hits.filter((h) => !h.severe).map((h) => h.code) };
}

export const MESSAGE_FLAG_TEXT = {
  contact: 'Tin nhắn có liên hệ ngoài ứng dụng (Zalo, Facebook…).',
  phone: 'Tin nhắn có số điện thoại.',
  link: 'Tin nhắn có đường link ra ngoài.',
};
