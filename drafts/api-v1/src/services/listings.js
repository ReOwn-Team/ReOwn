import { listingRisk, recommend, incomeBand, effectiveIncome, fmt } from '../../../../shared/scoring/engine.js';
import { UNVERIFIED_SELLER_MAX_LISTINGS } from '../../../../shared/scoring/config.js';
import { sellerScore, cachedSellerScores } from './scoring.js';
import { audit } from '../lib/audit.js';
import { getCatalog } from './catalogCache.js';
import { imagesFor, attachImages, setListingImages } from './images.js';
import { notify } from './notify.js';
import { normText, searchText, searchProducts } from '../../../../shared/search.js';
import { lockUser } from './ledger.js';
import { forbidden, notFound, unprocessable } from '../lib/errors.js';

const toProduct = (l) => ({
  id: l.id, sellerId: l.seller_id, editedAt: l.edited_at, title: l.title, category: l.category, price: l.price, refPrice: l.market_price,
  condition: l.condition, desc: l.description, icon: l.icon, cover: l.cover, location: l.location, status: l.status, sold: l.status !== 'active', createdAt: l.created_at,
});

async function sellersFor(db, rows) {
  return cachedSellerScores(db, [...new Set(rows.map((r) => r.seller_id))]);
}

function decorate(rows, sellers, pics = {}) {
  return rows.map((l) => {
    const p = { ...toProduct(l), images: pics[l.id] || [] };
    const s = sellers[l.seller_id];
    return { ...p, seller: { id: s.id, name: s.name, school: s.school }, sellerScore: s.score, risk: listingRisk(p, s.score) };
  });
}

let trgm = null;
async function hasTrgm(db) {
  if (trgm === null) trgm = !!(await db.query("SELECT 1 FROM pg_extension WHERE extname='pg_trgm'")).rows[0];
  return trgm;
}

const SEARCH_CANDIDATES = 300;

export async function browse(db, { category, q, minPrice, maxPrice, sellerId, includeInactive = false, limit = 60, offset = 0 }) {
  const where = [];
  const args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replace('?', `$${args.length}`)); };
  if (!includeInactive) where.push("status='active'"); else where.push("status <> 'hidden'");
  if (category) add('category = ?', category);
  if (sellerId) add('seller_id = ?', sellerId);
  if (minPrice != null) add('price >= ?', minPrice);
  if (maxPrice != null) add('price <= ?', maxPrice);
  const qWords = q ? normText(q).split(' ').filter(Boolean).slice(0, 6) : [];
  if (qWords.length) {
    const fuzzy = await hasTrgm(db);
    for (const w of qWords) {
      const like = `%${(w.length <= 4 ? w.slice(0, 2) : w).replace(/[\\%_]/g, (m) => '\\' + m)}%`;
      args.push(like);
      const likeSql = `search_text LIKE $${args.length} ESCAPE '\\'`;
      if (fuzzy && w.length >= 5) { args.push(w); where.push(`(${likeSql} OR word_similarity($${args.length}, search_text) >= 0.35)`); }
      else if (w.length >= 5) { args.push(`%${w.slice(0, 3)}%`); where.push(`(${likeSql} OR search_text LIKE $${args.length})`); }
      else where.push(likeSql);
    }
  }
  let rows;
  if (qWords.length) {
    args.push(SEARCH_CANDIDATES);
    const cand = (await db.query(
      `SELECT * FROM listings WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${args.length}`, args)).rows;
    rows = searchProducts(q, cand, { desc: (l) => l.description }).slice(offset, offset + limit).map((x) => x.product);
  } else {
    args.push(limit, offset);
    rows = (await db.query(
      `SELECT * FROM listings WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
  }
  return decorate(rows, await sellersFor(db, rows), await imagesFor(db, rows.map((r) => r.id)));
}

export async function logSearch(db, q) {
  const term = String(q || '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 60);
  if (term.length >= 2) await db.query('INSERT INTO search_log (term) VALUES ($1)', [term]);
}

export async function popularTerms(db, n = 8) {
  const rows = (await db.query(
    `SELECT term, COUNT(*)::int AS c FROM search_log WHERE created_at > now() - interval '14 days'
      GROUP BY term HAVING COUNT(*) >= 2 ORDER BY c DESC, term LIMIT 50`)).rows;
  const seen = new Set(), out = [];
  for (const r of rows) { const k = normText(r.term); if (!seen.has(k)) { seen.add(k); out.push(r.term); } if (out.length >= n) break; }
  return out;
}

export async function getOne(db, id) {
  const l = (await db.query("SELECT * FROM listings WHERE id=$1 AND status <> 'hidden'", [id])).rows[0];
  if (!l) throw notFound('Không tìm thấy tin đăng');
  return decorate([l], await sellersFor(db, [l]), await imagesFor(db, [l.id]))[0];
}

async function assessRisk(db, sellerResult, draft, excludeId = null) {
  const peers = (await db.query(
    `SELECT id, title, category, price FROM listings WHERE category=$1 AND ($2::uuid IS NULL OR id<>$2)
        AND status IN ('active','reserved','sold') ORDER BY created_at DESC LIMIT 300`, [draft.category, excludeId])).rows;
  const risk = listingRisk(draft, sellerResult, peers);
  if (risk.blocked) throw unprocessable('Tin đăng yêu cầu giao dịch ngoài ReOwn', { reasons: risk.flags });
  return risk;
}

export async function create(db, { sellerId, data, ip }) {
  await lockUser(db, sellerId);
  const { profile, result } = await sellerScore(db, sellerId);
  if (!profile.verify.cccd) {
    const active = (await db.query("SELECT COUNT(*)::int AS c FROM listings WHERE seller_id=$1 AND status IN ('active','reserved')", [sellerId])).rows[0].c;
    if (active >= UNVERIFIED_SELLER_MAX_LISTINGS) throw unprocessable(`Chưa xác thực CCCD chỉ được đăng tối đa ${UNVERIFIED_SELLER_MAX_LISTINGS} tin cùng lúc`);
  }
  const risk = await assessRisk(db, result, { title: data.title, desc: data.description || '', category: data.category, price: data.price });
  const row = (await db.query(
    `INSERT INTO listings (seller_id, title, category, price, market_price, condition, description, risk_level, risk_flags, location, search_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [sellerId, data.title, data.category, data.price, risk.ref?.price ?? null, data.condition, data.description || '',
      risk.level, JSON.stringify(risk.flags), data.location || null, searchText(data.title, data.description)])).rows[0];
  const pics = await attachImages(db, { listingId: row.id, ownerId: sellerId, ids: data.imageIds || [] });
  await audit(db, { actorId: sellerId, action: 'listing.create', entity: 'listing', entityId: row.id, meta: { risk: risk.level, images: pics.length }, ip });
  return decorate([row], await sellersFor(db, [row]), { [row.id]: pics })[0];
}

const EDITABLE = ['title', 'category', 'price', 'condition', 'description', 'location'];

export async function update(db, { id, sellerId, data, ip }) {
  const l = (await db.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!l || l.status === 'hidden') throw notFound('Không tìm thấy tin đăng');
  if (l.seller_id !== sellerId) throw forbidden();
  if (l.status !== 'active') throw unprocessable('Tin đã có người đặt hoặc đã bán — không sửa được nữa');
  const next = { ...l };
  const changed = {};
  for (const k of EDITABLE) {
    if (data[k] === undefined) continue;
    const v = k === 'description' ? data[k] || '' : k === 'location' ? data[k] || null : data[k];
    if (v !== l[k]) { changed[k] = k === 'price' ? { from: l.price, to: v } : true; next[k] = v; }
  }
  const { result } = await sellerScore(db, sellerId);
  const risk = await assessRisk(db, result, { id, title: next.title, desc: next.description, category: next.category, price: next.price }, id);
  const row = (await db.query(
    `UPDATE listings SET title=$2, category=$3, price=$4, condition=$5, description=$6, location=$7, market_price=$8,
            risk_level=$9, risk_flags=$10, search_text=$11, edited_at=now(), updated_at=now() WHERE id=$1 RETURNING *`,
    [id, next.title, next.category, next.price, next.condition, next.description, next.location, risk.ref?.price ?? null,
      risk.level, JSON.stringify(risk.flags), searchText(next.title, next.description)])).rows[0];
  let pics;
  if (data.imageIds) { pics = await setListingImages(db, { listingId: id, ownerId: sellerId, ids: data.imageIds }); changed.images = pics.length; }
  if (changed.price && next.price < l.price) {
    const buyers = (await db.query('SELECT buyer_id, id FROM conversations WHERE listing_id=$1', [id])).rows;
    for (const b of buyers) {
      await notify(db, b.buyer_id, { kind: 'listing.price_drop', title: `Giảm giá: ${next.title.slice(0, 40)}`, body: `${fmt(l.price)} → ${fmt(next.price)}`, link: `/san-pham/${id}`, dedupeKey: `pricedrop:${id}:${b.buyer_id}:${next.price}` });
    }
  }
  await audit(db, { actorId: sellerId, action: 'listing.update', entity: 'listing', entityId: id, meta: { changed, risk: risk.level }, ip });
  return decorate([row], await sellersFor(db, [row]), pics ? { [id]: pics } : await imagesFor(db, [id]))[0];
}

export async function hideOwn(db, { id, sellerId, ip }) {
  const l = (await db.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!l) throw notFound();
  if (l.seller_id !== sellerId) throw forbidden();
  if (l.status !== 'active') throw unprocessable('Chỉ gỡ được tin đang bán');
  await db.query("UPDATE listings SET status='hidden', updated_at=now() WHERE id=$1", [id]);
  await audit(db, { actorId: sellerId, action: 'listing.hide', entity: 'listing', entityId: id, ip });
}

export async function recommendFor(db, { profile, plans, income, savings, category }) {
  const items = await getCatalog(() => browse(db, { limit: 500 }));
  const sellerScores = Object.fromEntries(items.map((p) => [p.sellerId, p.sellerScore]));
  const orders = (await db.query(
    `SELECT l.category, u.monthly_income AS "buyerIncome" FROM orders o
       JOIN listings l ON l.id=o.listing_id JOIN users u ON u.id=o.buyer_id
      WHERE o.status='completed' AND o.created_at > now() - interval '180 days'`)).rows;
  const r = recommend({ user: profile, plans, products: items, sellerScores, orders, income, savings, category });
  return {
    band: incomeBand(effectiveIncome({ ...profile, finance: { ...profile.finance, monthlyIncome: income } })),
    totalAffordable: r.totalAffordable,
    buyer: { score: r.buyer.score, tier: r.buyer.tier, obligations: r.buyer.obligations },
    items: r.items.map((x) => ({ product: x.product, match: x.match, why: x.why, payFull: x.payFull, plans: x.plans })),
  };
}
