/** Lift a card on hover with translate and scale. */
import gsap from "gsap";
import { takenDuration, takenEase, type MotionTokenChoice } from "../motion/token-choice.ts";
import { readDocument, readWindow } from "./host.ts";

export function mountHoverLift(selector = "[data-hover-lift]", choice: MotionTokenChoice = {}): () => void {
  const window = readWindow();
  const document = readDocument();
  const target = document.querySelector(selector);
  const ease = takenEase(choice.ease, "power2.out");
  const duration = takenDuration(choice.duration, 0.45);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (target !== null) gsap.set(target, { y: 0, scale: 1, opacity: 1 });
    return () => {};
  }
  if (target === null) return () => {};
  let tween: { kill(): void } | undefined;
  const enter = (): void => {
    tween?.kill();
    tween = gsap.to(target, { y: -8, scale: 1.02, duration, ease });
  };
  const leave = (): void => {
    tween?.kill();
    tween = gsap.to(target, { y: 0, scale: 1, duration, ease });
  };
  target.addEventListener("pointerenter", enter);
  target.addEventListener("pointerleave", leave);
  return () => {
    target.removeEventListener("pointerenter", enter);
    target.removeEventListener("pointerleave", leave);
    tween?.kill();
  };
}
