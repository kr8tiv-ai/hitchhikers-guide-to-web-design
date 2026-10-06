/// <reference lib="dom" />

import { ensureSharedTicker, markLive, onSharedTick, runWhenVisible } from "../slider.ts";

export function mountPreview(el: HTMLElement): Promise<() => void> {
  return runWhenVisible(el, async () => {
    await ensureSharedTicker();
    el.innerHTML =
      '<div class="hh-motion__reveal">' +
      '<div class="hh-motion__cssport" data-scroller>' +
      '<p class="hh-motion__cssline">The line rises into view</p>' +
      '<div class="hh-motion__csspad"></div>' +
      "</div>" +
      '<p class="hh-motion__reveal-label">Scroll linked</p>' +
      "</div>";
    const scroller = el.querySelector("[data-scroller]");
    if (!(scroller instanceof HTMLElement)) return () => undefined;
    markLive(el);
    let y = 0;
    let dir = 1;
    const off = onSharedTick(() => {
      const limit = Math.min(72, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
      y += dir * 1.4;
      if (y >= limit) dir = -1;
      if (y <= 0) dir = 1;
      scroller.scrollTop = y;
    });
    return off;
  });
}
