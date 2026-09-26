import { useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import { bnplOffer, listingRisk, installmentSchedule } from '../../shared/scoring/engine.js';
import { CATEGORIES } from '../data/mock.js';
import { newIdempotencyKey } from '../api/client.js';
import Art from '../components/Art.jsx';
import Icon from '../components/Icon.jsx';
import AdminHide from '../components/AdminHide.jsx';
import { Breakdown, Reasons, TrustBadge, Stars, ProductCard, Empty } from '../components/ui.jsx';
import { money, discount, timeAgo, TIER_LABEL } from '../lib/format.js';

function Gallery({ p }) {
  const n = p.images?.length || 0;
  const [i, setI] = useState(0);
  const touch = useRef(null);
  const go = (d) => setI((x) => (x + d + n) % n);
  return (
    <div className="gallery">
      <div
        className="gallery-main"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (touch.current ?? 0); if (n > 1 && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); }}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }}
        tabIndex={n > 1 ? 0 : undefined}
        aria-roledescription={n > 1 ? 'thư viện ảnh' : undefined}
        aria-label={n > 1 ? `Ảnh ${i + 1} trên ${n}` : undefined}
      >
        <Art product={p} size="lg" index={i}><span className="cond">Mới {p.condition}%</span></Art>
        {n > 1 && <>
          <button type="button" className="gal-nav prev" onClick={() => go(-1)} aria-label="Ảnh trước"><Icon name="chevronLeft" size={20} /></button>
          <button type="button" className="gal-nav next" onClick={() => go(1)} aria-label="Ảnh sau"><Icon name="chevron" size={20} /></button>
          <span className="gal-count">{i + 1}/{n}</span>
        </>}
      </div>
      {n > 1 && (
        <div className="gallery-thumbs">
          {p.images.map((_, k) => (
            <button key={k} type="button" className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Xem ảnh ${k + 1}`} aria-current={k === i}>
              <Art product={p} size="xs" index={k} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SellerCard({ seller, sres, count, onChat, chatBusy }) {
  return (
    <section className="seller-card" aria-label="Người bán">
      <div className="sc-top">
        <span className="avatar lg">{seller.name.split(' ').pop()[0]}</span>
        <div className="sc-main">
          <strong>{seller.name}</strong>
          <span className="small muted">{seller.school}</span>
        </div>
        <div className="sc-acts">
          {onChat && <button type="button" className="btn btn-outline btn-sm" onClick={onChat} disabled={chatBusy}><Icon name="chat" size={16} /> Chat</button>}
          <Link to={`/shop/${seller.id}`} className="btn btn-outline btn-sm"><Icon name="shop" size={16} /> Xem shop</Link>
        </div>
      </div>
      <dl className="sc-stats">
        <div><dt>Uy tín</dt><dd><TrustBadge result={sres} long /></dd></div>
        <div><dt>Đánh giá</dt><dd>{sres.reviewCount ? <Stars value={sres.adjAvg} count={sres.reviewCount} /> : <span className="muted">Chưa có</span>}</dd></div>
        <div><dt>Đang bán</dt><dd>{count} món</dd></div>
        <div><dt>Nhận tiền</dt><dd>{sres.policy.escrowDays ? `sau ${sres.policy.escrowDays} ngày` : 'khi bạn xác nhận'}</dd></div>
      </dl>
      <details className="why-tier">
        <summary>Vì sao hạng {sres.tier.id}? <span className="muted">({sres.score}/100)</span></summary>
        <Breakdown parts={sres.parts} />
        <Reasons reasons={sres.reasons} />
      </details>
    </section>
  );
}

export default function Product() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, me, buyerScores, sellerScores, userById, dispatch, chat } = useStore();
  const [chatErr, setChatErr] = useState('');
  const [opening, setOpening] = useState(false);
  const [method, setMethod] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delivery, setDelivery] = useState('ship');
  const [shipTo, setShipTo] = useState(() => { try { return localStorage.getItem('reown-ship-to') || ''; } catch { return ''; } });
  const [meetupNote, setMeetupNote] = useState('');
  const [addrErr, setAddrErr] = useState('');
  const idemKey = useRef(null);
  const payRef = useRef(null);
  const p = state.products.find((x) => x.id === id);
  if (!p) return <Empty title="Không tìm thấy món này" action={<Link className="btn" to="/">Về trang chủ</Link>}>Tin có thể đã bị gỡ hoặc đường dẫn không đúng.</Empty>;

  const seller = userById(p.sellerId);
  const sres = sellerScores[p.sellerId];
  const risk = listingRisk(p, sres, state.products);
  const bres = me ? buyerScores[me.id] : null;
  const offer = me ? bnplOffer(me, p.price, state.plans, bres) : null;
  const canFull = me && me.finance.savings >= p.price;
  const own = me && me.id === p.sellerId;
  const isAdmin = me?.role === 'admin';
  const off = discount(p, risk.ref);
  const cat = CATEGORIES.find((c) => c.id === p.category);
  const related = state.products.filter((x) => !x.sold && x.id !== p.id && x.category === p.category).slice(0, 8);
  const sellerCount = state.products.filter((x) => !x.sold && x.sellerId === p.sellerId).length;

  const guestPlans = [3, 6].map((t) => { const s = installmentSchedule(p.price, t); return { term: t, monthly: s.amounts[0], total: s.total, down: 0, feeRate: s.fee / p.price, ok: false, why: [] }; });
  const choices = [
    { key: 'full', title: 'Trả thẳng', main: money(p.price), sub: me ? `Số dư ${money(me.finance.savings)}` : 'Thanh toán một lần', ok: !!canFull, why: me && !canFull ? ['Số dư chưa đủ'] : [] },
    ...(offer ? offer.options : guestPlans).map((o) => ({
      key: o.term, title: `Trả sau ${o.term} kỳ`, main: `${money(o.monthly)}/tháng`,
      sub: [o.down ? `Trả trước ${money(o.down)}` : null, o.feeRate ? `phí ${(o.feeRate * 100).toFixed(1)}%, tổng góp ${money(o.total)}` : 'không lãi'].filter(Boolean).join(' · '),
      ok: o.ok, why: offer?.blockers.length ? offer.blockers.slice(0, 1) : o.why,
    })),
  ];

  const openChat = async () => {
    if (!me) return nav('/dang-nhap', { state: { from: `/san-pham/${p.id}` } });
    setOpening(true);
    try { nav(`/tin-nhan/${await chat.open(p.id)}`); } catch (e) { setOpening(false); setChatErr(e.message); }
  };

  const place = async () => {
    if (delivery === 'ship' && shipTo.trim().length < 10) { setAddrErr('Nhập họ tên, số điện thoại và địa chỉ nhận hàng (ít nhất 10 ký tự)'); return; }
    setBusy(true);
    if (delivery === 'ship') { try { localStorage.setItem('reown-ship-to', shipTo.trim()); } catch { /* bộ nhớ bị chặn */ } }
    const ok = await dispatch({ type: 'placeOrder', product: p, method, downRate: offer?.downRate || 0, idempotencyKey: idemKey.current,
      delivery, shipTo: delivery === 'ship' ? shipTo.trim() : undefined, meetupNote: delivery === 'meetup' ? meetupNote.trim() : undefined });
    setBusy(false);
    if (ok) nav('/tai-khoan?tab=don-mua');
  };
  const startBuy = () => {
    if (!me) return nav('/dang-nhap', { state: { from: `/san-pham/${p.id}` } });
    if (method === null) { payRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    idemKey.current = newIdempotencyKey();
    setConfirming(true);
  };

  return (
    <article className="pd">
      <nav className="crumbs small" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link><Icon name="chevron" size={14} /><Link to={`/tim-kiem?cat=${p.category}`}>{cat?.short || cat?.label}</Link><Icon name="chevron" size={14} /><span className="muted">{p.title}</span>
      </nav>

      <div className="pd-grid">
        <div className="pd-media">
          <Gallery key={p.id} p={p} />
        </div>

        <div className="pd-info">
          <h1>{p.title}</h1>
          <div className="pd-sub small">
            <span>Tình trạng <b>{p.condition}%</b></span>
            {p.location && <span>Giao nhận <b>{p.location}</b></span>}
            <span className="muted">Đăng {timeAgo(p).toLowerCase()}</span>
          </div>

          <div className="pd-price">
            <strong className="price">{money(p.price)}</strong>
            {off > 0 && risk.level === 'low' && <span className="pd-save">Rẻ hơn {off}% giá tham khảo</span>}
          </div>

          {risk.level !== 'low' && (
            <div className={`alert alert-${risk.level}`} role="alert">
              <strong>Tin này có dấu hiệu rủi ro</strong>
              <ul>{risk.flags.map((f) => <li key={f}>{f}</li>)}</ul>
              <p className="small">Chỉ thanh toán trong ReOwn, không chuyển khoản riêng.</p>
            </div>
          )}

          {p.sold ? <p className="notice">Món này đã có người mua.</p> : isAdmin ? (
            <section className="adm-box" aria-labelledby="adm-h">
              <h2 id="adm-h"><Icon name="shield" size={18} />Quản trị tin này</h2>
              <p className="small muted">Gỡ nếu tin vi phạm. Người bán nhận thông báo kèm lý do.</p>
              <AdminHide id={p.id} onDone={() => nav('/quan-tri')} />
            </section>
          ) : own ? <p className="notice">Đây là tin đăng của bạn. <Link to="/kenh-nguoi-ban?tab=tin-dang">Quản lý tin</Link></p> : (
            <section className="pay" ref={payRef} aria-labelledby="pay-h">
              <div className="pay-head">
                <h2 id="pay-h">Chọn cách thanh toán</h2>
                {me && bres && <span className="small muted">Hạn mức còn <b>{money(offer.available)}</b></span>}
              </div>
              <div className="pay-opts" role="radiogroup" aria-label="Cách thanh toán">
                {choices.map((c) => (
                  <button key={c.key} role="radio" aria-checked={method === c.key} disabled={!!me && !c.ok}
                    className={`pay-opt ${method === c.key ? 'on' : ''} ${c.key !== 'full' ? 'is-bnpl' : ''}`}
                    onClick={() => { if (!me) return nav('/dang-nhap', { state: { from: `/san-pham/${p.id}` } }); setMethod(c.key); setConfirming(false); }}>
                    <span className="po-title">{c.title}{c.key === 3 && <em>0% phí</em>}{method === c.key && <Icon name="check" size={16} className="po-check" />}</span>
                    <strong>{c.main}</strong>
                    <span className="po-sub">{c.sub}</span>
                    {me && !c.ok && c.why[0] && <span className="po-why">{c.why[0]}</span>}
                  </button>
                ))}
              </div>
              {chatErr && <p className="small danger" role="alert">{chatErr}</p>}
              {offer && offer.blockers.length > 0 && <p className="small muted">Chưa trả sau được: {offer.blockers.join('. ')}. <Link to="/tai-khoan?tab=uy-tin">Nâng hạng</Link></p>}
              {!confirming ? (
                <div className="buy-row">
                  <button type="button" className="btn btn-outline btn-chat" onClick={openChat} disabled={opening}><Icon name="chat" size={20} />Chat với người bán</button>
                  <button className="btn btn-buy" onClick={startBuy}>{!me ? 'Đăng nhập để mua' : method === null ? 'Mua ngay' : method === 'full' ? `Mua ngay · ${money(p.price)}` : `Mua trả sau ${method} kỳ`}</button>
                </div>
              ) : (
                <div className="confirm">
                  <p><b>Xác nhận đặt hàng</b> — {method === 'full' ? `trừ ${money(p.price)} từ ví ReOwn` : (() => { const o = offer.options.find((x) => x.term === method); return `${o.down ? `trả trước ${money(o.down)} từ ví, ` : ''}góp ${method} kỳ × ${money(o.monthly)}, kỳ đầu sau 30 ngày`; })()}.</p>
                  <fieldset className="deliv">
                    <legend className="small"><b>Cách nhận hàng</b></legend>
                    <div className="deliv-opts" role="radiogroup" aria-label="Cách nhận hàng">
                      {[['ship', 'truck', 'Giao tận nơi', 'Người bán gửi qua GHN, GHTK… kèm mã vận đơn'], ['meetup', 'pin', 'Gặp trực tiếp', 'Hẹn ở trường / KTX, kiểm tra hàng rồi đọc mã nhận hàng']].map(([v, ic, t, d]) => (
                        <button key={v} type="button" role="radio" aria-checked={delivery === v} className={`deliv-opt ${delivery === v ? 'on' : ''}`} onClick={() => { setDelivery(v); setAddrErr(''); }}>
                          <Icon name={ic} size={20} /><span><b>{t}</b><span className="small muted">{d}</span></span>
                        </button>
                      ))}
                    </div>
                    {delivery === 'ship' ? (
                      <div className="field">
                        <label htmlFor="ship-to">Người nhận · SĐT · địa chỉ</label>
                        <textarea id="ship-to" rows={2} maxLength={300} value={shipTo} onChange={(e) => { setShipTo(e.target.value); setAddrErr(''); }}
                          placeholder="VD: Trần Lan · 0901 234 567 · Phòng 402, KTX khu B, ĐHQG TP.HCM" aria-invalid={!!addrErr} aria-describedby={addrErr ? 'ship-err' : undefined} />
                        {addrErr && <span id="ship-err" className="small danger" role="alert">{addrErr}</span>}
                      </div>
                    ) : (
                      <div className="field">
                        <label htmlFor="meet-note">Gợi ý nơi / giờ hẹn (không bắt buộc)</label>
                        <input id="meet-note" maxLength={200} value={meetupNote} onChange={(e) => setMeetupNote(e.target.value)} placeholder="VD: Cổng chính HUIT, 17h thứ Sáu" />
                        <span className="small muted">Sau khi đặt, bạn nhận một mã 6 số. Chỉ đọc mã cho người bán khi đã kiểm tra hàng đúng mô tả.</span>
                      </div>
                    )}
                  </fieldset>
                  <p className="small muted">Tiền được giữ hộ đến khi bạn xác nhận nhận hàng.</p>
                  <div className="row">
                    <button className="btn btn-buy" onClick={place} disabled={busy}>{busy ? 'Đang đặt…' : 'Đặt hàng'}</button>
                    <button className="btn btn-outline" onClick={() => setConfirming(false)}>Quay lại</button>
                  </div>
                </div>
              )}
            </section>
          )}

          <ul className="promise">
            <li><Icon name="shield" size={18} /><span>Tiền giữ hộ đến khi bạn nhận hàng</span></li>
            <li><Icon name="bag" size={18} /><span>Hoàn tiền nếu sai mô tả (trong 3 ngày)</span></li>
            <li><Icon name="user" size={18} /><span>Uy tín tính từ giao dịch thật</span></li>
          </ul>
        </div>
      </div>

      <div className="pd-lower">
        <section className="panel">
          <h2>Mô tả từ người bán</h2>
          <p className="desc">{p.desc || 'Người bán chưa thêm mô tả.'}</p>
          <table className="specs">
            <tbody>
              <tr><th>Danh mục</th><td>{cat?.label}</td></tr>
              <tr><th>Tình trạng</th><td>{p.condition}% · {p.condition >= 90 ? 'như mới' : p.condition >= 80 ? 'còn tốt' : 'đã qua sử dụng nhiều'}</td></tr>
              <tr><th>Giá tham khảo ReOwn</th><td>{risk.ref ? <>{money(risk.ref.price)} <span className="muted small">({risk.ref.source === 'peers' ? risk.ref.label.toLowerCase() : 'theo mẫu tương đương'})</span></> : <span className="muted">Chưa đủ dữ liệu</span>}</td></tr>
              {p.location && <tr><th>Khu vực giao nhận</th><td>{p.location}</td></tr>}
            </tbody>
          </table>
        </section>
        {seller && sres && <SellerCard seller={seller} sres={sres} count={sellerCount} onChat={!own && !p.sold && !isAdmin ? openChat : null} chatBusy={opening} />}
      </div>

      {related.length > 0 && (
        <section className="shelf">
          <div className="shelf-head"><h2>Món tương tự</h2><Link to={`/tim-kiem?cat=${p.category}`} className="see-all">Xem thêm<Icon name="chevron" size={16} /></Link></div>
          <div className="scroller">{related.map((x) => <ProductCard key={x.id} product={x} seller={userById(x.sellerId)} sellerRes={sellerScores[x.sellerId]} />)}</div>
        </section>
      )}

      {!p.sold && !own && !isAdmin && (
        <div className="buybar" aria-hidden={confirming}>
          <div><strong className="price">{money(p.price)}</strong><span className="small muted">{sres ? `Người bán ${TIER_LABEL[sres.tier.id].toLowerCase()}` : ''}</span></div>
          <button type="button" className="btn btn-outline bb-chat" onClick={openChat} disabled={opening} aria-label="Chat với người bán"><Icon name="chat" size={22} /></button>
          <button className="btn btn-buy" onClick={startBuy}>{method === null ? 'Chọn cách mua' : 'Mua ngay'}</button>
        </div>
      )}
    </article>
  );
}
