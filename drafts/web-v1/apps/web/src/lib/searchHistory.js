const KEY = 'reown-search-history';
const MAX = 8;

export function readHistory() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX) : []; }
  catch { return []; }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { }
  return list;
}

export function pushHistory(term) {
  const t = term.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (t.length < 2) return readHistory();
  return write([t, ...readHistory().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX));
}

export const removeHistory = (term) => write(readHistory().filter((x) => x !== term));
export const clearHistory = () => write([]);
