import {
  BUYER_WEIGHTS as BW, BUYER_IDENTITY_POINTS, REPAYMENT_PRIOR, REPAYMENT_PENALTY, DTI,
  MAX_INSTALLMENT_SHARE, SELLER_WEIGHTS as SW, SELLER_IDENTITY_POINTS, RATING_PRIOR,
  MIN_REVIEWER_WEIGHT, BNPL_POLICY, BNPL_TERMS, DEFAULT_CAP, SELLER_POLICY,
  SUSPICIOUS_PRICE_RATIO, UNVERIFIED_SELLER_MAX_LISTINGS, THIN_FILE_MIN_ONTIME, THIN_FILE_TIER, tierOf,
  INCOME_CAP, DOWN_PAYMENT,
} from './config.js';
import { referencePrice, scanListingText, scanMessage, MESSAGE_FLAG_TEXT } from './reference.js';

export { referencePrice, scanListingText, scanMessage, MESSAGE_FLAG_TEXT };
export const ENGINE_VERSION = 'rule-v1.1';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

function monthlyObligations(user, plans = []) {
  const inApp = plans
    .filter((p) => p.userId === user.id)
    .reduce((s, p) => {
      const next = p.installments.find((i) => i.status !== 'paid');
      return s + (next ? next.amount : 0);
    }, 0);
  return inApp + (user.finance?.otherDebtMonthly || 0);
}

export function outstanding(user, plans = []) {
  return plans
    .filter((p) => p.userId === user.id)
    .reduce((s, p) => s + p.installments.filter((i) => i.status !== 'paid').reduce((a, i) => a + i.amount, 0), 0);
}

export function effectiveIncome(user) {
  const declared = user.finance?.monthlyIncome || 0;
  const cap = user.verify?.bank ? INCOME_CAP.bankVerified : INCOME_CAP.selfDeclared;
  return Math.min(declared, cap);
}

function identityPart(verify, table, weight) {
  const items = Object.entries(table).map(([k, pts]) => ({ key: k, pts, ok: !!verify?.[k] }));
  const pts = items.reduce((s, i) => s + (i.ok ? i.pts : 0), 0);
  return { pts: clamp(pts, 0, weight), items };
}

export function scoreBuyer(user, plans = []) {
  const reasons = [];
  const b = user.buyer || {};
  const r = b.repayment || { onTime: 0, late: 0, severe: 0, defaults: 0 };

  const id = identityPart(user.verify, BUYER_IDENTITY_POINTS, BW.identity);
  const idLabels = { phone: 'SĐT', cccd: 'CCCD', bank: 'Tài khoản ngân hàng', student: 'Thẻ sinh viên' };
  id.items.filter((i) => !i.ok).forEach((i) => reasons.push({ type: 'tip', text: `Xác thực ${idLabels[i.key]} để +${i.pts} điểm` }));

  const n = r.onTime + r.late + r.severe + r.defaults;
  const goodEq = r.onTime + r.late * REPAYMENT_PENALTY.late;
  const rate = (goodEq + REPAYMENT_PRIOR.good) / (n + REPAYMENT_PRIOR.good + REPAYMENT_PRIOR.bad);
  let repay = BW.repayment * rate - r.severe * REPAYMENT_PENALTY.severe - r.defaults * REPAYMENT_PENALTY.default;
  repay = clamp(repay, 0, BW.repayment);
  if (n === 0) reasons.push({ type: 'info', text: 'Chưa có lịch sử trả sau — đang dùng điểm khởi đầu trung tính (60%)' });
  if (r.onTime >= 3) reasons.push({ type: 'good', text: `${r.onTime} kỳ trả đúng hạn` });
  if (r.late) reasons.push({ type: 'warn', text: `${r.late} kỳ trả trễ 1–10 ngày` });
  if (r.severe) reasons.push({ type: 'bad', text: `${r.severe} kỳ trễ trên 10 ngày (−${r.severe * REPAYMENT_PENALTY.severe})` });
  if (r.defaults) reasons.push({ type: 'bad', text: `${r.defaults} khoản quá hạn >30 ngày (−${r.defaults * REPAYMENT_PENALTY.default})` });

  const orders = b.orders || 0;
  const boms = b.boms || 0;
  const bomRate = boms / Math.max(1, orders + boms);
  let behavior = (Math.min(orders, 10) / 10) * 8 + 12 * (1 - Math.min(1, bomRate * 4)) - (b.disputesLost || 0) * 3;
  behavior = clamp(behavior, 0, BW.behavior);
  if (boms) reasons.push({ type: 'bad', text: `Bom hàng ${boms} lần (tỉ lệ ${Math.round(bomRate * 100)}%)` });
  if (b.disputesLost) reasons.push({ type: 'bad', text: `Thua ${b.disputesLost} tranh chấp` });
  if (orders >= 5 && !boms) reasons.push({ type: 'good', text: `${orders} đơn hoàn tất, không bom hàng` });

  const income = effectiveIncome(user);
  if ((user.finance?.monthlyIncome || 0) > income) {
    reasons.push({ type: 'tip', text: user.verify?.bank
      ? `Thu nhập được tính tối đa ${fmt(INCOME_CAP.bankVerified)}/tháng`
      : `Thu nhập tự khai chỉ tính tối đa ${fmt(INCOME_CAP.selfDeclared)} — xác thực ngân hàng để tính tới ${fmt(INCOME_CAP.bankVerified)}` });
  }
  const obligations = monthlyObligations(user, plans);
  const dti = income > 0 ? obligations / income : null;
  let capacity;
  if (dti === null) {
    capacity = 5;
    reasons.push({ type: 'tip', text: 'Khai báo thu nhập hàng tháng để đánh giá đúng khả năng chi trả' });
  } else if (dti <= DTI.comfortable) capacity = BW.capacity;
  else capacity = BW.capacity * clamp(1 - (dti - DTI.comfortable) / (DTI.max - DTI.comfortable), 0, 1);
  if (dti !== null && dti > DTI.comfortable) reasons.push({ type: 'warn', text: `Nợ góp chiếm ${Math.round(dti * 100)}% thu nhập` });

  const months = user.accountAgeMonths || 0;
  const sr = b.sellerRatings || [];
  const srAvg = (sr.reduce((s, x) => s + x, 0) + 4 * 3) / (sr.length + 3);
  const tenure = clamp((Math.min(months, 12) / 12) * 3 + clamp((srAvg - 3) / 2, 0, 1) * 2, 0, BW.tenure);

  const parts = [
    { key: 'identity', label: 'Xác thực danh tính', pts: id.pts, max: BW.identity },
    { key: 'repayment', label: 'Lịch sử trả nợ', pts: repay, max: BW.repayment },
    { key: 'behavior', label: 'Hành vi mua', pts: behavior, max: BW.behavior },
    { key: 'capacity', label: 'Năng lực chi trả', pts: capacity, max: BW.capacity },
    { key: 'tenure', label: 'Thâm niên & đánh giá', pts: tenure, max: BW.tenure },
  ].map((p) => ({ ...p, pts: round1(p.pts) }));

  let score = Math.round(parts.reduce((s, p) => s + p.pts, 0));
  const hasActiveDefault = (b.activeDefault || 0) > 0;
  if (hasActiveDefault && score > DEFAULT_CAP) {
    score = DEFAULT_CAP;
    reasons.unshift({ type: 'bad', text: `Đang có khoản quá hạn >30 ngày — điểm bị khoá tối đa ${DEFAULT_CAP}` });
  }
  return { score, tier: tierOf(score), parts, reasons, dti, obligations };
}

export function bnplOffer(user, price, plans = [], buyerResult = scoreBuyer(user, plans)) {
  const { tier } = buyerResult;
  const thinFile = (user.buyer?.repayment?.onTime || 0) < THIN_FILE_MIN_ONTIME && tier.id < THIN_FILE_TIER;
  const policyTier = thinFile ? THIN_FILE_TIER : tier.id;
  const policy = BNPL_POLICY[policyTier];
  const downRate = DOWN_PAYMENT[policyTier] ?? 1;
  const blockers = [];
  if (!user.verify?.cccd) blockers.push('Cần xác thực CCCD để dùng trả sau');
  if ((user.buyer?.activeDefault || 0) > 0) blockers.push('Đang có khoản nợ quá hạn');
  if (policy.limit === 0) blockers.push(`Hạng ${tier.id} chỉ được trả thẳng — nâng điểm lên từ 50 để mở trả sau`);

  const used = outstanding(user, plans);
  const available = Math.max(0, policy.limit - used);
  const income = effectiveIncome(user);
  const monthlyRoom = Math.max(0, income * MAX_INSTALLMENT_SHARE - monthlyObligations(user, plans));
  const savings = user.finance?.savings || 0;

  const options = BNPL_TERMS.map(({ term, feeRate }) => {
    const sch = installmentSchedule(price, term, policy.limit ? downRate : 0);
    const monthly = sch.amounts[0] || 0;
    const why = [];
    if (term > policy.maxTerm) why.push(!policy.maxTerm ? 'Chưa đủ hạng' : thinFile ? `Cần ${THIN_FILE_MIN_ONTIME} kỳ trả đúng hạn để mở ${term} kỳ` : `Hạng ${tier.id} tối đa ${policy.maxTerm} kỳ`);
    if (sch.financed > available) why.push(`Vượt hạn mức còn lại (${fmt(available)})`);
    if (monthly > monthlyRoom) why.push(`Mỗi kỳ ${fmt(monthly)} vượt 30% thu nhập còn trống (${fmt(monthlyRoom)})`);
    if (sch.down > savings) why.push(`Cần trả trước ${fmt(sch.down)}, ví còn ${fmt(savings)}`);
    return { term, feeRate, down: sch.down, financed: sch.financed, total: sch.total, monthly, ok: blockers.length === 0 && why.length === 0, why };
  });
  return { eligible: blockers.length === 0 && options.some((o) => o.ok), blockers, options, limit: policy.limit, maxTerm: policy.maxTerm, thinFile, available, monthlyRoom, downRate: policy.limit ? downRate : null };
}

export function installmentSchedule(price, term, downRate = 0) {
  const t = BNPL_TERMS.find((x) => x.term === term);
  if (!t) throw new Error('Kỳ hạn không hỗ trợ');
  const down = Math.min(price, Math.ceil((price * downRate) / 1000) * 1000);
  const financed = price - down;
  const total = Math.round(financed * (1 + t.feeRate));
  const monthly = Math.ceil(total / term / 1000) * 1000;
  const amounts = Array.from({ length: term }, (_, i) => (i === term - 1 ? total - monthly * (term - 1) : monthly));
  return { down, financed, total, fee: total - financed, amounts };
}

export function scoreSeller(seller, lookupBuyerScore = () => 60) {
  const s = seller.seller || {};
  const reasons = [];

  const id = identityPart(seller.verify, SELLER_IDENTITY_POINTS, SW.identity);
  if (!seller.verify?.cccd) reasons.push({ type: 'warn', text: `Chưa xác thực CCCD — tối đa ${UNVERIFIED_SELLER_MAX_LISTINGS} tin đăng` });
  else reasons.push({ type: 'good', text: 'Đã xác thực CCCD' });

  const allReviews = s.reviews || [];
  const latestBy = new Map();
  allReviews.forEach((rv) => latestBy.set(rv.by, rv));
  const reviews = [...latestBy.values()];
  const dupes = allReviews.length - reviews.length;
  let wSum = 0, wStars = 0;
  reviews.forEach((rv) => {
    const w = Math.max(MIN_REVIEWER_WEIGHT, lookupBuyerScore(rv.by) / 100);
    wSum += w; wStars += w * rv.stars;
  });
  const avg = (wStars + RATING_PRIOR.mean * RATING_PRIOR.weight) / (wSum + RATING_PRIOR.weight);
  const rating = clamp(((avg - 1) / 4) * SW.rating, 0, SW.rating);
  const rawAvg = reviews.length ? reviews.reduce((a, r) => a + r.stars, 0) / reviews.length : null;
  if (reviews.length) reasons.push({ type: avg >= 4.2 ? 'good' : 'info', text: `${reviews.length} đánh giá xác thực, trung bình hiệu chỉnh ${avg.toFixed(2)}★` });
  if (dupes) reasons.push({ type: 'info', text: `${dupes} đánh giá lặp từ cùng người mua chỉ được tính một lần` });
  const lowWeight = reviews.filter((rv) => lookupBuyerScore(rv.by) < 40).length;
  if (lowWeight) reasons.push({ type: 'warn', text: `${lowWeight} đánh giá từ tài khoản uy tín thấp bị giảm trọng số` });

  const sales = s.sales || 0;
  const dRate = (s.disputesLost || 0) / (sales + 5);
  const dispute = clamp(SW.dispute * (1 - Math.min(1, dRate * 5)), 0, SW.dispute);
  if (s.disputesLost) reasons.push({ type: 'bad', text: `Thua ${s.disputesLost} tranh chấp "hàng không đúng mô tả"` });

  const onTimeRate = ((s.shippedOnTime || 0) + 4) / ((s.shipTotal || 0) + 5);
  const delivery = clamp(SW.delivery * onTimeRate - (s.cancels || 0) * 2, 0, SW.delivery);
  if (s.cancels) reasons.push({ type: 'warn', text: `Tự huỷ ${s.cancels} đơn đã nhận` });

  const activity = clamp((Math.min(sales, 20) / 20) * 6 + (Math.min(seller.accountAgeMonths || 0, 12) / 12) * 4, 0, SW.activity);
  if (sales >= 10) reasons.push({ type: 'good', text: `${sales} giao dịch thành công` });
  if (sales === 0) reasons.push({ type: 'info', text: 'Người bán mới — chưa có giao dịch' });

  const parts = [
    { key: 'identity', label: 'Xác thực danh tính', pts: id.pts, max: SW.identity },
    { key: 'rating', label: 'Đánh giá từ người mua', pts: rating, max: SW.rating },
    { key: 'dispute', label: 'Đúng mô tả / tranh chấp', pts: dispute, max: SW.dispute },
    { key: 'delivery', label: 'Giao hàng đúng hẹn', pts: delivery, max: SW.delivery },
    { key: 'activity', label: 'Hoạt động & thâm niên', pts: activity, max: SW.activity },
  ].map((p) => ({ ...p, pts: round1(p.pts) }));

  const score = Math.round(parts.reduce((a, p) => a + p.pts, 0));
  const tier = tierOf(score);
  return { score, tier, parts, reasons, policy: SELLER_POLICY[tier.id], rawAvg, adjAvg: avg, reviewCount: reviews.length };
}

export function listingRisk(product, sellerResult, peers = []) {
  const flags = [];
  const ref = referencePrice(product, peers);
  if (ref && product.price > 0 && product.price < ref.price * SUSPICIOUS_PRICE_RATIO)
    flags.push(`Giá thấp bất thường (${Math.round((product.price / ref.price) * 100)}% giá tham khảo ${fmt(ref.price)})`);
  const text = scanListingText(product);
  text.forEach((t) => flags.push(t.text));
  if (sellerResult?.tier?.id === 'E') flags.push('Người bán thuộc nhóm rủi ro cao');
  if (sellerResult && sellerResult.reviewCount === 0 && product.price > 3_000_000) flags.push('Người bán mới đăng món giá trị cao');
  const blocked = text.some((t) => t.severe);
  return { level: blocked || flags.length >= 2 ? 'high' : flags.length ? 'medium' : 'low', flags, blocked, ref };
}

export function recommend(ctx, topN = 5) {
  const { user, plans = [], products, sellerScores, orders = [], income, savings, category } = ctx;
  const u = { ...user, finance: { ...user.finance, monthlyIncome: income, savings } };
  const buyerRes = scoreBuyer(u, plans);
  const band = incomeBand(effectiveIncome(u));

  const catPop = {};
  orders.filter((o) => incomeBand(o.buyerIncome) === band).forEach((o) => { catPop[o.category] = (catPop[o.category] || 0) + 1; });
  const maxPop = Math.max(1, ...Object.values(catPop));

  const scored = [];
  for (const p of products) {
    if (p.sold || p.sellerId === user.id) continue;
    if (category && p.category !== category) continue;
    const sres = sellerScores[p.sellerId];
    if (!sres || sres.policy.boost === 0) continue;
    const risk = listingRisk(p, sres, products);
    if (risk.level === 'high') continue;

    const offer = bnplOffer(u, p.price, plans, buyerRes);
    const payFull = savings >= p.price;
    const okPlans = offer.options.filter((o) => o.ok);
    if (!payFull && okPlans.length === 0) continue;

    const burdens = [];
    if (payFull) burdens.push(p.price / Math.max(1, savings));
    okPlans.forEach((o) => burdens.push(o.monthly / Math.max(1, offer.monthlyRoom)));
    const burden = Math.min(...burdens);
    const fit = burden <= 0.7 ? 0.5 + burden / 1.4 : Math.max(0, 1 - (burden - 0.7) / 0.3);

    const ref = risk.ref;
    const value = ref ? clamp(0.5 + ((ref.price - p.price) / ref.price) * 2.5, 0, 1) : 0.5;
    const cond = p.condition / 100;
    const trust = sres.score / 100;
    const pop = (catPop[p.category] || 0) / maxPop;

    const raw = 0.3 * fit + 0.25 * trust + 0.2 * value + 0.15 * cond + 0.1 * pop;
    const match = Math.round(clamp(raw * 100 + (sres.policy.boost - 1) * 20 - (risk.level === 'medium' ? 8 : 0), 0, 99));

    const why = [];
    const best = okPlans[0];
    if (payFull) why.push(`Trả thẳng được: dùng ${Math.round((p.price / savings) * 100)}% tiền đang có`);
    if (best) why.push(`Trả sau ${best.term} kỳ: ${fmt(best.monthly)}/tháng${best.down ? `, trả trước ${fmt(best.down)}` : ''}`);
    if (ref && value > 0.6) why.push(`Rẻ hơn ${Math.round((1 - p.price / ref.price) * 100)}% giá tham khảo`);
    if (sres.tier.id <= 'B') why.push(`Người bán hạng ${sres.tier.id} (${sres.score} điểm)`);
    if (pop > 0.6) why.push('Được sinh viên cùng mức thu nhập mua nhiều');

    scored.push({ product: p, match, why, payFull, plans: okPlans, burden });
  }
  scored.sort((a, b) => b.match - a.match);

  let items = scored.slice(0, topN);
  if (!category) {
    const perCat = {}, picked = [], rest = [];
    for (const x of scored) {
      const c = x.product.category;
      if ((perCat[c] || 0) < 2 && picked.length < topN) { picked.push(x); perCat[c] = (perCat[c] || 0) + 1; } else rest.push(x);
    }
    items = [...picked, ...rest].slice(0, topN);
  }
  return { items, buyer: buyerRes, totalAffordable: scored.length };
}

export function incomeBand(income) {
  if (income < 1_500_000) return 'low';
  if (income < 3_000_000) return 'mid';
  return 'high';
}

export function fmt(v) {
  return Math.round(v).toLocaleString('vi-VN') + 'đ';
}
