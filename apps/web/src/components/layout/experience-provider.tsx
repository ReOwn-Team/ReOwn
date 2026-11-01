"use client";

import type { ReactNode } from "react";
import { AnimateUIProvider } from "@animate-ui/react/provider";
import {
  ReducedMotionConfig,
  toCssTiming,
  useMotionTokens,
} from "@animate-ui/react/utils/motion";
import { TooltipProvider } from "@/components/primitives/tooltip";

function MotionTimingStyles() {
  const { spring } = useMotionTokens();
  const timing = toCssTiming(spring.press);
  return (
    <style>{`:root { --press-duration: ${timing.duration}ms; --press-ease: ${timing.easing}; }`}</style>
  );
}

export function ExperienceProvider({ children }: { children: ReactNode }) {
  return (
    <AnimateUIProvider tempo={0.85} reducedMotion="user">
      <ReducedMotionConfig>
        <MotionTimingStyles />
        <TooltipProvider delayDuration={400} skipDelayDuration={300}>
          {children}
        </TooltipProvider>
      </ReducedMotionConfig>
    </AnimateUIProvider>
  );
}
