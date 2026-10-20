import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react';
import { PAST_ORDERS, EXTRA_REVIEWER_SCORES } from '../data/mock.js';
import { scoreBuyer, scoreSeller, installmentSchedule, scanMessage } from '../../../../shared/scoring/engine.js';
import { blobToDataUrl } from '../lib/images.js';
import { Ctx, toastFor, useToast } from './shared.js';
import { WITHDRAW_MIN, HANDOVER_MAX_ATTEMPTS, lateFeeFor } from '../../../../shared/policy.js';
import { KEY, load, reducer, autoReply } from './mockReducer.js';

export default function MockStore({ children }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, load);
  const [toast, setToast] = useToast();
  const latest = useRef(state);
  useLayoutEffect(() => { latest.current = state; });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {
      if (e?.name === 'QuotaExceededError') setToast('Bộ nhớ trình duyệt đã đầy — tin vừa đăng sẽ mất khi tải lại trang. Hãy đăng ít ảnh hơn.');
    }
  }, [state, setToast]);

  const dispatch = useCallback(async (a) => {
    const st = latest.current;
    const me = st.users.find((u) => u.id === st.currentUserId);
    if (a.type === 'payInstallment' && a.mode !== 'default') {
      const inst = st.plans.find((p) => p.id === a.planId)?.installments.find((i) => i.n === a.n);
      if (inst && me.finance.savings < inst.amount + (a.mode === 'onTime' || a.mode === 'clearDefault' ? lateFeeFor(inst.due) : 0)) { setToast(`Ví còn ${me.finance.savings.toLocaleString('vi-VN')}₫, chưa đủ trả kỳ này. Nạp thêm ở mục Ví.`); return false; }
    }
    if (a.type === 'addListing' && a.photos?.length) {
      a = { ...a, product: { ...a.product, images: await Promise.all(a.photos.map((p) => blobToDataUrl(p.blob))) } };
      a.onProgress?.(a.photos.length, a.photos.length);
    }
    if (a.type === 'editListing' && a.photos) {
      a = { ...a, product: { ...a.product, images: await Promise.all(a.photos.map((p) => (p.blob ? blobToDataUrl(p.blob) : p.url))) } };
    }
    if (a.type === 'openDispute') {
      if (!a.photos?.length) { setToast('Cần ít nhất 1 ảnh chụp tình trạng hàng'); return false; }
      a = { ...a, evidence: await Promise.all(a.photos.map((p) => blobToDataUrl(p.blob))) };
    }
    if (a.type === 'respondDispute') {
      a = { ...a, evidence: await Promise.all((a.photos || []).map((p) => blobToDataUrl(p.blob))) };
    }
    if (a.type === 'handover') {
      const o = st.orders.find((x) => x.id === a.orderId);
      if (!o) return false;
      if ((o.handoverAttempts || 0) >= HANDOVER_MAX_ATTEMPTS) { setToast('Nhập sai quá nhiều lần — nhờ người mua bấm "Đã nhận hàng"'); return false; }
      if (a.code !== o.handoverCode) {
        rawDispatch(a);
        const left = HANDOVER_MAX_ATTEMPTS - (o.handoverAttempts || 0) - 1;
        setToast(left > 0 ? `Mã không đúng, còn ${left} lần thử` : 'Mã không đúng — đã hết lượt thử');
        return false;
      }
    }
    if (a.type === 'withdraw') {
      if (!me.verify.bank) { setToast('Xác thực tài khoản ngân hàng trước khi rút tiền'); return false; }
      if (!(a.amount >= WITHDRAW_MIN)) { setToast(`Số tiền rút tối thiểu ${WITHDRAW_MIN.toLocaleString('vi-VN')}₫`); return false; }
      if (a.amount > me.finance.savings) { setToast('Số dư ví không đủ'); return false; }
    }
    if (a.type === 'payoff') {
      const plan = st.plans.find((p) => p.id === a.planId);
      const need = plan ? plan.installments.filter((i) => i.status !== 'paid').reduce((sum, i) => sum + i.amount + lateFeeFor(i.due), 0) : 0;
      if (me.finance.savings < need) { setToast(`Cần ${need.toLocaleString('vi-VN')}₫ để tất toán, ví còn ${me.finance.savings.toLocaleString('vi-VN')}₫`); return false; }
    }
    if (a.type === 'placeOrder') {
      const need = a.method === 'full' ? a.product.price : installmentSchedule(a.product.price, a.method, a.downRate || 0).down;
      if (me.finance.savings < need) { setToast('Số dư ví không đủ'); return false; }
    }
    rawDispatch(a);
    const msg = toastFor(a);
    if (msg) setToast(msg);
    return true;
  }, [setToast]);

  useEffect(() => {
    rawDispatch({ type: 'remind' });
    const t = setInterval(() => rawDispatch({ type: 'remind' }), 60_000);
    return () => clearInterval(t);
  }, []);

  const chat = useMemo(() => {
    const st = () => latest.current;
    const summary = (c, uid) => {
      const s = st();
      const p = s.products.find((x) => x.id === c.listingId) || {};
      const otherId = uid === c.buyerId ? c.sellerId : c.buyerId;
      const other = s.users.find((u) => u.id === otherId);
      const readAt = uid === c.buyerId ? c.buyerRead : c.sellerRead;
      const msgs = s.messages.filter((m) => m.conversationId === c.id);
      const last = msgs[msgs.length - 1];
      return {
        id: c.id, role: uid === c.buyerId ? 'buyer' : 'seller', lastMessageAt: c.lastMessageAt,
        unread: msgs.filter((m) => m.sender_id !== uid && m.created_at > readAt).length,
        last: last ? { body: last.body, mine: last.sender_id === uid } : null,
        other: { id: otherId, name: other?.name || 'Người dùng' },
        listing: { id: p.id || c.listingId, title: p.title || 'Tin đã gỡ', price: p.price, status: p.sold ? 'sold' : p.id ? 'active' : 'hidden', category: p.category, icon: p.icon, cover: p.cover, images: p.images || [] },
      };
    };
    return {
      async list() {
        const s = st(), uid = s.currentUserId;
        return s.conversations.filter((c) => (c.buyerId === uid || c.sellerId === uid) && c.lastMessageAt)
          .sort((a, b) => b.lastMessageAt - a.lastMessageAt).map((c) => summary(c, uid));
      },
      async open(listingId) {
        const s = st(), uid = s.currentUserId;
        const p = s.products.find((x) => x.id === listingId);
        if (!p) throw new Error('Không tìm thấy tin đăng');
        if (p.sellerId === uid) throw new Error('Đây là tin của bạn');
        const id = `c_${listingId}_${uid}`;
        rawDispatch({ type: 'openConv', id, listingId, buyerId: uid, sellerId: p.sellerId });
        return id;
      },
      async thread(id, after = 0) {
        const s = st(), uid = s.currentUserId;
        const c = s.conversations.find((x) => x.id === id && (x.buyerId === uid || x.sellerId === uid));
        if (!c) throw new Error('Không tìm thấy cuộc trò chuyện');
        const readAt = uid === c.buyerId ? c.buyerRead : c.sellerRead;
        if (s.messages.some((m) => m.conversationId === id && m.sender_id !== uid && m.created_at > readAt)) rawDispatch({ type: 'readConv', id, userId: uid });
        return { conversation: summary(c, uid), messages: s.messages.filter((m) => m.conversationId === id && m.id > after) };
      },
      async send(id, body) {
        const s = st(), uid = s.currentUserId;
        const text = body.trim().slice(0, 1000);
        const scan = scanMessage(text);
        if (scan.blocked) throw new Error('Không gửi được: tin nhắn yêu cầu chuyển khoản / đặt cọc ngoài ReOwn. Mọi thanh toán phải đi qua ReOwn để được giữ tiền hộ.');
        rawDispatch({ type: 'sendMsg', id, senderId: uid, body: text, flags: scan.flags });
        const c = s.conversations.find((x) => x.id === id);
        const other = c && (uid === c.buyerId ? c.sellerId : c.buyerId);
        if (other && !s.users.find((u) => u.id === other)?.demo) {
          setTimeout(() => rawDispatch({ type: 'sendMsg', id, senderId: other, body: autoReply(text), auto: true }), 1200);
        }
        return true;
      },
    };
  }, []);

  const notes = useMemo(() => ({
    async list() {
      const s = latest.current;
      const items = s.notifications.filter((n) => n.userId === s.currentUserId).slice(0, 30)
        .map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, read: n.read, created_at: n.createdAt }));
      return { items, unread: items.filter((n) => !n.read).length };
    },
    async markRead(ids) { rawDispatch({ type: 'readNotes', ids }); },
  }), []);

  const admin = useMemo(() => {
    const st = () => latest.current;
    const nameOf = (id, fallback) => st().users.find((u) => u.id === id)?.name || fallback || 'Người dùng';
    const disputeRow = (o) => ({
      id: o.id, order_id: o.id, reason: o.dispute.reason, status: o.dispute.status, resolution: o.dispute.resolution || null,
      created_at: o.dispute.openedAt || o.createdAt, resolved_at: o.dispute.resolvedAt || null, price: o.price,
      method: o.method === 'full' ? 'full' : 'bnpl', term: o.method === 'full' ? null : o.method, order_created_at: o.createdAt,
      buyer_name: o.buyerName || nameOf(o.buyerId), seller_name: nameOf(o.sellerId), title: o.title,
      category: o.category || st().products.find((p) => p.id === o.productId)?.category, icon: o.icon, cover: st().products.find((p) => p.id === o.productId)?.cover, images: [], evidence: o.dispute.evidence || [],
      seller_evidence: o.dispute.sellerEvidence || [], seller_response: o.dispute.sellerResponse || null, seller_responded_at: o.dispute.sellerRespondedAt || null,
      respond_by: o.dispute.respondBy || null, remedy: o.dispute.remedy || null, refund_amount: o.dispute.refundAmount || null,
      delivery: o.delivery, carrier: o.carrier, tracking_code: o.trackingCode, shipped_at: o.shippedAt, completed_at: o.completedAt,
      chat: (() => {
        const conv = st().conversations.find((c) => c.listingId === o.productId && c.buyerId === o.buyerId);
        return conv ? st().messages.filter((m) => m.conversationId === conv.id).slice(-30).map((m) => ({ from: m.sender_id === o.buyerId ? 'buyer' : 'seller', body: m.body, flagged: (m.flags || []).length > 0, at: m.created_at })) : [];
      })(),
    });
    return {
      async mfa() { rawDispatch({ type: 'adminMfa' }); return true; },
      async disputes(status = 'open') {
        return st().orders.filter((o) => o.dispute && (status === 'all' || o.dispute.status === 'open')).map(disputeRow);
      },
      async resolve(id, outcome, resolution, refundAmount) { rawDispatch({ type: 'adminResolve', orderId: id, outcome, resolution, refundAmount }); setToast('Đã xử lý tranh chấp'); },
      async hide(id, reason) { rawDispatch({ type: 'adminHide', id, reason }); setToast('Đã gỡ tin và báo người bán'); },
    };
  }, [setToast]);

  const inbox = useMemo(() => {
    const uid = state.currentUserId;
    if (!uid) return { notifications: 0, chats: 0 };
    const convs = state.conversations.filter((c) => c.buyerId === uid || c.sellerId === uid);
    const chats = convs.reduce((n, c) => {
      const readAt = uid === c.buyerId ? c.buyerRead : c.sellerRead;
      return n + state.messages.filter((m) => m.conversationId === c.id && m.sender_id !== uid && m.created_at > readAt).length;
    }, 0);
    return { notifications: state.notifications.filter((n) => n.userId === uid && !n.read).length, chats };
  }, [state.currentUserId, state.notifications, state.conversations, state.messages]);

  const derived = useMemo(() => {
    const buyerScores = Object.fromEntries(state.users.map((u) => [u.id, scoreBuyer(u, state.plans)]));
    const lookup = (id) => buyerScores[id]?.score ?? EXTRA_REVIEWER_SCORES[id] ?? 50;
    const sellerScores = Object.fromEntries(state.users.map((u) => [u.id, scoreSeller(u, lookup)]));
    const me = state.users.find((u) => u.id === state.currentUserId) || null;
    const byId = Object.fromEntries(state.users.map((u) => [u.id, u]));
    return { buyerScores, sellerScores, me, userById: (id) => byId[id] };
  }, [state.users, state.plans, state.currentUserId]);

  const value = useMemo(() => ({
    mode: 'mock', devTools: true, ready: true,
    state: { ...state, sellerOrders: state.orders.filter((o) => o.sellerId === state.currentUserId), toast },
    dispatch, ...derived, pastOrders: PAST_ORDERS, users: state.users,
    chat, notes, inbox, refreshInbox: () => {}, admin,
    walletInfo: async () => {
      const u = latest.current.users.find((x) => x.id === latest.current.currentUserId);
      return { entries: [], withdrawals: u?.withdrawals || [], bankLast4: u?.verify.bank ? '6789' : null };
    },
  }), [state, toast, dispatch, derived, chat, notes, inbox, admin]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
