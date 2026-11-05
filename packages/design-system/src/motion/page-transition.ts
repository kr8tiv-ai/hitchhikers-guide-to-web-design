/**
 * Shared element or page change.
 * The View Transitions API runs when the document has it. Flip is the fallback.
 */
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { motionHandle } from "./handle.ts";
import { asElement, readDocument, readWindow } from "./host.ts";
import { takenDuration, takenEase } from "./token-choice.ts";
import type { MotionTokenChoice } from "./token-choice.ts";
import type { MotionHandle } from "./types.ts";

export interface PageTransitionOptions extends MotionTokenChoice {
  duration?: number;
}

export interface PageTransitionHandle extends MotionHandle {
  go(update: () => void): Promise<void>;
}

export function createPageTransition(target: unknown, options: PageTransitionOptions = {}): PageTransitionHandle {
  const window = readWindow();
  const node = asElement(target);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let flipTween: { kill(): void } | undefined;
  if (reduced) gsap.set(node, { opacity: 1 });

  const go = (update: () => void): Promise<void> => {
    if (reduced) {
      update();
      gsap.set(node, { opacity: 1 });
      return Promise.resolve();
    }
    const document = readDocument();
    if (typeof document.startViewTransition === "function") {
      const transition = document.startViewTransition(() => {
        update();
      });
      return transition.finished;
    }
    gsap.registerPlugin(Flip);
    const state = Flip.getState(node);
    update();
    flipTween = Flip.from(state, { duration: takenDuration(options.duration, 0.6), ease: takenEase(options.ease, "power2.out") });
    return Promise.resolve();
  };

  const handle = motionHandle(
    reduced,
    () => {},
    () => {
      flipTween?.kill();
      flipTween = undefined;
      gsap.set(node, { opacity: 1 });
    },
  );
  return { ...handle, go };
}
