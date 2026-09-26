import { evidenceFor } from './images.js';
import { HANDOVER_MAX_ATTEMPTS } from '../../../shared/policy.js';
const ORDER_SELECT = `
  SELECT o.*, l.title, l.category, l.icon, l.cover,
         b.name AS buyer_name, s.name AS seller_name,
         d.id AS dispute_id, d.status AS dispute_status, d.reason AS dispute_reason, d.remedy AS dispute_remedy,
         d.refund_amount AS dispute_refund, d.seller_response, d.seller_responded_at, d.respond_by, d.resolution AS dispute_resolution,
         (SELECT stars FROM reviews r WHERE r.order_id=o.id AND r.from_user=$1) AS my_stars
    FROM orders o
    JOIN listings l ON l.id=o.listing_id
    JOIN users b ON b.id=o.buyer_id
    JOIN users s ON s.id=o.seller_id
    LEFT JOIN disputes d ON d.order_id=o.id`;

async function withEvidence(db, rows, userId) {
  const proof = await evidenceFor(db, rows.filter((r) => r.dispute_id).map((r) => r.dispute_id));
  return rows.map((r) => orderView(r, userId, proof[r.dispute_id] || []));
}

export async function ordersFor(db, userId, role) {
  const col = role === 'seller' ? 'seller_id' : 'buyer_id';
  const rows = (await db.query(`${ORDER_SELECT} WHERE o.${col}=$1 ORDER BY o.created_at DESC LIMIT 100`, [userId])).rows;
  return withEvidence(db, rows, userId);
}

export async function orderFor(db, orderId, userId) {
  const o = (await db.query(`${ORDER_SELECT} WHERE o.id=$2 AND (o.buyer_id=$1 OR o.seller_id=$1)`, [userId, orderId])).rows[0];
  return o ? (await withEvidence(db, [o], userId))[0] : null;
}

function orderView(o, viewerId, evidence = []) {
  return {
    id: o.id, productId: o.listing_id, title: o.title, category: o.category, icon: o.icon, cover: o.cover,
    price: o.price, method: o.method === 'full' ? 'full' : o.term, status: o.status, payoutStatus: o.payout_status,
    buyerId: o.buyer_id, sellerId: o.seller_id, buyerName: o.buyer_name, sellerName: o.seller_name,
    createdAt: o.created_at, shippedAt: o.shipped_at, completedAt: o.completed_at, releaseAt: o.release_at,
    myStars: o.my_stars ?? null,
    delivery: o.delivery, shipTo: o.ship_to, meetupNote: o.meetup_note, carrier: o.carrier, trackingCode: o.tracking_code,
    handoverCode: viewerId === o.buyer_id ? o.handover_code : null, handoverLocked: o.handover_attempts >= HANDOVER_MAX_ATTEMPTS,
    refundAmount: o.refund_amount,
    returnInfo: o.return_due_at ? { dueAt: o.return_due_at, carrier: o.return_carrier, trackingCode: o.return_tracking, shippedAt: o.return_shipped_at } : null,
    dispute: o.dispute_id ? {
      id: o.dispute_id, status: o.dispute_status, reason: o.dispute_reason, remedy: o.dispute_remedy, refundAmount: o.dispute_refund,
      resolution: o.dispute_resolution, sellerResponse: o.seller_response, sellerRespondedAt: o.seller_responded_at, respondBy: o.respond_by,
      evidence: evidence.filter((e) => e.ownerId === o.buyer_id).map((e) => e.url),
      sellerEvidence: evidence.filter((e) => e.ownerId === o.seller_id).map((e) => e.url),
    } : null,
  };
}
