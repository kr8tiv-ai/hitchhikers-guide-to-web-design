/// <reference lib="dom" />

import { ensureSharedTicker, markLive, onSharedTick, runWhenVisible } from "../slider.ts";

interface Stoppable {
  cancel?: () => void;
  revert?: () => void;
}

export function mountPreview(el: HTMLElement): Promise<() => void> {
  return runWhenVisible(el, async () => {
    await ensureSharedTicker();
    const anime = await import("animejs");
    anime.engine.useDefaultMainLoop = false;
    anime.engine.paused = false;
    el.innerHTML =
      '<svg class="hh-motion__gl" viewBox="0 0 320 200" aria-hidden="true">' +
      '<path data-stroke d="M36 150 C70 40 120 40 150 110" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="120" stroke-dashoffset="120"></path>' +
      '<path data-stroke d="M150 110 C180 40 230 48 280 140" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="120" stroke-dashoffset="120"></path>' +
      '<path data-stroke d="M48 78 H270" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="120" stroke-dashoffset="120"></path>' +
      "</svg>";
    const paths = el.querySelectorAll("[data-stroke]");
    const animation = anime.animate(paths, {
      strokeDashoffset: [120, 0],
      delay: anime.utils.stagger(90),
      duration: 900,
      loop: true,
    }) as Stoppable;
    markLive(el);
    const off = onSharedTick(() => {
      anime.engine.update();
    });
    return () => {
      off();
      animation.cancel?.();
      animation.revert?.();
    };
  });
}
