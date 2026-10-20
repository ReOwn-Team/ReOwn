const TTL_MS = 15_000;
let cache = { at: 0, items: null, pending: null };

export function invalidateCatalog() {
  cache = { at: 0, items: null, pending: null };
}

export async function getCatalog(load) {
  if (cache.items && Date.now() - cache.at < TTL_MS) return cache.items;
  if (!cache.pending) {
    const mine = cache;
    mine.pending = load()
      .then((items) => { if (cache === mine) { cache.items = items; cache.at = Date.now(); } return items; })
      .finally(() => { mine.pending = null; });
  }
  return cache.pending;
}
