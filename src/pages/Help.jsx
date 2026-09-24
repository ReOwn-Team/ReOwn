import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { TIERS, BNPL_POLICY, DOWN_PAYMENT, INCOME_CAP } from '../../shared/scoring/config.js';
import { TrustBadge } from '../components/ui.jsx';
import { money } from '../lib/format.js';

export default function Help() {
  const { hash } = useLocation();
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }); }, [hash]);
  return (
    <div className="help">
      <h1>Trung tâm hỗ trợ</h1>
      <section className="panel" id="giu-ho">
        <h2>Tiền giữ hộ hoạt động thế nào?</h2>
        <ol className="steps">
          <li><b>Bạn đặt hàng</b> — tiền (hoặc khoản trả sau) được ReOwn giữ, người bán chưa nhận.</li>
          <li><b>Người bán gửi hàng</b> trong 3 ngày.</li>
          <li><b>Bạn kiểm tra hàng</b> — đúng mô tả thì bấm “Đã nhận hàng”; sai mô tả thì bấm “Hàng không đúng mô tả” trong 3 ngày.</li>
          <li><b>Người bán nhận tiền</b> sau khi bạn xác nhận (hoặc được hoàn tiền nếu bạn thắng khiếu nại).</li>
        </ol>
      </section>
      <section className="panel" id="tra-sau">
        <h2>Trả sau 3–6 kỳ</h2>
        <p>Trả sau 3 kỳ không mất phí. Trả sau 6 kỳ có phí dịch vụ 2,5% trên phần trả góp. Kỳ đầu thanh toán sau 30 ngày, tiền kỳ được trừ từ ví ReOwn.</p>
        <p>Hạng B trả trước {DOWN_PAYMENT.B * 100}%, hạng C (và tài khoản chưa đủ 3 kỳ trả đúng hạn) trả trước {DOWN_PAYMENT.C * 100}%; hạng A không cần trả trước. Tổng tiền góp mỗi tháng không vượt 30% thu nhập, thu nhập tự khai được tính tối đa {money(INCOME_CAP.selfDeclared)} ({money(INCOME_CAP.bankVerified)} khi đã xác thực tài khoản ngân hàng).</p>
        <p className="small muted">Khoản trả sau do đối tác tài chính được cấp phép cung cấp; ReOwn là nền tảng kết nối.</p>
      </section>
      <section className="panel" id="uy-tin">
        <h2>Điểm uy tín</h2>
        <p>Mỗi người mua và người bán có điểm từ 0–100, tính từ xác thực danh tính và lịch sử giao dịch thật trên ReOwn. Đánh giá chỉ được viết sau giao dịch hoàn tất; mỗi người mua chỉ được tính một đánh giá cho một người bán, và đánh giá từ tài khoản uy tín thấp có trọng số thấp.</p>
        <table className="specs">
          <thead><tr><th>Hạng</th><th>Điểm</th><th>Hạn mức trả sau</th></tr></thead>
          <tbody>
            {TIERS.map((t, i) => (
              <tr key={t.id}><td><TrustBadge result={{ tier: t, score: t.min }} long /></td><td>{t.min}–{i === 0 ? 100 : TIERS[i - 1].min - 1}</td><td>{BNPL_POLICY[t.id].limit ? `${money(BNPL_POLICY[t.id].limit)}, tối đa ${BNPL_POLICY[t.id].maxTerm} kỳ, trả trước ${DOWN_PAYMENT[t.id] * 100}%` : 'Chỉ trả thẳng'}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
