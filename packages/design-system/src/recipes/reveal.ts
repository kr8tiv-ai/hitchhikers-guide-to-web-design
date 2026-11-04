/** Fade and translate a block into view. Transform and opacity only. */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { readDocument, readWindow, type HostDocument } from "./host.ts";

export function mountReveal(selector = "[data-reveal]"): () => void {
  const window = readWindow();
  const document = readDocument();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.set(selector, { opacity: 1, yPercent: 0 });
    return () => {};
  }
  gsap.registerPlugin(ScrollTrigger);
  const tween = gsap.from(selector, {
    yPercent: 16,
    opacity: 0,
    duration: 0.9,
    ease: "expo.out",
    scrollTrigger: { start: "top 80%", once: true },
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
