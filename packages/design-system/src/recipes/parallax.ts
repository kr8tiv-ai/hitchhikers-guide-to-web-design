/** Parallax a media frame with transform and opacity. The track stays linear. */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { takenEase, type MotionTokenChoice } from "../motion/token-choice.ts";
import { readDocument, readWindow, type HostDocument } from "./host.ts";

export function mountParallax(selector = "[data-parallax]", choice: MotionTokenChoice = {}): () => void {
  const window = readWindow();
  const document = readDocument();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.set(selector, { opacity: 1, yPercent: 0 });
    return () => {};
  }
  gsap.registerPlugin(ScrollTrigger);
  const tween = gsap.fromTo(
    selector,
    { yPercent: 12, opacity: 0.85 },
    {
      yPercent: -12,
      opacity: 1,
      ease: takenEase(choice.ease, "none"),
      scrollTrigger: { start: "top bottom", end: "bottom top", scrub: true },
    },
  );
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
