"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./shine-border.css";

type TColorProp = string | string[];

interface ShineBorderProps {
  borderRadius?: number;
  borderWidth?: number;
  duration?: number;
  color?: TColorProp;
  className?: string;
  children: ReactNode;
}

/** An animated border that can wrap any content. */
export function ShineBorder({
  borderRadius = 8,
  borderWidth = 1,
  duration = 14,
  color = "#000000",
  className,
  children,
}: ShineBorderProps) {
  const colors = Array.isArray(color) ? color : [color];
  const gradient = `radial-gradient(circle, transparent, transparent, ${colors.join(", ")}, transparent, transparent)`;

  return (
    <div
      className={cn(
        "shine-border relative isolate grid min-h-[60px] w-fit min-w-[300px] place-items-center rounded-[var(--shine-radius)] bg-background p-3 text-foreground",
        className,
      )}
      style={
        {
          "--shine-radius": `${borderRadius}px`,
          "--shine-width": `${borderWidth}px`,
          "--shine-duration": `${duration}s`,
          "--shine-gradient": gradient,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
