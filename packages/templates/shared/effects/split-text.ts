/**
 * SplitText line reveal. A GSAP plugin, not a second page-wide library.
 */

import { prefersReducedMotion, registerEffect } from "../motion.ts";

interface SplitResult {
  lines: unknown;
  revert: () => void;
}

interface TweenLike {
  kill: () => void;
}

interface GsapModule {
  default: {
    registerPlugin: (...plugins: unknown[]) => void;
    from: (targets: unknown, vars: Record<string, unknown>) => TweenLike;
  };
}

interface SplitTextModule {
  SplitText: {
    create: (target: string, vars: { type: string; mask: string }) => SplitResult;
  };
}

export async function splitHeadline(target: string): Promise<() => void> {
  if (prefersReducedMotion()) return () => {};
  const gsapMod = (await import("gsap")) as unknown as GsapModule;
  const splitMod = (await import("gsap/SplitText")) as unknown as SplitTextModule;
  gsapMod.default.registerPlugin(splitMod.SplitText);
  const split = splitMod.SplitText.create(target, { type: "lines", mask: "lines" });
  const tween = gsapMod.default.from(split.lines, {
    yPercent: 110,
    opacity: 0,
    duration: 0.8,
    stagger: 0.08,
    ease: "power3.out",
  });
  return () => {
    tween.kill();
    split.revert();
  };
}

export function registerSplitText(target: string): void {
  registerEffect("split-text", async () => {
    await splitHeadline(target);
  });
}
