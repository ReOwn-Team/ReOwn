import { fileURLToPath } from 'node:url';
import { pool, tx } from './pool.js';
import { migrate, assertResetAllowed } from './migrate.js';
import { referencePrice, listingRisk } from '../../../../shared/scoring/engine.js';
import { searchText } from '../../../../shared/search.js';
import { piiHash } from '../lib/crypto.js';
import { post, wallet, acct } from '../services/ledger.js';
import * as orders from '../services/orders.js';
import { payInstallment } from '../services/bnpl.js';
import { rescore, sellerScore } from '../services/scoring.js';
import { PRODUCTS } from '../../../web/src/data/mock.js';

const DAY = 86_400_000;
const ago = (days) => new Date(Date.now() - days * DAY);
const plus = (d, days) => new Date(d.getTime() + days * DAY);
let docSeq = 1;

async function mkUser(db, { phone, name, school, monthsAgo = 0, income = 0, debt = 0, role = 'user', verify = [], topup = 0 }) {
  const u = (await db.query(
    `INSERT INTO users (phone, name, school, role, monthly_income, other_debt_monthly, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [phone, name, school, role, income, debt, ago(monthsAgo * 30 + 1)])).rows[0];
  for (const type of ['phone', ...verify]) {
    const doc = type === 'phone' ? null : `${type}-${String(docSeq++).padStart(12, '0')}`;
    await db.query(
      `INSERT INTO verifications (user_id, type, status, doc_hash, doc_last4, provider_ref, verified_at)
       VALUES ($1,$2,'verified',$3,$4,'seed',$5)`,
      [u.id, type, doc && piiHash(type, doc), doc && doc.slice(-4), u.created_at]);
  }
  if (topup) await post(db, { memo: 'Nạp tiền (seed)', entries: [acct('external', -topup), wallet(u.id, topup)] });
  return u;
}

async function mkListing(db, seller, p, { daysAgo = 3 } = {}) {
  return (await db.query(
    `INSERT INTO listings (seller_id, title, category, price, market_price, condition, description, icon, cover, location, created_at, search_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [seller.id, p.title, p.category, p.price, referencePrice(p)?.price ?? null, p.condition, p.desc || '', p.icon || null, p.cover || null, p.location || null, ago(daysAgo), searchText(p.title, p.desc || '')])).rows[0];
}

let keySeq = 1;
async function history(seller, buyer, { title, category = 'study', price, daysAgo, method = 'full', stars, sellerStars, late = [], outcome = 'complete', shipDelay = 1, admin, reason }) {
  const t0 = ago(daysAgo);
  const listing = await tx((db) => mkListing(db, seller, { title, category, price, condition: 80 }, { daysAgo: daysAgo + 1 }));
  const { order } = await tx((db) => orders.createOrder(db, {
    buyerId: buyer.id, listingId: listing.id, method: method === 'full' ? 'full' : 'bnpl', term: method === 'full' ? undefined : method,
    delivery: 'ship', shipTo: `${buyer.name} · KTX khu B, ĐHQG TP.HCM`, idempotencyKey: `seed-${keySeq++}`, now: t0,
  }));
  if (outcome === 'seller_cancel') return tx((db) => orders.sellerCancel(db, { orderId: order.id, userId: seller.id }));
  await tx((db) => orders.shipOrder(db, { orderId: order.id, userId: seller.id, carrier: 'GHN', trackingCode: `GHN${String(keySeq).padStart(8, '0')}`, now: plus(t0, shipDelay) }));
  if (outcome === 'refuse') {
    // Từ chối nhận: hàng hoàn về, người bán xác nhận đã nhận lại thì người mua mới được hoàn tiền.
    await tx((db) => orders.refuseDelivery(db, { orderId: order.id, userId: buyer.id, now: plus(t0, shipDelay + 1) }));
    return tx((db) => orders.returnReceived(db, { orderId: order.id, userId: seller.id }));
  }
  if (outcome.startsWith('dispute')) {
    const d = await tx((db) => orders.openDispute(db, { orderId: order.id, userId: buyer.id, reason: reason || 'Hàng không đúng như mô tả trong tin đăng', now: plus(t0, 3) }));
    if (outcome === 'dispute_open') return;
    await tx((db) => orders.resolveDispute(db, { disputeId: d.id, adminId: admin.id, outcome: outcome === 'dispute_buyer' ? 'buyer' : 'seller', resolution: 'Đã đối chiếu ảnh và video mở hộp', now: plus(t0, 5) }));
  } else {
    await tx((db) => orders.confirmReceived(db, { orderId: order.id, userId: buyer.id, now: plus(t0, shipDelay + 1) }));
    await tx((db) => orders.releaseIfDue(db, order.id, plus(t0, 30)));
  }
  if (method !== 'full' && outcome !== 'dispute_buyer') {
    const inst = (await pool.query(
      'SELECT i.id, i.due_at FROM installments i JOIN bnpl_plans p ON p.id=i.plan_id WHERE p.order_id=$1 ORDER BY n', [order.id])).rows;
    for (const [k, i] of inst.entries()) {
      const paidAt = plus(new Date(i.due_at), late[k] || 0);
      if (paidAt > new Date()) break;
      await tx((db) => payInstallment(db, { installmentId: i.id, userId: buyer.id, now: new Date(paidAt.getTime() - (late[k] ? 0 : DAY)) }));
    }
  }
  const final = (await pool.query('SELECT status FROM orders WHERE id=$1', [order.id])).rows[0].status;
  if (final === 'completed') {
    if (stars) await tx((db) => orders.review(db, { orderId: order.id, userId: buyer.id, stars }));
    if (sellerStars) await tx((db) => orders.review(db, { orderId: order.id, userId: seller.id, stars: sellerStars }));
  }
}

export async function seed({ force = false } = {}) {
  assertResetAllowed();
  if (!force) {
    const hasOrders = (await pool.query("SELECT to_regclass('public.orders') IS NOT NULL AS t")).rows[0].t
      && (await pool.query('SELECT EXISTS (SELECT 1 FROM orders) AS e')).rows[0].e;
    if (hasOrders) throw new Error('CSDL đã có đơn hàng — seed sẽ xoá sạch. Chạy lại với --force nếu chắc chắn.');
  }
  await migrate({ reset: true });

  const U = await tx(async (db) => {
    const u = {};
    u.admin = await mkUser(db, { phone: '0999999999', name: 'Quản trị ReOwn', role: 'admin', monthsAgo: 12 });
    u.minh = await mkUser(db, { phone: '0900000001', name: 'Nguyễn Minh', school: 'HUIT · năm 1', income: 2_000_000, verify: ['student'], topup: 600_000 });
    u.lan = await mkUser(db, { phone: '0900000002', name: 'Trần Ngọc Lan', school: 'HUIT · năm 3', monthsAgo: 14, income: 3_500_000, verify: ['cccd', 'bank', 'student'], topup: 12_000_000 });
    u.huy = await mkUser(db, { phone: '0900000003', name: 'Lê Quốc Huy', school: 'HUIT · năm 2', monthsAgo: 7, income: 2_500_000, debt: 300_000, verify: ['cccd'], topup: 3_000_000 });
    u.bao = await mkUser(db, { phone: '0900000011', name: 'Phạm Gia Bảo', school: 'HUIT · năm 4', monthsAgo: 18, income: 4_000_000, verify: ['cccd', 'bank', 'student'] });
    u.ha = await mkUser(db, { phone: '0900000012', name: 'Đỗ Thu Hà', school: 'UEH · năm 3', monthsAgo: 9, income: 3_000_000, verify: ['cccd', 'bank'] });
    u.tam = await mkUser(db, { phone: '0900000013', name: 'Võ Thành Tâm', school: 'HCMUTE · năm 2', monthsAgo: 5, income: 2_000_000, verify: ['cccd', 'student'] });
    u.shop = await mkUser(db, { phone: '0900000014', name: 'shop_passdo_gia_re', school: 'Không rõ', monthsAgo: 1 });
    u.bg = [];
    for (let i = 1; i <= 6; i++) {
      u.bg.push(await mkUser(db, { phone: `09000001${String(i).padStart(2, '0')}`, name: `Sinh viên ${i}`, school: 'HUIT', monthsAgo: 10, income: 1_500_000 + i * 400_000, verify: ['cccd', 'student'], topup: 20_000_000 }));
    }
    u.sock = [];
    for (let i = 1; i <= 3; i++) u.sock.push(await mkUser(db, { phone: `09000009${String(i).padStart(2, '0')}`, name: `acc_moi_${i}`, monthsAgo: 0.8, topup: 2_000_000 }));
    return u;
  });

  const bg = U.bg;
  for (let i = 0; i < 10; i++) await history(U.bao, bg[i % 6], { title: `Sách chuyên ngành #${i + 1}`, price: 150_000 + i * 20_000, daysAgo: 300 - i * 20, stars: i % 4 === 0 ? 4 : 5, sellerStars: 5 });
  for (let i = 0; i < 6; i++) await history(U.ha, bg[(i + 2) % 6], { title: `Phụ kiện điện thoại #${i + 1}`, category: 'phone', price: 250_000, daysAgo: 250 - i * 25, stars: i % 3 === 0 ? 4 : 5, sellerStars: 5 });
  for (let i = 0; i < 4; i++) await history(U.tam, bg[i], { title: `Đồ gia dụng #${i + 1}`, category: 'home', price: 200_000, daysAgo: 120 - i * 20, stars: [4, 3, 5, 4][i], shipDelay: i === 1 ? 5 : 1 });
  await history(U.tam, bg[4], { title: 'Quạt mini', category: 'home', price: 150_000, daysAgo: 30, outcome: 'seller_cancel' });

  await history(U.bao, U.lan, { title: 'Tai nghe cũ', category: 'phone', price: 1_200_000, daysAgo: 400, method: 3, stars: 5, sellerStars: 5 });
  await history(U.ha, U.lan, { title: 'Bàn phím cơ', category: 'laptop', price: 900_000, daysAgo: 220, method: 6, late: [0, 0, 4, 0, 0, 0], stars: 5, sellerStars: 5 });
  for (let i = 0; i < 5; i++) await history(U.bao, U.lan, { title: `Giáo trình #${i + 1}`, price: 100_000, daysAgo: 350 - i * 30, stars: 5, sellerStars: i === 2 ? 4 : 5 });

  await history(U.tam, U.huy, { title: 'Chuột không dây', category: 'laptop', price: 600_000, daysAgo: 140, method: 3, late: [0, 6, 15], stars: 5, sellerStars: 3 });
  await history(U.ha, U.huy, { title: 'Ốp lưng + cường lực', category: 'phone', price: 120_000, daysAgo: 150, outcome: 'refuse' });
  await history(U.bao, U.huy, { title: 'Balo laptop', category: 'fashion', price: 300_000, daysAgo: 100, outcome: 'dispute_seller', admin: U.admin });
  for (let i = 0; i < 3; i++) await history(U.bao, U.huy, { title: `Vở ghi #${i + 1}`, price: 50_000, daysAgo: 200 - i * 10, stars: 4, sellerStars: [4, 2, 4][i] });

  for (const s of U.sock) await history(U.shop, s, { title: 'Tai nghe AirPod rep', category: 'phone', price: 300_000, daysAgo: 20, stars: 5, shipDelay: 5 });
  await history(U.shop, bg[1], { title: 'Tai nghe AirPods Pro (rep 1:1)', category: 'phone', price: 450_000, daysAgo: 4, outcome: 'dispute_open', shipDelay: 1,
    reason: 'Nhận được hàng nhái, không kết nối được với iPhone, hộp không có tem như ảnh.' });
  await history(U.shop, bg[0], { title: 'Sạc dự phòng 20000mAh', category: 'phone', price: 250_000, daysAgo: 18, outcome: 'dispute_buyer', shipDelay: 5, admin: U.admin });
  await history(U.shop, bg[1], { title: 'Chuột gaming', category: 'laptop', price: 200_000, daysAgo: 15, outcome: 'dispute_buyer', shipDelay: 5, admin: U.admin });
  for (let i = 0; i < 3; i++) await history(U.shop, bg[2 + i], { title: `Loa bluetooth #${i}`, category: 'phone', price: 180_000, daysAgo: 12 - i, outcome: 'seller_cancel' });

  await pool.query("UPDATE listings SET status='hidden' WHERE status='active'");

  const sellerMap = { u_s1: U.bao, u_s2: U.ha, u_s3: U.tam, u_s4: U.shop };
  await tx(async (db) => {
    for (const p of PRODUCTS) await mkListing(db, sellerMap[p.sellerId], p, { daysAgo: p.daysAgo + Math.random() * 0.5 });
  });

  await pool.query('DELETE FROM notifications');

  const all = (await pool.query('SELECT id FROM users')).rows.map((r) => r.id);
  for (let pass = 0; pass < 2; pass++) await tx((db) => rescore(db, all, 'seed'));
  await tx(async (db) => {
    const risky = await db.query("SELECT l.id, l.title, l.description, l.category, l.price, l.market_price, l.seller_id FROM listings l WHERE status='active'");
    for (const l of risky.rows) {
      const { result } = await sellerScore(db, l.seller_id);
      const r = listingRisk({ id: l.id, title: l.title, desc: l.description, category: l.category, price: l.price, refPrice: l.market_price }, result);
      await db.query('UPDATE listings SET risk_level=$2, risk_flags=$3 WHERE id=$1', [l.id, r.level, JSON.stringify(r.flags)]);
    }
  });
  // Đơn lịch sử đã quá hạn giữ tiền → giải ngân luôn (không chờ tác vụ định kỳ)
  const due = (await pool.query("SELECT id FROM orders WHERE status='completed' AND payout_status='held' AND release_at <= now()")).rows;
  for (const { id } of due) await tx((db) => orders.releaseIfDue(db, id));
  return U;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed({ force: process.argv.includes('--force') })
    .then(async () => {
      const r = await pool.query(
        `SELECT u.name, u.phone, s.kind, s.score, s.tier FROM users u
           JOIN LATERAL (SELECT DISTINCT ON (kind) kind, score, tier FROM score_snapshots WHERE user_id=u.id ORDER BY kind, created_at DESC) s ON true
          WHERE u.phone IN ('0900000001','0900000002','0900000003','0900000011','0900000012','0900000013','0900000014')
          ORDER BY u.phone, s.kind`);
      console.table(r.rows);
      console.log('Seed xong. Đăng nhập bằng các SĐT trên; mã OTP hiện trong response (chế độ dev).');
      await pool.end();
    })
    .catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
}
