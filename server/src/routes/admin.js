import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query, tx } from '../db/pool.js';
import { ah, forbidden, conflict, unprocessable } from '../lib/errors.js';
import { parse, z, uuid } from '../lib/validate.js';
import { requireAdmin, requireAdminRole, adminMfaRequired } from '../middleware/auth.js';
import { config } from '../config.js';
import { verifyTotp } from '../lib/crypto.js';
import { signAccess } from '../services/auth.js';
import { imagesFor, evidenceFor } from '../services/images.js';
import { notify } from '../services/notify.js';
import { resolveDispute } from '../services/orders.js';
import { audit } from '../lib/audit.js';

const r = Router();

const mfaLimiter = rateLimit({ windowMs: 15 * 60_000, limit: config.isTest ? 1000 : 5, standardHeaders: 'draft-7', legacyHeaders: false });
r.post('/mfa', mfaLimiter, requireAdminRole, ah(async (req, res) => {
  const { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), req.body);
  if (!config.adminTotpSecret) {
    if (adminMfaRequired()) throw forbidden('Máy chủ chưa cấu hình ADMIN_TOTP_SECRET');
    return res.json({ accessToken: signAccess(req.user, req.user.sid, { mfa: true }) });
  }
  const ok = verifyTotp(config.adminTotpSecret, code);
  await audit({ query }, { actorId: req.user.id, action: ok ? 'admin.mfa.ok' : 'admin.mfa.fail', entity: 'user', entityId: req.user.id, ip: req.ip });
  if (!ok) throw unprocessable('Mã xác thực 2 lớp không đúng');
  res.json({ accessToken: signAccess(req.user, req.user.sid, { mfa: true }) });
}));

r.use(requireAdmin);

r.get('/disputes', ah(async (req, res) => {
  const status = req.query.status === 'all' ? null : 'open';
  const rows = (await query(
    `SELECT d.*, o.price, o.method, o.term, o.status AS order_status, o.buyer_id, o.seller_id, o.created_at AS order_created_at,
            o.shipped_at, o.listing_id, l.title, l.category, l.icon, l.cover, b.name AS buyer_name, s.name AS seller_name
       FROM disputes d JOIN orders o ON o.id=d.order_id JOIN listings l ON l.id=o.listing_id
       JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id
      WHERE ($1::text IS NULL OR d.status=$1) ORDER BY d.status='open' DESC, d.created_at LIMIT 200`, [status])).rows;
  const pics = await imagesFor({ query }, [...new Set(rows.map((r) => r.listing_id))]);
  const proof = await evidenceFor({ query }, rows.map((r) => r.id));
  res.json(rows.map((r) => ({ ...r, images: pics[r.listing_id] || [], evidence: proof[r.id] || [] })));
}));

r.post('/disputes/:id/resolve', ah(async (req, res) => {
  const body = parse(z.object({ outcome: z.enum(['buyer', 'seller']), resolution: z.string().trim().min(5).max(1000) }), req.body);
  await tx((db) => resolveDispute(db, { disputeId: parse(uuid, req.params.id), adminId: req.user.id, ...body, ip: req.ip }));
  res.json({ ok: true });
}));

r.post('/listings/:id/hide', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { reason } = parse(z.object({ reason: z.string().trim().max(300).optional() }), req.body || {});
  await tx(async (db) => {
    const l = (await db.query("UPDATE listings SET status='hidden', updated_at=now() WHERE id=$1 AND status='active' RETURNING seller_id, title", [id])).rows[0];
    if (!l) throw conflict('Tin không còn ở trạng thái đang bán');
    await audit(db, { actorId: req.user.id, action: 'admin.listing.hide', entity: 'listing', entityId: id, meta: { reason }, ip: req.ip });
    await notify(db, l.seller_id, { kind: 'listing.hidden', title: `Tin bị gỡ: ${l.title.slice(0, 50)}`, body: reason ? `Lý do: ${reason}` : 'Tin vi phạm quy định đăng tin của ReOwn.', link: '/kenh-nguoi-ban?tab=tin-dang' });
  });
  res.json({ ok: true });
}));

export default r;
