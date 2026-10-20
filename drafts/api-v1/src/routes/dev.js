import { Router } from 'express';
import { tx } from '../db/pool.js';
import { ah, forbidden, notFound } from '../lib/errors.js';
import { parse, z, uuid } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { post, wallet, acct } from '../services/ledger.js';
import { payInstallment } from '../services/bnpl.js';
import { rescore } from '../services/scoring.js';
import { installmentReminders, deliverSms } from '../services/notify.js';
import { shipOrder, releaseIfDue } from '../services/orders.js';

const r = Router();

r.post('/wallet/topup', requireAuth, ah(async (req, res) => {
  const { amount } = parse(z.object({ amount: z.number().int().min(10_000).max(50_000_000) }), req.body);
  await tx(async (db) => {
    await post(db, { memo: 'Nạp tiền (giả lập)', entries: [acct('external', -amount), wallet(req.user.id, amount)] });
    await rescore(db, [req.user.id], 'wallet.topup');
  });
  res.json({ ok: true });
}));

r.post('/installments/:id/pay-late', requireAuth, ah(async (req, res) => {
  const { daysLate } = parse(z.object({ daysLate: z.number().int().min(0).max(120) }), req.body);
  const id = parse(uuid, req.params.id);
  const out = await tx(async (db) => {
    const due = (await db.query('SELECT due_at FROM installments WHERE id=$1', [id])).rows[0];
    const now = new Date(new Date(due?.due_at ?? Date.now()).getTime() + daysLate * 86_400_000 + 3_600_000);
    return payInstallment(db, { installmentId: id, userId: req.user.id, ip: req.ip, now });
  });
  res.json(out);
}));

r.post('/installments/:id/make-overdue', requireAuth, ah(async (req, res) => {
  const { days } = parse(z.object({ days: z.number().int().min(1).max(120) }), req.body);
  const id = parse(uuid, req.params.id);
  await tx(async (db) => {
    const ok = (await db.query(
      `UPDATE installments i SET due_at = now() - make_interval(days => $2)
         FROM bnpl_plans p WHERE p.id=i.plan_id AND i.id=$1 AND p.user_id=$3 AND i.status='due' RETURNING i.id`,
      [id, days, req.user.id])).rows[0];
    if (ok) await rescore(db, [req.user.id], 'dev.overdue');
  });
  res.json({ ok: true });
}));

r.post('/installments/:id/due-in', requireAuth, ah(async (req, res) => {
  const { days } = parse(z.object({ days: z.number().int().min(0).max(3) }), req.body);
  const id = parse(uuid, req.params.id);
  await tx(async (db) => {
    const ok = (await db.query(
      `UPDATE installments i SET due_at = now() + make_interval(days => $2) - interval '1 hour'
         FROM bnpl_plans p WHERE p.id=i.plan_id AND i.id=$1 AND p.user_id=$3 AND i.status='due' RETURNING i.id`,
      [id, days, req.user.id])).rows[0];
    if (ok) { await installmentReminders(db); await deliverSms(db); }
  });
  res.json({ ok: true });
}));

r.post('/orders/:id/release-now', requireAuth, ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  await tx(async (db) => {
    const o = (await db.query("SELECT seller_id FROM orders WHERE id=$1 AND status='completed' AND payout_status='held' FOR UPDATE", [id])).rows[0];
    if (!o) throw notFound('Không có khoản đang giữ hộ cho đơn này');
    if (o.seller_id !== req.user.id) throw forbidden();
    await db.query('UPDATE orders SET release_at=now() WHERE id=$1', [id]);
    await releaseIfDue(db, id);
  });
  res.json({ ok: true });
}));

r.post('/orders/:id/simulate-ship', requireAuth, ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  await tx(async (db) => {
    const o = (await db.query('SELECT buyer_id, seller_id FROM orders WHERE id=$1', [id])).rows[0];
    if (!o) throw notFound('Không tìm thấy đơn');
    if (o.buyer_id !== req.user.id) throw forbidden();
    await shipOrder(db, { orderId: id, userId: o.seller_id, carrier: 'GHN', trackingCode: 'DEMO' + id.slice(0, 8).toUpperCase(), ip: req.ip });
  });
  res.json({ ok: true });
}));

export default r;
