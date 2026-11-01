"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  useMotionTokens,
  useShouldReduceMotion,
} from "@animate-ui/react/utils/motion";
import { Button as PressButton } from "@animate-ui/react/primitives/buttons/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/primitives/tooltip";
import { FigmaIcon } from "@/components/icons/figma-icon";
import { useMock } from "@/mocks/store";

export function SaveButton({ id }: { id: string }) {
  const { saved, toggleSaved } = useMock();
  const { transition, scale, blur } = useMotionTokens();
  const reduce = useShouldReduceMotion();
  const active = saved.includes(id);
  const label = active ? "Bỏ lưu sản phẩm" : "Lưu sản phẩm";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PressButton
          className={`icon-button save-button ${active ? "is-saved" : ""}`}
          type="button"
          aria-label={label}
          aria-pressed={active}
          onClick={() => toggleSaved(id)}
        >
          <span className="save-icon-swap" aria-hidden="true">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={String(active)}
                initial={{
                  opacity: 0,
                  scale: reduce ? 1 : scale.icon,
                  filter: blur.icon,
                }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  filter: "blur(0px)",
                  transition: transition.swap,
                }}
                exit={{
                  opacity: 0,
                  scale: reduce ? 1 : scale.icon,
                  filter: blur.icon,
                  transition: transition.swap,
                }}
              >
                <FigmaIcon name={active ? "heartFilled" : "heart"} />
              </motion.span>
            </AnimatePresence>
          </span>
        </PressButton>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
