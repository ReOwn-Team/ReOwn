import { Router } from 'express';
import { query, tx } from '../db/pool.js';
import { ah } from '../lib/errors.js';
import { parse, z, uuid } from '../lib/validate.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import * as listings from '../services/listings.js';
import { recommendLimiter, listingWriteLimiter } from '../lib/limits.js';
import { offerFor, buyerScore } from '../services/scoring.js';

const r = Router();
const CATS = ['laptop', 'phone', 'study', 'fashion', 'home'];

r.get('/', ah(async (req, res) => {
  const q = parse(z.object({
    category: z.enum(CATS).optional(),
    q: z.string().trim().max(80).optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(60),
    offset: z.coerce.number().int().min(0).default(0),
  }), req.query);
  const [out] = await Promise.all([
    listings.browse({ query }, q),
    q.q && q.offset === 0 ? listings.logSearch({ query }, q.q).catch(() => {}) : null,
  ]);
  res.json(out);
}));

r.get('/:id', optionalAuth, ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const item = await listings.getOne({ query }, id);
  let offer = null;
  if (req.user && req.user.id !== item.sellerId) {
    const o = await offerFor({ query }, req.user.id, item.price);
    offer = { ...o.offer, canPayFull: o.profile.finance.savings >= item.price, balance: o.profile.finance.savings };
  }
  res.json({ ...item, offer });
}));

r.post('/', requireAuth, listingWriteLimiter, ah(async (req, res) => {
  const data = parse(z.object({
    title: z.string().trim().min(5).max(120),
    category: z.enum(CATS),
    price: z.number().int().min(10_000).max(100_000_000),
    condition: z.number().int().min(1).max(100),
    description: z.string().trim().max(2000).optional(),
    location: z.string().trim().max(40).optional(),
    imageIds: z.array(uuid).max(3).optional(),
  }).strict(), req.body);
  const out = await tx((db) => listings.create(db, { sellerId: req.user.id, data, ip: req.ip }));
  res.status(201).json(out);
}));

r.patch('/:id', requireAuth, listingWriteLimiter, ah(async (req, res) => {
  const data = parse(z.object({
    title: z.string().trim().min(5).max(120).optional(),
    category: z.enum(CATS).optional(),
    price: z.number().int().min(10_000).max(100_000_000).optional(),
    condition: z.number().int().min(1).max(100).optional(),
    description: z.string().trim().max(2000).optional(),
    location: z.string().trim().max(40).optional(),
    imageIds: z.array(uuid).max(3).optional(),
  }).strict(), req.body);
  const out = await tx((db) => listings.update(db, { id: parse(uuid, req.params.id), sellerId: req.user.id, data, ip: req.ip }));
  res.json(out);
}));

r.delete('/:id', requireAuth, ah(async (req, res) => {
  await tx((db) => listings.hideOwn(db, { id: parse(uuid, req.params.id), sellerId: req.user.id, ip: req.ip }));
  res.status(204).end();
}));

export const search = Router();
search.get('/popular', ah(async (_req, res) => res.json({ terms: await listings.popularTerms({ query }) })));

export const recommendations = Router();
recommendations.post('/', optionalAuth, recommendLimiter, ah(async (req, res) => {
  const body = parse(z.object({
    income: z.number().int().min(0).max(500_000_000),
    savings: z.number().int().min(0).max(500_000_000),
    category: z.enum(CATS).optional().nullable(),
  }), req.body);
  let profile, plans;
  if (req.user) ({ profile, plans } = await buyerScore({ query }, req.user.id));
  else {
    profile = { id: 'guest', verify: { phone: true, cccd: true }, accountAgeMonths: 0, finance: {},
      buyer: { orders: 0, boms: 0, repayment: { onTime: 0, late: 0, severe: 0, defaults: 0 } } };
    plans = [];
  }
  res.json(await listings.recommendFor({ query }, { profile, plans, income: body.income, savings: body.savings, category: body.category || null }));
}));

export default r;
