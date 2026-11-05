/**
 * Wait for fonts and the hero media, then play the hero intro.
 * Reduced motion shows the hero immediately and still resolves.
 */
import gsap from "gsap";
import { motionHandle } from "./handle.ts";
import { asElement, readDocument, readWindow, type MotionMedia } from "./host.ts";
import type { MotionHandle } from "./types.ts";

export interface PreloaderHandoffOptions {
  media?: MotionMedia;
  overlay?: unknown;
  duration?: number;
}

export interface PreloaderHandle extends MotionHandle {
  ready: Promise<void>;
}

function mediaReady(media: MotionMedia, undo: Array<() => void>): Promise<void> {
  if (typeof media.decode === "function") return media.decode().then(() => undefined);
  if (media.complete === true || media.readyState === 4) return Promise.resolve();
  return new Promise((resolve) => {
    const onLoad = (): void => {
      resolve();
    };
    media.addEventListener("load", onLoad, { once: true });
    undo.push(() => {
      media.removeEventListener("load", onLoad);
    });
  });
}

export function createPreloaderHandoff(target: unknown, options: PreloaderHandoffOptions = {}): PreloaderHandle {
  const window = readWindow();
  const document = readDocument();
  const hero = asElement(target);
  const undo: Array<() => void> = [];
  let alive = true;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) gsap.set(hero, { opacity: 1, yPercent: 0 });
  if (options.overlay !== undefined && reduced) gsap.set(options.overlay, { opacity: 0 });

  const ready = document.fonts.ready
    .then(() => (options.media === undefined ? undefined : mediaReady(options.media, undo)))
    .then(() => {
      if (!alive || reduced) return;
      const timeline = gsap.timeline();
      if (options.overlay !== undefined) {
        timeline.to(options.overlay, { opacity: 0, duration: 0.45, ease: "power2.out" });
      }
      timeline.fromTo(
        hero,
        { opacity: 0, yPercent: 12 },
        { opacity: 1, yPercent: 0, duration: options.duration ?? 0.9, ease: "expo.out" },
      );
      undo.push(() => {
        timeline.kill();
      });
    })
    .then(
      () => undefined,
      () => {
        if (!alive) return;
        gsap.set(hero, { opacity: 1, yPercent: 0 });
      },
    );

  const handle = motionHandle(
    reduced,
    () => {},
    () => {
      alive = false;
      for (const release of undo) release();
      undo.length = 0;
      gsap.set(hero, { opacity: 1, yPercent: 0 });
    },
  );
  return { ...handle, ready };
}
