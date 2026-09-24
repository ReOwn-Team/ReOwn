const ORDER_SELECT = `
  SELECT o.*, l.title, l.category, l.icon, l.cover,
         b.name AS buyer_name, s.name AS seller_name,
         d.id AS dispute_id, d.status AS dispute_status, d.reason AS dispute_reason,
         (SELECT stars FROM reviews r WHERE r.order_id=o.id AND r.from_user=$1) AS my_stars
    FROM orders o
    JOIN listings l ON l.id=o.listing_id
    JOIN users b ON b.id=o.buyer_id
    JOIN users s ON s.id=o.seller_id
    LEFT JOIN disputes d ON d.order_id=o.id`;

export async function ordersFor(db, userId, role) {
  const col = role === 'seller' ? 'seller_id' : 'buyer_id';
  const rows = (await db.query(`${ORDER_SELECT} WHERE o.${col}=$1 ORDER BY o.created_at DESC LIMIT 100`, [userId])).rows;
  return rows.map(orderView);
}

export async function orderFor(db, orderId, userId) {
  const o = (await db.query(`${ORDER_SELECT} WHERE o.id=$2 AND (o.buyer_id=$1 OR o.seller_id=$1)`, [userId, orderId])).rows[0];
  return o ? orderView(o) : null;
}

function orderView(o) {
  return {
    id: o.id, productId: o.listing_id, title: o.title, category: o.category, icon: o.icon, cover: o.cover,
    price: o.price, method: o.method === 'full' ? 'full' : o.term, status: o.status, payoutStatus: o.payout_status,
    buyerId: o.buyer_id, sellerId: o.seller_id, buyerName: o.buyer_name, sellerName: o.seller_name,
    createdAt: o.created_at, shippedAt: o.shipped_at, completedAt: o.completed_at, releaseAt: o.release_at,
    myStars: o.my_stars ?? null,
    dispute: o.dispute_id ? { id: o.dispute_id, status: o.dispute_status, reason: o.dispute_reason } : null,
  };
}
