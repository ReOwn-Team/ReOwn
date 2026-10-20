import { config } from '../config.js';

const DAY_MS = 86_400_000;

export async function walletBalance(db, userId) {
  const r = await db.query('SELECT balance FROM wallet_balances WHERE user_id=$1', [userId]);
  return r.rows[0]?.balance ?? 0;
}

export async function enginePlans(db, userId) {
  const r = await db.query(
    `SELECT p.id, p.order_id, p.total, p.term, p.down_payment, p.status AS plan_status, o.listing_id, l.title,
            json_agg(json_build_object('id', i.id, 'n', i.n, 'amount', i.amount, 'status', i.status,
                     'due', i.due_at, 'paidAt', i.paid_at, 'daysLate', i.days_late, 'lateFee', i.late_fee) ORDER BY i.n) AS inst
       FROM bnpl_plans p
       JOIN orders o ON o.id = p.order_id
       JOIN listings l ON l.id = o.listing_id
       JOIN installments i ON i.plan_id = p.id
      WHERE p.user_id = $1 AND p.status <> 'cancelled'
      GROUP BY p.id, o.listing_id, l.title
      ORDER BY p.created_at DESC`,
    [userId],
  );
  return r.rows.map((p) => ({
    id: p.id, userId, orderId: p.order_id, title: p.title, total: p.total, down: p.down_payment, term: p.term, status: p.plan_status,
    installments: p.inst.map((i) => ({ ...i, status: i.status === 'due' ? 'due' : 'paid' })),
  }));
}

function classifyRepayment(rows, now = new Date()) {
  const r = { onTime: 0, late: 0, severe: 0, defaults: 0 };
  let activeDefault = 0;
  for (const i of rows) {
    if (i.status === 'paid') {
      const d = i.days_late || 0;
      if (d === 0) r.onTime++;
      else if (d <= 10) r.late++;
      else if (d <= 30) r.severe++;
      else r.defaults++;
    } else if (i.status === 'due') {
      const overdue = Math.floor((now - new Date(i.due_at)) / DAY_MS);
      if (overdue > 30) { r.defaults++; activeDefault++; }
    }
  }
  return { repayment: r, activeDefault };
}

export async function buildProfile(db, userId, now = new Date()) {
  const u = (await db.query('SELECT * FROM users WHERE id=$1', [userId])).rows[0];
  if (!u) return null;

  const run = async (qs) => { const out = []; for (const q of qs) out.push(await q()); return out; };
  const [ver, inst, bo, so, rev, sav] = await run([
    () => db.query("SELECT type FROM verifications WHERE user_id=$1 AND status='verified'", [userId]),
    () => db.query(
      `SELECT i.status, i.due_at, i.days_late FROM installments i
         JOIN bnpl_plans p ON p.id = i.plan_id WHERE p.user_id=$1 AND i.status <> 'cancelled'`, [userId]),
    () => db.query(
      `SELECT
          COUNT(*) FILTER (WHERE status='completed')::int AS completed,
          COUNT(*) FILTER (WHERE status='refused_by_buyer')::int AS boms,
          (SELECT COUNT(*)::int FROM disputes d JOIN orders o2 ON o2.id=d.order_id
             WHERE o2.buyer_id=$1 AND d.status='resolved_seller') AS disputes_lost
         FROM orders WHERE buyer_id=$1`, [userId]),
    () => db.query(
      `SELECT
          COUNT(*) FILTER (WHERE status='completed')::int AS sales,
          COUNT(*) FILTER (WHERE shipped_at IS NOT NULL)::int AS ship_total,
          COUNT(*) FILTER (WHERE shipped_at IS NOT NULL AND shipped_at - created_at <= make_interval(days => $2))::int AS shipped_on_time,
          COUNT(*) FILTER (WHERE status='cancelled_by_seller')::int AS cancels,
          (SELECT COUNT(*)::int FROM disputes d JOIN orders o2 ON o2.id=d.order_id
             WHERE o2.seller_id=$1 AND d.status IN ('resolved_buyer', 'resolved_partial')) AS disputes_lost
         FROM orders WHERE seller_id=$1`, [userId, config.shipSlaDays]),
    () => db.query('SELECT from_user, direction, stars FROM reviews WHERE to_user=$1 ORDER BY created_at, id', [userId]),
    () => walletBalance(db, userId),
  ]);

  const verify = { phone: false, cccd: false, bank: false, student: false };
  ver.rows.forEach((v) => { verify[v.type] = true; });
  const { repayment, activeDefault } = classifyRepayment(inst.rows, now);
  const b = bo.rows[0], s = so.rows[0];

  return {
    id: u.id,
    name: u.name,
    school: u.school,
    role: u.role,
    verify,
    accountAgeMonths: Math.floor((now - new Date(u.created_at)) / (30 * DAY_MS)),
    finance: { monthlyIncome: u.monthly_income, otherDebtMonthly: u.other_debt_monthly, savings: sav },
    buyer: {
      orders: b.completed, boms: b.boms, disputesLost: b.disputes_lost, activeDefault, repayment,
      sellerRatings: [...new Map(rev.rows.filter((x) => x.direction === 'seller_to_buyer').map((x) => [x.from_user, x.stars])).values()],
    },
    seller: {
      sales: s.sales, shipTotal: s.ship_total, shippedOnTime: s.shipped_on_time, cancels: s.cancels, disputesLost: s.disputes_lost,
      reviews: rev.rows.filter((x) => x.direction === 'buyer_to_seller').map((x) => ({ by: x.from_user, stars: x.stars })),
    },
  };
}
