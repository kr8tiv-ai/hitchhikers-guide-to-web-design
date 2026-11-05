/** Pin a section and scrub a labelled timeline. */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motionHandle } from "./handle.ts";
import { asElement, readDocument, readWindow, type MotionMedia } from "./host.ts";
import type { MotionHandle } from "./types.ts";

export interface PinnedBeat {
  target: unknown;
  vars: { opacity?: number; yPercent?: number; x?: number; y?: number; scale?: number; duration?: number; ease?: string };
  at?: string | number;
  label?: string;
}

export interface PinnedLabel {
  name: string;
  at?: string | number;
}

export interface PinnedTimelineOptions {
  end?: string;
  scrub?: boolean | number;
  start?: string;
  beats?: readonly PinnedBeat[];
  labels?: readonly PinnedLabel[];
}

function armPinnedMedia(document: { fonts: { ready: Promise<unknown> }; images: readonly MotionMedia[] }, undo: Array<() => void>): void {
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

function showPinned(target: unknown, beats: readonly PinnedBeat[]): void {
  gsap.set(target, { opacity: 1, yPercent: 0 });
  for (const beat of beats) gsap.set(beat.target, { opacity: 1, yPercent: 0 });
}

export function createPinnedTimeline(target: unknown, options: PinnedTimelineOptions = {}): MotionHandle {
  const window = readWindow();
  const document = readDocument();
  const trigger = asElement(target);
  const beats = options.beats ?? [{ target: trigger, vars: { yPercent: 24, opacity: 0 } }];
  const undo: Array<() => void> = [];
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    showPinned(trigger, beats);
    return motionHandle(true, () => {}, () => {});
  }
  gsap.registerPlugin(ScrollTrigger);
  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger,
      start: options.start ?? "top top",
      end: options.end ?? "+=150%",
      pin: true,
      pinType: "transform",
      scrub: options.scrub ?? 1,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });
  timeline.addLabel("start", 0);
  for (const beat of beats) {
    if (beat.label !== undefined) timeline.addLabel(beat.label, beat.at);
    timeline.from(beat.target, beat.vars, beat.at);
  }
  for (const label of options.labels ?? []) timeline.addLabel(label.name, label.at);
  timeline.addLabel("end");
  armPinnedMedia(document, undo);
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
