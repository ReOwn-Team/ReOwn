import { scoreBuyer, scoreSeller, bnplOffer, ENGINE_VERSION } from '../../../../shared/scoring/engine.js';
import { tierOf, SELLER_POLICY } from '../../../../shared/scoring/config.js';
import { buildProfile, enginePlans } from './features.js';
import { notFound } from '../lib/errors.js';

const DEFAULT_REVIEWER_SCORE = 50;

async function reviewerScores(db, ids) {
  if (!ids.length) return {};
  const r = await db.query(
    `SELECT DISTINCT ON (user_id) user_id, score FROM score_snapshots
      WHERE kind='buyer' AND user_id = ANY($1::uuid[]) ORDER BY user_id, created_at DESC`, [ids]);
  return Object.fromEntries(r.rows.map((x) => [x.user_id, x.score]));
}

const stored = (kind, r) => (kind === 'seller'
  ? { parts: r.parts, reasons: r.reasons, reviewCount: r.reviewCount, rawAvg: r.rawAvg, adjAvg: r.adjAvg }
  : { parts: r.parts, reasons: r.reasons });

async function snapshot(db, userId, kind, result, trigger) {
  const data = stored(kind, result);
  const last = (await db.query(
    'SELECT score, tier, result FROM score_snapshots WHERE user_id=$1 AND kind=$2 ORDER BY created_at DESC LIMIT 1', [userId, kind])).rows[0];
  if (last && last.score === result.score && last.tier === result.tier.id && JSON.stringify(last.result) === JSON.stringify(data)) return;
  await db.query(
    'INSERT INTO score_snapshots (user_id, kind, score, tier, result, engine_version, trigger) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [userId, kind, result.score, result.tier.id, JSON.stringify(data), ENGINE_VERSION, trigger],
  );
}

export async function cachedSellerScores(db, ids) {
  if (!ids.length) return {};
  const rows = (await db.query(
    `SELECT u.id, u.name, u.school, s.score, s.tier, s.result, s.engine_version
       FROM users u
       LEFT JOIN LATERAL (SELECT score, tier, result, engine_version FROM score_snapshots
                           WHERE user_id = u.id AND kind = 'seller' ORDER BY created_at DESC LIMIT 1) s ON true
      WHERE u.id = ANY($1::uuid[])`, [ids])).rows;
  const out = {};
  for (const r of rows) {
    const fresh = r.score != null && r.engine_version === ENGINE_VERSION && r.result?.reviewCount != null;
    const score = publicSellerScore(fresh
      ? { ...r.result, score: r.score, tier: tierOf(r.score), policy: SELLER_POLICY[tierOf(r.score).id] }
      : (await sellerScore(db, r.id, { trigger: 'cache.fill' })).result);
    out[r.id] = { id: r.id, name: r.name, school: r.school, score };
  }
  return out;
}

export async function buyerScore(db, userId, { trigger, now } = {}) {
  const profile = await buildProfile(db, userId, now);
  if (!profile) throw notFound('Không tìm thấy người dùng');
  const plans = await enginePlans(db, userId);
  const result = scoreBuyer(profile, plans);
  if (trigger) await snapshot(db, userId, 'buyer', result, trigger);
  return { profile, plans, result };
}

export async function sellerScore(db, userId, { trigger, profile, now } = {}) {
  const p = profile || (await buildProfile(db, userId, now));
  if (!p) throw notFound('Không tìm thấy người dùng');
  const ids = [...new Set(p.seller.reviews.map((r) => r.by))];
  const scores = await reviewerScores(db, ids);
  const result = scoreSeller(p, (id) => scores[id] ?? DEFAULT_REVIEWER_SCORE);
  if (trigger) await snapshot(db, userId, 'seller', result, trigger);
  return { profile: p, result };
}

export async function rescore(db, userIds, trigger) {
  for (const id of [...new Set(userIds)]) {
    const { profile } = await buyerScore(db, id, { trigger });
    await sellerScore(db, id, { trigger, profile });
  }
}

export async function offerFor(db, userId, price) {
  const { profile, plans, result } = await buyerScore(db, userId);
  return { profile, plans, buyer: result, offer: bnplOffer(profile, price, plans, result) };
}

function publicSellerScore(r) {
  return {
    score: r.score, tier: r.tier, parts: r.parts, reasons: r.reasons, policy: r.policy,
    reviewCount: r.reviewCount, rawAvg: r.rawAvg, adjAvg: r.adjAvg,
  };
}
