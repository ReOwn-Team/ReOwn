import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { api, pool, resetDb, login, auth, listingByTitle, key } from './helpers.js';
import { totp } from '../src/lib/crypto.js';
import { config } from '../src/config.js';
import { seed } from '../src/db/seed.js';
import { runJobs } from '../src/services/jobs.js';

const CSRF = { 'X-ReOwn-Client': 'web' };
async function adminMfa(token) {
  const r = await api().post('/api/admin/mfa').set(auth(token)).send({ code: totp(config.adminTotpSecret) }).expect(200);
  return r.body.accessToken;
}

let lan, huy, minh, bao, admin;

beforeAll(async () => {
  await resetDb();
  [lan, huy, minh, bao, admin] = await Promise.all([
    login('0900000002'), login('0900000003'), login('0900000001'), login('0900000011'), login('0999999999'),
  ]);
  admin.token = await adminMfa(admin.token);
});
afterAll(() => pool.end());

describe('Xác thực & phiên', () => {
  it('sai OTP bị từ chối và bị đếm số lần', async () => {
    await api().post('/api/auth/otp/request').send({ phone: '0911111111' }).expect(200);
    const r = await api().post('/api/auth/otp/verify').send({ phone: '0911111111', code: '000000' });
    expect(r.status).toBe(401);
    const a = (await pool.query("SELECT attempts FROM otp_codes WHERE phone='0911111111' ORDER BY created_at DESC LIMIT 1")).rows[0];
    expect(a.attempts).toBe(1);
  });

  it('giới hạn 3 mã OTP / 10 phút cho mỗi số', async () => {
    const phone = '0922222222';
    for (let i = 0; i < 3; i++) await api().post('/api/auth/otp/request').send({ phone }).expect(200);
    await api().post('/api/auth/otp/request').send({ phone }).expect(429);
  });

  it('không lưu mã OTP gốc trong CSDL', async () => {
    const r = await api().post('/api/auth/otp/request').send({ phone: '0933333333' });
    const row = (await pool.query("SELECT code_hash FROM otp_codes WHERE phone='0933333333'")).rows[0];
    expect(row.code_hash).not.toContain(r.body.devCode);
    expect(row.code_hash).toHaveLength(64);
  });

  it('refresh token xoay vòng; dùng lại token cũ => thu hồi cả họ phiên', async () => {
    const s = await login('0900000101');
    const r1 = await api().post('/api/auth/refresh').set(CSRF).set('Cookie', s.cookie).expect(200);
    await api().post('/api/auth/refresh').set(CSRF).set('Cookie', s.cookie).expect(401);
    await api().post('/api/auth/refresh').set(CSRF).set('Cookie', r1.headers['set-cookie']).expect(401);
    await api().get('/api/me').set(auth(r1.body.accessToken)).expect(401);
  });

  it('API cần đăng nhập trả 401 khi thiếu / sai token', async () => {
    await api().get('/api/me').expect(401);
    await api().get('/api/me').set(auth('abc.def.ghi')).expect(401);
  });
});

describe('Tin đăng & quyền riêng tư', () => {
  it('danh sách tin công khai kèm điểm người bán, không lộ SĐT hay dữ liệu tài chính', async () => {
    const r = await api().get('/api/listings').expect(200);
    expect(r.body.length).toBe(24);
    const s = JSON.stringify(r.body);
    const leaks = ['"phone":', '0900000011', 'monthlyIncome', 'savings', 'repayment', 'doc_hash'].filter((x) => s.includes(x));
    expect(leaks).toEqual([]);
    expect(r.body[0].sellerScore.tier.id).toBeTruthy();
  });

  it('tin của shop lừa đảo bị gắn rủi ro cao', async () => {
    const l = await listingByTitle('Laptop HP Elitebook');
    const r = await api().get(`/api/listings/${l.id}`).expect(200);
    expect(r.body.risk.level).toBe('high');
    expect(r.body.sellerScore.tier.id).toBe('E');
  });

  it('không cho gán trường lạ khi đăng tin (mass assignment)', async () => {
    await api().post('/api/listings').set(auth(bao.token))
      .send({ title: 'Bàn phím test', category: 'laptop', price: 200000, condition: 80, status: 'sold', sellerId: lan.user.id })
      .expect(400);
  });

  it('gợi ý cho khách chưa đăng nhập không có người bán hạng E', async () => {
    const r = await api().post('/api/recommendations').send({ income: 2000000, savings: 800000 }).expect(200);
    expect(r.body.items.length).toBeGreaterThan(0);
    r.body.items.forEach((i) => expect(i.product.sellerScore.tier.id).not.toBe('E'));
  });
});

describe('Đặt hàng, trả sau và tiền giữ hộ', () => {
  let order;

  it('từ chối trả 3 kỳ khi tiền góp vượt 30% thu nhập', async () => {
    const l = await listingByTitle('Laptop Dell Latitude');
    const r = await api().post('/api/orders').set(auth(lan.token)).set('Idempotency-Key', key())
      .send({ listingId: l.id, method: 'bnpl', term: 3 }).expect(422);
    expect(JSON.stringify(r.body.error.details)).toMatch(/30% thu nhập/);
  });

  it('không nhận giá từ client', async () => {
    const l = await listingByTitle('Laptop Dell Latitude');
    await api().post('/api/orders').set(auth(lan.token)).set('Idempotency-Key', key())
      .send({ listingId: l.id, method: 'full', price: 1000 }).expect(400);
  });

  it('trả 6 kỳ được duyệt; gửi lại cùng Idempotency-Key trả về đúng đơn cũ', async () => {
    const l = await listingByTitle('Laptop Dell Latitude');
    const k = key();
    const r = await api().post('/api/orders').set(auth(lan.token)).set('Idempotency-Key', k).send({ listingId: l.id, method: 'bnpl', term: 6 }).expect(201);
    const again = await api().post('/api/orders').set(auth(lan.token)).set('Idempotency-Key', k).send({ listingId: l.id, method: 'bnpl', term: 6 }).expect(200);
    expect(again.body.id).toBe(r.body.id);
    order = r.body;
    const plan = (await pool.query('SELECT * FROM bnpl_plans WHERE order_id=$1', [order.id])).rows[0];
    expect(plan.total).toBe(3_280_000);
    const n = (await pool.query('SELECT COUNT(*)::int c FROM installments WHERE plan_id=$1', [plan.id])).rows[0].c;
    expect(n).toBe(6);
  });

  it('món đã có người đặt thì người khác không mua được', async () => {
    const r = await api().post('/api/orders').set(auth(huy.token)).set('Idempotency-Key', key()).send({ listingId: order.productId, method: 'full' });
    expect(r.status).toBe(409);
  });

  it('người ngoài không xem / thao tác được đơn của người khác', async () => {
    await api().get(`/api/orders/${order.id}`).set(auth(huy.token)).expect(404);
    await api().post(`/api/orders/${order.id}/ship`).set(auth(huy.token)).expect(403);
    await api().post(`/api/orders/${order.id}/confirm`).set(auth(bao.token)).expect(403);
  });

  it('người mua chưa thể xác nhận khi hàng chưa gửi', async () => {
    await api().post(`/api/orders/${order.id}/confirm`).set(auth(lan.token)).expect(409);
  });

  it('đơn mới nằm ở "chờ người bán gửi" cho đến khi người bán xác nhận', async () => {
    const r = await api().get(`/api/orders/${order.id}`).set(auth(lan.token)).expect(200);
    expect(r.body.status).toBe('paid');
    await api().post(`/api/orders/${order.id}/refuse`).set(auth(lan.token)).expect(409);
  });

  it('công cụ demo "mô phỏng người bán gửi" chỉ người mua của đơn dùng được', async () => {
    await api().post(`/api/dev/orders/${order.id}/simulate-ship`).set(auth(huy.token)).expect(403);
    await api().post(`/api/dev/orders/${order.id}/simulate-ship`).set(auth(bao.token)).expect(403);
  });

  it('gửi hàng → nhận hàng → giải ngân ngay cho người bán hạng A, sàn thu 4%', async () => {
    const before = (await api().get('/api/me/wallet').set(auth(bao.token))).body.balance;
    await api().post(`/api/orders/${order.id}/ship`).set(auth(bao.token)).expect(200);
    const r = await api().post(`/api/orders/${order.id}/confirm`).set(auth(lan.token)).expect(200);
    expect(r.body.status).toBe('completed');
    expect(r.body.payoutStatus).toBe('released');
    const after = (await api().get('/api/me/wallet').set(auth(bao.token))).body.balance;
    expect(after - before).toBe(3_200_000 - 128_000);
  });

  it('đánh giá hai chiều, mỗi bên một lần', async () => {
    await api().post(`/api/orders/${order.id}/review`).set(auth(lan.token)).send({ stars: 5 }).expect(200);
    await api().post(`/api/orders/${order.id}/review`).set(auth(bao.token)).send({ stars: 5 }).expect(200);
    await api().post(`/api/orders/${order.id}/review`).set(auth(lan.token)).send({ stars: 1 }).expect(409);
  });

  it('trả trễ 15 ngày làm giảm điểm; quá hạn > 30 ngày khoá điểm về 30 và tắt trả sau', async () => {
    const plan = (await pool.query("SELECT i.id FROM installments i JOIN bnpl_plans p ON p.id=i.plan_id WHERE p.order_id=$1 ORDER BY n", [order.id])).rows;
    const s0 = (await api().get('/api/me').set(auth(lan.token))).body.buyerScore.score;
    await api().post(`/api/dev/installments/${plan[0].id}/pay-late`).set(auth(lan.token)).send({ daysLate: 15 }).expect(200);
    const s1 = (await api().get('/api/me').set(auth(lan.token))).body.buyerScore.score;
    expect(s1).toBeLessThan(s0);
    await api().post(`/api/dev/installments/${plan[1].id}/make-overdue`).set(auth(lan.token)).send({ days: 35 }).expect(200);
    const me = (await api().get('/api/me').set(auth(lan.token))).body;
    expect(me.buyerScore.score).toBeLessThanOrEqual(30);
    expect(me.bnpl.blockers.join()).toMatch(/quá hạn/);
    const hist = (await pool.query('SELECT trigger FROM score_snapshots WHERE user_id=$1', [lan.user.id])).rows;
    expect(hist.some((h) => h.trigger === 'dev.overdue')).toBe(true);
  });

  it('không được trả kỳ sau khi kỳ trước còn nợ', async () => {
    const inst = (await pool.query("SELECT i.id FROM installments i JOIN bnpl_plans p ON p.id=i.plan_id WHERE p.order_id=$1 ORDER BY n", [order.id])).rows;
    await api().post(`/api/installments/${inst[3].id}/pay`).set(auth(lan.token)).expect(409);
  });
});

describe('Chống bán trùng khi 2 người đặt cùng lúc', () => {
  it('chỉ đúng một đơn thành công', async () => {
    const l = await listingByTitle('Máy tính Casio');
    const [a, b] = await Promise.all([
      api().post('/api/orders').set(auth(huy.token)).set('Idempotency-Key', key()).send({ listingId: l.id, method: 'full' }),
      api().post('/api/orders').set(auth(lan.token)).set('Idempotency-Key', key()).send({ listingId: l.id, method: 'full' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });
});

describe('Xác thực danh tính', () => {
  it('chưa có CCCD thì không trả sau được; mỗi CCCD chỉ gắn một tài khoản', async () => {
    const l = await listingByTitle('Nồi cơm điện');
    await api().post('/api/orders').set(auth(minh.token)).set('Idempotency-Key', key()).send({ listingId: l.id, method: 'bnpl', term: 3 }).expect(422);
    const v = await api().post('/api/me/verifications/cccd').set(auth(minh.token)).send({ number: '079206001234' }).expect(200);
    expect(v.body.last4).toBe('1234');
    const row = (await pool.query("SELECT doc_hash FROM verifications WHERE type='cccd' AND doc_last4='1234'")).rows[0];
    expect(row.doc_hash).not.toContain('079206001234');
    await api().post('/api/me/verifications/cccd').set(auth(huy.token)).send({ number: '079206001234' }).expect(409);
    await api().post('/api/me/verifications/cccd').set(auth(minh.token)).send({ number: '123' }).expect(400);
  });
});

describe('Tranh chấp & quản trị', () => {
  it('người mua thắng tranh chấp được hoàn tiền về ví, người bán bị trừ điểm', async () => {
    const l = await listingByTitle('Giày Converse');
    const w0 = (await api().get('/api/me/wallet').set(auth(huy.token))).body.balance;
    const o = (await api().post('/api/orders').set(auth(huy.token)).set('Idempotency-Key', key()).send({ listingId: l.id, method: 'full' }).expect(201)).body;
    await api().post(`/api/orders/${o.id}/ship`).set(auth(bao.token)).expect(200);
    const sBefore = (await api().get('/api/me').set(auth(bao.token))).body.sellerScore.score;
    const d = await api().post(`/api/orders/${o.id}/dispute`).set(auth(huy.token)).send({ reason: 'Đế giày bị bong, không giống ảnh' }).expect(200);
    expect(d.body.status).toBe('disputed');
    await api().get('/api/admin/disputes').set(auth(huy.token)).expect(403);
    const list = (await api().get('/api/admin/disputes').set(auth(admin.token)).expect(200)).body;
    const mine = list.find((x) => x.order_id === o.id);
    await api().post(`/api/admin/disputes/${mine.id}/resolve`).set(auth(admin.token)).send({ outcome: 'buyer', resolution: 'Ảnh mở hộp cho thấy hàng lỗi' }).expect(200);
    const w1 = (await api().get('/api/me/wallet').set(auth(huy.token))).body.balance;
    expect(w1).toBe(w0);
    const sAfter = (await api().get('/api/me').set(auth(bao.token))).body.sellerScore.score;
    expect(sAfter).toBeLessThan(sBefore);
  });

});

describe('Toàn vẹn sổ cái', () => {
  it('mọi giao dịch cân bằng (tổng = 0) và toàn sổ cân bằng', async () => {
    const bad = (await pool.query('SELECT tx_id FROM ledger_entries GROUP BY tx_id HAVING SUM(amount) <> 0')).rows;
    expect(bad).toHaveLength(0);
    expect((await pool.query('SELECT SUM(amount)::bigint s FROM ledger_entries')).rows[0].s).toBe(0);
  });

  it('CSDL từ chối giao dịch lệch và mọi lệnh sửa/xoá sổ cái', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("INSERT INTO ledger_entries (tx_id, account, amount, memo) VALUES (gen_random_uuid(), 'escrow', 100, 'hack')");
      await expect(c.query('COMMIT')).rejects.toThrow(/not balanced/);
    } finally { c.release(); }
    await expect(pool.query('UPDATE ledger_entries SET amount = amount + 1 WHERE id = 1')).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM ledger_entries WHERE id = 1')).rejects.toThrow(/append-only/);
  });

  it('không ví nào âm', async () => {
    const neg = (await pool.query("SELECT user_id FROM ledger_entries WHERE account='wallet' GROUP BY user_id HAVING SUM(amount) < 0")).rows;
    expect(neg).toHaveLength(0);
  });
});

describe('Kiểu dữ liệu tiền', () => {
  it('số dư ví trả về dạng số, không phải chuỗi', async () => {
    const me = (await api().get('/api/me').set(auth(huy.token))).body;
    expect(typeof me.profile.finance.savings).toBe('number');
    const w = (await api().get('/api/me/wallet').set(auth(huy.token))).body;
    expect(typeof w.balance).toBe('number');
  });
});

describe('rule-v1.1: giá tham chiếu, câu chữ lừa đảo, trả trước', () => {
  it('chặn tin yêu cầu chuyển khoản / đặt cọc ngoài ReOwn', async () => {
    const r = await api().post('/api/listings').set(auth(bao.token))
      .send({ title: 'Tai nghe Sony WH-CH520 còn mới', category: 'phone', price: 600_000, condition: 90, description: 'Cọc trước 100k giữ hàng, ib Zalo' })
      .expect(422);
    expect(r.body.error.details.reasons.join()).toMatch(/ngoài ReOwn/);
  });

  it('bỏ qua giá "thị trường" người bán tự khai, lưu giá tham chiếu hệ thống', async () => {
    await api().post('/api/listings').set(auth(bao.token))
      .send({ title: 'Tai nghe Sony WH-CH520 bản đen', category: 'phone', price: 600_000, marketPrice: 9_000_000, condition: 90 })
      .expect(400);
    const r = await api().post('/api/listings').set(auth(bao.token))
      .send({ title: 'Tai nghe Sony WH-CH520 bản đen', category: 'phone', price: 600_000, condition: 90 })
      .expect(201);
    expect(r.body.refPrice).toBe(800_000);
    const row = (await pool.query('SELECT market_price FROM listings WHERE id=$1', [r.body.id])).rows[0];
    expect(row.market_price).toBe(800_000);
  });

  it('trả sau có trả trước: trừ ví đúng phần trả trước, huỷ đơn thì hoàn lại', async () => {
    const l = await listingByTitle('Quạt đứng');
    const detail = (await api().get(`/api/listings/${l.id}`).set(auth(huy.token)).expect(200)).body;
    const opt = detail.offer.options.find((o) => o.term === 3);
    expect(opt.ok).toBe(true);
    expect(opt.down).toBeGreaterThan(0);
    const w0 = (await api().get('/api/me/wallet').set(auth(huy.token))).body.balance;
    const o = (await api().post('/api/orders').set(auth(huy.token)).set('Idempotency-Key', key()).send({ listingId: l.id, method: 'bnpl', term: 3 }).expect(201)).body;
    const plan = (await pool.query('SELECT * FROM bnpl_plans WHERE order_id=$1', [o.id])).rows[0];
    expect(plan.down_payment).toBe(opt.down);
    expect(plan.principal + plan.down_payment).toBe(l.price);
    const w1 = (await api().get('/api/me/wallet').set(auth(huy.token))).body.balance;
    expect(w0 - w1).toBe(opt.down);
    const sellerPhone = (await pool.query('SELECT phone FROM users WHERE id=$1', [l.seller_id])).rows[0].phone;
    const seller = await login(sellerPhone);
    await api().post(`/api/orders/${o.id}/cancel`).set(auth(seller.token)).expect(200);
    const w2 = (await api().get('/api/me/wallet').set(auth(huy.token))).body.balance;
    expect(w2).toBe(w0);
  });

  it('thu nhập tự khai cao không mở thêm sức góp nếu chưa xác thực ngân hàng', async () => {
    await api().patch('/api/me').set(auth(huy.token)).send({ monthlyIncome: 50_000_000 }).expect(200);
    const me = (await api().get('/api/me').set(auth(huy.token))).body;
    expect(me.bnpl.monthlyRoom).toBeLessThanOrEqual(900_000);
    await api().patch('/api/me').set(auth(huy.token)).send({ monthlyIncome: 2_500_000 }).expect(200);
  });
});

describe('Cấu hình an toàn mặc định', () => {
  const boot = (env) => {
    try {
      execFileSync(process.execPath, ['-e', "import('./src/config.js').then(()=>console.log('BOOT_OK'))"],
        { cwd: process.cwd(), env: { PATH: process.env.PATH, DOTENV_CONFIG_PATH: '/nonexistent', ...env }, stdio: 'pipe' });
      return 'ok';
    } catch (e) { return String(e.stderr); }
  };
  it('bản demo công khai (DEMO_DEPLOYMENT) chạy được ở production nhưng vẫn bắt buộc có CSDL', () => {
    expect(boot({ NODE_ENV: 'production', DEMO_DEPLOYMENT: 'true', DATABASE_URL: 'postgres://x' })).toBe('ok');
    expect(boot({ NODE_ENV: 'production', DEMO_DEPLOYMENT: 'true' })).toMatch(/DATABASE_URL/);
  });
  it('quên NODE_ENV và không có khoá bí mật => không khởi động (không còn tự bật công cụ dev)', () => {
    expect(boot({})).toMatch(/Thiếu biến môi trường bắt buộc/);
  });
  it('DEV_TOOLS=true bị cấm ở production; khoá ngắn bị từ chối', () => {
    expect(boot({ NODE_ENV: 'production', DEV_TOOLS: 'true' })).toMatch(/không được dùng khi NODE_ENV=production/);
    expect(boot({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', JWT_SECRET: 'ngan' })).toMatch(/quá ngắn/);
  });
  it('không có route HTTP nào chạy job định kỳ', async () => {
    await api().post('/api/dev/jobs/run').send({}).expect(404);
    await api().post('/api/admin/jobs/run').set(auth(admin.token)).expect(404);
  });
});

describe('Phiên & CSRF & 2FA admin', () => {
  it('refresh / logout thiếu header chống CSRF bị từ chối', async () => {
    const s = await login('0900000102');
    await api().post('/api/auth/refresh').set('Cookie', s.cookie).expect(401);
    await api().post('/api/auth/logout').set('Cookie', s.cookie).expect(401);
  });
  it('đăng xuất làm access token hết hiệu lực ngay', async () => {
    const s = await login('0900000103');
    await api().get('/api/me').set(auth(s.token)).expect(200);
    await api().post('/api/auth/logout').set(CSRF).set('Cookie', s.cookie).expect(204);
    await api().get('/api/me').set(auth(s.token)).expect(401);
  });
  it('token không đúng issuer/audience bị từ chối', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign({ sub: huy.user.id, sid: 'x' }, config.jwtSecret, { algorithm: 'HS256', expiresIn: 60 });
    await api().get('/api/me').set(auth(forged)).expect(401);
  });
  it('admin chưa qua 2FA không vào được; sai mã bị từ chối', async () => {
    const a = await login('0999999999');
    await api().get('/api/admin/disputes').set(auth(a.token)).expect(403);
    await api().post('/api/admin/mfa').set(auth(a.token)).send({ code: '000000' }).expect(422);
    await api().post('/api/admin/mfa').set(auth(huy.token)).send({ code: totp(config.adminTotpSecret) }).expect(403);
    const t = await adminMfa(a.token);
    await api().get('/api/admin/disputes').set(auth(t)).expect(200);
  });
});

describe('Chống tranh chấp đồng thời (race)', () => {
  it('gửi 6 yêu cầu OTP song song cho cùng một số chỉ tạo tối đa 3 mã', async () => {
    const phone = '0944444444';
    const rs = await Promise.all(Array.from({ length: 6 }, () => api().post('/api/auth/otp/request').send({ phone })));
    expect(rs.filter((r) => r.status === 200).length).toBe(3);
  });
  it('người bán chưa xác thực đăng 5 tin song song chỉ được 3', async () => {
    const s = await login('0955555555', 'Người bán mới');
    const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => api().post('/api/listings').set(auth(s.token))
      .send({ title: `Sách giáo trình số ${i + 1}`, category: 'study', price: 50_000, condition: 80 })));
    expect(rs.filter((r) => r.status === 201).length).toBe(3);
  });
});

describe('Ví: bảng số dư & chốt chặn CSDL', () => {
  it('bảng số dư khớp tuyệt đối với sổ cái', async () => {
    const diff = (await pool.query(`SELECT COUNT(*)::int c FROM wallet_balances w FULL JOIN (
      SELECT user_id, SUM(amount) s FROM ledger_entries WHERE account='wallet' GROUP BY user_id) l ON l.user_id=w.user_id
      WHERE COALESCE(w.balance,0) <> COALESCE(l.s,0)`)).rows[0].c;
    expect(diff).toBe(0);
  });
  it('CSDL từ chối làm ví âm và từ chối sửa số dư trực tiếp', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await expect(c.query(`INSERT INTO ledger_entries (tx_id, account, user_id, amount, memo)
        VALUES (gen_random_uuid(), 'wallet', $1, -999999999, 'rút quá số dư')`, [huy.user.id])).rejects.toThrow(/wallet_balances_balance_check/);
      await c.query('ROLLBACK');
    } finally { c.release(); }
    await expect(pool.query('UPDATE wallet_balances SET balance = 10 WHERE user_id=$1', [huy.user.id])).rejects.toThrow(/chỉ được cập nhật qua sổ cái/);
  });
});

describe('Hiệu năng & dữ liệu', () => {
  it('danh sách tin không còn N+1: số truy vấn không tăng theo số người bán', async () => {
    const pg = (await import('pg')).default;
    const orig = pg.Pool.prototype.query;
    let n = 0;
    pg.Pool.prototype.query = function (...a) { n++; return orig.apply(this, a); };
    try {
      await api().get('/api/listings?limit=100').expect(200);
      const first = n; n = 0;
      await api().get('/api/listings?limit=100').expect(200);
      expect(n).toBeLessThanOrEqual(3);
      expect(first).toBeLessThan(40);
    } finally { pg.Pool.prototype.query = orig; }
  });
  it('tìm kiếm khớp cả phần mô tả', async () => {
    const r = await api().get('/api/listings?q=' + encodeURIComponent('không phai màu')).expect(200);
    expect(r.body.some((x) => x.title.includes('Uniqlo'))).toBe(true);
  });
  it('xác thực giấy tờ trùng không xác nhận "số này đã có người dùng"', async () => {
    const r = await api().post('/api/me/verifications/cccd').set(auth(bao.token)).send({ number: '079206001234' });
    expect(r.status).toBe(409);
    expect(r.body.error.message).not.toMatch(/đã được dùng/);
  });
  it('seed từ chối xoá CSDL đã có đơn hàng nếu không có --force', async () => {
    await expect(seed()).rejects.toThrow(/--force/);
  });
});

describe('Ảnh sản phẩm', () => {
  let sharp;
  const jpeg = async (w = 2400, h = 1600, opts = {}) => {
    sharp ||= (await import('sharp')).default;
    return sharp({ create: { width: w, height: h, channels: 3, background: '#3b6' } })
      .jpeg().withMetadata({ exif: { IFD0: { Make: 'iPhone', Copyright: 'bí mật' } }, ...opts }).toBuffer();
  };
  const up = (token, buf, type = 'image/jpeg') => api().post('/api/uploads/images').set(auth(token)).set('Content-Type', type).send(buf);

  it('tải lên: ảnh được thu về ≤1280px, đổi sang WebP và xoá EXIF', async () => {
    const r = await up(bao.token, await jpeg()).expect(201);
    expect(r.body.width).toBe(1280);
    const row = (await pool.query('SELECT bytes, mime FROM listing_images WHERE id=$1', [r.body.id])).rows[0];
    expect(row.mime).toBe('image/webp');
    const meta = await sharp(row.bytes).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
  });

  it('từ chối file giả dạng ảnh, ảnh quá nhỏ, bom giải nén và khi chưa đăng nhập', async () => {
    await up(bao.token, Buffer.from('<html><script>alert(1)</script></html>'.padEnd(200, ' '))).expect(422);
    await up(bao.token, await jpeg(120, 120)).expect(422);
    const bomb = await sharp({ create: { width: 10_000, height: 10_000, channels: 3, background: '#fff' } }).png().toBuffer();
    await up(bao.token, bomb, 'image/png').expect(422);
    await api().post('/api/uploads/images').set('Content-Type', 'image/jpeg').send(await jpeg()).expect(401);
    await api().post('/api/uploads/images').set(auth(bao.token)).set('Content-Type', 'application/pdf').send(Buffer.from('%PDF-1.4')).expect(400);
  });

  it('đăng tin kèm ảnh: ảnh bìa theo thứ tự, xem công khai được, không dùng lại ảnh / ảnh của người khác', async () => {
    const a = (await up(bao.token, await jpeg())).body;
    const b = (await up(bao.token, await jpeg(1600, 2400))).body;
    const other = (await up(huy.token, await jpeg())).body;
    const body = { title: 'Máy tính Casio fx-580VN X còn hộp', category: 'study', price: 300_000, condition: 90 };
    await api().post('/api/listings').set(auth(bao.token)).send({ ...body, imageIds: [a.id, other.id] }).expect(422);
    const r = await api().post('/api/listings').set(auth(bao.token)).send({ ...body, imageIds: [b.id, a.id] }).expect(201);
    expect(r.body.images).toEqual([`/api/images/${b.id}`, `/api/images/${a.id}`]);
    await api().post('/api/listings').set(auth(bao.token)).send({ ...body, imageIds: [a.id] }).expect(422);
    const img = await api().get(r.body.images[0]).expect(200);
    expect(img.headers['content-type']).toBe('image/webp');
    expect(img.headers['cross-origin-resource-policy']).toBe('cross-origin');
    await api().get(r.body.images[0]).set('If-None-Match', img.headers.etag).expect(304);
    const list = (await api().get('/api/listings?q=' + encodeURIComponent('còn hộp')).expect(200)).body;
    expect(list.find((x) => x.id === r.body.id).images).toHaveLength(2);
    await api().delete(`/api/listings/${r.body.id}`).set(auth(bao.token)).expect(204);
    await api().get(r.body.images[0]).expect(404);
    await api().get(`/api/images/${other.id}`).expect(404);
  });

  it('tối đa 3 ảnh mỗi tin; ảnh chờ tối đa 9 mỗi người; ảnh bỏ quên bị dọn sau 1 ngày', async () => {
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push((await up(bao.token, await jpeg(800, 800))).body.id);
    await api().post('/api/listings').set(auth(bao.token))
      .send({ title: 'Bàn học gấp gọn cho phòng trọ', category: 'study', price: 200_000, condition: 80, imageIds: ids }).expect(400);
    const s = await login('0966666666');
    for (let i = 0; i < 9; i++) await up(s.token, await jpeg(400, 400)).expect(201);
    await up(s.token, await jpeg(400, 400)).expect(422);
    await pool.query("UPDATE listing_images SET created_at = now() - interval '2 days' WHERE owner_id=$1", [s.user.id]);
    await runJobs();
    expect((await pool.query('SELECT COUNT(*)::int c FROM listing_images WHERE owner_id=$1', [s.user.id])).rows[0].c).toBe(0);
  });
});

describe('Tìm kiếm không dấu & chịu gõ sai (server)', () => {
  const titles = async (q) => (await api().get('/api/listings?q=' + encodeURIComponent(q)).expect(200)).body.map((x) => x.title);
  it('gõ không dấu, gõ sai, gõ dở đều ra đúng món và xếp đúng thứ tự', async () => {
    expect((await titles('den hoc'))[0]).toMatch(/^Đèn học/);
    expect((await titles('thinkpat'))[0]).toMatch(/ThinkPad/);
    expect((await titles('tai nge sony'))[0]).toMatch(/Tai nghe Sony/);
    expect(await titles('xyzzz qqq')).toEqual([]);
  });
  it('từ khoá được tìm nhiều hiện ở mục "Tìm nhiều" (ẩn danh)', async () => {
    for (let i = 0; i < 3; i++) await api().get('/api/listings?q=' + encodeURIComponent('nồi cơm')).expect(200);
    await new Promise((r) => setTimeout(r, 50));
    const r = await api().get('/api/search/popular').expect(200);
    expect(r.body.terms).toContain('nồi cơm');
    const row = (await pool.query("SELECT * FROM search_log WHERE term='nồi cơm' LIMIT 1")).rows[0];
    expect(Object.keys(row).sort()).toEqual(['created_at', 'id', 'term']);
  });
});

describe('Thông báo & nhắc hạn', () => {
  const notes = async (u) => (await api().get('/api/me/notifications').set(auth(u.token)).expect(200)).body;
  it('đặt hàng → người bán nhận thông báo (kèm SMS mô phỏng); gửi hàng → người mua nhận', async () => {
    const l = await listingByTitle('Đèn học');
    const seller = await login((await pool.query('SELECT phone FROM users WHERE id=$1', [l.seller_id])).rows[0].phone);
    const o = (await api().post('/api/orders').set(auth(lan.token)).set('Idempotency-Key', key()).send({ listingId: l.id, method: 'full' }).expect(201)).body;
    const s1 = await notes(seller);
    expect(s1.items[0].kind).toBe('order.new');
    expect(s1.unread).toBeGreaterThan(0);
    await api().post(`/api/dev/orders/${o.id}/simulate-ship`).set(auth(lan.token)).expect(200);
    await api().post(`/api/orders/${o.id}/ship`).set(auth(seller.token)).expect(409);
    const b = await notes(lan);
    expect(b.items.find((n) => n.kind === 'order.shipped')).toBeTruthy();
    const inbox = (await api().get('/api/me/inbox').set(auth(lan.token)).expect(200)).body;
    expect(inbox.notifications).toBe(b.unread);
    const after = (await api().post('/api/me/notifications/read').set(auth(lan.token)).send({}).expect(200)).body;
    expect(after.unread).toBe(0);
  });
  it('nhắc trước 3 ngày, đến hạn, quá hạn — mỗi mốc chỉ một lần; SMS được "gửi"', async () => {
    const plan = (await pool.query(
      "SELECT i.id FROM installments i JOIN bnpl_plans p ON p.id=i.plan_id WHERE p.user_id=$1 AND i.status='due' AND i.due_at > now() + interval '5 days' ORDER BY i.due_at LIMIT 1", [lan.user.id])).rows[0];
    expect(plan).toBeTruthy();
    await pool.query("UPDATE installments SET due_at = now() + interval '2 days' WHERE id=$1", [plan.id]);
    await runJobs();
    await runJobs();
    let rows = (await pool.query("SELECT kind FROM notifications WHERE user_id=$1 AND dedupe_key LIKE '%' || $2", [lan.user.id, plan.id])).rows;
    expect(rows.map((r) => r.kind)).toEqual(['installment.due_soon']);
    await pool.query("UPDATE installments SET due_at = now() - interval '3 days' WHERE id=$1", [plan.id]);
    await runJobs();
    rows = (await pool.query("SELECT kind, sms, sms_sent_at FROM notifications WHERE user_id=$1 AND dedupe_key = $2", [lan.user.id, 'overdue:' + plan.id])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].sms && rows[0].sms_sent_at).toBeTruthy();
    await pool.query("UPDATE installments SET due_at = now() + interval '20 days' WHERE id=$1", [plan.id]);
  });
});

describe('Chat mua–bán', () => {
  let conv, l, seller;
  it('người mua mở cuộc trò chuyện; không tự nhắn tin của chính mình', async () => {
    l = await listingByTitle('Loa bluetooth');
    seller = await login((await pool.query('SELECT phone FROM users WHERE id=$1', [l.seller_id])).rows[0].phone);
    await api().post('/api/conversations').set(auth(seller.token)).send({ listingId: l.id }).expect(403);
    conv = (await api().post('/api/conversations').set(auth(huy.token)).send({ listingId: l.id }).expect(201)).body.conversation;
    const again = (await api().post('/api/conversations').set(auth(huy.token)).send({ listingId: l.id }).expect(201)).body.conversation;
    expect(again.id).toBe(conv.id);
  });
  it('gửi / nhận, đếm chưa đọc, đọc rồi về 0', async () => {
    await api().post(`/api/conversations/${conv.id}/messages`).set(auth(huy.token)).send({ body: 'Loa còn bảo hành không bạn?' }).expect(201);
    expect((await api().get('/api/me/inbox').set(auth(seller.token))).body.chats).toBe(1);
    const list = (await api().get('/api/conversations').set(auth(seller.token)).expect(200)).body;
    expect(list[0]).toMatchObject({ id: conv.id, role: 'seller', unread: 1, other: { name: 'Lê Quốc Huy' } });
    const read = (await api().get(`/api/conversations/${conv.id}/messages`).set(auth(seller.token)).expect(200)).body;
    expect(read.messages).toHaveLength(1);
    expect((await api().get('/api/me/inbox').set(auth(seller.token))).body.chats).toBe(0);
    const m2 = (await api().post(`/api/conversations/${conv.id}/messages`).set(auth(seller.token)).send({ body: 'Còn 2 tháng nha' }).expect(201)).body;
    const poll = (await api().get(`/api/conversations/${conv.id}/messages?after=${m2.id - 1}`).set(auth(huy.token)).expect(200)).body;
    expect(poll.messages.map((m) => m.body)).toEqual(['Còn 2 tháng nha']);
  });
  it('chặn "chuyển khoản trước", cảnh báo khi có SĐT / Zalo', async () => {
    const r = await api().post(`/api/conversations/${conv.id}/messages`).set(auth(seller.token)).send({ body: 'Bạn chuyển khoản trước 200k giữ hàng nhé' }).expect(422);
    expect(r.body.error.message).toMatch(/ngoài ReOwn/);
    const m = (await api().post(`/api/conversations/${conv.id}/messages`).set(auth(seller.token)).send({ body: 'Zalo mình 0912 345 678' }).expect(201)).body;
    expect(m.flags).toEqual(expect.arrayContaining(['contact', 'phone']));
  });
  it('người ngoài không đọc / nhắn được (404)', async () => {
    await api().get(`/api/conversations/${conv.id}/messages`).set(auth(lan.token)).expect(404);
    await api().post(`/api/conversations/${conv.id}/messages`).set(auth(lan.token)).send({ body: 'xin chào' }).expect(404);
  });
});

describe('Sửa tin', () => {
  let mine;
  it('chủ tin sửa được giá, mô tả, ảnh; tìm kiếm cập nhật theo nội dung mới', async () => {
    const sharp = (await import('sharp')).default;
    const img = () => sharp({ create: { width: 800, height: 800, channels: 3, background: '#48c' } }).jpeg().toBuffer();
    const up = async () => (await api().post('/api/uploads/images').set(auth(bao.token)).set('Content-Type', 'image/jpeg').send(await img()).expect(201)).body;
    const a = await up(), b = await up(), c = await up();
    mine = (await api().post('/api/listings').set(auth(bao.token))
      .send({ title: 'Máy chiếu mini cho phòng trọ', category: 'home', price: 900_000, condition: 80, imageIds: [a.id, b.id] }).expect(201)).body;
    const r = await api().patch(`/api/listings/${mine.id}`).set(auth(bao.token))
      .send({ price: 750_000, description: 'Kèm dây HDMI và remote', imageIds: [c.id, a.id] }).expect(200);
    expect(r.body.price).toBe(750_000);
    expect(r.body.images).toEqual([`/api/images/${c.id}`, `/api/images/${a.id}`]);
    expect((await pool.query('SELECT COUNT(*)::int c FROM listing_images WHERE id=$1', [b.id])).rows[0].c).toBe(0);
    expect(r.body.editedAt).toBeTruthy();
    const found = (await api().get('/api/listings?q=' + encodeURIComponent('day hdmi')).expect(200)).body;
    expect(found.some((x) => x.id === mine.id)).toBe(true);
    const log = (await pool.query("SELECT meta FROM audit_logs WHERE action='listing.update' AND entity_id=$1", [mine.id])).rows[0];
    expect(log.meta.changed.price).toEqual({ from: 900_000, to: 750_000 });
  });
  it('giảm giá báo cho người đã nhắn hỏi', async () => {
    await api().post('/api/conversations').set(auth(huy.token)).send({ listingId: mine.id }).expect(201);
    await api().patch(`/api/listings/${mine.id}`).set(auth(bao.token)).send({ price: 700_000 }).expect(200);
    const n = (await api().get('/api/me/notifications').set(auth(huy.token))).body.items;
    expect(n.find((x) => x.kind === 'listing.price_drop')?.body).toMatch(/750\.000đ → 700\.000đ/);
  });
  it('người khác không sửa được; câu chữ lừa đảo bị chặn; tin đã có người đặt thì khoá', async () => {
    await api().patch(`/api/listings/${mine.id}`).set(auth(huy.token)).send({ price: 10_000 }).expect(403);
    await api().patch(`/api/listings/${mine.id}`).set(auth(bao.token)).send({ description: 'Chuyển khoản trước rồi mình ship' }).expect(422);
    await api().post('/api/orders').set(auth(lan.token)).set('Idempotency-Key', key()).send({ listingId: mine.id, method: 'full' }).expect(201);
    const r = await api().patch(`/api/listings/${mine.id}`).set(auth(bao.token)).send({ price: 1_000_000 }).expect(422);
    expect(r.body.error.message).toMatch(/không sửa được/);
  });
});

describe('Trang quản trị (API)', () => {
  it('admin gỡ tin kèm lý do => người bán nhận thông báo; gỡ lần hai báo 409; người thường bị chặn', async () => {
    const elite = await listingByTitle('Laptop HP Elitebook');
    await api().post(`/api/admin/listings/${elite.id}/hide`).set(auth(huy.token)).send({}).expect(403);
    await api().post(`/api/admin/listings/${elite.id}/hide`).set(auth(admin.token)).send({ reason: 'Yêu cầu chuyển khoản trước' }).expect(200);
    const n = (await pool.query("SELECT body FROM notifications WHERE user_id=$1 AND kind='listing.hidden'", [elite.seller_id])).rows[0];
    expect(n.body).toMatch(/chuyển khoản/);
    await api().get(`/api/listings/${elite.id}`).expect(404);
    await api().post(`/api/admin/listings/${elite.id}/hide`).set(auth(admin.token)).send({}).expect(409);
  });
  it('các API quản trị đã bỏ không còn tồn tại', async () => {
    for (const path of ['/overview', '/users', '/audit', '/listings/flagged']) await api().get('/api/admin' + path).set(auth(admin.token)).expect(404);
  });
});
