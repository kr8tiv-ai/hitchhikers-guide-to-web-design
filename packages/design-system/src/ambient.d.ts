/**
 * Ambient types for the motion recipes. gsap and lenis are not dependencies
 * of this package. The app already ships both.
 */

declare module "gsap" {
  interface ScrollTriggerVars {
    start?: string;
    end?: string | (() => string);
    pin?: boolean;
    scrub?: boolean | number;
    anticipatePin?: number;
    invalidateOnRefresh?: boolean;
    once?: boolean;
    trigger?: unknown;
  }

  interface TweenVars {
    opacity?: number;
    xPercent?: number;
    yPercent?: number;
    y?: number;
    scale?: number;
    clipPath?: string;
    filter?: string;
    duration?: number;
    stagger?: number;
    ease?: string;
    repeat?: number;
    scrollTrigger?: ScrollTriggerVars;
  }

  interface Tween {
    kill(): void;
  }

  interface Ticker {
    add(fn: (time: number) => void): void;
    remove(fn: (time: number) => void): void;
    lagSmoothing(value: number): void;
  }

  interface GsapApi {
    registerPlugin(...plugins: readonly unknown[]): void;
    to(target: unknown, vars: TweenVars): Tween;
    from(target: unknown, vars: TweenVars): Tween;
    fromTo(target: unknown, fromVars: TweenVars, toVars: TweenVars): Tween;
    set(target: unknown, vars: TweenVars): void;
    ticker: Ticker;
    utils: { toArray(selector: string): unknown[] };
  }

  const api: GsapApi;
  export default api;
}

declare module "gsap/ScrollTrigger" {
  export const ScrollTrigger: {
    update(): void;
    refresh(): void;
  };
}

declare module "gsap/SplitText" {
  export const SplitText: {
    create(
      target: string,
      vars: { type?: string; mask?: string; aria?: string },
    ): { lines: readonly unknown[]; revert(): void };
  };
}

declare module "lenis" {
  export default class Lenis {
    constructor(options?: { autoRaf?: boolean; smoothTouch?: boolean });
    on(event: "scroll", callback: () => void): void;
    raf(time: number): void;
    destroy(): void;
  }
}
