/// <reference lib="dom" />

import { ensureSharedTicker, markLive, onSharedTick, paintStill, runWhenVisible } from "../slider.ts";

export function mountPreview(el: HTMLElement): Promise<() => void> {
  return runWhenVisible(el, async () => {
    await ensureSharedTicker();
    const gsapLoaded = await import("gsap");
    const triggerLoaded = await import("gsap/ScrollTrigger");
    const gsap = gsapLoaded.gsap ?? gsapLoaded.default;
    const ScrollTrigger = triggerLoaded.ScrollTrigger ?? triggerLoaded.default;
    gsap.registerPlugin(ScrollTrigger);
    el.innerHTML =
      '<div class="hh-motion__cssport" data-scroller>' +
      '<div class="hh-motion__seq" data-pin><span class="hh-motion__bar" data-bar></span></div>' +
      '<div class="hh-motion__csspad"></div>' +
      "</div>";
    const scroller = el.querySelector("[data-scroller]");
    const pin = el.querySelector("[data-pin]");
    const bar = el.querySelector("[data-bar]");
    if (!(scroller instanceof HTMLElement) || !(pin instanceof HTMLElement) || !(bar instanceof HTMLElement)) {
      return () => undefined;
    }
    try {
      const tween = gsap.to(bar, { x: 160, ease: "none" });
      const trigger = ScrollTrigger.create({
        scroller,
        trigger: pin,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        animation: tween,
      });
      markLive(el);
      let y = 0;
      let dir = 1;
      const off = onSharedTick(() => {
        const limit = Math.min(80, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
        y += dir * 1.6;
        if (y >= limit) dir = -1;
        if (y <= 0) dir = 1;
        scroller.scrollTop = y;
        ScrollTrigger.update();
      });
      return () => {
        off();
        trigger.kill();
        tween.kill();
      };
    } catch {
      paintStill(el, "ScrollTrigger could not start in this frame.");
      return () => undefined;
    }
  });
}
