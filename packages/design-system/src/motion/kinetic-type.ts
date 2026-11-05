/** Masked SplitText reveal. kill() reverts the split and unwraps the clip. */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { motionHandle } from "./handle.ts";
import { asElement, readDocument, readWindow, type MotionElement, type MotionMedia } from "./host.ts";
import { takenDuration, takenEase } from "./token-choice.ts";
import type { MotionTokenChoice } from "./token-choice.ts";
import type { KineticUnit, MotionHandle } from "./types.ts";

export interface KineticTypeOptions extends MotionTokenChoice {
  unit?: KineticUnit;
  scrub?: boolean | number;
  start?: string;
}

const SPLIT_TYPE: Record<KineticUnit, string> = {
  line: "lines",
  word: "words",
  char: "chars",
};

function armKineticMedia(document: { fonts: { ready: Promise<unknown> }; images: readonly MotionMedia[] }, undo: Array<() => void>): void {
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

function pieces(split: { lines: readonly unknown[]; words: readonly unknown[]; chars: readonly unknown[] }, unit: KineticUnit): readonly unknown[] {
  if (unit === "word") return split.words;
  if (unit === "char") return split.chars;
  return split.lines;
}

function clipWrap(target: MotionElement): { parent: MotionElement; wrap: MotionElement } | null {
  const parent = target.parentNode ?? null;
  if (parent === null || parent.insertBefore === undefined) return null;
  const wrap = readDocument().createElement("div");
  wrap.style.overflow = "clip";
  wrap.setAttribute?.("data-motion-mask", "");
  parent.insertBefore(wrap, target);
  wrap.appendChild?.(target);
  return { parent, wrap };
}

export function createKineticType(target: unknown, options: KineticTypeOptions = {}): MotionHandle {
  const window = readWindow();
  const document = readDocument();
  const node = asElement(target);
  const unit = options.unit ?? "line";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.set(node, { opacity: 1, yPercent: 0 });
    return motionHandle(true, () => {}, () => {});
  }
  gsap.registerPlugin(ScrollTrigger, SplitText);
  const undo: Array<() => void> = [];
  const wrapped = clipWrap(node);
  const split = SplitText.create(node, { type: SPLIT_TYPE[unit], mask: SPLIT_TYPE[unit], aria: "auto" });
  const tween = gsap.from(pieces(split, unit), {
    yPercent: 100,
    opacity: 0,
    duration: takenDuration(options.duration, 0.9),
    stagger: 0.08,
    ease: takenEase(options.ease, "expo.out"),
    scrollTrigger: { trigger: node, start: options.start ?? "top 80%" },
  });
  armKineticMedia(document, undo);
  return motionHandle(
    false,
    () => {
      ScrollTrigger.refresh();
    },
    () => {
      tween.kill();
      split.revert();
      if (wrapped !== null) {
        wrapped.parent.insertBefore?.(node, wrapped.wrap);
        wrapped.parent.removeChild?.(wrapped.wrap);
      }
      for (const release of undo) release();
    },
  );
}
