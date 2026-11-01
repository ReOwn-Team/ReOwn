"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { motion } from "motion/react";
import {
  useMotionTokens,
  useShouldReduceMotion,
} from "@animate-ui/react/utils/motion";
import { X } from "lucide-react";

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
  className = "",
  returnFocus,
  placement = "center",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
  returnFocus?: HTMLElement | null;
  placement?: "center" | "right" | "left";
}) {
  const reduce = useShouldReduceMotion();
  const { spring, scale, transition, shift } = useMotionTokens();
  const slide = placement === "left" ? -shift.navigation : shift.navigation;
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  function finishClose() {
    if (!closing.current) return;
    closing.current = false;
    clearTimeout(closeTimer.current);
    onClose();
  }
  function requestClose() {
    if (closing.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    closing.current = true;
    setLeaving(true);
    if (ref.current) ref.current.dataset.state = "closing";
    // Fallback for browsers/extensions that suppress animation events.
    closeTimer.current = setTimeout(finishClose, 300);
  }
  useEffect(() => {
    const element = ref.current;
    const previous =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    element?.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(closeTimer.current);
      element?.close();
      document.body.style.overflow = oldOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [returnFocus]);
  return (
    <motion.dialog
      initial={{
        opacity: 0,
        scale: reduce || placement !== "center" ? 1 : scale.choice,
        x: !reduce && placement !== "center" ? slide : 0,
      }}
      animate={{
        opacity: leaving ? 0 : 1,
        scale: leaving && !reduce && placement === "center" ? scale.choice : 1,
        x: leaving && !reduce && placement !== "center" ? slide : 0,
      }}
      transition={
        leaving
          ? transition.dismiss
          : { ...spring.dialog, opacity: transition.fade }
      }
      onAnimationComplete={() => {
        if (closing.current) finishClose();
      }}
      ref={ref}
      className={`dialog ${wide ? "dialog-wide" : ""} ${className}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            requestClose();
        }
      }}
    >
      <div className="dialog-content">
        <button
          className="icon-button dialog-close"
          type="button"
          onClick={requestClose}
          aria-label="Đóng"
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </motion.dialog>
  );
}
