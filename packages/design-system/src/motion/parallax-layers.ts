/** Subtle parallax. Transform only, and travel stays inside a small cap. */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motionHandle } from "./handle.ts";
import { asElement, readDocument, readWindow, type MotionMedia } from "./host.ts";
import { takenEase } from "./token-choice.ts";
import type { MotionTokenChoice } from "./token-choice.ts";
import type { MotionHandle } from "./types.ts";

export interface ParallaxLayer {
  target: unknown;
  travel?: number;
}

export interface ParallaxLayersOptions extends MotionTokenChoice {
  layers?: readonly ParallaxLayer[];
  travel?: number;
}

/** Hard cap so a layer cannot drift across the section. */
export const PARALLAX_TRAVEL_CAP = 12;

function armParallaxMedia(document: { fonts: { ready: Promise<unknown> }; images: readonly MotionMedia[] }, undo: Array<() => void>): void {
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

function capped(value: number): number {
  return Math.min(Math.abs(value), PARALLAX_TRAVEL_CAP);
}

export function createParallaxLayers(target: unknown, options: ParallaxLayersOptions = {}): MotionHandle {
  const window = readWindow();
  const document = readDocument();
  const fallback = capped(options.travel ?? 8);
  const layers = options.layers ?? [{ target, travel: fallback }];
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (const layer of layers) gsap.set(asElement(layer.target), { opacity: 1, yPercent: 0 });
    return motionHandle(true, () => {}, () => {});
  }
  gsap.registerPlugin(ScrollTrigger);
  const undo: Array<() => void> = [];
  const tweens = layers.map((layer) => {
    const node = asElement(layer.target);
    const travel = capped(layer.travel ?? fallback);
    return gsap.fromTo(
      node,
      { yPercent: travel },
      {
        yPercent: -travel,
        ease: takenEase(options.ease, "none"),
        scrollTrigger: {
          trigger: node,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
          invalidateOnRefresh: true,
        },
      },
    );
  });
  armParallaxMedia(document, undo);
  return motionHandle(
    false,
    () => {
      ScrollTrigger.refresh();
    },
    () => {
      for (const tween of tweens) tween.kill();
      for (const release of undo) release();
    },
  );
}
