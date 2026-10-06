/// <reference lib="dom" />

import { ensureSharedTicker, markLive, paintStill, runWhenVisible } from "../slider.ts";

export function mountPreview(el: HTMLElement): Promise<() => void> {
  return runWhenVisible(el, async () => {
    await ensureSharedTicker();
    const gsapLoaded = await import("gsap");
    const splitLoaded = await import("gsap/SplitText");
    const gsap = gsapLoaded.gsap ?? gsapLoaded.default;
    const SplitText = splitLoaded.SplitText ?? splitLoaded.default;
    gsap.registerPlugin(SplitText);
    el.innerHTML = '<p class="hh-motion__headline" data-line>The line arrives one word at a time</p>';
    const line = el.querySelector("[data-line]");
    if (!(line instanceof HTMLElement)) return () => undefined;
    try {
      const split = SplitText.create(line, { type: "words" });
      const tween = gsap.from(split.words, {
        y: 16,
        opacity: 0,
        stagger: 0.08,
        duration: 0.6,
        ease: "power3.out",
        repeat: -1,
        yoyo: true,
      });
      markLive(el);
      return () => {
        tween.kill();
        split.revert();
      };
    } catch {
      paintStill(el, "SplitText could not start in this frame.");
      return () => undefined;
    }
  });
}
