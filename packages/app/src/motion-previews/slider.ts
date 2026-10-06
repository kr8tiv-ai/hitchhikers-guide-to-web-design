/// <reference lib="dom" />

/**
 * Appetite ceilings from CONTEXT-PACKAGE v2 §8.3, with JS gzip budgets
 * from research/06. The note strings are the v2 table, verbatim, so the
 * later motion picker can copy them. Phone copy is separate.
 */

export interface WeightCeiling {
  maxJsKb: number;
  webgl: boolean;
  note: string;
}

export interface PhoneSignals {
  width: number;
  coarse: boolean;
  fine: boolean;
  saveData: boolean;
}

export type TickFn = (time: number, delta: number, frame: number) => void;

export interface TickerHost {
  add(fn: TickFn): void;
  remove(fn: TickFn): void;
}

const LEVELS: readonly WeightCeiling[] = [
  { maxJsKb: 90, webgl: false, note: "Native scroll, CSS hover, a load fade" },
  { maxJsKb: 90, webgl: false, note: "Reveals, button feedback" },
  { maxJsKb: 90, webgl: false, note: "Smooth scroll, headline splits, marquee" },
  { maxJsKb: 90, webgl: false, note: "Parallax, clip-path, page transitions" },
  {
    maxJsKb: 160,
    webgl: false,
    note: "One pinned story, optional custom cursor if it carries the brand, vector accents",
  },
  { maxJsKb: 160, webgl: true, note: "Scroll video or image sequence, one shader background" },
  {
    maxJsKb: 160,
    webgl: true,
    note: "Several scroll scenes, shared-element transitions, hover-distort, opt-in sound",
  },
  { maxJsKb: 250, webgl: true, note: "One 3D moment, phone still" },
  { maxJsKb: 250, webgl: true, note: "Scroll camera, particles, post, branded preloader" },
  { maxJsKb: 250, webgl: true, note: "Full world, physics, a dedicated phone path" },
];

const NAMES = [
  "Calm brochure",
  "Gentle",
  "Polished",
  "Editorial",
  "Expressive",
  "Cinematic lite",
  "Cinematic",
  "3D accent",
  "3D-led",
  "World",
] as const;

export const DEFAULT_APPETITE = 3;

export function weightCeiling(level: number): WeightCeiling {
  assertLevel(level);
  const row = LEVELS[level - 1];
  if (row === undefined) throw new Error("Appetite level is out of range.");
  return row;
}

export function appetiteName(level: number): string {
  assertLevel(level);
  const name = NAMES[level - 1];
  if (name === undefined) throw new Error("Appetite level is out of range.");
  return name;
}

export function webglCeilingSentence(level: number): string {
  assertLevel(level);
  return weightCeiling(level).webgl
    ? "WebGL in the ceiling: yes, one context."
    : "WebGL in the ceiling: no.";
}

export function phoneNote(level: number): string {
  assertLevel(level);
  if (level >= 6) {
    return "On a phone, level 6 and above keeps a calm still in place of the heavy scene. The number caps weight. It does not remove a library from the Guide.";
  }
  return "On a phone, this level stays as shown. Touch scroll stays native. The number caps weight. It does not remove a library from the Guide.";
}

export function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > 10) {
    throw new Error("Appetite level must be a whole number from 1 to 10.");
  }
}

export function readPhoneSignals(): PhoneSignals {
  const host = globalThis as {
    innerWidth?: number;
    matchMedia?: (query: string) => { matches: boolean };
    navigator?: { connection?: { saveData?: boolean } };
  };
  const media = host.matchMedia;
  return {
    width: host.innerWidth ?? 1280,
    coarse: media?.("(pointer: coarse)").matches ?? false,
    fine: media?.("(pointer: fine)").matches ?? false,
    saveData: host.navigator?.connection?.saveData === true,
  };
}

/**
 * A resized desktop window is not a phone. Coarse pointer, or save-data,
 * is the signal. hardwareConcurrency is ignored on purpose.
 */
export function isLowEndPhone(signals: PhoneSignals = readPhoneSignals()): boolean {
  if (signals.saveData) return true;
  return signals.coarse && !signals.fine;
}

export function holdsPoster(minLevel: number, level: number, signals?: PhoneSignals): boolean {
  assertLevel(level);
  return minLevel > level && isLowEndPhone(signals);
}

export function prefersReducedMotion(): boolean {
  const query = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  if (typeof query !== "function") return false;
  return query("(prefers-reduced-motion: reduce)").matches;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const STILL_SVG =
  '<svg class="hh-motion__marksvg" viewBox="0 0 320 200" width="320" height="200" aria-hidden="true">' +
  '<rect width="320" height="200" fill="currentColor" opacity="0.12"></rect>' +
  '<circle cx="78" cy="118" r="26" fill="currentColor"></circle>' +
  '<rect x="122" y="100" width="140" height="8" fill="currentColor"></rect>' +
  '<rect x="122" y="118" width="88" height="8" fill="currentColor"></rect>' +
  "</svg>";

export function paintStill(el: HTMLElement, caption: string): void {
  el.dataset.still = "true";
  el.dataset.live = "false";
  delete el.dataset.webglLive;
  el.innerHTML =
    `<figure class="hh-motion__still">${STILL_SVG}` +
    `<figcaption class="hh-motion__caption">${escapeHtml(caption)}</figcaption></figure>`;
}

export function markLive(el: HTMLElement): void {
  el.dataset.live = "true";
  delete el.dataset.still;
}

let host: TickerHost | null = null;
let fanout: TickFn | null = null;
const listeners = new Set<TickFn>();
let rafPatched = false;

/**
 * One native animation frame for every preview. Callers subscribe.
 * The host is asked to add exactly one listener.
 */
export function bindSharedTicker(next: TickerHost, opts?: { patchRaf?: boolean }): void {
  if (host === next && fanout !== null) {
    if (opts?.patchRaf === true) patchWindowRaf(next);
    return;
  }
  if (host !== null && fanout !== null) host.remove(fanout);
  host = next;
  const loop: TickFn = (time, delta, frame) => {
    for (const fn of listeners) fn(time, delta, frame);
  };
  fanout = loop;
  next.add(loop);
  if (opts?.patchRaf === true) patchWindowRaf(next);
}

export function onSharedTick(fn: TickFn): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function ensureSharedTicker(): Promise<void> {
  if (host !== null) return;
  const loaded = await import("gsap");
  const gsap = loaded.gsap ?? loaded.default;
  bindSharedTicker(gsap.ticker as TickerHost, { patchRaf: true });
}

export function resetSharedTickerForTests(): void {
  if (host !== null && fanout !== null) host.remove(fanout);
  host = null;
  fanout = null;
  listeners.clear();
}

function patchWindowRaf(ticker: TickerHost): void {
  const g = globalThis as {
    requestAnimationFrame?: (cb: (time: number) => void) => number;
    cancelAnimationFrame?: (id: number) => void;
  };
  if (rafPatched || typeof g.requestAnimationFrame !== "function") return;
  rafPatched = true;
  const nativeCancel = g.cancelAnimationFrame?.bind(globalThis);
  let nextId = 1;
  const pending = new Map<number, TickFn>();
  g.requestAnimationFrame = (cb) => {
    const id = nextId++;
    const once: TickFn = (time) => {
      ticker.remove(once);
      if (!pending.has(id)) return;
      pending.delete(id);
      cb(time * 1000);
    };
    pending.set(id, once);
    // Defer the add. GSAP's tick loop also runs listeners pushed during the
    // current pass, so a callback that schedules the next frame would recurse.
    queueMicrotask(() => {
      if (!pending.has(id)) return;
      ticker.add(once);
    });
    return id;
  };
  g.cancelAnimationFrame = (id) => {
    const fn = pending.get(id);
    if (fn !== undefined) {
      pending.delete(id);
      ticker.remove(fn);
      return;
    }
    nativeCancel?.(id);
  };
}

let liveWebgl: string | null = null;

export function claimWebgl(id: string): boolean {
  if (liveWebgl === null || liveWebgl === id) {
    liveWebgl = id;
    return true;
  }
  return false;
}

export function releaseWebgl(id: string): void {
  if (liveWebgl === id) liveWebgl = null;
}

export function liveWebglId(): string | null {
  return liveWebgl;
}

export function resetWebglForTests(): void {
  liveWebgl = null;
}

export function watchFrame(el: HTMLElement, onChange: (visible: boolean) => void): () => void {
  const IO = (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
  if (typeof IO !== "function") {
    onChange(true);
    return () => undefined;
  }
  const observer = new IO(
    (entries) => {
      onChange(entries.some((entry) => entry.isIntersecting));
    },
    { threshold: 0.15 },
  );
  observer.observe(el);
  return () => observer.disconnect();
}

/**
 * Lazy start on first intersection. Pause by tearing the loop down
 * when the frame leaves the screen, then start again on return.
 * Reduced motion paints a still and does not import a library.
 */
export function runWhenVisible(
  el: HTMLElement,
  start: () => Promise<() => void>,
): Promise<() => void> {
  if (prefersReducedMotion()) {
    paintStill(el, "Still. Motion is reduced.");
    return Promise.resolve(() => undefined);
  }
  let token = 0;
  let visible = false;
  let cleanup: (() => void) | null = null;
  const unwatch = watchFrame(el, (next) => {
    if (next === visible) return;
    visible = next;
    token += 1;
    const mine = token;
    if (!next) {
      const wasWebgl = el.dataset.webglLive === "true";
      cleanup?.();
      cleanup = null;
      if (wasWebgl && el.isConnected) paintStill(el, "Paused off screen. One WebGL context stays live.");
      return;
    }
    void start()
      .then((stop) => {
        if (mine !== token) {
          stop();
          return;
        }
        cleanup = stop;
      })
      .catch((error: unknown) => {
        if (mine !== token) return;
        const message = error instanceof Error ? error.message : "Preview failed.";
        console.warn(`Motion preview stayed on the still. ${message}`);
        paintStill(el, "This preview stayed on the still.");
      });
  });
  return Promise.resolve(() => {
    token += 1;
    visible = false;
    unwatch();
    cleanup?.();
    cleanup = null;
  });
}

export function renderAppetite(level: number): string {
  assertLevel(level);
  const ceiling = weightCeiling(level);
  const kb = String(ceiling.maxJsKb);
  return `<section id="hh-appetite-panel" class="hh-motion__panel" data-ceiling-level="${level}" data-webgl="${ceiling.webgl ? "true" : "false"}" data-max-js="${kb}" aria-labelledby="hh-appetite-title">
  <p class="hh-kicker" id="hh-appetite-title">Appetite</p>
  <label class="hh-motion__label" for="hh-appetite">Motion appetite, 1 to 10. ${escapeHtml(appetiteName(level))} is the current step.</label>
  <input class="hh-motion__range" id="hh-appetite" name="appetite" type="range" min="1" max="10" step="1" value="${level}">
  <p class="hh-title" data-appetite-name>${escapeHtml(appetiteName(level))}</p>
  <p data-appetite-note>${escapeHtml(ceiling.note)}</p>
  <p data-appetite-kb>JS ceiling ${kb} KB gzip.</p>
  <p data-phone-note>${escapeHtml(phoneNote(level))}</p>
  <p class="hh-dek" data-appetite-webgl>${escapeHtml(webglCeilingSentence(level))}</p>
</section>`;
}
