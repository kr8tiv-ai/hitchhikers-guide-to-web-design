/** Vertical scroll drives a horizontal track. The end follows the track width. */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motionHandle } from "./handle.ts";
import { asElement, readDocument, readWindow, type MotionElement, type MotionMedia } from "./host.ts";
import type { MotionHandle } from "./types.ts";

export interface HorizontalTrackOptions {
  panels?: readonly unknown[];
  scrub?: boolean | number;
  start?: string;
}

function armHorizontalMedia(document: { fonts: { ready: Promise<unknown> }; images: readonly MotionMedia[] }, undo: Array<() => void>): void {
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

function panelList(track: MotionElement, options: HorizontalTrackOptions): readonly unknown[] {
  if (options.panels !== undefined && options.panels.length > 0) return options.panels;
  if (track.children !== undefined && track.children.length > 0) return track.children;
  return [track];
}

export function createHorizontalTrack(target: unknown, options: HorizontalTrackOptions = {}): MotionHandle {
  const window = readWindow();
  const document = readDocument();
  const track = asElement(target);
  const panels = panelList(track, options);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.set(track, { opacity: 1, xPercent: 0 });
    gsap.set(panels, { opacity: 1, xPercent: 0 });
    return motionHandle(true, () => {}, () => {});
  }
  gsap.registerPlugin(ScrollTrigger);
  const undo: Array<() => void> = [];
  const tween = gsap.to(panels, {
    xPercent: -100 * Math.max(panels.length - 1, 0),
    ease: "none",
    scrollTrigger: {
      trigger: track,
      pin: true,
      pinType: "transform",
      scrub: options.scrub ?? 1,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      start: options.start ?? "top top",
      end: () => "+=" + String(Math.max((track.scrollWidth ?? 0) - (track.clientWidth ?? 0), 0)),
    },
  });
  armHorizontalMedia(document, undo);
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
