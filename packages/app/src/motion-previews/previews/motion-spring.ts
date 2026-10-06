/// <reference lib="dom" />

import { ensureSharedTicker, markLive, runWhenVisible } from "../slider.ts";

export function mountPreview(el: HTMLElement): Promise<() => void> {
  return runWhenVisible(el, async () => {
    await ensureSharedTicker();
    const loaded = await import("motion");
    el.innerHTML =
      '<div class="hh-motion__track"><span class="hh-motion__knob" data-knob></span></div>';
    const knob = el.querySelector("[data-knob]");
    if (!(knob instanceof HTMLElement)) return () => undefined;
    markLive(el);
    const controls = loaded.animate(
      knob,
      { x: [0, 88, 0] },
      { type: "spring", bounce: 0.35, duration: 1.2, repeat: Infinity },
    );
    return () => {
      controls.stop();
    };
  });
}
