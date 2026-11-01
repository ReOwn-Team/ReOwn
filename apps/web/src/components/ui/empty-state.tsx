"use client";
import { type ReactNode } from "react";
import Link from "next/link";

import { PackageOpen, ArrowRight, type LucideIcon } from "lucide-react";

export function EmptyState({
  title,
  children,
  icon: Icon = PackageOpen,
}: {
  title: string;
  children: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty-state">
      <Icon size={36} strokeWidth={1.5} aria-hidden="true" />
      <h2>{title}</h2>
      <p className="muted">{children}</p>
      <Link className="button primary" href="/browse">
        Khám phá sản phẩm <ArrowRight size={16} />
      </Link>
    </div>
  );
}
