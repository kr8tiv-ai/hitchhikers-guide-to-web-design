/// <reference lib="dom" />

import { ensureSharedTicker, markLive, onSharedTick, runWhenVisible } from "../slider.ts";

export function mountPreview(el: HTMLElement): Promise<() => void> {
  return runWhenVisible(el, async () => {
    await ensureSharedTicker();
    el.innerHTML = '<div class="hh-motion__fade" data-fade>Fade</div>';
    const fade = el.querySelector("[data-fade]");
    if (!(fade instanceof HTMLElement)) return () => undefined;
    markLive(el);
    let t = 0;
    const off = onSharedTick((_time, delta) => {
      t += delta / 1000;
      const wave = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2));
      fade.style.opacity = wave.toFixed(3);
    });
    return off;
  });
}
