/**
 * One scroll owner. Lenis drives the frame. ScrollTrigger listens.
 * Reduced motion skips Lenis and shows the end state.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { readDocument, readWindow, type HostDocument } from "./host.ts";

export function mountLenis(): () => void {
  const window = readWindow();
  const document = readDocument();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.set("[data-motion]", { opacity: 1, yPercent: 0 });
    return () => {};
  }
  gsap.registerPlugin(ScrollTrigger);
  const lenis = new Lenis({ autoRaf: false, smoothTouch: false });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(driveLenis);
  gsap.ticker.lagSmoothing(0);
  function driveLenis(time: number): void {
    lenis.raf(time * 1000);
  }
  refreshAfterMedia(document);
  return () => {
    gsap.ticker.remove(driveLenis);
    lenis.destroy();
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
