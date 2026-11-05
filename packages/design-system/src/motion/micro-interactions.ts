/**
 * Desktop cursor, one magnetic call to action, and a hover distortion.
 * The cursor stays off for coarse pointers. A second magnetic control is refused.
 */
import gsap from "gsap";
import { motionHandle } from "./handle.ts";
import { asElement, readDocument, readWindow, type MotionPointerEvent } from "./host.ts";
import type { MotionHandle } from "./types.ts";

export interface MicroInteractionsOptions {
  magnetic?: boolean;
  magneticTarget?: unknown;
  media?: unknown;
  cursor?: boolean;
}

const MAGNET_MAX = 8;
let magneticHeld = false;

function claimMagnetic(): void {
  if (magneticHeld) throw new Error("A page can hold one magnetic CTA.");
  magneticHeld = true;
}

function releaseMagnetic(): void {
  magneticHeld = false;
}

function finePointer(): boolean {
  const window = readWindow();
  const fine = window.matchMedia("(pointer: fine)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return fine && !coarse;
}

export function createMicroInteractions(target: unknown, options: MicroInteractionsOptions = {}): MotionHandle {
  const window = readWindow();
  const document = readDocument();
  const root = asElement(target);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wantsMagnet = options.magnetic === true || options.magneticTarget !== undefined;
  if (wantsMagnet) claimMagnetic();
  gsap.set(root, { opacity: 1 });
  if (options.magneticTarget !== undefined) gsap.set(asElement(options.magneticTarget), { opacity: 1 });
  if (options.media !== undefined) gsap.set(asElement(options.media), { opacity: 1, scale: 1 });

  if (reduced) {
    return motionHandle(true, () => {}, () => {
      if (wantsMagnet) releaseMagnetic();
    });
  }

  const undo: Array<() => void> = [];
  const tweens: Array<{ kill(): void }> = [];
  const remember = (tween: { kill(): void }): void => {
    tweens.push(tween);
  };

  if (options.cursor !== false && finePointer()) {
    const cursor = document.createElement("div");
    cursor.style.position = "fixed";
    cursor.style.left = "0";
    cursor.style.top = "0";
    cursor.style.pointerEvents = "none";
    cursor.setAttribute?.("data-motion-cursor", "");
    document.body.appendChild?.(cursor);
    const onMove = (event: MotionPointerEvent): void => {
      remember(gsap.to(cursor, { x: event.clientX, y: event.clientY, duration: 0.2, ease: "power2.out" }));
    };
    window.addEventListener("pointermove", onMove);
    undo.push(() => {
      window.removeEventListener("pointermove", onMove);
      document.body.removeChild?.(cursor);
    });
  }

  if (wantsMagnet && finePointer()) {
    const magnet = asElement(options.magneticTarget ?? root);
    const onMove = (event: MotionPointerEvent): void => {
      const rect = magnet.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const x = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dx * 0.25));
      const y = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dy * 0.25));
      remember(gsap.to(magnet, { x, y, duration: 0.3, ease: "power2.out" }));
    };
    const onLeave = (): void => {
      remember(gsap.to(magnet, { x: 0, y: 0, duration: 0.3, ease: "power2.out" }));
    };
    magnet.addEventListener("pointermove", onMove);
    magnet.addEventListener("pointerleave", onLeave);
    undo.push(() => {
      magnet.removeEventListener("pointermove", onMove);
      magnet.removeEventListener("pointerleave", onLeave);
    });
  }

  if (options.media !== undefined && finePointer()) {
    const media = asElement(options.media);
    const uniform = { value: 0 };
    const onEnter = (): void => {
      remember(gsap.to(media, { scale: 1.03, duration: 0.35, ease: "power2.out" }));
      remember(gsap.to(uniform, { value: 1, duration: 0.35, ease: "power2.out" }));
    };
    const onLeave = (): void => {
      remember(gsap.to(media, { scale: 1, opacity: 1, duration: 0.35, ease: "power2.out" }));
      remember(gsap.to(uniform, { value: 0, duration: 0.35, ease: "power2.out" }));
    };
    media.addEventListener("pointerenter", onEnter);
    media.addEventListener("pointerleave", onLeave);
    undo.push(() => {
      media.removeEventListener("pointerenter", onEnter);
      media.removeEventListener("pointerleave", onLeave);
    });
  }

  return motionHandle(
    false,
    () => {},
    () => {
      if (wantsMagnet) releaseMagnetic();
      for (const tween of tweens) tween.kill();
      tweens.length = 0;
      for (const release of undo) release();
      undo.length = 0;
      gsap.set(root, { opacity: 1 });
    },
  );
}
