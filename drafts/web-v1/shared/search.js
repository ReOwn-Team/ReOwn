export const fold = (s = '') => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

export function normText(s = '') {
  return fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
}

export const searchText = (title, desc = '') => `${normText(title)} ${normText(desc)}`.trim();

const words = (s) => normText(s).split(' ').filter(Boolean);

function trigrams(w) {
  const p = `  ${w} `;
  const out = new Set();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}

const triCache = new Map();
function tri(w) {
  let t = triCache.get(w);
  if (!t) { if (triCache.size > 20_000) triCache.clear(); t = trigrams(w); triCache.set(w, t); }
  return t;
}

function similarity(a, b) {
  if (a === b) return 1;
  const A = tri(a), B = tri(b);
  let common = 0;
  for (const g of A) if (B.has(g)) common++;
  return common / (A.size + B.size - common);
}

function editDistanceAtMost1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const threshold = (len) => (len <= 3 ? 1.01 : len === 4 ? 0.5 : 0.42);

function wordScore(q, textWords) {
  let best = 0;
  for (const w of textWords) {
    if (w === q) return 1;
    if (w.startsWith(q)) best = Math.max(best, q.length >= 2 ? 0.95 : 0);
    else if (q.length >= 3 && w.includes(q)) best = Math.max(best, 0.85);
    else if (q.length >= 3 && q.length <= 4 && q[0] === w[0] && editDistanceAtMost1(q, w)) best = Math.max(best, 0.6);
    else if (q.length >= 4 && Math.abs(w.length - q.length) <= 3) {
      const s = similarity(q, w);
      if (s >= threshold(q.length)) best = Math.max(best, s * 0.8);
    }
  }
  return best;
}

const wordsCache = new Map();
function cachedWords(s) {
  let w = wordsCache.get(s);
  if (!w) { if (wordsCache.size > 5000) wordsCache.clear(); w = words(s); wordsCache.set(s, w); }
  return w;
}

export function matchScore(query, title, desc = '') {
  const qs = words(query).slice(0, 8);
  if (!qs.length) return 0;
  const tw = cachedWords(title), dw = cachedWords(desc);
  let total = 0;
  for (const q of qs) {
    const t = wordScore(q, tw);
    const d = t >= 0.95 ? 0 : wordScore(q, dw);
    const s = Math.max(t, d * 0.6);
    if (s <= 0) return 0;
    total += s;
  }
  if (qs.length > 1 && ` ${tw.join(' ')} `.includes(` ${qs.join(' ')} `)) total += 0.5;
  return total;
}

export function searchProducts(query, products, { title = (p) => p.title, desc = (p) => p.desc || p.description || '' } = {}) {
  const hits = products.map((p) => ({ p, s: matchScore(query, title(p), desc(p)) })).filter((x) => x.s > 0);
  const top = Math.max(0, ...hits.map((x) => x.s));
  return hits.filter((x) => x.s >= top * 0.45).sort((a, b) => b.s - a.s).map((x) => ({ product: x.p, score: x.s }));
}
