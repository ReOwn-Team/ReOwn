import { fmt } from '../../../shared/scoring/engine.js';
import { maskPhone } from '../lib/crypto.js';
import { config } from '../config.js';

const ORDER_LINK_BUYER = '/tai-khoan?tab=don-mua';
const ORDER_LINK_SELLER = '/kenh-nguoi-ban';
const PLAN_LINK = '/tai-khoan?tab=tra-sau';

export async function notify(db, userId, { kind, title, body = null, link = null, dedupeKey = null, sms = false }) {
  const r = await db.query(
    `INSERT INTO notifications (user_id, kind, title, body, link, dedupe_key, sms)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (dedupe_key) DO NOTHING`,
    [userId, kind, title.slice(0, 140), body?.slice(0, 500) ?? null, link, dedupeKey, sms]);
  return r.rowCount > 0;
}

const short = (t) => (t.length > 48 ? t.slice(0, 47) + '…' : t);
const vnDate = (d) => new Date(d).toLocaleDateString('vi-VN');

export const orderEvents = {
  async created(db, o, title) {
    await notify(db, o.seller_id, { kind: 'order.new', title: `Có đơn mới: ${short(title)}`, body: `Gửi hàng trong ${config.shipSlaDays} ngày để giữ điểm giao đúng hẹn.`, link: ORDER_LINK_SELLER, sms: true });
  },
  async shipped(db, o, title) {
    await notify(db, o.buyer_id, { kind: 'order.shipped', title: `Người bán đã gửi: ${short(title)}`, body: 'Kiểm tra hàng khi nhận rồi bấm "Đã nhận hàng". Sai mô tả thì khiếu nại trong 3 ngày.', link: ORDER_LINK_BUYER });
  },
  async completed(db, o, title, releaseAt) {
    await notify(db, o.seller_id, { kind: 'order.completed', title: `Người mua đã nhận: ${short(title)}`, body: `Tiền về ví ${new Date(releaseAt) <= new Date() ? 'ngay' : 'ngày ' + vnDate(releaseAt)}.`, link: ORDER_LINK_SELLER });
  },
  async released(db, o, title, amount) {
    await notify(db, o.seller_id, { kind: 'payout.released', title: `+${fmt(amount)} vào ví ReOwn`, body: `Tiền bán ${short(title)} (đã trừ phí sàn).`, link: '/tai-khoan?tab=vi', dedupeKey: `payout:${o.id}` });
  },
  async sellerCancelled(db, o, title) {
    await notify(db, o.buyer_id, { kind: 'order.cancelled', title: `Người bán đã huỷ: ${short(title)}`, body: 'Tiền đã được hoàn về ví / khoản trả sau đã huỷ.', link: ORDER_LINK_BUYER });
  },
  async refused(db, o, title) {
    await notify(db, o.seller_id, { kind: 'order.refused', title: `Người mua từ chối nhận: ${short(title)}`, body: 'Tin đã mở bán lại.', link: ORDER_LINK_SELLER });
  },
  async disputeOpened(db, o, title) {
    await notify(db, o.seller_id, { kind: 'dispute.opened', title: `Khiếu nại đơn ${short(title)}`, body: 'Tiền được giữ lại chờ ReOwn xử lý. Chuẩn bị ảnh/video lúc đóng gói.', link: ORDER_LINK_SELLER, sms: true });
  },
  async disputeResolved(db, o, title, outcome) {
    const buyerWon = outcome === 'buyer';
    await notify(db, o.buyer_id, { kind: 'dispute.resolved', title: buyerWon ? `Bạn thắng khiếu nại: ${short(title)}` : `Khiếu nại không được chấp nhận: ${short(title)}`, body: buyerWon ? 'Tiền đã hoàn về ví.' : 'Đơn được tính là hoàn tất.', link: ORDER_LINK_BUYER });
    await notify(db, o.seller_id, { kind: 'dispute.resolved', title: buyerWon ? `Thua khiếu nại: ${short(title)}` : `Khiếu nại đã xử lý có lợi cho bạn: ${short(title)}`, link: ORDER_LINK_SELLER });
  },
  async reviewed(db, toUser, stars, asSeller) {
    await notify(db, toUser, { kind: 'review.new', title: `Bạn nhận được đánh giá ${stars}★`, body: asSeller ? 'Từ người mua sau giao dịch.' : 'Từ người bán sau giao dịch.', link: '/tai-khoan?tab=uy-tin' });
  },
};

export async function installmentReminders(db, now = new Date()) {
  const rows = (await db.query(
    `SELECT i.id, i.n, i.amount, i.due_at, p.user_id, p.term, l.title
       FROM installments i JOIN bnpl_plans p ON p.id=i.plan_id
       JOIN orders o ON o.id=p.order_id JOIN listings l ON l.id=o.listing_id
      WHERE i.status='due' AND i.due_at <= $1::timestamptz + interval '3 days'`, [now])).rows;
  let sent = 0;
  for (const r of rows) {
    const days = Math.ceil((new Date(r.due_at) - now) / 86_400_000);
    const what = `kỳ ${r.n}/${r.term} · ${fmt(r.amount)} · ${short(r.title)}`;
    let n;
    if (days > 0) n = { kind: 'installment.due_soon', title: `Còn ${days} ngày đến hạn trả ${fmt(r.amount)}`, body: `${what}. Hạn ${vnDate(r.due_at)}. Nạp đủ ví để trả đúng hạn, giữ điểm uy tín.`, dedupeKey: `due3:${r.id}` };
    else if (days > -1) n = { kind: 'installment.due_today', title: `Hôm nay đến hạn trả ${fmt(r.amount)}`, body: `${what}. Trả trễ sẽ bị trừ điểm uy tín.`, dedupeKey: `due0:${r.id}`, sms: true };
    else n = { kind: 'installment.overdue', title: `Quá hạn ${-days} ngày: ${fmt(r.amount)}`, body: `${what}. Trễ trên 10 ngày bị trừ điểm nặng; trên 30 ngày khoá trả sau.`, dedupeKey: `overdue:${r.id}`, sms: true };
    if (await notify(db, r.user_id, { ...n, link: PLAN_LINK })) sent++;
  }
  return sent;
}

export async function deliverSms(db, now = new Date()) {
  const rows = (await db.query(
    `UPDATE notifications n SET sms_sent_at=$1 FROM users u
      WHERE u.id=n.user_id AND n.sms AND n.sms_sent_at IS NULL RETURNING n.title, u.phone`, [now])).rows;
  if (!config.isTest) rows.forEach((r) => console.info('[sms-mô-phỏng]', maskPhone(r.phone), '—', r.title));
  return rows.length;
}

export async function listNotifications(db, userId, { limit = 30 } = {}) {
  const items = (await db.query(
    `SELECT id, kind, title, body, link, read_at IS NOT NULL AS read, created_at FROM notifications
      WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [userId, limit])).rows;
  const unread = (await db.query('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND read_at IS NULL', [userId])).rows[0].c;
  return { items, unread };
}

export async function markRead(db, userId, ids) {
  if (ids?.length) await db.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND id = ANY($2::uuid[]) AND read_at IS NULL', [userId, ids]);
  else await db.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [userId]);
}
