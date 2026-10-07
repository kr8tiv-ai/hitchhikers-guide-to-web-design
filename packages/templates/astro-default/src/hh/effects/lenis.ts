/**
 * Lenis on the shared ticker. Import this module only on a Lenis page.
 * Do not also install CSS scroll-driven animations on that page.
 */

import { prefersReducedMotion, registerEffect, wireLenis, type LenisLike, type ScrollTriggerLike, type Ticker } from "../motion.ts";

interface GsapModule {
  default: {
    registerPlugin: (...plugins: unknown[]) => void;
    ticker: {
      add: (fn: (time: number) => void) => void;
      remove: (fn: (time: number) => void) => void;
      lagSmoothing: (value: number) => void;
    };
  };
}

interface ScrollTriggerModule {
  ScrollTrigger: ScrollTriggerLike;
}

interface LenisModule {
  default: new (options: { autoRaf: boolean }) => LenisLike;
}

function asGsap(mod: unknown): GsapModule {
  if (typeof mod !== "object" || mod === null || !("default" in mod)) throw new Error("gsap did not load.");
  return mod as unknown as GsapModule;
}

function asScrollTrigger(mod: unknown): ScrollTriggerModule {
  if (typeof mod !== "object" || mod === null || !("ScrollTrigger" in mod)) throw new Error("ScrollTrigger did not load.");
  return mod as unknown as ScrollTriggerModule;
}

function asLenis(mod: unknown): LenisModule {
  if (typeof mod !== "object" || mod === null || !("default" in mod)) throw new Error("lenis did not load.");
  return mod as unknown as LenisModule;
}

export async function startLenis(): Promise<() => void> {
  if (prefersReducedMotion()) return () => {};
  const gsap = asGsap(await import("gsap"));
  const scroll = asScrollTrigger(await import("gsap/ScrollTrigger"));
  const lenisMod = asLenis(await import("lenis"));
  await import("lenis/dist/lenis.css");
  gsap.default.registerPlugin(scroll.ScrollTrigger);
  const lenis = new lenisMod.default({ autoRaf: false });
  const ticker: Ticker = {
    add: (fn) => {
      gsap.default.ticker.add(fn);
    },
    remove: (fn) => {
      gsap.default.ticker.remove(fn);
    },
    lagSmoothing: (value) => {
      gsap.default.ticker.lagSmoothing(value);
    },
  };
  return wireLenis(ticker, lenis, scroll.ScrollTrigger);
}

export function registerLenis(): void {
  registerEffect("lenis", async () => {
    await startLenis();
  });
}
