"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  useMotionTokens,
  useShouldReduceMotion,
} from "@animate-ui/react/utils/motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/primitives/button";
import { money } from "@/mocks/data";

export function PurchaseDock({
  price,
  onContinue,
}: {
  price: number;
  onContinue: () => void;
}) {
  const [show, setShow] = useState(false);
  const dock = useRef<HTMLElement>(null);
  const reduce = useShouldReduceMotion();
  const { spring, transition, shift } = useMotionTokens();
  useEffect(() => {
    const actions = document.querySelector(".product-actions");
    if (!actions) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const shouldShow =
          !entry.isIntersecting &&
          entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0);
        if (!shouldShow && dock.current?.contains(document.activeElement)) {
          const target = entry.isIntersecting
            ? actions.querySelector<HTMLButtonElement>("button")
            : document.querySelector<HTMLElement>("main");
          target?.focus({ preventScroll: true });
        }
        if (dock.current) dock.current.inert = !shouldShow;
        setShow(shouldShow);
      },
      {
        threshold: 0.1,
        rootMargin: window.matchMedia("(max-width: 767px)").matches
          ? "0px 0px -96px 0px"
          : "0px",
      },
    );
    observer.observe(actions);
    return () => observer.disconnect();
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          ref={dock}
          className="purchase-dock"
          aria-label="Tiếp tục mua sản phẩm"
          initial={{
            opacity: 1,
            transform: reduce ? "none" : `translateY(${shift.navigation}px)`,
          }}
          animate={{ opacity: 1, transform: "none", transition: spring.slide }}
          exit={{
            opacity: 0,
            transform: reduce ? "none" : `translateY(${shift.navigation}px)`,
            transition: transition.dismiss,
          }}
        >
          <div>
            <span className="small muted">Giá sản phẩm</span>
            <strong>{money(price)}</strong>
            <small>Kiểm tra thanh toán ở bước tiếp theo</small>
          </div>
          <Button onClick={onContinue}>
            Tiếp tục đặt hàng
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
