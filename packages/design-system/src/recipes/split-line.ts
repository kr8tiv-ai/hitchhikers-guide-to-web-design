/** Split a headline into lines and reveal each line. */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { readDocument, readWindow, type HostDocument } from "./host.ts";

export function mountSplitLine(selector = "[data-split-line]"): () => void {
  const window = readWindow();
  const document = readDocument();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.set(selector, { opacity: 1, yPercent: 0, clipPath: "inset(0% 0% 0% 0%)" });
    return () => {};
  }
  gsap.registerPlugin(ScrollTrigger, SplitText);
  const split = SplitText.create(selector, { type: "lines", mask: "lines", aria: "auto" });
  const tween = gsap.from(split.lines, {
    yPercent: 100,
    opacity: 0,
    clipPath: "inset(100% 0% 0% 0%)",
    duration: 0.9,
    stagger: 0.08,
    ease: "expo.out",
    scrollTrigger: { start: "top 80%" },
  });
  refreshAfterMedia(document);
  return () => {
    tween.kill();
    split.revert();
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
