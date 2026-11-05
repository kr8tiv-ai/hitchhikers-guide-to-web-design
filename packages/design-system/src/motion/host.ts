/**
 * DOM reads for the motion modules. The package lib has no DOM types.
 * A recipe names its local document so the recipe checker can see
 * document.fonts and document.images in that file.
 */

export interface MotionPointerEvent {
  clientX: number;
  clientY: number;
}

export interface MotionStyle {
  overflow?: string;
  opacity?: string;
  transform?: string;
  position?: string;
  left?: string;
  top?: string;
  pointerEvents?: string;
  width?: string;
  height?: string;
}

export interface MotionListenerTarget {
  addEventListener(type: string, listener: (event: MotionPointerEvent) => void, options?: { once?: boolean }): void;
  removeEventListener(type: string, listener: (event: MotionPointerEvent) => void): void;
}

export interface MotionElement extends MotionListenerTarget {
  style: MotionStyle;
  scrollWidth?: number;
  clientWidth?: number;
  width?: number;
  height?: number;
  children?: readonly MotionElement[];
  parentElement?: MotionElement | null;
  parentNode?: MotionElement | null;
  appendChild?(child: MotionElement): void;
  insertBefore?(node: MotionElement, child: MotionElement | null): void;
  removeChild?(child: MotionElement): void;
  setAttribute?(name: string, value: string): void;
  getAttribute?(name: string): string | null;
  querySelector?(selector: string): MotionElement | null;
  querySelectorAll?(selector: string): ArrayLike<MotionElement>;
  getBoundingClientRect?(): { left: number; top: number; width: number; height: number };
  getContext?(kind: "2d"): MotionContext2D | null;
}

export interface MotionContext2D {
  drawImage(image: unknown, x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect?(x: number, y: number, w: number, h: number): void;
}

export interface MotionMedia extends MotionListenerTarget {
  decode?(): Promise<void>;
  complete?: boolean;
  readyState?: number;
  src?: string;
}

export interface ViewTransition {
  finished: Promise<void>;
}

export interface MotionDocument extends MotionListenerTarget {
  fonts: { ready: Promise<unknown> };
  images: readonly MotionMedia[];
  body: MotionElement;
  querySelector(selector: string): MotionElement | null;
  querySelectorAll?(selector: string): ArrayLike<MotionElement>;
  createElement(tag: string): MotionElement;
  startViewTransition?: (update: () => void) => ViewTransition;
}

export interface MotionWindow extends MotionListenerTarget {
  matchMedia(query: string): { matches: boolean };
  innerWidth: number;
  Image?: new () => MotionMedia;
}

export function readDocument(): MotionDocument {
  const host = globalThis as { document?: MotionDocument };
  if (host.document !== undefined) return host.document;
  const images: MotionMedia[] = [];
  const body = emptyElement();
  return {
    fonts: { ready: Promise.resolve(undefined) },
    images,
    body,
    querySelector: () => null,
    createElement: () => emptyElement(),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

export function readWindow(): MotionWindow {
  const host = globalThis as { window?: MotionWindow };
  if (host.window !== undefined) return host.window;
  return {
    matchMedia: () => ({ matches: false }),
    innerWidth: 1440,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

export function asElement(target: unknown): MotionElement {
  if (typeof target === "string") {
    const found = readDocument().querySelector(target);
    if (found === null) throw new Error("Motion target was not found.");
    return found;
  }
  if (typeof target !== "object" || target === null) throw new Error("Motion target was not found.");
  return target as MotionElement;
}

export function imageConstructor(): new () => MotionMedia {
  const window = readWindow();
  if (window.Image !== undefined) return window.Image;
  const host = globalThis as { Image?: new () => MotionMedia };
  if (host.Image !== undefined) return host.Image;
  return class FallbackImage {
    src = "";
    complete = true;
    addEventListener(): void {}
    removeEventListener(): void {}
  };
}

function emptyElement(): MotionElement {
  return {
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
