import { pool, tx } from '../db/pool.js';
import { config } from '../config.js';
import { releaseIfDue, complete, returnExpired, returnReceived } from './orders.js';
import { RETURN_CONFIRM_DAYS } from '../../../shared/policy.js';
import { rescore } from './scoring.js';
import { invalidateCatalog } from './catalogCache.js';
import { installmentReminders, deliverSms } from './notify.js';

const JOB_LOCK = 42_4245;

// Khoá giao dịch (xact) giữ trong một transaction mở trên kết nối riêng: an toàn với pgbouncer ở chế độ
// transaction pooling (khoá phiên có thể rơi vào kết nối khác và không bao giờ được nhả).
export async function runJobs(now = new Date()) {
  const lock = await pool.connect();
  try {
    await lock.query('BEGIN');
    const got = (await lock.query('SELECT pg_try_advisory_xact_lock($1) AS ok', [JOB_LOCK])).rows[0].ok;
    if (!got) return { skipped: true };
    const out = { autoCompleted: 0, released: 0, returnsClosed: 0, rescored: 0, refreshed: 0, reminded: 0, sms: 0, cleaned: 0 };

    const stale = await pool.query(
      "SELECT id FROM orders WHERE status='shipped' AND shipped_at < $1::timestamptz - make_interval(days => $2)",
      [now, config.autoCompleteDays]);
    for (const { id } of stale.rows) {
      await tx(async (db) => {
        const o = (await db.query("SELECT * FROM orders WHERE id=$1 AND status='shipped' FOR UPDATE", [id])).rows[0];
        if (!o) return;
        await complete(db, o, now);
        await rescore(db, [o.buyer_id, o.seller_id], 'job.auto_complete');
        out.autoCompleted++;
      });
    }

    const due = await pool.query("SELECT id FROM orders WHERE status='completed' AND payout_status='held' AND release_at <= $1", [now]);
    for (const { id } of due.rows) {
      if (await tx((db) => releaseIfDue(db, id, now))) out.released++;
    }

    const noReturn = await pool.query("SELECT id FROM orders WHERE status='return_pending' AND return_due_at <= $1", [now]);
    for (const { id } of noReturn.rows) {
      if (await tx((db) => returnExpired(db, { orderId: id, now }))) out.returnsClosed++;
    }
    const unconfirmed = await pool.query(
      "SELECT id FROM orders WHERE status='returning' AND return_shipped_at < $1::timestamptz - make_interval(days => $2)", [now, RETURN_CONFIRM_DAYS]);
    for (const { id } of unconfirmed.rows) {
      await tx((db) => returnReceived(db, { orderId: id, auto: true }));
      out.returnsClosed++;
    }

    const overdue = await pool.query(
      `SELECT DISTINCT p.user_id FROM installments i JOIN bnpl_plans p ON p.id=i.plan_id
        WHERE i.status='due' AND i.due_at < $1`, [now]);
    for (const { user_id } of overdue.rows) {
      await tx((db) => rescore(db, [user_id], 'job.overdue'));
      out.rescored++;
    }

    const stale2 = await pool.query(
      `SELECT DISTINCT l.seller_id FROM listings l
        WHERE l.status='active' AND NOT EXISTS (
          SELECT 1 FROM score_snapshots s WHERE s.user_id=l.seller_id AND s.kind='seller' AND s.created_at > $1::timestamptz - interval '1 day')
        LIMIT 200`, [now]);
    for (const { seller_id } of stale2.rows) {
      await tx((db) => rescore(db, [seller_id], 'job.refresh'));
      out.refreshed++;
    }

    out.reminded = await tx((db) => installmentReminders(db, now));
    out.sms = await tx((db) => deliverSms(db, now));

    const c1 = await pool.query("DELETE FROM otp_codes WHERE expires_at < $1::timestamptz - interval '1 day'", [now]);
    const c2 = await pool.query(
      "DELETE FROM sessions WHERE (expires_at < $1::timestamptz OR revoked_at < $1::timestamptz - interval '30 days')", [now]);
    const c3 = await pool.query("DELETE FROM listing_images WHERE listing_id IS NULL AND dispute_id IS NULL AND created_at < $1::timestamptz - interval '1 day'", [now]);
    const c4 = await pool.query("DELETE FROM search_log WHERE created_at < $1::timestamptz - interval '30 days'", [now]);
    out.cleaned = c1.rowCount + c2.rowCount + c3.rowCount + c4.rowCount;

    if (out.autoCompleted || out.released || out.returnsClosed) invalidateCatalog();
    return out;
  } finally {
    await lock.query('COMMIT').catch(() => {});
    lock.release();
  }
}
