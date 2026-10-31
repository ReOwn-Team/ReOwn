import sharp from 'sharp';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, pool, resetDb, login, auth, listingByTitle, key } from './helpers.js';
import { totp } from '../src/lib/crypto.js';
import { config } from '../src/config.js';
import { runJobs } from '../src/services/jobs.js';
import { LATE_FEE, SHIP_DEADLINE_DAYS } from '../../../shared/policy.js';

let lan, huy, bao, ha, tam, admin;
const balance = async (u) => (await api().get('/api/me/wallet').set(auth(u.token)).expect(200)).body.balance;
const photo = () => sharp({ create: { width: 300, height: 300, channels: 3, background: '#3a6' } }).jpeg().toBuffer();
const upload = async (u) => (await api().post('/api/uploads/images').set(auth(u.token)).set('Content-Type', 'image/jpeg').send(await photo()).expect(201)).body;
const order = (u, listingId, body) => api().post('/api/orders').set(auth(u.token)).set('Idempotency-Key', key()).send({ listingId, method: 'full', ...body });
const bare = (urls) => urls.map((u) => u.split('?')[0]);
const ship = { delivery: 'ship', shipTo: 'Trần Ngọc Lan · 0900000002 · KTX khu B, ĐHQG TP.HCM' };

async function disputed(buyer, seller, title) {
  const l = await listingByTitle(title);
  const o = (await order(buyer, l.id, ship).expect(201)).body;
  await api().post(`/api/orders/${o.id}/ship`).set(auth(seller.token)).send({ carrier: 'GHN', trackingCode: 'GHN12345678' }).expect(200);
  const pic = await upload(buyer);
  await api().post(`/api/orders/${o.id}/dispute`).set(auth(buyer.token)).send({ reason: 'Hàng không giống ảnh trong tin đăng', imageIds: [pic.id] }).expect(200);
  const d = (await api().get('/api/admin/disputes').set(auth(admin.token)).expect(200)).body.find((x) => x.order_id === o.id);
  return { o, d, l };
}

beforeAll(async () => {
  await resetDb();
  [lan, huy, bao, ha, tam, admin] = await Promise.all([
    login('0900000002'), login('0900000003'), login('0900000011'), login('0900000012'), login('0900000013'), login('0999999999'),
  ]);
  admin.token = (await api().post('/api/admin/mfa').set(auth(admin.token)).send({ code: totp(config.adminTotpSecret) }).expect(200)).body.accessToken;
});
afterAll(() => pool.end());

describe('Giao hàng', () => {
  it('gửi qua đơn vị vận chuyển: bắt buộc địa chỉ, mã vận đơn hiện cho người mua', async () => {
    const l = await listingByTitle('Máy tính Casio');
    await order(lan, l.id, { delivery: 'ship' }).expect(400);
    const o = (await order(lan, l.id, ship).expect(201)).body;
    expect(o).toMatchObject({ delivery: 'ship', shipTo: ship.shipTo, handoverCode: null });
    await api().post(`/api/orders/${o.id}/ship`).set(auth(bao.token)).send({}).expect(422);
    await api().post(`/api/orders/${o.id}/ship`).set(auth(bao.token)).send({ carrier: 'GHN', trackingCode: 'GHN98765432' }).expect(200);
    const seen = (await api().get(`/api/orders/${o.id}`).set(auth(lan.token)).expect(200)).body;
    expect(seen).toMatchObject({ status: 'shipped', carrier: 'GHN', trackingCode: 'GHN98765432' });
  });

  it('gặp trực tiếp: người bán nhập đúng mã của người mua thì đơn hoàn tất, sai quá 5 lần thì khoá', async () => {
    const l = await listingByTitle('Quạt đứng');
    const o = (await order(lan, l.id, { delivery: 'meetup', meetupNote: 'Cổng A HUIT, 17h' }).expect(201)).body;
    expect(o.handoverCode).toMatch(/^\d{6}$/);
    const sellerView = (await api().get(`/api/orders/${o.id}`).set(auth(bao.token)).expect(200)).body;
    expect(sellerView.handoverCode).toBeNull();
    expect(sellerView.meetupNote).toBe('Cổng A HUIT, 17h');
    const wrong = o.handoverCode === '000000' ? '111111' : '000000';
    const r = await api().post(`/api/orders/${o.id}/handover`).set(auth(bao.token)).send({ code: wrong }).expect(422);
    expect(r.body.error.details.attemptsLeft).toBe(4);
    await api().post(`/api/orders/${o.id}/handover`).set(auth(lan.token)).send({ code: o.handoverCode }).expect(403);
    const before = await balance(bao);
    const done = (await api().post(`/api/orders/${o.id}/handover`).set(auth(bao.token)).send({ code: o.handoverCode }).expect(200)).body;
    expect(done).toMatchObject({ status: 'completed', payoutStatus: 'held' });
    expect(await balance(bao)).toBe(before);
    await runJobs(new Date(Date.now() + 3 * 86_400_000 + 60_000));
    expect(await balance(bao)).toBe(before + Math.round(l.price * 0.96));
  });
});

describe('Hạn khiếu nại sau khi nhận hàng', () => {
  it('người mua vẫn khiếu nại được trong 3 ngày sau khi nhận, kể cả mua của người bán hạng A', async () => {
    const l = await listingByTitle('Màn hình Dell');
    const o = (await order(lan, l.id, { delivery: 'meetup' }).expect(201)).body;
    await api().post(`/api/orders/${o.id}/handover`).set(auth(bao.token)).send({ code: o.handoverCode }).expect(200);
    const pic = await upload(lan);
    await api().post(`/api/orders/${o.id}/dispute`).set(auth(lan.token)).send({ reason: 'Màn hình có điểm chết không ghi trong tin', imageIds: [pic.id] }).expect(200);
  });
});

describe('Khiếu nại hai chiều', () => {
  it('người bán phản hồi kèm ảnh; admin thấy ảnh hai bên và lịch sử chat; hoàn một phần chia tiền đúng', async () => {
    const conv = (await api().post('/api/conversations').set(auth(lan.token)).send({ listingId: (await listingByTitle('Giày Converse')).id }).expect(201)).body.conversation;
    await api().post(`/api/conversations/${conv.id}/messages`).set(auth(lan.token)).send({ body: 'Giày còn đế tốt không bạn?' }).expect(201);
    const { o, d, l } = await disputed(lan, bao, 'Giày Converse');
    expect(new Date(d.respond_by) - new Date(d.created_at)).toBe(48 * 3_600_000);
    expect(d.chat.map((m) => m.body)).toContain('Giày còn đế tốt không bạn?');

    await api().post(`/api/orders/${o.id}/dispute/respond`).set(auth(lan.token)).send({ text: 'Người mua không được phản hồi thay' }).expect(403);
    const pic = await upload(bao);
    await api().post(`/api/orders/${o.id}/dispute/respond`).set(auth(bao.token)).send({ text: 'Video đóng gói cho thấy đế nguyên vẹn', imageIds: [pic.id] }).expect(200);
    await api().post(`/api/orders/${o.id}/dispute/respond`).set(auth(bao.token)).send({ text: 'Gửi phản hồi lần thứ hai' }).expect(409);
    const buyerView = (await api().get(`/api/orders/${o.id}`).set(auth(lan.token)).expect(200)).body;
    expect(buyerView.dispute.sellerResponse).toBe('Video đóng gói cho thấy đế nguyên vẹn');
    expect(bare(buyerView.dispute.sellerEvidence)).toEqual([pic.url]);
    const row = (await api().get('/api/admin/disputes').set(auth(admin.token)).expect(200)).body.find((x) => x.id === d.id);
    expect(bare(row.seller_evidence)).toEqual([pic.url]);
    expect(row.evidence).toHaveLength(1);

    await api().post(`/api/admin/disputes/${d.id}/resolve`).set(auth(admin.token)).send({ outcome: 'partial', resolution: 'Lỗi nhỏ ở đế', refundAmount: l.price }).expect(422);
    const [b0, s0] = [await balance(lan), await balance(bao)];
    await api().post(`/api/admin/disputes/${d.id}/resolve`).set(auth(admin.token)).send({ outcome: 'partial', resolution: 'Lỗi nhỏ ở đế', refundAmount: 100_000 }).expect(200);
    expect(await balance(lan)).toBe(b0 + 100_000);
    expect(await balance(bao)).toBe(s0 + (l.price - 100_000) - Math.round((l.price - 100_000) * 0.04));
    const after = (await api().get(`/api/orders/${o.id}`).set(auth(lan.token)).expect(200)).body;
    expect(after).toMatchObject({ status: 'completed', refundAmount: 100_000, dispute: { status: 'resolved_partial', remedy: 'partial' } });
  });

  it('trả hàng rồi mới hoàn tiền: người mua gửi trả → người bán nhận lại → hoàn tiền', async () => {
    const { o, d, l } = await disputed(lan, tam, 'Nồi cơm điện');
    const b0 = await balance(lan);
    await api().post(`/api/admin/disputes/${d.id}/resolve`).set(auth(admin.token)).send({ outcome: 'return', resolution: 'Nồi bị móp, trả hàng để hoàn tiền' }).expect(200);
    expect((await api().get(`/api/orders/${o.id}`).set(auth(lan.token))).body.status).toBe('return_pending');
    expect(await balance(lan)).toBe(b0);
    await api().post(`/api/orders/${o.id}/return/received`).set(auth(tam.token)).expect(409);
    await api().post(`/api/orders/${o.id}/return`).set(auth(lan.token)).send({ carrier: 'GHTK', trackingCode: 'S1234567' }).expect(200);
    await api().post(`/api/orders/${o.id}/return/received`).set(auth(lan.token)).expect(403);
    const done = (await api().post(`/api/orders/${o.id}/return/received`).set(auth(tam.token)).expect(200)).body;
    expect(done).toMatchObject({ status: 'refunded', returnInfo: { carrier: 'GHTK', trackingCode: 'S1234567' } });
    expect(await balance(lan)).toBe(b0 + l.price);
  });

  it('không gửi trả trong hạn thì đơn hoàn tất cho người bán; gửi trả mà người bán im lặng 7 ngày thì tự hoàn tiền', async () => {
    const a = await disputed(lan, ha, 'Tai nghe Sony');
    const b = await disputed(lan, ha, 'Bàn phím cơ Akko');
    for (const x of [a, b]) {
      await api().post(`/api/admin/disputes/${x.d.id}/resolve`).set(auth(admin.token)).send({ outcome: 'return', resolution: 'Trả hàng để đối chiếu' }).expect(200);
    }
    await api().post(`/api/orders/${b.o.id}/return`).set(auth(lan.token)).send({ carrier: 'Gặp trực tiếp' }).expect(200);
    const b0 = await balance(lan);
    await runJobs(new Date(Date.now() + 8 * 86_400_000));
    expect((await api().get(`/api/orders/${a.o.id}`).set(auth(lan.token))).body.status).toBe('completed');
    expect((await api().get(`/api/orders/${b.o.id}`).set(auth(lan.token))).body.status).toBe('refunded');
    expect(await balance(lan)).toBe(b0 + b.l.price);
  });
});

describe('Ví & trả sau', () => {
  it('rút tiền về ngân hàng đã xác thực, có mức tối thiểu', async () => {
    await api().post('/api/me/wallet/withdraw').set(auth(huy.token)).send({ amount: 100_000 }).expect(422);
    await api().post('/api/me/wallet/withdraw').set(auth(bao.token)).send({ amount: 10_000 }).expect(422);
    const b0 = await balance(bao);
    const w = (await api().post('/api/me/wallet/withdraw').set(auth(bao.token)).send({ amount: 200_000 }).expect(201)).body;
    expect(w).toMatchObject({ amount: 200_000, status: 'paid' });
    expect(w.bankLast4).toMatch(/^\d{4}$/);
    const wallet = (await api().get('/api/me/wallet').set(auth(bao.token)).expect(200)).body;
    expect(wallet.balance).toBe(b0 - 200_000);
    expect(wallet.withdrawals[0].reference).toBe(w.reference);
    await api().post('/api/me/wallet/withdraw').set(auth(bao.token)).send({ amount: wallet.balance + 1 }).expect(422);
  });

  it('trả trễ quá 3 ngày cộng phí 30.000đ; tất toán sớm trả hết các kỳ còn lại', async () => {
    const l = await listingByTitle('Loa bluetooth');
    const o = (await order(lan, l.id, { ...ship, method: 'bnpl', term: 3 }).expect(201)).body;
    const plan = (await api().get('/api/me').set(auth(lan.token))).body.plans.find((p) => p.orderId === o.id);
    const [k1] = plan.installments;
    const b0 = await balance(lan);
    const late = (await api().post(`/api/dev/installments/${k1.id}/pay-late`).set(auth(lan.token)).send({ daysLate: 5 }).expect(200)).body;
    expect(late.lateFee).toBe(LATE_FEE);
    expect(await balance(lan)).toBe(b0 - k1.amount - LATE_FEE);
    const rest = plan.installments.slice(1).reduce((s, i) => s + i.amount, 0);
    const payoff = (await api().post(`/api/installments/plans/${plan.id}/payoff`).set(auth(lan.token)).expect(200)).body;
    expect(payoff).toMatchObject({ paid: rest, lateFees: 0, installments: 2 });
    expect(await balance(lan)).toBe(b0 - k1.amount - LATE_FEE - rest);
    await api().post(`/api/installments/plans/${plan.id}/payoff`).set(auth(lan.token)).expect(409);
    const after = (await api().get('/api/me').set(auth(lan.token))).body.plans.find((p) => p.id === plan.id);
    expect(after.status).toBe('paid_off');
  });
});

describe('Hoàn tiền an toàn', () => {
  it('từ chối nhận: tiền giữ tới khi người bán nhận lại hàng, rồi mới hoàn và mở bán lại', async () => {
    const l = await listingByTitle('Đèn học chống cận');
    const b0 = await balance(lan);
    const o = (await order(lan, l.id, ship).expect(201)).body;
    await api().post(`/api/orders/${o.id}/ship`).set(auth(tam.token)).send({ carrier: 'GHN', trackingCode: 'GHN11112222' }).expect(200);
    const refused = (await api().post(`/api/orders/${o.id}/refuse`).set(auth(lan.token)).expect(200)).body;
    expect(refused).toMatchObject({ status: 'refused_by_buyer', payoutStatus: 'held' });
    expect(await balance(lan)).toBe(b0 - l.price);
    await api().post(`/api/orders/${o.id}/return/received`).set(auth(lan.token)).expect(403);
    const back = (await api().post(`/api/orders/${o.id}/return/received`).set(auth(tam.token)).expect(200)).body;
    expect(back).toMatchObject({ status: 'refused_by_buyer', payoutStatus: 'refunded' });
    expect(await balance(lan)).toBe(b0);
    expect((await pool.query('SELECT status FROM listings WHERE id=$1', [l.id])).rows[0].status).toBe('active');
    await api().post(`/api/orders/${o.id}/return/received`).set(auth(tam.token)).expect(409);
  });

  it('người bán không gửi hàng: người mua tự huỷ khi quá hạn; quá thêm 2 ngày thì ReOwn tự huỷ và hoàn tiền', async () => {
    const [a, b] = [await listingByTitle('Ấm siêu tốc'), await listingByTitle('Balo laptop')];
    const b0 = await balance(lan);
    const oa = (await order(lan, a.id, ship).expect(201)).body;
    const ob = (await order(lan, b.id, ship).expect(201)).body;
    expect(new Date(oa.shipBy) - new Date(oa.createdAt)).toBe(SHIP_DEADLINE_DAYS * 86_400_000);
    await api().post(`/api/orders/${oa.id}/cancel-overdue`).set(auth(lan.token)).expect(409);
    await api().post(`/api/orders/${oa.id}/cancel-overdue`).set(auth(bao.token)).expect(403);
    await pool.query("UPDATE orders SET created_at = created_at - interval '4 days' WHERE id = ANY($1::uuid[])", [[oa.id, ob.id]]);
    const ca = (await api().post(`/api/orders/${oa.id}/cancel-overdue`).set(auth(lan.token)).expect(200)).body;
    expect(ca).toMatchObject({ status: 'cancelled_by_seller', payoutStatus: 'refunded' });
    // Đơn thứ hai mới quá hạn 1 ngày (< 2 ngày ân hạn): tác vụ định kỳ chưa huỷ
    expect((await runJobs()).overdueCancelled).toBe(0);
    await pool.query("UPDATE orders SET created_at = created_at - interval '2 days' WHERE id=$1", [ob.id]);
    expect((await runJobs()).overdueCancelled).toBe(1);
    expect((await api().get(`/api/orders/${ob.id}`).set(auth(lan.token))).body.status).toBe('cancelled_by_seller');
    expect(await balance(lan)).toBe(b0);
  });
});
