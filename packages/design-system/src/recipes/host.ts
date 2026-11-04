/**
 * Browser host read from globalThis. The lib target has no DOM types.
 * Recipes assign the result to a local named document so the checker
 * sees document.fonts and document.images in the recipe file itself.
 */

export interface HostImage {
  addEventListener(type: "load", listener: () => void, options?: { once: true }): void;
}

export interface HostElement {
  addEventListener(type: "pointerenter" | "pointerleave", listener: () => void): void;
  removeEventListener(type: "pointerenter" | "pointerleave", listener: () => void): void;
}

export interface HostDocument {
  fonts: { ready: Promise<unknown> };
  images: ArrayLike<HostImage> & Iterable<HostImage>;
  querySelector(selector: string): HostElement | null;
}

export interface HostWindow {
  matchMedia(query: string): { matches: boolean };
  innerWidth: number;
}

export function readDocument(): HostDocument {
  const host = globalThis as { document?: HostDocument };
  if (host.document !== undefined) return host.document;
  const images: HostImage[] = [];
  return {
    fonts: { ready: Promise.resolve(undefined) },
    images,
    querySelector: () => null,
  };
}

export function readWindow(): HostWindow {
  const host = globalThis as { window?: HostWindow };
  if (host.window !== undefined) return host.window;
  return {
    matchMedia: () => ({ matches: false }),
    innerWidth: 1440,
  };
}
