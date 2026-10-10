/// <reference lib="dom" />

import { motion } from "./tokens.ts";

interface MatchMediaHost {
  matchMedia?: (query: string) => { matches: boolean };
}

const EASE = {
  out: "power3.out",
  inOut: "power2.inOut",
  spring: "back.out(1.4)",
} as const;

export function prefersReducedMotion(): boolean {
  const query = (globalThis as MatchMediaHost).matchMedia;
  if (typeof query !== "function") return false;
  return query("(prefers-reduced-motion: reduce)").matches;
}

function settle(el: Element): void {
  const Host = (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement;
  if (typeof Host !== "function" || !(el instanceof Host)) return;
  el.style.opacity = "1";
  el.style.transform = "none";
}

export function enter(el: Element, opts?: { delay?: number }): Promise<void> {
  if (prefersReducedMotion()) {
    settle(el);
    return Promise.resolve();
  }
  const delay = (opts?.delay ?? 0) / 1000;
  return import("gsap").then(
    ({ gsap }) =>
      new Promise((resolve) => {
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 14 },
          {
            autoAlpha: 1,
            y: 0,
            duration: motion.durations.fast / 1000,
            delay,
            ease: EASE.out,
            onComplete: resolve,
          },
        );
      }),
  );
}

export function confirmPulse(el: Element): Promise<void> {
  if (prefersReducedMotion()) {
    settle(el);
    return Promise.resolve();
  }
  return import("gsap").then(
    ({ gsap }) =>
      new Promise((resolve) => {
        const timeline = gsap.timeline({ onComplete: resolve });
        timeline
          .to(el, {
            scale: 1.02,
            duration: motion.durations.fast / 2000,
            ease: EASE.spring,
            transformOrigin: "center center",
          })
          .to(el, {
            scale: 1,
            duration: motion.durations.fast / 2000,
            ease: EASE.inOut,
          });
      }),
  );
}

export function mapProgress(el: Element): Promise<void> {
  if (prefersReducedMotion()) {
    settle(el);
    return Promise.resolve();
  }
  return import("gsap").then(
    ({ gsap }) =>
      new Promise((resolve) => {
        gsap.fromTo(
          el,
          { scaleX: 0 },
          {
            scaleX: 1,
            transformOrigin: "left center",
            duration: motion.durations.slow / 1000,
            ease: EASE.inOut,
            onComplete: resolve,
          },
        );
      }),
  );
}

export function toast(el: Element): Promise<void> {
  if (prefersReducedMotion()) {
    settle(el);
    return Promise.resolve();
  }
  return import("gsap").then(
    ({ gsap }) =>
      new Promise((resolve) => {
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 10 },
          {
            autoAlpha: 1,
            y: 0,
            duration: motion.durations.fast / 1000,
            ease: EASE.out,
            onComplete: resolve,
          },
        );
      }),
  );
}
