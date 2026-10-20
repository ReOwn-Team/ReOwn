import { pool, tx } from '../db/pool.js';
import { config } from '../config.js';
import { releaseIfDue, complete, returnExpired, returnReceived, cancelUnshipped } from './orders.js';
import { RETURN_CONFIRM_DAYS, SHIP_DEADLINE_DAYS, AUTO_CANCEL_GRACE_DAYS } from '../../../../shared/policy.js';
import { rescore } from './scoring.js';
import { invalidateCatalog } from './catalogCache.js';
import { installmentReminders, deliverSms } from './notify.js';

const JOB_LOCK = 42_4245;

/**
 * Chạy fn cho từng dòng trong transaction riêng. Một dòng lỗi (vd trạng thái vừa đổi) chỉ được ghi log,
 * không làm dừng cả lượt — nếu không, cùng một đơn lỗi sẽ chặn mọi bước phía sau ở mọi lần chạy.
 * Trả về số dòng mà fn báo đã xử lý (trả về true).
 */
async function each(rows, label, out, fn) {
  let n = 0;
  for (const row of rows) {
    try {
      if (await tx((db) => fn(db, row))) n++;
    } catch (e) {
      out.errors++;
      console.error('[jobs]', label, row.id ?? row.user_id ?? row.seller_id, e.message);
    }
  }
  return n;
}

// Khoá giao dịch (xact) giữ trong một transaction mở trên kết nối riêng: an toàn với pgbouncer ở chế độ
// transaction pooling (khoá phiên có thể rơi vào kết nối khác và không bao giờ được nhả).
export async function runJobs(now = new Date()) {
  const lock = await pool.connect();
  try {
    await lock.query('BEGIN');
    const got = (await lock.query('SELECT pg_try_advisory_xact_lock($1) AS ok', [JOB_LOCK])).rows[0].ok;
    if (!got) return { skipped: true };
    const out = { autoCompleted: 0, released: 0, returnsClosed: 0, overdueCancelled: 0, rescored: 0, refreshed: 0, reminded: 0, sms: 0, cleaned: 0, errors: 0 };

    const stale = await pool.query(
      "SELECT id FROM orders WHERE status='shipped' AND shipped_at < $1::timestamptz - make_interval(days => $2)",
      [now, config.autoCompleteDays]);
    out.autoCompleted = await each(stale.rows, 'auto_complete', out, async (db, { id }) => {
      const o = (await db.query("SELECT * FROM orders WHERE id=$1 AND status='shipped' FOR UPDATE", [id])).rows[0];
      if (!o) return false;
      await complete(db, o, now);
      await rescore(db, [o.buyer_id, o.seller_id], 'job.auto_complete');
      return true;
    });

    const due = await pool.query("SELECT id FROM orders WHERE status='completed' AND payout_status='held' AND release_at <= $1", [now]);
    out.released = await each(due.rows, 'release', out, (db, { id }) => releaseIfDue(db, id, now));

    const noReturn = await pool.query("SELECT id FROM orders WHERE status='return_pending' AND return_due_at <= $1", [now]);
    out.returnsClosed += await each(noReturn.rows, 'return_expired', out, (db, { id }) => returnExpired(db, { orderId: id, now }));
    // Hàng trả sau khiếu nại, hoặc hàng bị từ chối nhận đang hoàn về: người bán im lặng quá hạn thì tự hoàn tiền.
    const unconfirmed = await pool.query(
      `SELECT id FROM orders WHERE (status='returning' OR (status='refused_by_buyer' AND payout_status='held'))
          AND return_shipped_at < $1::timestamptz - make_interval(days => $2)`, [now, RETURN_CONFIRM_DAYS]);
    out.returnsClosed += await each(unconfirmed.rows, 'return_auto_refund', out, async (db, { id }) => {
      await returnReceived(db, { orderId: id, auto: true });
      return true;
    });

    // Người bán không gửi hàng: quá hạn + thời gian ân hạn thì tự huỷ, hoàn tiền (lọc thô ở đây, hạn chính xác tính trong cancelUnshipped).
    const unshipped = await pool.query(
      "SELECT id FROM orders WHERE status='paid' AND created_at < $1::timestamptz - make_interval(days => $2)",
      [now, SHIP_DEADLINE_DAYS + AUTO_CANCEL_GRACE_DAYS]);
    out.overdueCancelled = await each(unshipped.rows, 'overdue_cancel', out, (db, { id }) => cancelUnshipped(db, { orderId: id, now }));

    const overdue = await pool.query(
      `SELECT DISTINCT p.user_id FROM installments i JOIN bnpl_plans p ON p.id=i.plan_id
        WHERE i.status='due' AND i.due_at < $1`, [now]);
    out.rescored = await each(overdue.rows, 'rescore', out, async (db, { user_id }) => { await rescore(db, [user_id], 'job.overdue'); return true; });

    const stale2 = await pool.query(
      `SELECT DISTINCT l.seller_id FROM listings l
        WHERE l.status='active' AND NOT EXISTS (
          SELECT 1 FROM score_snapshots s WHERE s.user_id=l.seller_id AND s.kind='seller' AND s.created_at > $1::timestamptz - interval '1 day')
        LIMIT 200`, [now]);
    out.refreshed = await each(stale2.rows, 'refresh', out, async (db, { seller_id }) => { await rescore(db, [seller_id], 'job.refresh'); return true; });

    out.reminded = await tx((db) => installmentReminders(db, now));
    out.sms = await tx((db) => deliverSms(db, now));

    const c1 = await pool.query("DELETE FROM otp_codes WHERE expires_at < $1::timestamptz - interval '1 day'", [now]);
    const c2 = await pool.query(
      "DELETE FROM sessions WHERE (expires_at < $1::timestamptz OR revoked_at < $1::timestamptz - interval '30 days')", [now]);
    const c3 = await pool.query("DELETE FROM listing_images WHERE listing_id IS NULL AND dispute_id IS NULL AND created_at < $1::timestamptz - interval '1 day'", [now]);
    const c4 = await pool.query("DELETE FROM search_log WHERE created_at < $1::timestamptz - interval '30 days'", [now]);
    out.cleaned = c1.rowCount + c2.rowCount + c3.rowCount + c4.rowCount;

    if (out.autoCompleted || out.released || out.returnsClosed || out.overdueCancelled) invalidateCatalog();
    return out;
  } finally {
    await lock.query('COMMIT').catch(() => {});
    lock.release();
  }
}
