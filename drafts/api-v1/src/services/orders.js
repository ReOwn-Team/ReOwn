import { installmentSchedule } from '../../../../shared/scoring/engine.js';
import { config } from '../config.js';
import { post, lockUser, requireBalance, wallet, acct } from './ledger.js';
import { offerFor, sellerScore, rescore } from './scoring.js';
import { audit } from '../lib/audit.js';
import { orderEvents } from './notify.js';
import { attachEvidence } from './images.js';
import { notFound, forbidden, conflict, unprocessable } from '../lib/errors.js';
import crypto from 'node:crypto';
import { DISPUTE_RESPONSE_HOURS, RETURN_SHIP_DAYS, HANDOVER_MAX_ATTEMPTS, AUTO_CANCEL_GRACE_DAYS, shipDeadline } from '../../../../shared/policy.js';

const titleOf = async (db, listingId) => (await db.query('SELECT title FROM listings WHERE id=$1', [listingId])).rows[0]?.title || 'đơn hàng';
const DAY_MS = 86_400_000;
const addDays = (d, n) => new Date(d.getTime() + n * DAY_MS);

async function lockOrder(db, orderId) {
  const o = (await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
  if (!o) throw notFound('Không tìm thấy đơn hàng');
  return o;
}

function expect(o, statuses, action) {
  if (!statuses.includes(o.status)) throw conflict(`Không thể ${action} khi đơn đang ở trạng thái "${o.status}"`);
}

async function replayOf(db, buyerId, idempotencyKey, listingId) {
  const existing = (await db.query('SELECT * FROM orders WHERE buyer_id=$1 AND idempotency_key=$2', [buyerId, idempotencyKey])).rows[0];
  if (existing && existing.listing_id !== listingId) throw conflict('Idempotency-Key đã được dùng cho một đơn khác');
  return existing || null;
}

export async function createOrder(db, { buyerId, listingId, method, term, delivery = 'ship', shipTo = null, meetupNote = null, idempotencyKey, ip, now = new Date() }) {
  const early = await replayOf(db, buyerId, idempotencyKey, listingId);
  if (early) return { order: early, replay: true };

  const listing = (await db.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE', [listingId])).rows[0];
  if (!listing) throw notFound('Không tìm thấy tin đăng');
  // Hai request trùng key gửi cùng lúc: request sau chờ khoá tin rồi thấy đơn request trước vừa tạo → trả lại đơn đó.
  const raced = await replayOf(db, buyerId, idempotencyKey, listingId);
  if (raced) return { order: raced, replay: true };
  if (listing.status !== 'active') throw conflict('Món này không còn bán');
  if (listing.seller_id === buyerId) throw forbidden('Không thể mua tin của chính mình');

  await lockUser(db, buyerId);
  const price = listing.price;

  let plan = null;
  if (method === 'full') {
    await requireBalance(db, buyerId, price);
  } else {
    const { offer } = await offerFor(db, buyerId, price);
    const opt = offer.options.find((o) => o.term === term);
    if (!offer.eligible || !opt?.ok) {
      throw unprocessable('Bạn chưa đủ điều kiện trả sau cho kỳ hạn này', { blockers: offer.blockers, reasons: opt?.why || [] });
    }
    plan = installmentSchedule(price, term, offer.downRate || 0);
    if (plan.down) await requireBalance(db, buyerId, plan.down);
  }

  if (delivery === 'ship' && !shipTo) throw unprocessable('Nhập địa chỉ nhận hàng');
  const handoverCode = delivery === 'meetup' ? String(crypto.randomInt(0, 1_000_000)).padStart(6, '0') : null;
  const order = (await db.query(
    `INSERT INTO orders (listing_id, buyer_id, seller_id, price, method, term, status, idempotency_key, created_at, delivery, ship_to, meetup_note, handover_code)
     VALUES ($1,$2,$3,$4,$5,$6,'paid',$7,$8,$9,$10,$11,$12) RETURNING *`,
    [listing.id, buyerId, listing.seller_id, price, method, method === 'bnpl' ? term : null, idempotencyKey, now,
      delivery, delivery === 'ship' ? shipTo : null, delivery === 'meetup' ? meetupNote : null, handoverCode],
  )).rows[0];
  await db.query("UPDATE listings SET status='reserved', updated_at=now() WHERE id=$1", [listing.id]);

  if (method === 'full') {
    await post(db, { orderId: order.id, memo: 'Thanh toán đơn vào ví giữ hộ', entries: [wallet(buyerId, -price), acct('escrow', price)] });
  } else {
    const entries = [acct('lender', -plan.financed), acct('escrow', price)];
    if (plan.down) entries.unshift(wallet(buyerId, -plan.down));
    await post(db, { orderId: order.id, memo: plan.down ? 'Trả trước + đối tác giải ngân trả sau' : 'Đối tác giải ngân trả sau', entries });
    const p = (await db.query(
      'INSERT INTO bnpl_plans (order_id, user_id, principal, fee, total, term, down_payment) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [order.id, buyerId, plan.financed, plan.fee, plan.total, term, plan.down],
    )).rows[0];
    for (let i = 0; i < term; i++) {
      await db.query('INSERT INTO installments (plan_id, n, due_at, amount) VALUES ($1,$2,$3,$4)',
        [p.id, i + 1, addDays(now, 30 * (i + 1)), plan.amounts[i]]);
    }
  }
  await audit(db, { actorId: buyerId, action: 'order.create', entity: 'order', entityId: order.id, meta: { method, term, price }, ip });
  await orderEvents.created(db, order, listing.title);
  return { order, replay: false };
}

async function refund(db, o, memo) {
  if (o.method === 'full') {
    await post(db, { orderId: o.id, memo, entries: [acct('escrow', -o.price), wallet(o.buyer_id, o.price)] });
  } else {
    const plan = (await db.query('SELECT id, principal, down_payment FROM bnpl_plans WHERE order_id=$1 FOR UPDATE', [o.id])).rows[0];
    const entries = [acct('escrow', -o.price), acct('lender', plan.principal)];
    if (plan.down_payment) entries.push(wallet(o.buyer_id, plan.down_payment));
    await post(db, { orderId: o.id, memo: `${memo} — trả gốc cho đối tác${plan.down_payment ? ', hoàn tiền trả trước' : ''}`, entries });
    const paid = (await db.query("SELECT COALESCE(SUM(amount),0)::int AS s FROM installments WHERE plan_id=$1 AND status='paid'", [plan.id])).rows[0].s;
    if (paid > 0) {
      await post(db, { orderId: o.id, memo: `${memo} — hoàn các kỳ đã trả`, entries: [acct('lender', -paid), wallet(o.buyer_id, paid)] });
    }
    await db.query("UPDATE installments SET status='cancelled' WHERE plan_id=$1 AND status='due'", [plan.id]);
    await db.query("UPDATE bnpl_plans SET status='cancelled' WHERE id=$1", [plan.id]);
  }
  await db.query("UPDATE orders SET payout_status='refunded', closed_at=now() WHERE id=$1", [o.id]);
}

export async function shipOrder(db, { orderId, userId, carrier = null, trackingCode = null, ip, now = new Date() }) {
  const o = await lockOrder(db, orderId);
  if (o.seller_id !== userId) throw forbidden('Chỉ người bán mới xác nhận gửi hàng');
  expect(o, ['paid'], 'xác nhận gửi hàng');
  if (o.delivery === 'ship' && (!carrier || !trackingCode)) throw unprocessable('Nhập đơn vị vận chuyển và mã vận đơn để người mua theo dõi');
  await db.query("UPDATE orders SET status='shipped', shipped_at=$2, carrier=$3, tracking_code=$4 WHERE id=$1",
    [o.id, now, o.delivery === 'ship' ? carrier : null, o.delivery === 'ship' ? trackingCode : null]);
  await audit(db, { actorId: userId, action: 'order.ship', entity: 'order', entityId: o.id, ip });
  await orderEvents.shipped(db, o, await titleOf(db, o.listing_id));
  await rescore(db, [o.seller_id], 'order.ship');
}

export async function sellerCancel(db, { orderId, userId, ip }) {
  const o = await lockOrder(db, orderId);
  if (o.seller_id !== userId) throw forbidden();
  expect(o, ['paid'], 'huỷ đơn');
  await db.query("UPDATE orders SET status='cancelled_by_seller' WHERE id=$1", [o.id]);
  await db.query("UPDATE listings SET status='active', updated_at=now() WHERE id=$1", [o.listing_id]);
  await refund(db, o, 'Người bán huỷ đơn');
  await audit(db, { actorId: userId, action: 'order.seller_cancel', entity: 'order', entityId: o.id, ip });
  await orderEvents.sellerCancelled(db, o, await titleOf(db, o.listing_id));
  await rescore(db, [o.seller_id, o.buyer_id], 'order.seller_cancel');
}

/**
 * Người mua từ chối nhận: hàng được đơn vị vận chuyển hoàn về người bán. Tiền vẫn giữ hộ cho tới khi người bán
 * xác nhận đã nhận lại (hoặc quá RETURN_CONFIRM_DAYS thì tự hoàn) — tránh việc giữ hàng mà vẫn được hoàn tiền.
 */
export async function refuseDelivery(db, { orderId, userId, ip, now = new Date() }) {
  const o = await lockOrder(db, orderId);
  if (o.buyer_id !== userId) throw forbidden();
  expect(o, ['shipped'], 'từ chối nhận hàng');
  await db.query("UPDATE orders SET status='refused_by_buyer', return_carrier=$2, return_tracking=$3, return_shipped_at=$4 WHERE id=$1",
    [o.id, o.carrier, o.tracking_code, now]);
  await audit(db, { actorId: userId, action: 'order.refuse', entity: 'order', entityId: o.id, ip });
  await orderEvents.refused(db, o, await titleOf(db, o.listing_id));
  await rescore(db, [o.buyer_id], 'order.refuse');
}

export async function complete(db, o, now) {
  const { result } = await sellerScore(db, o.seller_id);
  const releaseAt = addDays(now, Math.max(result.policy.escrowDays, config.disputeWindowDays));
  await db.query("UPDATE orders SET status='completed', completed_at=$2, release_at=$3 WHERE id=$1", [o.id, now, releaseAt]);
  await db.query("UPDATE listings SET status='sold', updated_at=now() WHERE id=$1", [o.listing_id]);
  await orderEvents.completed(db, o, await titleOf(db, o.listing_id), releaseAt);
  return releaseAt;
}

export async function confirmReceived(db, { orderId, userId, ip, now = new Date() }) {
  const o = await lockOrder(db, orderId);
  if (o.buyer_id !== userId) throw forbidden('Chỉ người mua mới xác nhận đã nhận hàng');
  expect(o, o.delivery === 'meetup' ? ['paid', 'shipped'] : ['shipped'], 'xác nhận nhận hàng');
  if (!o.shipped_at) await db.query("UPDATE orders SET shipped_at=$2 WHERE id=$1", [o.id, now]);
  const releaseAt = await complete(db, o, now);
  await audit(db, { actorId: userId, action: 'order.confirm', entity: 'order', entityId: o.id, meta: { releaseAt }, ip });
  await releaseIfDue(db, o.id, now);
  await rescore(db, [o.buyer_id, o.seller_id], 'order.complete');
}

/** Giao trực tiếp: người bán nhập mã 6 số người mua đọc khi nhận hàng. Mã sai không ném lỗi để lượt thử được lưu lại. */
export async function handover(db, { orderId, userId, code, ip, now = new Date() }) {
  const o = await lockOrder(db, orderId);
  if (o.seller_id !== userId) throw forbidden('Chỉ người bán mới nhập mã giao hàng');
  if (o.delivery !== 'meetup') throw conflict('Đơn này giao qua đơn vị vận chuyển, không dùng mã giao trực tiếp');
  expect(o, ['paid', 'shipped'], 'xác nhận giao trực tiếp');
  if (o.handover_attempts >= HANDOVER_MAX_ATTEMPTS) throw conflict('Nhập sai quá nhiều lần — nhờ người mua bấm "Đã nhận hàng" trên ứng dụng');
  if (code !== o.handover_code) {
    const left = HANDOVER_MAX_ATTEMPTS - o.handover_attempts - 1;
    await db.query('UPDATE orders SET handover_attempts = handover_attempts + 1 WHERE id=$1', [o.id]);
    await audit(db, { actorId: userId, action: 'order.handover.fail', entity: 'order', entityId: o.id, ip });
    return { ok: false, attemptsLeft: left };
  }
  if (!o.shipped_at) await db.query("UPDATE orders SET status='shipped', shipped_at=$2 WHERE id=$1", [o.id, now]);
  const releaseAt = await complete(db, { ...o, shipped_at: o.shipped_at || now }, now);
  await audit(db, { actorId: userId, action: 'order.handover', entity: 'order', entityId: o.id, meta: { releaseAt }, ip });
  await releaseIfDue(db, o.id, now);
  await rescore(db, [o.buyer_id, o.seller_id], 'order.complete');
  return { ok: true };
}

export async function releaseIfDue(db, orderId, now = new Date()) {
  const o = await lockOrder(db, orderId);
  if (o.status !== 'completed' || o.payout_status !== 'held' || !o.release_at || o.release_at > now) return false;
  const fee = Math.round(o.price * config.platformFeeRate);
  await post(db, {
    orderId: o.id, memo: 'Giải ngân cho người bán',
    entries: [acct('escrow', -o.price), wallet(o.seller_id, o.price - fee), acct('platform_fee', fee)],
  });
  await db.query("UPDATE orders SET payout_status='released', closed_at=$2 WHERE id=$1", [o.id, now]);
  await orderEvents.released(db, o, await titleOf(db, o.listing_id), o.price - fee);
  return true;
}

export async function openDispute(db, { orderId, userId, reason, imageIds = [], ip, now = new Date() }) {
  const o = await lockOrder(db, orderId);
  if (o.buyer_id !== userId) throw forbidden('Chỉ người mua mới mở tranh chấp');
  const inWindow = o.status === 'shipped'
    || (o.status === 'completed' && o.payout_status === 'held' && now - o.completed_at <= config.disputeWindowDays * DAY_MS);
  if (!inWindow) throw conflict('Đã quá thời hạn mở tranh chấp hoặc tiền đã được giải ngân');
  await db.query("UPDATE orders SET status='disputed' WHERE id=$1", [o.id]);
  const d = (await db.query('INSERT INTO disputes (order_id, opened_by, reason, created_at, respond_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [o.id, userId, reason, now, new Date(now.getTime() + DISPUTE_RESPONSE_HOURS * 3_600_000)])).rows[0];
  if (imageIds.length) await attachEvidence(db, { disputeId: d.id, ownerId: userId, ids: imageIds });
  await audit(db, { actorId: userId, action: 'dispute.open', entity: 'dispute', entityId: d.id, ip });
  await orderEvents.disputeOpened(db, o, await titleOf(db, o.listing_id));
  return d;
}

export async function respondDispute(db, { orderId, userId, text, imageIds = [], ip, now = new Date() }) {
  const o = await lockOrder(db, orderId);
  if (o.seller_id !== userId) throw forbidden('Chỉ người bán của đơn mới phản hồi khiếu nại');
  const d = (await db.query('SELECT * FROM disputes WHERE order_id=$1 FOR UPDATE', [o.id])).rows[0];
  if (!d || d.status !== 'open') throw conflict('Khiếu nại không còn mở');
  if (d.seller_responded_at) throw conflict('Bạn đã gửi phản hồi cho khiếu nại này');
  await db.query('UPDATE disputes SET seller_response=$2, seller_responded_at=$3 WHERE id=$1', [d.id, text, now]);
  if (imageIds.length) await attachEvidence(db, { disputeId: d.id, ownerId: userId, ids: imageIds });
  await audit(db, { actorId: userId, action: 'dispute.respond', entity: 'dispute', entityId: d.id, ip });
  await orderEvents.disputeResponded(db, o, await titleOf(db, o.listing_id));
}

/** Hoàn một phần: người mua nhận `amount` về ví, người bán nhận phần còn lại (trừ phí sàn trên phần đó). */
async function settlePartial(db, o, amount, now) {
  const rest = o.price - amount;
  const fee = Math.round(rest * config.platformFeeRate);
  await post(db, {
    orderId: o.id, memo: 'Hoàn một phần sau tranh chấp',
    entries: [acct('escrow', -o.price), wallet(o.buyer_id, amount), wallet(o.seller_id, rest - fee), acct('platform_fee', fee)],
  });
  await db.query(`UPDATE orders SET status='completed', payout_status='released', refund_amount=$2,
                  completed_at=COALESCE(completed_at,$3), release_at=$3, closed_at=$3 WHERE id=$1`, [o.id, amount, now]);
  await db.query("UPDATE listings SET status='sold', updated_at=now() WHERE id=$1", [o.listing_id]);
}

const OUTCOME = {
  buyer: { status: 'resolved_buyer', remedy: 'refund' },
  return: { status: 'resolved_buyer', remedy: 'return_refund' },
  partial: { status: 'resolved_partial', remedy: 'partial' },
  seller: { status: 'resolved_seller', remedy: null },
};

export async function resolveDispute(db, { disputeId, adminId, outcome, resolution, refundAmount = null, ip, now = new Date() }) {
  const d = (await db.query('SELECT * FROM disputes WHERE id=$1 FOR UPDATE', [disputeId])).rows[0];
  if (!d) throw notFound('Không tìm thấy tranh chấp');
  if (d.status !== 'open') throw conflict('Tranh chấp đã được xử lý');
  const o = await lockOrder(db, d.order_id);
  if (outcome === 'buyer') {
    await db.query("UPDATE orders SET status='refunded' WHERE id=$1", [o.id]);
    await db.query("UPDATE listings SET status='hidden', updated_at=now() WHERE id=$1", [o.listing_id]);
    await refund(db, o, 'Hoàn tiền sau tranh chấp');
  } else if (outcome === 'return') {
    await db.query("UPDATE orders SET status='return_pending', return_due_at=$2 WHERE id=$1", [o.id, addDays(now, RETURN_SHIP_DAYS)]);
  } else if (outcome === 'partial') {
    if (!Number.isInteger(refundAmount) || refundAmount <= 0 || refundAmount >= o.price) {
      throw unprocessable('Số tiền hoàn một phần phải lớn hơn 0 và nhỏ hơn giá đơn');
    }
    await settlePartial(db, o, refundAmount, now);
  } else {
    await db.query("UPDATE orders SET status='completed', completed_at=COALESCE(completed_at,$2), release_at=$2 WHERE id=$1", [o.id, now]);
    await db.query("UPDATE listings SET status='sold', updated_at=now() WHERE id=$1", [o.listing_id]);
    await releaseIfDue(db, o.id, now);
  }
  const { status, remedy } = OUTCOME[outcome];
  await db.query('UPDATE disputes SET status=$2, resolution=$3, resolved_by=$4, resolved_at=$5, remedy=$6, refund_amount=$7 WHERE id=$1',
    [d.id, status, resolution, adminId, now, remedy, outcome === 'partial' ? refundAmount : null]);
  await audit(db, { actorId: adminId, action: 'dispute.resolve', entity: 'dispute', entityId: d.id, meta: { outcome, refundAmount }, ip });
  await orderEvents.disputeResolved(db, o, await titleOf(db, o.listing_id), outcome, refundAmount);
  if (outcome !== 'return') await rescore(db, [o.buyer_id, o.seller_id], 'dispute.resolve');
}

export async function returnShipped(db, { orderId, userId, carrier, trackingCode = null, ip, now = new Date() }) {
  const o = await lockOrder(db, orderId);
  if (o.buyer_id !== userId) throw forbidden('Chỉ người mua mới gửi trả hàng');
  expect(o, ['return_pending'], 'gửi trả hàng');
  await db.query("UPDATE orders SET status='returning', return_carrier=$2, return_tracking=$3, return_shipped_at=$4 WHERE id=$1",
    [o.id, carrier, trackingCode, now]);
  await audit(db, { actorId: userId, action: 'order.return_ship', entity: 'order', entityId: o.id, ip });
  await orderEvents.returnShipped(db, o, await titleOf(db, o.listing_id));
}

/**
 * Người bán xác nhận đã nhận lại hàng (hoặc hết hạn xác nhận) → hoàn tiền cho người mua.
 * Áp dụng cho hàng trả sau khiếu nại ('returning') và hàng bị từ chối nhận ('refused_by_buyer', tiền còn giữ).
 */
export async function returnReceived(db, { orderId, userId = null, ip, auto = false }) {
  const o = await lockOrder(db, orderId);
  if (!auto && o.seller_id !== userId) throw forbidden('Chỉ người bán mới xác nhận nhận lại hàng');
  expect(o, ['returning', 'refused_by_buyer'], 'xác nhận nhận lại hàng');
  if (o.payout_status !== 'held') throw conflict('Đơn này đã được hoàn tiền');
  const refused = o.status === 'refused_by_buyer';
  if (!refused) await db.query("UPDATE orders SET status='refunded' WHERE id=$1", [o.id]);
  // Hàng bị từ chối nhận vẫn nguyên vẹn nên mở bán lại; hàng trả sau khiếu nại (sai mô tả) thì gỡ tin.
  await db.query('UPDATE listings SET status=$2, updated_at=now() WHERE id=$1', [o.listing_id, refused ? 'active' : 'hidden']);
  await refund(db, o, refused ? 'Hoàn tiền sau khi người bán nhận lại hàng bị từ chối' : 'Hoàn tiền sau khi người bán nhận lại hàng');
  await audit(db, { actorId: userId, action: auto ? 'order.return_auto_refund' : 'order.return_received', entity: 'order', entityId: o.id, ip });
  await orderEvents.returnRefunded(db, o, await titleOf(db, o.listing_id));
  await rescore(db, [o.buyer_id, o.seller_id], 'order.return');
}

/** Người mua không gửi trả trong hạn → coi như chấp nhận hàng, giải ngân cho người bán. */
export async function returnExpired(db, { orderId, now = new Date() }) {
  const o = await lockOrder(db, orderId);
  if (o.status !== 'return_pending' || !o.return_due_at || o.return_due_at > now) return false;
  await db.query("UPDATE orders SET status='completed', completed_at=COALESCE(completed_at,$2), release_at=$2 WHERE id=$1", [o.id, now]);
  await db.query("UPDATE listings SET status='sold', updated_at=now() WHERE id=$1", [o.listing_id]);
  await releaseIfDue(db, o.id, now);
  await orderEvents.returnExpired(db, o, await titleOf(db, o.listing_id));
  await rescore(db, [o.buyer_id, o.seller_id], 'order.return_expired');
  return true;
}

/**
 * Người bán không gửi / giao hàng đúng hạn: người mua tự huỷ được từ lúc quá hạn; quá thêm AUTO_CANCEL_GRACE_DAYS
 * thì tác vụ định kỳ tự huỷ (userId = null). Tính là lỗi của người bán, tiền hoàn đủ cho người mua.
 */
export async function cancelUnshipped(db, { orderId, userId = null, ip, now = new Date() }) {
  const o = await lockOrder(db, orderId);
  if (userId && o.buyer_id !== userId) throw forbidden('Chỉ người mua mới huỷ được đơn quá hạn gửi hàng');
  if (o.status !== 'paid') {
    if (userId) expect(o, ['paid'], 'huỷ đơn');
    return false;
  }
  const deadline = shipDeadline(o.delivery, o.created_at);
  const cutoff = userId ? deadline : deadline + AUTO_CANCEL_GRACE_DAYS * DAY_MS;
  if (now.getTime() < cutoff) {
    if (userId) throw conflict('Người bán vẫn còn trong hạn gửi hàng', { shipBy: new Date(deadline) });
    return false;
  }
  await db.query("UPDATE orders SET status='cancelled_by_seller' WHERE id=$1", [o.id]);
  // Người bán không phản hồi: gỡ tin để người mua khác không đặt vào rồi lại bị kẹt tiền.
  await db.query("UPDATE listings SET status='hidden', updated_at=now() WHERE id=$1", [o.listing_id]);
  await refund(db, o, 'Người bán không gửi hàng đúng hạn');
  await audit(db, { actorId: userId, action: userId ? 'order.buyer_cancel_overdue' : 'order.auto_cancel_overdue', entity: 'order', entityId: o.id, ip });
  await orderEvents.overdueCancelled(db, o, await titleOf(db, o.listing_id));
  await rescore(db, [o.seller_id, o.buyer_id], 'order.overdue_cancel');
  return true;
}

export async function review(db, { orderId, userId, stars, comment, ip }) {
  const o = (await db.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
  if (!o) throw notFound('Không tìm thấy đơn hàng');
  if (o.status !== 'completed') throw conflict('Chỉ đánh giá được sau khi giao dịch hoàn tất');
  let direction, toUser;
  if (userId === o.buyer_id) { direction = 'buyer_to_seller'; toUser = o.seller_id; }
  else if (userId === o.seller_id) { direction = 'seller_to_buyer'; toUser = o.buyer_id; }
  else throw forbidden();
  const r = await db.query(
    `INSERT INTO reviews (order_id, from_user, to_user, direction, stars, comment) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (order_id, direction) DO NOTHING RETURNING *`,
    [o.id, userId, toUser, direction, stars, comment || null]);
  if (!r.rows[0]) throw conflict('Bạn đã đánh giá giao dịch này');
  await audit(db, { actorId: userId, action: 'review.create', entity: 'review', entityId: r.rows[0].id, ip });
  await orderEvents.reviewed(db, toUser, stars, direction === 'buyer_to_seller');
  await rescore(db, [toUser], 'review');
  return r.rows[0];
}
