import crypto from 'node:crypto';
import { post, lockUser, requireBalance, wallet, acct } from './ledger.js';
import { audit } from '../lib/audit.js';
import { orderEvents } from './notify.js';
import { unprocessable } from '../lib/errors.js';
import { WITHDRAW_MIN, WITHDRAW_DAILY_MAX } from '../../../shared/policy.js';
import { fmt } from '../../../shared/scoring/engine.js';

export async function bankAccount(db, userId) {
  return (await db.query("SELECT doc_last4 FROM verifications WHERE user_id=$1 AND type='bank' AND status='verified' ORDER BY created_at DESC LIMIT 1", [userId])).rows[0]?.doc_last4 || null;
}

/** Rút tiền về tài khoản ngân hàng đã xác thực. Bản demo mô phỏng chuyển khoản thành công ngay. */
export async function withdraw(db, { userId, amount, ip, now = new Date() }) {
  if (!Number.isInteger(amount) || amount < WITHDRAW_MIN) throw unprocessable(`Số tiền rút tối thiểu ${fmt(WITHDRAW_MIN)}`);
  const last4 = await bankAccount(db, userId);
  if (!last4) throw unprocessable('Xác thực tài khoản ngân hàng trước khi rút tiền');
  await lockUser(db, userId);
  const today = (await db.query("SELECT COUNT(*)::int AS c FROM withdrawals WHERE user_id=$1 AND created_at > $2::timestamptz - interval '1 day'", [userId, now])).rows[0].c;
  if (today >= WITHDRAW_DAILY_MAX) throw unprocessable(`Mỗi ngày rút tối đa ${WITHDRAW_DAILY_MAX} lần`);
  await requireBalance(db, userId, amount);
  const reference = 'RW' + crypto.randomBytes(5).toString('hex').toUpperCase();
  await post(db, { memo: `Rút về tài khoản ****${last4} (${reference})`, entries: [wallet(userId, -amount), acct('external', amount)] });
  const w = (await db.query(
    'INSERT INTO withdrawals (user_id, amount, bank_last4, reference, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [userId, amount, last4, reference, now])).rows[0];
  await audit(db, { actorId: userId, action: 'wallet.withdraw', entity: 'withdrawal', entityId: w.id, meta: { amount }, ip });
  await orderEvents.withdrawn(db, userId, amount, last4);
  return { id: w.id, amount, bankLast4: last4, reference, status: w.status, createdAt: w.created_at };
}
