"use client";

import { type Address } from "@/mocks/data";

export function AddressLines({ address }: { address: Address }) {
  return (
    <div className="purchase-address-lines">
      <strong>
        {address.name} · {address.phone}
      </strong>
      <span>{address.detail}</span>
      <span>
        {address.label}
        {address.isDefault ? " · Mặc định" : ""}
      </span>
    </div>
  );
}
