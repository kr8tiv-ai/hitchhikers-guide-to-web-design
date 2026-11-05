/** Canvas frame sequence. Scroll snaps to a whole frame. A poster paints first. */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motionHandle } from "./handle.ts";
import { asElement, imageConstructor, readDocument, readWindow, type MotionContext2D, type MotionElement, type MotionMedia } from "./host.ts";
import type { MotionHandle } from "./types.ts";

export interface FrameSequenceOptions {
  frames: readonly string[];
  poster?: MotionMedia;
  end?: string;
  scrub?: boolean | number;
}

function armFrameMedia(document: { fonts: { ready: Promise<unknown> }; images: readonly MotionMedia[] }, undo: Array<() => void>): void {
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

/** Progress snapped onto a frame boundary in the 0 to 1 range. */
export function snapFrameProgress(progress: number, frameCount: number): number {
  if (frameCount <= 1) return 0;
  const clamped = Math.min(1, Math.max(0, progress));
  const steps = frameCount - 1;
  const index = Math.round(clamped * steps);
  return index / steps;
}

function paint(context: MotionContext2D, image: unknown, canvas: MotionElement): void {
  const width = canvas.width ?? canvas.clientWidth ?? 0;
  const height = canvas.height ?? 0;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
}

function loadFrames(sources: readonly string[]): MotionMedia[] {
  const Ctor = imageConstructor();
  return sources.map((src) => {
    const image = new Ctor();
    image.src = src;
    return image;
  });
}

export function createFrameSequence(target: unknown, options: FrameSequenceOptions): MotionHandle {
  const window = readWindow();
  const document = readDocument();
  const canvas = asElement(target);
  const context = canvas.getContext?.("2d") ?? null;
  if (context === null) throw new Error("frameSequence needs a canvas.");
  const frames = loadFrames(options.frames);
  const count = Math.max(frames.length, 1);
  const poster = options.poster ?? frames[0];
  if (poster !== undefined) paint(context, poster, canvas);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const still = frames[frames.length - 1] ?? poster;
    if (still !== undefined) paint(context, still, canvas);
    gsap.set(canvas, { opacity: 1 });
    return motionHandle(true, () => {}, () => {});
  }
  gsap.registerPlugin(ScrollTrigger);
  const undo: Array<() => void> = [];
  const state = { frame: 0 };
  const tween = gsap.to(state, {
    frame: count - 1,
    ease: "none",
    scrollTrigger: {
      trigger: canvas,
      start: "top top",
      end: options.end ?? "+=200%",
      pin: true,
      pinType: "transform",
      scrub: options.scrub ?? true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      snap: (value: number) => snapFrameProgress(value, count),
      onUpdate: (self) => {
        const index = Math.round(self.progress * Math.max(count - 1, 0));
        const image = frames[index] ?? poster;
        if (image !== undefined) paint(context, image, canvas);
      },
    },
  });
  armFrameMedia(document, undo);
  return motionHandle(
    false,
    () => {
      ScrollTrigger.refresh();
    },
    () => {
      tween.kill();
      for (const release of undo) release();
    },
  );
}
