"use client";
import "@/features/purchase/components/payment-plan.css";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/primitives/accordion";
import { installmentPlan, money } from "@/mocks/data";
export function PaymentPlan({
  total,
  months,
  start,
  collapsible = false,
}: {
  total: number;
  months: number;
  start?: string;
  collapsible?: boolean;
}) {
  const plan = installmentPlan(total, months);
  const base = start ? new Date(start) : new Date("2026-10-30T12:00:00+07:00");
  const schedule = (
    <>
      <ol>
        {plan.map((amount, index) => {
          const date = new Date(base);
          const day = date.getUTCDate();
          date.setUTCDate(1);
          date.setUTCMonth(base.getUTCMonth() + index);
          const lastDay = new Date(
            Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
          ).getUTCDate();
          date.setUTCDate(Math.min(day, lastDay));
          return (
            <li key={index}>
              <span>
                Kỳ {index + 1}
                <small>
                  {date.toLocaleDateString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}
                </small>
              </span>
              <strong>{money(amount)}</strong>
            </li>
          );
        })}
      </ol>
      <div className="summary-row total">
        <span>Tổng các kỳ</span>
        <strong>{money(total)}</strong>
      </div>
    </>
  );
  return (
    <div className="payment-schedule">
      {collapsible ? (
        <Accordion
          key={months}
          type="single"
          collapsible
          className="payment-schedule-disclosure"
        >
          <AccordionItem value="schedule">
            <AccordionTrigger>
              <span>Lịch thanh toán · {months} kỳ</span>
              <span className="small muted">Chi tiết</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="payment-schedule-content">{schedule}</div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : (
        <>
          <div className="summary-row">
            <strong>Lịch thanh toán · {months} kỳ</strong>
            <span className="small muted">Minh họa</span>
          </div>
          {schedule}
        </>
      )}
      <p className="small muted">
        Phí trả sau giả định: 0₫ trong demo. Lịch này không phải kết quả duyệt
        trả sau.
      </p>
    </div>
  );
}
