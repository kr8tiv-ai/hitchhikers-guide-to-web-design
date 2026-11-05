/**
 * Ambient types for the motion recipes. gsap and lenis are not dependencies
 * of this package. The app already ships both.
 */

declare module "gsap" {
  interface ScrollTriggerSnap {
    snapTo?: string | ((value: number) => number);
    duration?: number | { min: number; max: number };
    delay?: number;
    ease?: string;
  }

  interface ScrollTriggerSelf {
    progress: number;
    getVelocity(): number;
  }

  interface ScrollTriggerVars {
    start?: string;
    end?: string | (() => string);
    pin?: boolean;
    pinType?: "fixed" | "transform";
    scrub?: boolean | number;
    anticipatePin?: number;
    invalidateOnRefresh?: boolean;
    once?: boolean;
    trigger?: unknown;
    snap?: string | ((value: number) => number) | ScrollTriggerSnap;
    onUpdate?: (self: ScrollTriggerSelf) => void;
  }

  interface TweenVars {
    opacity?: number;
    x?: number;
    y?: number;
    xPercent?: number;
    yPercent?: number;
    scale?: number;
    value?: number;
    clipPath?: string;
    filter?: string;
    duration?: number;
    stagger?: number;
    ease?: string;
    /** Numeric state a frame-sequence scrub writes. Not a CSS property. */
    frame?: number;
    repeat?: number;
    scrollTrigger?: ScrollTriggerVars;
  }

  interface Tween {
    kill(): void;
  }

  interface TimelineVars {
    scrollTrigger?: ScrollTriggerVars;
  }

  interface Timeline {
    to(target: unknown, vars: TweenVars, position?: string | number): Timeline;
    from(target: unknown, vars: TweenVars, position?: string | number): Timeline;
    fromTo(target: unknown, fromVars: TweenVars, toVars: TweenVars, position?: string | number): Timeline;
    set(target: unknown, vars: TweenVars, position?: string | number): Timeline;
    addLabel(label: string, position?: string | number): Timeline;
    kill(): void;
  }

  interface MatchMedia {
    add(query: string, callback: () => void | (() => void)): MatchMedia;
    revert(): void;
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
    timeline(vars?: TimelineVars): Timeline;
    matchMedia(): MatchMedia;
    ticker: Ticker;
    utils: { toArray(selector: string): unknown[] };
  }

  const api: GsapApi;
  export default api;
}

declare module "gsap/ScrollTrigger" {
  interface BatchVars {
    start?: string;
    once?: boolean;
    onEnter?: (batch: readonly unknown[]) => void;
  }

  export const ScrollTrigger: {
    update(): void;
    refresh(): void;
    batch(targets: unknown, vars: BatchVars): { kill(): void }[];
  };
}

declare module "gsap/SplitText" {
  interface SplitResult {
    lines: readonly unknown[];
    words: readonly unknown[];
    chars: readonly unknown[];
    revert(): void;
  }

  export const SplitText: {
    create(target: unknown, vars: { type?: string; mask?: string; aria?: string }): SplitResult;
  };
}

declare module "gsap/Flip" {
  export const Flip: {
    getState(target: unknown): { element: unknown };
    from(state: unknown, vars: { duration?: number; ease?: string; opacity?: number }): { kill(): void };
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
