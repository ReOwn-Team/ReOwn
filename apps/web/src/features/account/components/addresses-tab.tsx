"use client";
import { useState } from "react";

import { useMock } from "@/mocks/store";

import { Dialog } from "@/components/ui/dialog";
import { AddressEditor } from "@/features/addresses/components/address-editor";
import { AddressLines } from "@/features/addresses/components/address-lines";
import type { Address } from "@/mocks/data";

export function AddressesTab() {
  const { addresses, setAddresses, notify } = useMock();
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const [removing, setRemoving] = useState<Address | null>(null);
  return (
    <section className="panel stack">
      <div className="section-heading">
        <h2>Địa chỉ nhận hàng</h2>
        <button className="button secondary" onClick={() => setEditing("new")}>
          Thêm địa chỉ
        </button>
      </div>
      {addresses.length ? (
        addresses.map((address) => (
          <article className="address-card" key={address.id}>
            <AddressLines address={address} />
            <div className="action-row">
              {!address.isDefault && (
                <button
                  className="plain-button"
                  onClick={() => {
                    setAddresses((current) =>
                      current.map((a) => ({
                        ...a,
                        isDefault: a.id === address.id,
                      })),
                    );
                    notify("Đã đặt địa chỉ mặc định.");
                  }}
                >
                  Đặt mặc định
                </button>
              )}
              <button
                className="plain-button"
                onClick={() => setEditing(address)}
              >
                Sửa
              </button>
              <button
                className="plain-button error"
                onClick={() => setRemoving(address)}
              >
                Xóa
              </button>
            </div>
          </article>
        ))
      ) : (
        <p className="muted">
          Chưa có địa chỉ nào. Thêm địa chỉ để thanh toán nhanh hơn.
        </p>
      )}
      {editing && (
        <AddressEditor
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}{" "}
      {removing && (
        <Dialog title="Xóa địa chỉ" onClose={() => setRemoving(null)}>
          <div className="stack">
            <h2>Xóa địa chỉ {removing.label}?</h2>
            <AddressLines address={removing} />
            <button
              className="button danger"
              onClick={() => {
                setAddresses((current) => {
                  const rest = current.filter((a) => a.id !== removing.id);
                  return removing.isDefault
                    ? rest.map((a, i) => ({ ...a, isDefault: i === 0 }))
                    : rest;
                });
                setRemoving(null);
                notify("Đã xóa địa chỉ.");
              }}
            >
              Xóa địa chỉ
            </button>
            <button
              className="button secondary"
              onClick={() => setRemoving(null)}
            >
              Giữ lại
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
