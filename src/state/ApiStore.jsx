import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as client from '../api/client.js';
import { Ctx, DAY, LATE_DAYS, toastFor, useToast } from './shared.js';

const toProduct = (l) => ({ ...l, sold: l.status !== 'active' });

function normalizePlans(plans) {
  const now = Date.now();
  return plans.filter((p) => p.status !== 'cancelled').map((p) => ({
    ...p,
    installments: p.installments.map((i) => {
      const due = new Date(i.due).getTime();
      const status = i.paidAt ? 'paid' : now - due > 30 * DAY ? 'overdue' : 'due';
      return { ...i, due, status };
    }),
  }));
}

const NO_INBOX = { notifications: 0, chats: 0 };

export default function ApiStore({ children }) {
  const [data, setData] = useState({ me: null, products: [], sellers: {}, sellerScores: {}, plans: [], orders: [], sellerOrders: [], myListings: [] });
  const [ready, setReady] = useState(false);
  const [devTools, setDevTools] = useState(false);
  const [demo, setDemo] = useState(false);
  const [toast, setToast] = useToast();
  const loggedIn = useRef(false);

  const reload = useCallback(async (prefetched) => {
    const listings = await (prefetched ?? client.api('/listings?limit=100'));
    const sellers = {}, sellerScores = {};
    listings.forEach((l) => { sellers[l.sellerId] = l.seller; sellerScores[l.sellerId] = l.sellerScore; });
    const next = { me: null, products: listings.map(toProduct), sellers, sellerScores, plans: [], orders: [], sellerOrders: [], myListings: [] };
    if (loggedIn.current) {
      try {
        const [me, orders, sellerOrders, mine] = await Promise.all([
          client.api('/me'), client.api('/me/orders?role=buyer'), client.api('/me/orders?role=seller'), client.api('/me/listings'),
        ]);
        next.me = { ...me.profile, buyerScore: me.buyerScore, sellerScore: me.sellerScore, bnpl: me.bnpl };
        next.plans = normalizePlans(me.plans);
        next.orders = orders;
        next.sellerOrders = sellerOrders;
        next.myListings = mine.map(toProduct);
        sellers[me.profile.id] = { id: me.profile.id, name: me.profile.name, school: me.profile.school };
        sellerScores[me.profile.id] = me.sellerScore;
        const ids = new Set(next.products.map((p) => p.id));
        next.products = [...next.products, ...next.myListings.filter((p) => !ids.has(p.id))];
      } catch (e) {
        if (e.status === 401) loggedIn.current = false; else throw e;
      }
    }
    setData(next);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const listings = client.api('/listings?limit=100');
        listings.catch(() => {});
        const [h, user] = await Promise.all([client.api('/health'), client.refreshSession()]);
        setDevTools(!!h.devTools);
        setDemo(!!h.demo);
        loggedIn.current = !!user;
        await reload(listings);
      } catch {
        setToast('Không kết nối được máy chủ ReOwn');
      } finally {
        setReady(true);
      }
    })();
  }, [reload, setToast]);

  const [inbox, setInbox] = useState({ notifications: 0, chats: 0 });
  const seenNotes = useRef(null);
  const refreshInbox = useCallback(() => (loggedIn.current ? client.api('/me/inbox').then((next) => {
    setInbox(next);
    if (seenNotes.current != null && next.notifications > seenNotes.current) reload().catch(() => {});
    seenNotes.current = next.notifications;
  }, () => {}) : Promise.resolve()), [reload]);
  useEffect(() => {
    seenNotes.current = null;
    refreshInbox();
    // Tab ẩn thì ngừng hỏi máy chủ: đỡ tốn lượt gọi serverless và để Neon được "ngủ" (gói Free tính theo giờ thức)
    const t = setInterval(() => { if (!document.hidden) refreshInbox(); }, 20_000);
    const onVisible = () => { if (!document.hidden) refreshInbox(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [refreshInbox, data.me?.id]);

  const chat = useMemo(() => ({
    list: () => client.api('/conversations'),
    open: async (listingId) => (await client.api('/conversations', { method: 'POST', body: { listingId } })).conversation.id,
    thread: (id, after = 0) => client.api(`/conversations/${id}/messages?after=${after}`),
    send: async (id, body) => {
      try { return await client.api(`/conversations/${id}/messages`, { method: 'POST', body: { body } }); } catch (e) {
        throw new Error(e.details?.reasons?.[0] ? `${e.message}. ${e.details.reasons[0]}` : e.message);
      }
    },
  }), []);
  const notes = useMemo(() => ({
    list: () => client.api('/me/notifications'),
    markRead: async (ids) => { await client.api('/me/notifications/read', { method: 'POST', body: ids ? { ids } : {} }); refreshInbox(); },
  }), [refreshInbox]);

  const admin = useMemo(() => {
    const call = (path, opts) => client.api('/admin' + path, opts);
    const act = async (path, body, msg) => { await call(path, { method: 'POST', body }); if (msg) setToast(msg); };
    return {
      async mfa(code) { const r = await call('/mfa', { method: 'POST', body: { code } }); client.setAccessToken(r.accessToken); return true; },
      disputes: (status = 'open') => call(`/disputes?status=${status}`),
      resolve: (id, outcome, resolution, refundAmount) => act(`/disputes/${id}/resolve`, { outcome, resolution, ...(outcome === 'partial' ? { refundAmount } : {}) }, 'Đã xử lý tranh chấp'),
      hide: async (id, reason) => { await act(`/listings/${id}/hide`, reason ? { reason } : {}, 'Đã gỡ tin và báo người bán'); await reload(); },
    };
  }, [setToast, reload]);

  const findInstallment = (planId, n) => data.plans.find((p) => p.id === planId)?.installments.find((i) => i.n === n);

  const dispatch = useCallback(async (a) => {
    try {
      switch (a.type) {
        case 'afterLogin': loggedIn.current = true; break;
        case 'logout': await client.logout(); loggedIn.current = false; break;
        case 'updateFinance':
          if (a.finance.monthlyIncome != null) await client.api('/me', { method: 'PATCH', body: { monthlyIncome: a.finance.monthlyIncome } });
          break;
        case 'verify':
          await client.api(`/me/verifications/${a.key}`, { method: 'POST', body: a.data });
          break;
        case 'topup':
          await client.api('/dev/wallet/topup', { method: 'POST', body: { amount: a.amount } });
          break;
        case 'placeOrder': {
          const delivery = a.delivery === 'meetup' ? { delivery: 'meetup', ...(a.meetupNote ? { meetupNote: a.meetupNote } : {}) } : { delivery: 'ship', shipTo: a.shipTo };
          const body = { ...delivery, ...(a.method === 'full' ? { listingId: a.product.id, method: 'full' } : { listingId: a.product.id, method: 'bnpl', term: a.method }) };
          await client.api('/orders', { method: 'POST', body, headers: { 'Idempotency-Key': a.idempotencyKey } });
          break;
        }
        case 'shipOrder': await client.api(`/orders/${a.orderId}/ship`, { method: 'POST', body: a.carrier ? { carrier: a.carrier, trackingCode: a.trackingCode } : {} }); break;
        case 'handover': await client.api(`/orders/${a.orderId}/handover`, { method: 'POST', body: { code: a.code } }); break;
        case 'respondDispute': {
          const imageIds = [];
          for (const p of a.photos || []) imageIds.push((await client.uploadImage(p.blob)).id);
          await client.api(`/orders/${a.orderId}/dispute/respond`, { method: 'POST', body: { text: a.text, imageIds } });
          break;
        }
        case 'returnShip': await client.api(`/orders/${a.orderId}/return`, { method: 'POST', body: { carrier: a.carrier, ...(a.trackingCode ? { trackingCode: a.trackingCode } : {}) } }); break;
        case 'returnReceived': await client.api(`/orders/${a.orderId}/return/received`, { method: 'POST' }); break;
        case 'withdraw': await client.api('/me/wallet/withdraw', { method: 'POST', body: { amount: a.amount } }); break;
        case 'payoff': await client.api(`/installments/plans/${a.planId}/payoff`, { method: 'POST' }); break;
        case 'devShip': await client.api(`/dev/orders/${a.orderId}/simulate-ship`, { method: 'POST' }); break;
        case 'sellerCancel': await client.api(`/orders/${a.orderId}/cancel`, { method: 'POST' }); break;
        case 'confirmReceived':
          await client.api(`/orders/${a.orderId}/confirm`, { method: 'POST' });
          if (a.stars) await client.api(`/orders/${a.orderId}/review`, { method: 'POST', body: { stars: a.stars } });
          break;
        case 'bomOrder': await client.api(`/orders/${a.orderId}/refuse`, { method: 'POST' }); break;
        case 'cancelOverdue': await client.api(`/orders/${a.orderId}/cancel-overdue`, { method: 'POST' }); break;
        case 'openDispute': {
          const imageIds = [];
          for (const p of a.photos || []) imageIds.push((await client.uploadImage(p.blob)).id);
          await client.api(`/orders/${a.orderId}/dispute`, { method: 'POST', body: { reason: a.reason, imageIds } });
          break;
        }
        case 'review': await client.api(`/orders/${a.orderId}/review`, { method: 'POST', body: { stars: a.stars } }); break;
        case 'payInstallment': {
          const i = findInstallment(a.planId, a.n);
          if (a.mode === 'onTime' || a.mode === 'clearDefault') await client.api(`/installments/${i.id}/pay`, { method: 'POST' });
          else if (a.mode === 'default') await client.api(`/dev/installments/${i.id}/make-overdue`, { method: 'POST', body: { days: 35 } });
          else await client.api(`/dev/installments/${i.id}/pay-late`, { method: 'POST', body: { daysLate: LATE_DAYS[a.mode] } });
          break;
        }
        case 'editListing': {
          const imageIds = [];
          const photos = a.photos || [];
          for (const [i, p] of photos.entries()) {
            a.onProgress?.(i, photos.length);
            imageIds.push(p.blob ? (await client.uploadImage(p.blob)).id : p.url.split('/').pop());
          }
          await client.api(`/listings/${a.id}`, { method: 'PATCH', body: {
            title: a.product.title, category: a.product.category, price: a.product.price, condition: a.product.condition,
            description: a.product.description || '', location: a.product.location || '', ...(a.photos ? { imageIds } : {}),
          } });
          break;
        }
        case 'hideListing': await client.api(`/listings/${a.id}`, { method: 'DELETE' }); break;
        case 'devDueIn': {
          const i = findInstallment(a.planId, a.n);
          await client.api(`/dev/installments/${i.id}/due-in`, { method: 'POST', body: { days: a.days } });
          break;
        }
        case 'addListing': {
          const imageIds = [];
          for (const [i, p] of (a.photos || []).entries()) {
            a.onProgress?.(i, a.photos.length);
            imageIds.push((await client.uploadImage(p.blob)).id);
          }
          a.onProgress?.(imageIds.length, imageIds.length);
          await client.api('/listings', { method: 'POST', body: {
            title: a.product.title, category: a.product.category, price: a.product.price,
            condition: a.product.condition, description: a.product.description || undefined, location: a.product.location || undefined,
            ...(imageIds.length ? { imageIds } : {}),
          } });
          break;
        }
        default: return true;
      }
      await reload();
      refreshInbox();
      const msg = toastFor(a);
      if (msg) setToast(msg);
      return true;
    } catch (e) {
      const extra = e.details?.blockers?.[0] || e.details?.reasons?.[0] || e.details?.[0]?.message;
      setToast(extra ? `${e.message}: ${extra}` : e.message);
      return false;
    }
  }, [reload, setToast, data.plans]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => {
    const me = data.me;
    const buyerScores = me ? { [me.id]: me.buyerScore } : {};
    return {
      mode: 'api', devTools, demo, ready,
      state: { products: data.products, plans: data.plans, orders: data.orders, sellerOrders: data.sellerOrders, currentUserId: me?.id ?? null, toast },
      dispatch, me, buyerScores, sellerScores: data.sellerScores,
      userById: (id) => data.sellers[id] || { id, name: 'Người bán', school: '' },
      pastOrders: [], users: [], chat, notes, inbox: data.me ? inbox : NO_INBOX, refreshInbox, admin,
      walletInfo: async () => {
        const w = await client.api('/me/wallet');
        return { entries: w.entries, bankLast4: w.bankLast4, withdrawals: w.withdrawals.map((x) => ({ id: x.id, amount: x.amount, bankLast4: x.bank_last4, reference: x.reference, status: x.status, createdAt: x.created_at })) };
      },
    };
  }, [data, toast, dispatch, devTools, demo, ready, chat, notes, inbox, refreshInbox, admin]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

