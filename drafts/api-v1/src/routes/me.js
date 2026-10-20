import { Router } from 'express';
import { query, tx } from '../db/pool.js';
import { ah, badRequest } from '../lib/errors.js';
import { parse, z, money } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { bnplOffer } from '../../../../shared/scoring/engine.js';
import { buyerScore, sellerScore } from '../services/scoring.js';
import { verify } from '../services/verification.js';
import { ordersFor } from '../services/views.js';
import { browse } from '../services/listings.js';
import { walletBalance } from '../services/features.js';
import { withdraw, bankAccount } from '../services/wallet.js';
import { audit } from '../lib/audit.js';
import { verifyLimiter } from '../lib/limits.js';
import { listNotifications, markRead } from '../services/notify.js';
import { unreadChats } from '../services/chat.js';

const r = Router();
r.use(requireAuth);

async function meView(db, userId) {
  const { profile, plans, result } = await buyerScore(db, userId);
  const { result: seller } = await sellerScore(db, userId, { profile });
  const policy = bnplOffer(profile, 0, plans, result);
  return {
    profile, plans, buyerScore: result, sellerScore: seller,
    bnpl: { limit: policy.limit, available: policy.available, maxTerm: policy.maxTerm, thinFile: policy.thinFile, blockers: policy.blockers, monthlyRoom: policy.monthlyRoom },
  };
}

r.get('/', ah(async (req, res) => res.json(await meView({ query }, req.user.id))));

r.patch('/', ah(async (req, res) => {
  const body = parse(z.object({
    name: z.string().trim().min(2).max(80).optional(),
    monthlyIncome: money.optional(),
    otherDebtMonthly: money.optional(),
  }).strict(), req.body);
  await tx(async (db) => {
    await db.query(
      `UPDATE users SET name=COALESCE($2,name), monthly_income=COALESCE($3,monthly_income),
              other_debt_monthly=COALESCE($4,other_debt_monthly) WHERE id=$1`,
      [req.user.id, body.name ?? null, body.monthlyIncome ?? null, body.otherDebtMonthly ?? null]);
    await audit(db, { actorId: req.user.id, action: 'user.update', entity: 'user', entityId: req.user.id, meta: Object.keys(body), ip: req.ip });
  });
  res.json(await meView({ query }, req.user.id));
}));

r.get('/inbox', ah(async (req, res) => {
  const [n, chats] = await Promise.all([
    query('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id]),
    unreadChats({ query }, req.user.id),
  ]);
  res.json({ notifications: n.rows[0].c, chats });
}));

r.get('/notifications', ah(async (req, res) => res.json(await listNotifications({ query }, req.user.id))));

r.post('/notifications/read', ah(async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).max(100).optional() }).strict(), req.body || {});
  await markRead({ query }, req.user.id, ids);
  res.json(await listNotifications({ query }, req.user.id));
}));

const verifySchemas = {
  cccd: z.object({ number: z.string().regex(/^\d{12}$/, 'Số CCCD gồm 12 chữ số') }),
  bank: z.object({ bankCode: z.string().regex(/^[A-Z]{2,12}$/), accountNumber: z.string().regex(/^\d{6,19}$/) }),
  student: z.object({ school: z.string().trim().min(2).max(120), studentId: z.string().trim().regex(/^[A-Za-z0-9]{4,20}$/) }),
};
r.post('/verifications/:type', verifyLimiter, ah(async (req, res) => {
  const schema = verifySchemas[req.params.type];
  if (!schema) throw badRequest('Loại xác thực không hỗ trợ');
  const data = parse(schema, req.body);
  const out = await tx((db) => verify(db, { userId: req.user.id, type: req.params.type, data, ip: req.ip }));
  res.json(out);
}));

r.get('/orders', ah(async (req, res) => {
  const role = req.query.role === 'seller' ? 'seller' : 'buyer';
  res.json(await ordersFor({ query }, req.user.id, role));
}));

r.get('/listings', ah(async (req, res) => {
  res.json(await browse({ query }, { sellerId: req.user.id, includeInactive: true, limit: 100 }));
}));

r.get('/wallet', ah(async (req, res) => {
  const rows = (await query(
    "SELECT amount, memo, order_id, created_at FROM ledger_entries WHERE account='wallet' AND user_id=$1 ORDER BY id DESC LIMIT 50",
    [req.user.id])).rows;
  const balance = await walletBalance({ query }, req.user.id);
  const withdrawals = (await query('SELECT id, amount, bank_last4, reference, status, created_at FROM withdrawals WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [req.user.id])).rows;
  res.json({ balance, entries: rows, withdrawals, bankLast4: await bankAccount({ query }, req.user.id) });
}));

r.post('/wallet/withdraw', verifyLimiter, ah(async (req, res) => {
  const { amount } = parse(z.object({ amount: z.number().int().positive() }), req.body);
  res.status(201).json(await tx((db) => withdraw(db, { userId: req.user.id, amount, ip: req.ip })));
}));

export default r;
