"use client";
import { type ReactNode } from "react";

export function DemoNote({ children }: { children?: ReactNode }) {
  return (
    <p className="demo-note">
      {children ??
        "Dữ liệu minh họa được lưu trên thiết bị này. Không có giao dịch thật."}
    </p>
  );
}
