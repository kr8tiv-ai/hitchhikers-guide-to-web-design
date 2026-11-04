/** Parallax a media frame with transform and filter. The track stays linear. */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { readDocument, readWindow, type HostDocument } from "./host.ts";

export function mountParallax(selector = "[data-parallax]"): () => void {
  const window = readWindow();
  const document = readDocument();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.set(selector, { opacity: 1, yPercent: 0 });
    return () => {};
  }
  gsap.registerPlugin(ScrollTrigger);
  const tween = gsap.fromTo(
    selector,
    { yPercent: 12, filter: "blur(8px)" },
    {
      yPercent: -12,
      filter: "blur(0px)",
      ease: "none",
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
