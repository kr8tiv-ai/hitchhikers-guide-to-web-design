/**
 * Our remix of the documented Lenis and GSAP ticker pairing.
 * Lenis is MIT, Copyright (c) 2024 darkroom.engineering.
 * This file is not a copy of the Lenis source.
 */
export interface SmoothLenis {
  raf: (time: number) => void;
}

export interface SmoothGsap {
  ticker: {
    add: (fn: (time: number) => void) => void;
    lagSmoothing: (n: number) => void;
  };
}

export function attachTicker(lenis: SmoothLenis, gsap: SmoothGsap, update: () => void): () => void {
  gsap.ticker.lagSmoothing(0);
  const tick = (time: number): void => {
    lenis.raf(time * 1000);
    update();
  };
  gsap.ticker.add(tick);
  return () => {
    gsap.ticker.lagSmoothing(500);
  };
}
