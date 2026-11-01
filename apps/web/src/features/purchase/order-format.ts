import { type MockOrder } from "@/mocks/data";

export const fee = (delivery: MockOrder["delivery"]) =>
  delivery === "shipping" ? 30000 : 0;
export const deliveryName = (delivery: MockOrder["delivery"]) =>
  delivery === "shipping" ? "Giao hàng" : "Gặp trực tiếp";
export const paymentName = (months: number) =>
  months === 1 ? "Trả thẳng" : `Chia ${months} tháng`;
