import { post, lockUser, requireBalance, wallet, acct } from './ledger.js';
import { rescore } from './scoring.js';
import { audit } from '../lib/audit.js';
import { notFound, forbidden, conflict } from '../lib/errors.js';
import { lateFeeFor } from '../../../shared/policy.js';

const DAY_MS = 86_400_000;

async function payOne(db, i, userId, now) {
  const fee = lateFeeFor(i.due_at, now);
  const daysLate = Math.max(0, Math.floor((now - new Date(i.due_at)) / DAY_MS));
  const entries = [wallet(userId, -(i.amount + fee)), acct('lender', i.amount)];
  if (fee) entries.push(acct('platform_fee', fee));
  await post(db, { orderId: i.order_id, memo: fee ? `Trả kỳ ${i.n} + phí trả trễ` : `Trả kỳ ${i.n}`, entries });
  await db.query("UPDATE installments SET status='paid', paid_at=$2, days_late=$3, late_fee=$4 WHERE id=$1", [i.id, now, daysLate, fee]);
  return { daysLate, fee };
}

async function closeIfPaid(db, planId) {
  const left = (await db.query("SELECT COUNT(*)::int AS c FROM installments WHERE plan_id=$1 AND status='due'", [planId])).rows[0].c;
  if (left === 0) await db.query("UPDATE bnpl_plans SET status='paid_off' WHERE id=$1", [planId]);
  return left === 0;
}

export async function payInstallment(db, { installmentId, userId, ip, now = new Date() }) {
  const i = (await db.query(
    `SELECT i.*, p.user_id, p.order_id FROM installments i JOIN bnpl_plans p ON p.id = i.plan_id
      WHERE i.id=$1 FOR UPDATE OF i, p`, [installmentId])).rows[0];
  if (!i) throw notFound('Không tìm thấy kỳ thanh toán');
  if (i.user_id !== userId) throw forbidden();
  if (i.status !== 'due') throw conflict('Kỳ này không ở trạng thái chờ thanh toán');
  const earlier = (await db.query("SELECT 1 FROM installments WHERE plan_id=$1 AND n<$2 AND status='due' LIMIT 1", [i.plan_id, i.n])).rows[0];
  if (earlier) throw conflict('Hãy trả các kỳ trước trước');

  await lockUser(db, userId);
  await requireBalance(db, userId, i.amount + lateFeeFor(i.due_at, now));
  const { daysLate, fee } = await payOne(db, i, userId, now);
  const planPaidOff = await closeIfPaid(db, i.plan_id);
  await audit(db, { actorId: userId, action: 'installment.pay', entity: 'installment', entityId: i.id, meta: { daysLate, lateFee: fee }, ip });
  await rescore(db, [userId], 'installment.pay');
  return { daysLate, lateFee: fee, planPaidOff };
}

/** Tất toán sớm: trả hết các kỳ còn lại một lần, không phạt trả trước hạn (kỳ đã trễ vẫn tính phí trễ). */
export async function payOffPlan(db, { planId, userId, ip, now = new Date() }) {
  const plan = (await db.query('SELECT * FROM bnpl_plans WHERE id=$1 FOR UPDATE', [planId])).rows[0];
  if (!plan) throw notFound('Không tìm thấy khoản trả sau');
  if (plan.user_id !== userId) throw forbidden();
  if (plan.status !== 'active') throw conflict('Khoản trả sau này đã đóng');
  const due = (await db.query(
    "SELECT i.*, $2::uuid AS order_id FROM installments i WHERE plan_id=$1 AND status='due' ORDER BY n FOR UPDATE", [planId, plan.order_id])).rows;
  if (!due.length) throw conflict('Không còn kỳ nào cần trả');
  await lockUser(db, userId);
  await requireBalance(db, userId, due.reduce((s, i) => s + i.amount + lateFeeFor(i.due_at, now), 0));
  let paid = 0, fees = 0;
  for (const i of due) { const r = await payOne(db, i, userId, now); paid += i.amount; fees += r.fee; }
  await closeIfPaid(db, planId);
  await audit(db, { actorId: userId, action: 'plan.payoff', entity: 'bnpl_plan', entityId: planId, meta: { paid, lateFees: fees, installments: due.length }, ip });
  await rescore(db, [userId], 'plan.payoff');
  return { paid, lateFees: fees, installments: due.length };
}
