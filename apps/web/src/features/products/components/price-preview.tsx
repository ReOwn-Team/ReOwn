"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/primitives/toggle-group";
import { installmentPlan, money } from "@/mocks/data";
import "./price-preview.css";

const terms = [3, 6, 9, 12];

export function PricePreview({
  price,
  months,
  onMonthsChange,
}: {
  price: number;
  months: number;
  onMonthsChange: (months: number) => void;
}) {
  const installments = months > 1;
  const plan = installmentPlan(price, months);

  return (
    <section className="price-preview" aria-label="Giá và cách thanh toán">
      <div className="price-preview-price">
        <span>Giá bán</span>
        <strong className="detail-price">{money(price)}</strong>
        <p>Chưa gồm phí giao nhận</p>
      </div>
      <div className="price-preview-controls">
        <h2>Chọn cách thanh toán</h2>
        <div className="price-preview-methods" role="radiogroup" aria-label="Cách thanh toán">
          <label className={installments ? "" : "is-selected"}>
            <input
              type="radio"
              name="product-payment"
              checked={!installments}
              onChange={() => onMonthsChange(1)}
            />
            <span>Trả toàn bộ</span>
          </label>
          <label className={installments ? "is-selected" : ""}>
            <input
              type="radio"
              name="product-payment"
              checked={installments}
              onChange={() => onMonthsChange(3)}
            />
            <span>Trả góp</span>
          </label>
        </div>
        {installments && (
          <div className="price-preview-installments">
            <p className="price-preview-term-label">Thời gian thanh toán</p>
            <ToggleGroup
              type="single"
              value={String(months)}
              onValueChange={(value) => {
                const selected = Number(value);
                if (terms.includes(selected)) onMonthsChange(selected);
              }}
              aria-label="Kỳ hạn trả góp"
              className="price-preview-terms"
            >
              {terms.map((term) => (
                <ToggleGroupItem key={term} value={String(term)}>
                  {term} tháng
                  {months === term && <Check aria-hidden="true" />}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="price-preview-estimate">
              <div className="price-preview-monthly" aria-live="polite" aria-atomic="true">
                <span>Thanh toán mỗi tháng</span>
                <strong>{money(plan[0])}</strong>
              </div>
              <dl className="price-preview-summary">
                <div><dt>Giá sản phẩm</dt><dd>{money(price)}</dd></div>
                <div><dt>Thời gian thanh toán</dt><dd>{months} tháng</dd></div>
                <div><dt>Lần thanh toán cuối</dt><dd>{money(plan[plan.length - 1])}</dd></div>
              </dl>
              <details className="price-preview-schedule" key={months}>
                <summary>Xem lịch thanh toán <ChevronDown aria-hidden="true" /></summary>
                <table>
                  <thead><tr><th scope="col">Lần thanh toán</th><th scope="col">Số tiền</th></tr></thead>
                  <tbody>
                    {plan.map((amount, index) => (
                      <tr key={index}><th scope="row">Tháng {index + 1}</th><td>{money(amount)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p>Chưa gồm phí giao nhận. Ngày thanh toán cụ thể được hiển thị tại bước đặt hàng.</p>
              </details>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
