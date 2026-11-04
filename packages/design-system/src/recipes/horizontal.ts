/** Pin a row and move it sideways. The track uses ease none so it stays linear. */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { readDocument, readWindow, type HostDocument } from "./host.ts";

export function mountHorizontal(selector = "[data-horizontal]"): () => void {
  const window = readWindow();
  const document = readDocument();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.set(selector, { opacity: 1, xPercent: 0 });
    return () => {};
  }
  gsap.registerPlugin(ScrollTrigger);
  const row = document.querySelector(selector);
  const panels = gsap.utils.toArray(`${selector} > *`);
  const tween = gsap.to(panels, {
    xPercent: -100 * Math.max(panels.length - 1, 1),
    ease: "none",
    scrollTrigger: {
      trigger: row,
      pin: true,
      scrub: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      start: "top top",
      end: () => "+=" + String(window.innerWidth * Math.max(panels.length - 1, 1)),
    },
  });
  refreshAfterMedia(document);
  return () => {
    tween.kill();
  };
}

function refreshAfterMedia(document: HostDocument): void {
  const refresh = (): void => {
    ScrollTrigger.refresh();
  };
  void document.fonts.ready.then(refresh);
  for (const image of document.images) {
    image.addEventListener("load", refresh, { once: true });
  }
}
