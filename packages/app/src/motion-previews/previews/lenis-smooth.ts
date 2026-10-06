/// <reference lib="dom" />

import { ensureSharedTicker, markLive, onSharedTick, paintStill, runWhenVisible } from "../slider.ts";

export function mountPreview(el: HTMLElement): Promise<() => void> {
  return runWhenVisible(el, async () => {
    await ensureSharedTicker();
    const gsapLoaded = await import("gsap");
    const triggerLoaded = await import("gsap/ScrollTrigger");
    const lenisLoaded = await import("lenis");
    const gsap = gsapLoaded.gsap ?? gsapLoaded.default;
    const ScrollTrigger = triggerLoaded.ScrollTrigger ?? triggerLoaded.default;
    const Lenis = lenisLoaded.default;
    gsap.registerPlugin(ScrollTrigger);
    el.innerHTML =
      '<div class="hh-motion__cssport" data-scroller>' +
      '<div class="hh-motion__lenis-content" data-content><span class="hh-motion__bar" data-bar></span></div>' +
      "</div>";
    const scroller = el.querySelector("[data-scroller]");
    const content = el.querySelector("[data-content]");
    const bar = el.querySelector("[data-bar]");
    if (!(scroller instanceof HTMLElement) || !(content instanceof HTMLElement) || !(bar instanceof HTMLElement)) {
      return () => undefined;
    }
    try {
      const lenis = new Lenis({
        wrapper: scroller,
        content,
        autoRaf: false,
        smoothWheel: true,
      });
      lenis.on("scroll", () => {
        ScrollTrigger.update();
      });
      const tween = gsap.to(bar, { x: 140, ease: "none", repeat: -1, yoyo: true, duration: 1.6 });
      markLive(el);
      let target = 0;
      let dir = 1;
      const off = onSharedTick((time) => {
        const limit = Math.min(48, Math.max(1, scroller.scrollHeight - scroller.clientHeight));
        target += dir * 0.7;
        if (target >= limit) dir = -1;
        if (target <= 0) dir = 1;
        lenis.scrollTo(target, { immediate: true, force: true });
        lenis.raf(time * 1000);
        ScrollTrigger.update();
      });
      return () => {
        off();
        tween.kill();
        lenis.destroy();
      };
    } catch {
      paintStill(el, "Lenis could not start in this frame.");
      return () => undefined;
    }
  });
}
