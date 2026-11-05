/**
 * Scroll drives a plain progress value along a camera path.
 * The render loop reads sample(). This module does not start a second frame loop.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motionHandle } from "./handle.ts";
import { asElement, readDocument, readWindow, type MotionMedia } from "./host.ts";
import type { CameraKeyframe, CameraSample, MotionHandle } from "./types.ts";

export interface ScrollCameraOptions {
  keyframes: readonly CameraKeyframe[];
  end?: string;
  scrub?: boolean | number;
  start?: string;
}

export interface ScrollCameraHandle extends MotionHandle {
  progress: { value: number };
  sample(): CameraSample;
}

function armCameraMedia(document: { fonts: { ready: Promise<unknown> }; images: readonly MotionMedia[] }, undo: Array<() => void>): void {
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

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export function sampleCamera(keyframes: readonly CameraKeyframe[], progress: number): CameraSample {
  const first = keyframes[0];
  if (first === undefined) {
    return { x: 0, y: 0, z: 4, lookAt: { x: 0, y: 0, z: 0 } };
  }
  const sorted = [...keyframes].sort((left, right) => left.at - right.at);
  const cursor = Math.min(1, Math.max(0, progress));
  let previous = sorted[0] ?? first;
  for (const frame of sorted) {
    if (frame.at >= cursor) {
      const span = frame.at - previous.at;
      const amount = span <= 0 ? 1 : (cursor - previous.at) / span;
      return {
        x: lerp(previous.position.x, frame.position.x, amount),
        y: lerp(previous.position.y, frame.position.y, amount),
        z: lerp(previous.position.z, frame.position.z, amount),
        lookAt: {
          x: lerp(previous.lookAt.x, frame.lookAt.x, amount),
          y: lerp(previous.lookAt.y, frame.lookAt.y, amount),
          z: lerp(previous.lookAt.z, frame.lookAt.z, amount),
        },
      };
    }
    previous = frame;
  }
  const last = sorted[sorted.length - 1] ?? first;
  return { x: last.position.x, y: last.position.y, z: last.position.z, lookAt: last.lookAt };
}

export function createScrollCamera(target: unknown, options: ScrollCameraOptions): ScrollCameraHandle {
  if (options.keyframes.length === 0) throw new Error("scrollCamera needs at least one keyframe.");
  const window = readWindow();
  const document = readDocument();
  const trigger = asElement(target);
  const progress = { value: 0 };
  const undo: Array<() => void> = [];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    progress.value = 1;
    gsap.set(trigger, { opacity: 1 });
    const handle = motionHandle(true, () => {}, () => {});
    return { ...handle, progress, sample: () => sampleCamera(options.keyframes, progress.value) };
  }
  gsap.registerPlugin(ScrollTrigger);
  const tween = gsap.to(progress, {
    value: 1,
    ease: "none",
    scrollTrigger: {
      trigger,
      start: options.start ?? "top top",
      end: options.end ?? "+=200%",
      scrub: options.scrub ?? 1,
      invalidateOnRefresh: true,
    },
  });
  armCameraMedia(document, undo);
  const handle = motionHandle(
    false,
    () => {
      ScrollTrigger.refresh();
    },
    () => {
      tween.kill();
      for (const release of undo) release();
    },
  );
  return { ...handle, progress, sample: () => sampleCamera(options.keyframes, progress.value) };
}
