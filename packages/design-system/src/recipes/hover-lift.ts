/** Lift a card on hover with translate and scale. */
import gsap from "gsap";
import { readDocument, readWindow } from "./host.ts";

export function mountHoverLift(selector = "[data-hover-lift]"): () => void {
  const window = readWindow();
  const document = readDocument();
  const target = document.querySelector(selector);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (target !== null) gsap.set(target, { y: 0, scale: 1, opacity: 1 });
    return () => {};
  }
  if (target === null) return () => {};
  const enter = (): void => {
    gsap.to(target, { y: -8, scale: 1.02, duration: 0.45, ease: "power2.out" });
  };
  const leave = (): void => {
    gsap.to(target, { y: 0, scale: 1, duration: 0.45, ease: "power2.out" });
  };
  target.addEventListener("pointerenter", enter);
  target.addEventListener("pointerleave", leave);
  return () => {
    target.removeEventListener("pointerenter", enter);
    target.removeEventListener("pointerleave", leave);
  };
}
