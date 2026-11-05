/** Pinned timeline that settles on its labels. */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motionHandle } from "./handle.ts";
import { asElement, readDocument, readWindow, type MotionMedia } from "./host.ts";
import type { MotionHandle } from "./types.ts";

export interface SnapLabel {
  name: string;
  at?: string | number;
}

export interface SnapToLabelsOptions {
  end?: string;
  scrub?: boolean | number;
  labels?: readonly SnapLabel[];
}

function armSnapMedia(document: { fonts: { ready: Promise<unknown> }; images: readonly MotionMedia[] }, undo: Array<() => void>): void {
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

export function createSnapToLabels(target: unknown, options: SnapToLabelsOptions = {}): MotionHandle {
  const window = readWindow();
  const document = readDocument();
  const trigger = asElement(target);
  const labels = options.labels ?? [
    { name: "start", at: 0 },
    { name: "end", at: 1 },
  ];
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.set(trigger, { opacity: 1, yPercent: 0 });
    return motionHandle(true, () => {}, () => {});
  }
  gsap.registerPlugin(ScrollTrigger);
  const undo: Array<() => void> = [];
  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger,
      start: "top top",
      end: options.end ?? "+=150%",
      pin: true,
      pinType: "transform",
      scrub: options.scrub ?? 1,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      snap: {
        snapTo: "labelsDirectional",
        duration: { min: 0.2, max: 0.8 },
        delay: 0.1,
        ease: "power1.inOut",
      },
    },
  });
  for (const label of labels) timeline.addLabel(label.name, label.at);
  timeline.from(trigger, { yPercent: 16, opacity: 0 }, 0);
  armSnapMedia(document, undo);
  return motionHandle(
    false,
    () => {
      ScrollTrigger.refresh();
    },
    () => {
      timeline.kill();
      for (const release of undo) release();
    },
  );
}
