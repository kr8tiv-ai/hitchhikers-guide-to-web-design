/**
 * The one scroll owner. Lenis rides the GSAP ticker.
 * Reduced motion skips Lenis and shows the rested state.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { motionHandle } from "./handle.ts";
import { readDocument, readWindow, type MotionMedia } from "./host.ts";
import type { MotionHandle } from "./types.ts";

let current: MotionHandle | undefined;

function armSetupMedia(document: { fonts: { ready: Promise<unknown> }; images: readonly MotionMedia[] }, undo: Array<() => void>): void {
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

function startOwner(): MotionHandle {
  const window = readWindow();
  const document = readDocument();
  const media = gsap.matchMedia();
  const undo: Array<() => void> = [];
  let reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let drive: ((time: number) => void) | undefined;

  media.add("(prefers-reduced-motion: reduce)", () => {
    reduced = true;
    gsap.set("[data-motion]", { opacity: 1, yPercent: 0 });
    return () => {
      reduced = false;
    };
  });

  media.add("(prefers-reduced-motion: no-preference)", () => {
    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ autoRaf: false, smoothTouch: false });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(
      (drive = (time: number): void => {
        lenis.raf(time * 1000);
      }),
    );
    gsap.ticker.lagSmoothing(0);
    armSetupMedia(document, undo);
    return () => {
      if (drive !== undefined) gsap.ticker.remove(drive);
      lenis.destroy();
      drive = undefined;
    };
  });

  return motionHandle(
    reduced,
    () => {
      ScrollTrigger.refresh();
    },
    () => {
      for (const release of undo) release();
      undo.length = 0;
      media.revert();
    },
  );
}

/** One Lenis for the page. A second call returns the handle already running. */
export function motionSetup(): MotionHandle {
  if (current !== undefined) return current;
  const handle = startOwner();
  const wrapped: MotionHandle = {
    reduced: handle.reduced,
    refresh() {
      handle.refresh();
    },
    kill() {
      if (current === undefined) return;
      current = undefined;
      handle.kill();
    },
  };
  current = wrapped;
  return wrapped;
}
