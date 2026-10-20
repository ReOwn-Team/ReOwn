import { describe, it, expect } from 'vitest';
import { scoreBuyer, scoreSeller, bnplOffer, recommend, listingRisk, installmentSchedule, effectiveIncome, referencePrice, scanListingText } from './engine.js';
import { USERS, PRODUCTS, PAST_ORDERS, EXTRA_REVIEWER_SCORES } from '../../apps/web/src/data/mock.js';

const byId = (id) => structuredClone(USERS.find((u) => u.id === id));
const base = () => byId('u_lan');

describe('Điểm người mua', () => {
  it('luôn nằm trong 0–100 và tổng các phần = điểm', () => {
    for (const u of USERS) {
      const r = scoreBuyer(u);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      const sum = r.parts.reduce((s, p) => s + p.pts, 0);
      expect(Math.abs(Math.round(sum) - r.score)).toBeLessThanOrEqual(1);
      r.parts.forEach((p) => expect(p.pts).toBeLessThanOrEqual(p.max));
    }
  });

  it('người mới bắt đầu ở mức trung tính, không 0 cũng không tối đa', () => {
    const r = scoreBuyer(byId('u_minh'));
    const repay = r.parts.find((p) => p.key === 'repayment');
    expect(repay.pts).toBeCloseTo(21, 0);
  });

  it('thêm kỳ trả đúng hạn làm điểm tăng (đơn điệu)', () => {
    const u = byId('u_huy');
    const before = scoreBuyer(u).score;
    u.buyer.repayment.onTime += 5;
    expect(scoreBuyer(u).score).toBeGreaterThan(before);
  });

  it('trễ nặng bị phạt nhiều hơn trễ nhẹ', () => {
    const a = base(); a.buyer.repayment.late += 1;
    const b = base(); b.buyer.repayment.severe += 1;
    expect(scoreBuyer(b).score).toBeLessThan(scoreBuyer(a).score);
  });

  it('có nợ quá hạn đang mở => điểm bị khoá tối đa 30 và không được trả sau', () => {
    const u = base(); u.buyer.activeDefault = 1;
    expect(scoreBuyer(u).score).toBeLessThanOrEqual(30);
    expect(bnplOffer(u, 500_000).eligible).toBe(false);
  });

  it('DTI cao làm giảm điểm năng lực chi trả', () => {
    const u = base(); u.finance.otherDebtMonthly = 1_500_000;
    expect(scoreBuyer(u).parts.find((p) => p.key === 'capacity').pts).toBeLessThan(5);
  });
});

describe('Trả sau (BNPL)', () => {
  it('ví dụ trong đề án: 900k trả 3 kỳ = 300k/kỳ, 0% phí', () => {
    const o = bnplOffer(base(), 900_000).options.find((x) => x.term === 3);
    expect(o.monthly).toBe(300_000);
    expect(o.ok).toBe(true);
  });

  it('chưa xác thực CCCD thì không được trả sau', () => {
    const r = bnplOffer(byId('u_minh'), 900_000);
    expect(r.eligible).toBe(false);
    expect(r.blockers.join()).toMatch(/CCCD/);
  });

  it('kỳ góp không vượt 30% thu nhập còn trống', () => {
    const u = base(); u.finance.monthlyIncome = 1_000_000;
    const r = bnplOffer(u, 1_500_000);
    expect(r.options.find((o) => o.term === 3).ok).toBe(false);
    expect(r.options.find((o) => o.term === 6).ok).toBe(true);
  });

  it('không vượt hạn mức theo hạng', () => {
    expect(bnplOffer(base(), 7_000_000).eligible).toBe(false);
  });
});

const lookup = (id) => {
  const u = USERS.find((x) => x.id === id);
  return u ? scoreBuyer(u).score : EXTRA_REVIEWER_SCORES[id] ?? 50;
};

describe('Hồ sơ mỏng', () => {
  it('người mới điểm cao vẫn chỉ được hạn mức hạng C cho tới khi có 3 kỳ đúng hạn', () => {
    const u = byId('u_minh'); u.verify = { phone: true, cccd: true, bank: true, student: true };
    const o = bnplOffer(u, 900_000);
    expect(o.thinFile).toBe(true);
    expect(o.limit).toBe(2_000_000);
    expect(o.options.find((x) => x.term === 6).ok).toBe(false);
    u.buyer.repayment.onTime = 3;
    expect(bnplOffer(u, 900_000).thinFile).toBe(false);
  });
});

describe('Điểm người bán', () => {
  it('review 5★ từ tài khoản ảo không cứu được người bán lừa đảo', () => {
    const r = scoreSeller(byId('u_s4'), lookup);
    expect(r.tier.id).toBe('E');
    expect(r.adjAvg).toBeLessThan(4);
  });

  it('một đánh giá 5★ duy nhất không đưa người bán mới lên hạng A', () => {
    const u = byId('u_minh');
    u.seller.reviews = [{ by: 'u_lan', stars: 5 }]; u.seller.sales = 1;
    expect(scoreSeller(u, lookup).tier.id).not.toBe('A');
  });

  it('người bán lâu năm, không tranh chấp đạt hạng A', () => {
    expect(scoreSeller(byId('u_s1'), lookup).tier.id).toBe('A');
  });
});

describe('Chống lừa đảo & gợi ý', () => {
  it('cảnh báo tin giá thấp bất thường', () => {
    const s = scoreSeller(byId('u_s4'), lookup);
    expect(listingRisk(PRODUCTS.find((p) => p.id === 'p4'), s).level).toBe('high');
  });

  it('chỉ gợi ý món vừa túi tiền và không gợi ý người bán hạng E', () => {
    const sellerScores = Object.fromEntries(USERS.map((u) => [u.id, scoreSeller(u, lookup)]));
    const u = byId('u_minh');
    const r = recommend({ user: u, products: PRODUCTS, sellerScores, orders: PAST_ORDERS, income: 2_000_000, savings: 600_000 });
    expect(r.items.length).toBeGreaterThan(0);
    r.items.forEach((it) => {
      expect(it.product.sellerId).not.toBe('u_s4');
      expect(it.payFull || it.plans.length > 0).toBe(true);
      if (!it.plans.length) expect(it.product.price).toBeLessThanOrEqual(600_000);
    });
  });
});

describe('Giá tham chiếu & câu chữ lừa đảo', () => {
  it('bỏ qua giá "thị trường" người bán tự khai, dùng giá tham chiếu ReOwn', () => {
    const s = scoreSeller(byId('u_s1'), lookup);
    const p = { id: 'x', title: 'Laptop Dell Latitude 7490 i5', category: 'laptop', price: 1_500_000, desc: '' };
    const r = listingRisk(p, s);
    expect(r.ref.price).toBe(3_800_000);
    expect(r.flags.join()).toMatch(/Giá thấp bất thường/);
  });

  it('không có trong danh mục mẫu thì lấy trung vị tin tương tự (cần ít nhất 3)', () => {
    const peers = [1, 2, 3].map((i) => ({ id: 'q' + i, title: `Tủ nhựa Duy Tân 5 tầng ${i}`, category: 'home', price: 300_000 + i * 10_000 }));
    expect(referencePrice({ id: 'x', title: 'Tủ nhựa Duy Tân 4 tầng', category: 'home' }, peers).price).toBe(320_000);
    expect(referencePrice({ id: 'x', title: 'Tủ nhựa Duy Tân 4 tầng', category: 'home' }, peers.slice(0, 2))).toBeNull();
  });

  it('phát hiện yêu cầu chuyển khoản trước / liên hệ ngoài và chặn đăng', () => {
    const hits = scanListingText({ title: 'Bán iPhone', desc: 'Chuyển khoản trước giao sau, liên hệ Zalo 0912 345 678' });
    expect(hits.map((h) => h.code)).toEqual(expect.arrayContaining(['offplatform_pay', 'contact', 'phone']));
    const r = listingRisk({ title: 'Bán iPhone XR', desc: 'Cọc trước 200k giữ hàng', price: 3_000_000 }, scoreSeller(byId('u_s1'), lookup));
    expect(r.blocked).toBe(true);
    expect(r.level).toBe('high');
    expect(scanListingText({ title: 'Nồi cơm điện Sharp', desc: 'Nấu vừa cho 1–2 người.' })).toEqual([]);
  });
});

describe('Đánh giá: mỗi người mua một lượt', () => {
  it('mua đi mua lại 10 lần với 5★ không tăng điểm hơn 1 lần', () => {
    const one = byId('u_minh'); one.seller.reviews = [{ by: 'u_lan', stars: 5 }]; one.seller.sales = 1;
    const ten = byId('u_minh'); ten.seller.reviews = Array(10).fill({ by: 'u_lan', stars: 5 }); ten.seller.sales = 1;
    expect(scoreSeller(ten, lookup).parts.find((p) => p.key === 'rating').pts)
      .toBe(scoreSeller(one, lookup).parts.find((p) => p.key === 'rating').pts);
    expect(scoreSeller(ten, lookup).reviewCount).toBe(1);
  });

  it('lượt mới nhất của cùng người mua là lượt được tính', () => {
    const u = byId('u_minh'); u.seller.reviews = [{ by: 'u_lan', stars: 5 }, { by: 'u_lan', stars: 1 }];
    expect(scoreSeller(u, lookup).rawAvg).toBe(1);
  });
});

describe('Trần thu nhập & trả trước theo hạng', () => {
  it('thu nhập tự khai bị giới hạn 3 triệu, xác thực ngân hàng thì 8 triệu', () => {
    const u = byId('u_minh'); u.finance.monthlyIncome = 20_000_000;
    expect(effectiveIncome(u)).toBe(3_000_000);
    u.verify.bank = true;
    expect(effectiveIncome(u)).toBe(8_000_000);
  });

  it('khai thu nhập cao không mở thêm sức góp', () => {
    const u = byId('u_huy'); u.verify.bank = false; u.finance.monthlyIncome = 50_000_000;
    expect(bnplOffer(u, 900_000).monthlyRoom).toBeLessThanOrEqual(900_000);
  });

  it('lịch trả trước: 20% trả trước, phần còn lại chia kỳ, tổng khớp', () => {
    const s = installmentSchedule(1_000_000, 3, 0.2);
    expect(s.down).toBe(200_000);
    expect(s.financed).toBe(800_000);
    expect(s.amounts.reduce((a, b) => a + b, 0)).toBe(s.total);
    expect(s.total).toBe(800_000);
  });

  it('hồ sơ mỏng (hạng C) phải trả trước 20%, thiếu tiền ví thì không được', () => {
    const u = byId('u_minh'); u.verify.cccd = true; u.finance.savings = 100_000;
    const o = bnplOffer(u, 1_000_000).options.find((x) => x.term === 3);
    expect(o.down).toBe(200_000);
    expect(o.ok).toBe(false);
    expect(o.why.join()).toMatch(/trả trước/);
    u.finance.savings = 300_000;
    expect(bnplOffer(u, 1_000_000).options.find((x) => x.term === 3).ok).toBe(true);
  });

  it('hạng A không phải trả trước', () => {
    expect(bnplOffer(base(), 900_000).options[0].down).toBe(0);
  });
});

describe('Gợi ý đã cân lại', () => {
  const sellerScores = Object.fromEntries(USERS.map((u) => [u.id, scoreSeller(u, lookup)]));
  const run = (extra) => recommend({ user: byId('u_lan'), products: PRODUCTS, sellerScores, orders: PAST_ORDERS, income: 3_500_000, savings: 1_500_000, ...extra });

  it('đã chọn danh mục thì chỉ gợi ý đúng danh mục', () => {
    run({ category: 'phone' }).items.forEach((x) => expect(x.product.category).toBe('phone'));
  });

  it('không gợi ý tin nghi lừa đảo và mỗi danh mục tối đa 2 món khi chưa chọn nhu cầu', () => {
    const r = run();
    expect(r.items.find((x) => x.product.id === 'p4')).toBeUndefined();
    const count = {};
    r.items.forEach((x) => { count[x.product.category] = (count[x.product.category] || 0) + 1; });
    Object.values(count).forEach((c) => expect(c).toBeLessThanOrEqual(2));
  });

  it('không luôn đẩy món rẻ nhất lên đầu', () => {
    const r = run();
    const cheapest = Math.min(...r.items.map((x) => x.product.price));
    expect(r.items[0].product.price).toBeGreaterThan(cheapest);
  });
});
