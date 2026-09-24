import { Router } from 'express';
import { query, tx } from '../db/pool.js';
import { ah, badRequest, notFound } from '../lib/errors.js';
import { parse, z, uuid } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import * as orders from '../services/orders.js';
import { payInstallment } from '../services/bnpl.js';
import { orderFor } from '../services/views.js';
import { orderLimiter, reviewLimiter } from '../lib/limits.js';

const r = Router();
r.use(requireAuth);

async function view(id, userId) {
  const o = await orderFor({ query }, id, userId);
  if (!o) throw notFound('Không tìm thấy đơn hàng');
  return o;
}

r.post('/', orderLimiter, ah(async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9_-]{8,64}$/.test(key)) throw badRequest('Thiếu header Idempotency-Key hợp lệ');
  const body = parse(z.object({
    listingId: uuid,
    method: z.enum(['full', 'bnpl']),
    term: z.union([z.literal(3), z.literal(6)]).optional(),
  }).strict().refine((b) => (b.method === 'bnpl') === (b.term != null), 'Trả sau phải chọn kỳ hạn 3 hoặc 6; trả thẳng không có kỳ hạn'), req.body);
  const { order, replay } = await tx((db) => orders.createOrder(db, { buyerId: req.user.id, ...body, idempotencyKey: key, ip: req.ip }));
  res.status(replay ? 200 : 201).json(await view(order.id, req.user.id));
}));

r.get('/:id', ah(async (req, res) => res.json(await view(parse(uuid, req.params.id), req.user.id))));

const act = (fn) => ah(async (req, res) => {
  const orderId = parse(uuid, req.params.id);
  await tx((db) => fn(db, { orderId, userId: req.user.id, ip: req.ip, body: req.body || {} }));
  res.json(await view(orderId, req.user.id));
});

r.post('/:id/ship', act((db, a) => orders.shipOrder(db, a)));
r.post('/:id/cancel', act((db, a) => orders.sellerCancel(db, a)));
r.post('/:id/refuse', act((db, a) => orders.refuseDelivery(db, a)));
r.post('/:id/confirm', act((db, a) => orders.confirmReceived(db, a)));
r.post('/:id/dispute', act((db, a) => {
  const { reason, imageIds } = parse(z.object({ reason: z.string().trim().min(10).max(1000), imageIds: z.array(uuid).min(1, 'Cần ít nhất 1 ảnh chụp tình trạng hàng').max(3) }), a.body);
  return orders.openDispute(db, { ...a, reason, imageIds });
}));
r.post('/:id/review', reviewLimiter, act((db, a) => {
  const { stars, comment } = parse(z.object({ stars: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() }), a.body);
  return orders.review(db, { ...a, stars, comment });
}));

export const installments = Router();
installments.use(requireAuth);
installments.post('/:id/pay', ah(async (req, res) => {
  const out = await tx((db) => payInstallment(db, { installmentId: parse(uuid, req.params.id), userId: req.user.id, ip: req.ip }));
  res.json(out);
}));

export default r;
