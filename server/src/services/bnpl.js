import { post, lockUser, requireBalance, wallet, acct } from './ledger.js';
import { rescore } from './scoring.js';
import { audit } from '../lib/audit.js';
import { notFound, forbidden, conflict } from '../lib/errors.js';

const DAY_MS = 86_400_000;

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
  await requireBalance(db, userId, i.amount);
  await post(db, { orderId: i.order_id, memo: `Trả kỳ ${i.n}`, entries: [wallet(userId, -i.amount), acct('lender', i.amount)] });
  const daysLate = Math.max(0, Math.floor((now - new Date(i.due_at)) / DAY_MS));
  await db.query("UPDATE installments SET status='paid', paid_at=$2, days_late=$3 WHERE id=$1", [i.id, now, daysLate]);
  const left = (await db.query("SELECT COUNT(*)::int AS c FROM installments WHERE plan_id=$1 AND status='due'", [i.plan_id])).rows[0].c;
  if (left === 0) await db.query("UPDATE bnpl_plans SET status='paid_off' WHERE id=$1", [i.plan_id]);
  await audit(db, { actorId: userId, action: 'installment.pay', entity: 'installment', entityId: i.id, meta: { daysLate }, ip });
  await rescore(db, [userId], 'installment.pay');
  return { daysLate, planPaidOff: left === 0 };
}
