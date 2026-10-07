/**
 * Shared motion root for generated sites.
 * One gsap.ticker drives Lenis.raf and ScrollTrigger.update.
 * Pages call registerEffect and load only the effect module they use.
 * This file names no motion library.
 */

export interface Ticker {
  add(fn: (time: number) => void): void;
  remove(fn: (time: number) => void): void;
  lagSmoothing(value: number): void;
}

export interface LenisLike {
  raf(time: number): void;
  on(event: "scroll", callback: () => void): void;
  destroy(): void;
}

export interface ScrollTriggerLike {
  update(): void;
}

export type EffectLoader = () => void | Promise<void>;

const effects = new Map<string, EffectLoader>();

export function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== "function") return false;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function keepContentVisible(): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.visibility = "visible";
}

/**
 * Lenis listens for scroll and calls ScrollTrigger.update.
 * The ticker callback calls lenis.raf with milliseconds.
 * autoRaf stays off. There is no second animation frame loop.
 */
export function wireLenis(ticker: Ticker, lenis: LenisLike, scrollTrigger: ScrollTriggerLike): () => void {
  lenis.on("scroll", () => {
    scrollTrigger.update();
  });
  const tick = (time: number): void => {
    lenis.raf(time * 1000);
  };
  ticker.add(tick);
  ticker.lagSmoothing(0);
  return () => {
    ticker.remove(tick);
    lenis.destroy();
  };
}

export function registerEffect(name: string, loader: EffectLoader): void {
  const id = name.trim();
  if (id.length === 0) throw new Error("Effect name is empty.");
  effects.set(id, loader);
}

export function registeredEffects(): string[] {
  return [...effects.keys()];
}

export async function bootNamed(names: readonly string[]): Promise<string[]> {
  const started: string[] = [];
  for (const name of names) {
    const loader = effects.get(name);
    if (loader === undefined) throw new Error(`No effect registered: ${name}`);
    await loader();
    started.push(name);
  }
  return started;
}

export function resetEffects(): void {
  effects.clear();
}
