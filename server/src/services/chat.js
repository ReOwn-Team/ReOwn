import { scanMessage } from '../../../shared/scoring/engine.js';
import { forbidden, notFound, unprocessable, conflict } from '../lib/errors.js';
import { imagesFor } from './images.js';

export const MAX_MESSAGE = 1000;

async function load(db, id, userId, { lock = false } = {}) {
  const c = (await db.query(`SELECT * FROM conversations WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0];
  if (!c || (c.buyer_id !== userId && c.seller_id !== userId)) throw notFound('Không tìm thấy cuộc trò chuyện');
  return c;
}

export async function openConversation(db, { listingId, buyerId }) {
  const l = (await db.query('SELECT id, seller_id, status FROM listings WHERE id=$1', [listingId])).rows[0];
  if (!l || l.status === 'hidden') throw notFound('Không tìm thấy tin đăng');
  if (l.seller_id === buyerId) throw forbidden('Đây là tin của bạn');
  const existing = (await db.query('SELECT * FROM conversations WHERE listing_id=$1 AND buyer_id=$2', [listingId, buyerId])).rows[0];
  if (existing) return existing;
  if (l.status !== 'active') throw conflict('Món này không còn bán');
  return (await db.query(
    `INSERT INTO conversations (listing_id, buyer_id, seller_id) VALUES ($1,$2,$3)
     ON CONFLICT (listing_id, buyer_id) DO UPDATE SET listing_id = EXCLUDED.listing_id RETURNING *`,
    [listingId, buyerId, l.seller_id])).rows[0];
}

export async function sendMessage(db, { conversationId, senderId, body }) {
  const text = String(body || '').trim().slice(0, MAX_MESSAGE);
  if (!text) throw unprocessable('Tin nhắn trống');
  const c = await load(db, conversationId, senderId, { lock: true });
  const listing = (await db.query('SELECT status FROM listings WHERE id=$1', [c.listing_id])).rows[0];
  if (listing?.status === 'hidden') throw conflict('Tin đăng đã bị gỡ, không thể nhắn tiếp');
  const scan = scanMessage(text);
  if (scan.blocked) {
    throw unprocessable('Không gửi được: tin nhắn yêu cầu chuyển khoản / đặt cọc ngoài ReOwn', {
      reasons: ['ReOwn giữ tiền hộ đến khi người mua nhận hàng. Mọi thanh toán phải đi qua ReOwn để được bảo vệ.'],
    });
  }
  const m = (await db.query(
    'INSERT INTO messages (conversation_id, sender_id, body, flags) VALUES ($1,$2,$3,$4) RETURNING id, sender_id, body, flags, created_at',
    [c.id, senderId, text, JSON.stringify(scan.flags)])).rows[0];
  const readCol = senderId === c.buyer_id ? 'buyer_last_read_at' : 'seller_last_read_at';
  await db.query(`UPDATE conversations SET last_message_at=$2, ${readCol}=$2 WHERE id=$1`, [c.id, m.created_at]);
  return m;
}

export async function listMessages(db, { conversationId, userId, after = 0, limit = 100 }) {
  const c = await load(db, conversationId, userId);
  const msgs = (await db.query(
    `SELECT id, sender_id, body, flags, created_at FROM messages WHERE conversation_id=$1 AND id > $2
      ORDER BY id DESC LIMIT $3`, [c.id, after, limit])).rows.reverse();
  const readCol = userId === c.buyer_id ? 'buyer_last_read_at' : 'seller_last_read_at';
  await db.query(`UPDATE conversations SET ${readCol}=now() WHERE id=$1`, [c.id]);
  return { conversation: await summary(db, c, userId), messages: msgs };
}

async function summary(db, c, userId) {
  const other = userId === c.buyer_id ? c.seller_id : c.buyer_id;
  const r = (await db.query(
    `SELECT l.id, l.title, l.price, l.status, l.category, l.icon, l.cover, u.id AS uid, u.name FROM listings l, users u WHERE l.id=$1 AND u.id=$2`,
    [c.listing_id, other])).rows[0];
  const pics = await imagesFor(db, [c.listing_id]);
  return {
    id: c.id, role: userId === c.buyer_id ? 'buyer' : 'seller',
    listing: { id: r.id, title: r.title, price: r.price, status: r.status, category: r.category, icon: r.icon, cover: r.cover, images: pics[r.id] || [] },
    other: { id: r.uid, name: r.name },
  };
}

export async function listConversations(db, userId) {
  const rows = (await db.query(
    `SELECT c.*, l.title, l.price, l.status AS listing_status, l.category, l.icon, l.cover,
            CASE WHEN c.buyer_id=$1 THEN s.name ELSE b.name END AS other_name,
            CASE WHEN c.buyer_id=$1 THEN c.seller_id ELSE c.buyer_id END AS other_id,
            lm.body AS last_body, lm.sender_id AS last_sender,
            (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id=c.id AND m.sender_id<>$1
               AND m.created_at > CASE WHEN c.buyer_id=$1 THEN c.buyer_last_read_at ELSE c.seller_last_read_at END) AS unread
       FROM conversations c
       JOIN listings l ON l.id=c.listing_id JOIN users b ON b.id=c.buyer_id JOIN users s ON s.id=c.seller_id
       LEFT JOIN LATERAL (SELECT body, sender_id FROM messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) lm ON true
      WHERE (c.buyer_id=$1 OR c.seller_id=$1) AND c.last_message_at IS NOT NULL
      ORDER BY c.last_message_at DESC LIMIT 100`, [userId])).rows;
  const pics = await imagesFor(db, [...new Set(rows.map((r) => r.listing_id))]);
  return rows.map((r) => ({
    id: r.id, role: r.buyer_id === userId ? 'buyer' : 'seller', unread: r.unread, lastMessageAt: r.last_message_at,
    last: r.last_body ? { body: r.last_body, mine: r.last_sender === userId } : null,
    other: { id: r.other_id, name: r.other_name },
    listing: { id: r.listing_id, title: r.title, price: r.price, status: r.listing_status, category: r.category, icon: r.icon, cover: r.cover, images: pics[r.listing_id] || [] },
  }));
}

export async function unreadChats(db, userId) {
  return (await db.query(
    `SELECT COUNT(*)::int AS c FROM messages m JOIN conversations c ON c.id=m.conversation_id
      WHERE (c.buyer_id=$1 OR c.seller_id=$1) AND m.sender_id<>$1
        AND m.created_at > CASE WHEN c.buyer_id=$1 THEN c.buyer_last_read_at ELSE c.seller_last_read_at END`, [userId])).rows[0].c;
}
