/** One ScrollTrigger.batch for a repeated list of cards. */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motionHandle } from "./handle.ts";
import { readDocument, readWindow, type MotionMedia } from "./host.ts";
import { takenDuration, takenEase } from "./token-choice.ts";
import type { MotionTokenChoice } from "./token-choice.ts";
import type { MotionHandle } from "./types.ts";

export interface BatchRevealOptions extends MotionTokenChoice {
  start?: string;
  yPercent?: number;
  stagger?: number;
}

function armBatchMedia(document: { fonts: { ready: Promise<unknown> }; images: readonly MotionMedia[] }, undo: Array<() => void>): void {
  const refresh = (): void => {
    ScrollTrigger.refresh();
  };
  void document.fonts.ready.then(refresh);
  for (const image of document.images) {
    const onLoad = (): void => {
      refresh();
    };
    image.addEventListener("load", onLoad, { once: true });
    undo.push(() => {
      image.removeEventListener("load", onLoad);
    });
  }
}

export function createBatchReveal(target: unknown, options: BatchRevealOptions = {}): MotionHandle {
  const window = readWindow();
  const document = readDocument();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.set(target, { opacity: 1, yPercent: 0 });
    return motionHandle(true, () => {}, () => {});
  }
  gsap.registerPlugin(ScrollTrigger);
  const undo: Array<() => void> = [];
  const distance = options.yPercent ?? 16;
  const batch = ScrollTrigger.batch(target, {
    start: options.start ?? "top 85%",
    once: true,
    onEnter: (cards) => {
      const tween = gsap.from(cards, {
        yPercent: distance,
        opacity: 0,
        stagger: options.stagger ?? 0.08,
        duration: takenDuration(options.duration, 0.9),
        ease: takenEase(options.ease, "expo.out"),
      });
      undo.push(() => {
        tween.kill();
      });
    },
  });
  armBatchMedia(document, undo);
  return motionHandle(
    false,
    () => {
      ScrollTrigger.refresh();
    },
    () => {
      for (const item of batch) item.kill();
      for (const release of undo) release();
    },
  );
}
