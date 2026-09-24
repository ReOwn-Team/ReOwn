import crypto from 'node:crypto';
import { walletBalance } from './features.js';
import { unprocessable } from '../lib/errors.js';
import { fmt } from '../../../shared/scoring/engine.js';

export async function post(db, { orderId = null, memo, entries }) {
  const sum = entries.reduce((s, e) => s + e.amount, 0);
  if (sum !== 0) throw new Error(`Unbalanced ledger tx (${sum})`);
  const txId = crypto.randomUUID();
  for (const e of entries) {
    if (e.amount === 0) continue;
    await db.query(
      'INSERT INTO ledger_entries (tx_id, account, user_id, order_id, amount, memo) VALUES ($1,$2,$3,$4,$5,$6)',
      [txId, e.account, e.account === 'wallet' ? e.userId : null, orderId, e.amount, memo],
    );
  }
  return txId;
}

export async function lockUser(db, userId) {
  await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
}

export async function requireBalance(db, userId, amount) {
  const bal = await walletBalance(db, userId);
  if (bal < amount) throw unprocessable(`Số dư ví ${fmt(bal)} không đủ (cần ${fmt(amount)})`, { balance: bal, required: amount });
  return bal;
}

export const wallet = (userId, amount) => ({ account: 'wallet', userId, amount });
export const acct = (account, amount) => ({ account, amount });
