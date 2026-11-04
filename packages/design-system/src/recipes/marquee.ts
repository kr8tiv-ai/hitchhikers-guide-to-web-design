/** Endless sideways marquee. No second scroll owner. */
import gsap from "gsap";
import { readWindow } from "./host.ts";

export function mountMarquee(selector = "[data-marquee]"): () => void {
  const window = readWindow();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.set(selector, { opacity: 1, xPercent: 0 });
    return () => {};
  }
  const tween = gsap.to(selector, {
    xPercent: -50,
    ease: "none",
    duration: 18,
    repeat: -1,
  });
  return () => {
    tween.kill();
  };
}
