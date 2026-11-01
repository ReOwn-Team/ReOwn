"use client";
import { useState, type FormEvent } from "react";
import type { Address } from "@/mocks/data";
import { useMock } from "@/mocks/store";
import { Dialog } from "@/components/ui/dialog";
export function AddressEditor({
  initial,
  temporary = false,
  onClose,
  onSave,
}: {
  initial?: Address;
  temporary?: boolean;
  onClose: () => void;
  onSave?: (address: Address) => void;
}) {
  const { setAddresses, notify } = useMock();
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [label, setLabel] = useState(initial?.label ?? "Nhà riêng");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Nhập tên người nhận.";
    if (!/^(?:\+84|0)\d{9,10}$/.test(phone.replace(/\s/g, "")))
      next.phone = "Nhập số điện thoại Việt Nam hợp lệ.";
    if (detail.trim().length < 8)
      next.detail = "Nhập địa chỉ nhận hàng đầy đủ.";
    setErrors(next);
    if (Object.keys(next).length) {
      const first = Object.keys(next)[0];
      (e.currentTarget.elements.namedItem(first) as HTMLElement)?.focus();
      return;
    }
    const address: Address = {
      id: initial?.id ?? `addr-${crypto.randomUUID()}`,
      name: name.trim(),
      phone: phone.trim(),
      detail: detail.trim(),
      label,
      isDefault,
    };
    if (!temporary)
      setAddresses((current) => {
        const updated = initial
          ? current.map((a) => (a.id === initial.id ? address : a))
          : [...current, address];
        if (isDefault || !current.length)
          return updated.map((a) => ({ ...a, isDefault: a.id === address.id }));
        return updated;
      });
    notify(
      temporary
        ? "Đã dùng thông tin riêng cho đơn này."
        : "Đã lưu thông tin người nhận.",
    );
    onSave?.(address);
    onClose();
  }
  const title = temporary
    ? "Chỉ dùng cho đơn này"
    : initial
      ? "Sửa người nhận"
      : "Thêm người nhận";
  return (
    <Dialog title={title} onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <h2>{title}</h2>
        <p className="small muted">
          {temporary
            ? "Thông tin này không được thêm vào sổ địa chỉ."
            : "Thông tin giúp người bán liên hệ và giao món đồ cho bạn."}
        </p>
        {[
          {
            id: "name",
            label: "Họ và tên người nhận",
            value: name,
            set: setName,
            auto: "name",
          },
          {
            id: "phone",
            label: "Số điện thoại",
            value: phone,
            set: setPhone,
            auto: "tel",
          },
          {
            id: "detail",
            label: "Địa chỉ chi tiết",
            value: detail,
            set: setDetail,
            auto: "street-address",
          },
        ].map((field) => (
          <div className="field" key={field.id}>
            <label htmlFor={`addr-${field.id}`}>{field.label}</label>
            <input
              id={`addr-${field.id}`}
              name={field.id}
              autoComplete={field.auto}
              inputMode={field.id === "phone" ? "tel" : "text"}
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              aria-invalid={!!errors[field.id]}
              aria-describedby={
                errors[field.id] ? `addr-${field.id}-error` : undefined
              }
            />
            {errors[field.id] && (
              <p className="error" id={`addr-${field.id}-error`} role="alert">
                {errors[field.id]}
              </p>
            )}
          </div>
        ))}
        <div className="field">
          <label htmlFor="addr-label">Nhãn địa chỉ</label>
          <select
            id="addr-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          >
            {["Nhà riêng", "Ký túc xá", "Nơi làm việc", "Khác"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        {!temporary && (
          <label className="choice">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Đặt làm mặc định
          </label>
        )}
        <div className="action-row">
          <button className="button secondary" type="button" onClick={onClose}>
            Hủy
          </button>
          <button className="button primary" type="submit">
            {temporary ? "Dùng cho đơn này" : "Lưu người nhận"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
