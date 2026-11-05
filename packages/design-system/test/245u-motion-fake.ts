/**
 * In-memory GSAP, ScrollTrigger, Lenis, and DOM.
 * This package does not depend on jsdom, gsap, or lenis.
 * Hooks are installed before the motion modules are imported.
 */
import { registerHooks } from "node:module";

export interface FakeTrigger {
  config: Record<string, unknown>;
  killed: boolean;
  kill(): void;
}

export interface FakeTween {
  vars: Record<string, unknown>;
  fromVars?: Record<string, unknown>;
  killed: boolean;
  trigger?: FakeTrigger;
  kill(): void;
}

export interface FakeSet {
  target: unknown;
  vars: Record<string, unknown>;
}

export interface FakeSplit {
  lines: readonly unknown[];
  words: readonly unknown[];
  chars: readonly unknown[];
  vars: { type?: string; mask?: string; aria?: string };
  reverted: boolean;
  revert(): void;
}

export interface FakeLenis {
  options: { autoRaf?: boolean; smoothTouch?: boolean };
  handlers: Array<{ event: string; cb: () => void }>;
  destroyed: boolean;
  on(event: string, cb: () => void): void;
  raf(time: number): void;
  destroy(): void;
}

type Listener = (event: { clientX: number; clientY: number }) => void;

interface ListenerEntry {
  listener: Listener;
  once: boolean;
}

export interface FakeElement {
  tag: string;
  style: Record<string, string>;
  attrs: Record<string, string>;
  children: FakeElement[];
  parentNode: FakeElement | null;
  scrollWidth: number;
  clientWidth: number;
  width: number;
  height: number;
  appendChild(child: FakeElement): void;
  insertBefore(node: FakeElement, child: FakeElement | null): void;
  removeChild(child: FakeElement): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  getContext(kind: string): { drawImage(image: unknown, x: number, y: number, w: number, h: number): void; clearRect(x: number, y: number, w: number, h: number): void } | null;
  addEventListener(type: string, listener: Listener, options?: { once?: boolean }): void;
  removeEventListener(type: string, listener: Listener): void;
  dispatch(type: string, event?: { clientX: number; clientY: number }): void;
}

export interface FakeMedia {
  src: string;
  complete: boolean;
  readyState: number;
  decode(): Promise<void>;
  addEventListener(type: string, listener: Listener, options?: { once?: boolean }): void;
  removeEventListener(type: string, listener: Listener): void;
  dispatch(type: string, event?: { clientX: number; clientY: number }): void;
}

interface Timeline {
  vars: Record<string, unknown>;
  labels: string[];
  children: FakeTween[];
  trigger?: FakeTrigger;
  addLabel(name: string, at?: string | number): Timeline;
  to(target: unknown, vars: Record<string, unknown>, position?: string | number): Timeline;
  from(target: unknown, vars: Record<string, unknown>, position?: string | number): Timeline;
  fromTo(target: unknown, fromVars: Record<string, unknown>, toVars: Record<string, unknown>, position?: string | number): Timeline;
  set(target: unknown, vars: Record<string, unknown>, position?: string | number): Timeline;
  kill(): void;
}

const queries = new Map<string, boolean>();
const bags = new WeakMap<object, Map<string, Set<ListenerEntry>>>();

const state = {
  triggers: [] as FakeTrigger[],
  tweens: [] as FakeTween[],
  sets: [] as FakeSet[],
  splits: [] as FakeSplit[],
  lenis: [] as FakeLenis[],
  timelines: [] as Timeline[],
  ticker: [] as Array<(time: number) => void>,
  lag: [] as number[],
  refresh: 0,
  listeners: 0,
  drawn: [] as unknown[],
  imageBuilds: 0,
};

let fontsReady: Promise<unknown> = Promise.resolve();
let viewTransition: ((update: () => void) => { finished: Promise<void> }) | undefined;

function bagFor(target: object): Map<string, Set<ListenerEntry>> {
  let map = bags.get(target);
  if (map === undefined) {
    map = new Map();
    bags.set(target, map);
  }
  return map;
}

function bindListeners(target: object): {
  addEventListener(type: string, listener: Listener, options?: { once?: boolean }): void;
  removeEventListener(type: string, listener: Listener): void;
  dispatch(type: string, event?: { clientX: number; clientY: number }): void;
} {
  return {
    addEventListener(type, listener, options) {
      const map = bagFor(target);
      let set = map.get(type);
      if (set === undefined) {
        set = new Set();
        map.set(type, set);
      }
      for (const entry of set) {
        if (entry.listener === listener) return;
      }
      set.add({ listener, once: options?.once === true });
      state.listeners += 1;
    },
    removeEventListener(type, listener) {
      const set = bags.get(target)?.get(type);
      if (set === undefined) return;
      for (const entry of set) {
        if (entry.listener !== listener) continue;
        set.delete(entry);
        state.listeners -= 1;
        return;
      }
    },
    dispatch(type, event) {
      const set = bags.get(target)?.get(type);
      if (set === undefined) return;
      for (const entry of [...set]) {
        if (entry.once) {
          set.delete(entry);
          state.listeners -= 1;
        }
        entry.listener(event ?? { clientX: 0, clientY: 0 });
      }
    },
  };
}

function clearListeners(target: object): void {
  const map = bags.get(target);
  if (map === undefined) return;
  for (const set of map.values()) state.listeners -= set.size;
  map.clear();
}

function makeTrigger(config: Record<string, unknown>): FakeTrigger {
  const trigger: FakeTrigger = {
    config,
    killed: false,
    kill() {
      trigger.killed = true;
    },
  };
  state.triggers.push(trigger);
  return trigger;
}

function triggerFrom(vars: Record<string, unknown> | undefined): FakeTrigger | undefined {
  if (vars === undefined) return undefined;
  const config = vars.scrollTrigger;
  if (typeof config !== "object" || config === null) return undefined;
  return makeTrigger(config as Record<string, unknown>);
}

function makeTween(vars: Record<string, unknown>, fromVars?: Record<string, unknown>): FakeTween {
  const trigger = triggerFrom(vars);
  const tween: FakeTween = {
    vars,
    killed: false,
    kill() {
      if (tween.killed) return;
      tween.killed = true;
      tween.trigger?.kill();
    },
  };
  if (fromVars !== undefined) tween.fromVars = fromVars;
  if (trigger !== undefined) tween.trigger = trigger;
  state.tweens.push(tween);
  return tween;
}

function makeTimeline(vars: Record<string, unknown> | undefined): Timeline {
  const timeline: Timeline = {
    vars: vars ?? {},
    labels: [],
    children: [],
    addLabel(name) {
      timeline.labels.push(name);
      return timeline;
    },
    to(_target, tweenVars) {
      timeline.children.push(makeTween(tweenVars));
      return timeline;
    },
    from(_target, tweenVars) {
      timeline.children.push(makeTween(tweenVars));
      return timeline;
    },
    fromTo(_target, fromVars, toVars) {
      timeline.children.push(makeTween(toVars, fromVars));
      return timeline;
    },
    set(target, tweenVars) {
      state.sets.push({ target, vars: tweenVars });
      return timeline;
    },
    kill() {
      for (const child of timeline.children) child.kill();
      timeline.trigger?.kill();
    },
  };
  const trigger = triggerFrom(timeline.vars);
  if (trigger !== undefined) timeline.trigger = trigger;
  state.timelines.push(timeline);
  return timeline;
}

const gsap = {
  registerPlugin(): void {},
  to(_target: unknown, vars: Record<string, unknown>) {
    return makeTween(vars);
  },
  from(_target: unknown, vars: Record<string, unknown>) {
    return makeTween(vars);
  },
  fromTo(_target: unknown, fromVars: Record<string, unknown>, toVars: Record<string, unknown>) {
    return makeTween(toVars, fromVars);
  },
  set(target: unknown, vars: Record<string, unknown>): void {
    state.sets.push({ target, vars });
  },
  timeline(vars?: Record<string, unknown>) {
    return makeTimeline(vars);
  },
  matchMedia() {
    const cleanups: Array<() => void> = [];
    return {
      add(query: string, callback: () => void | (() => void)) {
        const host = globalThis as { window?: { matchMedia(query: string): { matches: boolean } } };
        if (host.window?.matchMedia(query).matches === true) {
          const cleanup = callback();
          if (typeof cleanup === "function") cleanups.push(cleanup);
        }
        return this;
      },
      revert() {
        for (const cleanup of cleanups) cleanup();
        cleanups.length = 0;
      },
    };
  },
  ticker: {
    add(fn: (time: number) => void): void {
      state.ticker.push(fn);
    },
    remove(fn: (time: number) => void): void {
      const index = state.ticker.indexOf(fn);
      if (index >= 0) state.ticker.splice(index, 1);
    },
    lagSmoothing(value: number): void {
      state.lag.push(value);
    },
  },
  utils: {
    toArray(value: unknown): unknown[] {
      if (Array.isArray(value)) return value;
      return [value];
    },
  },
};

const ScrollTrigger = {
  update(): void {},
  refresh(): void {
    state.refresh += 1;
  },
  batch(_targets: unknown, vars: Record<string, unknown>): FakeTrigger[] {
    return [makeTrigger(vars)];
  },
};

const SplitText = {
  create(target: unknown, vars: { type?: string; mask?: string; aria?: string }): FakeSplit {
    const piece = target;
    const split: FakeSplit = {
      lines: [piece],
      words: [piece],
      chars: [piece],
      vars,
      reverted: false,
      revert() {
        split.reverted = true;
      },
    };
    state.splits.push(split);
    return split;
  },
};

const Flip = {
  getState(target: unknown): { element: unknown } {
    return { element: target };
  },
  from(_flipState: unknown, vars: Record<string, unknown>): FakeTween {
    return makeTween(vars);
  },
};

class LenisInstance implements FakeLenis {
  options: { autoRaf?: boolean; smoothTouch?: boolean };
  handlers: Array<{ event: string; cb: () => void }> = [];
  destroyed = false;

  constructor(options?: { autoRaf?: boolean; smoothTouch?: boolean }) {
    this.options = options ?? {};
    state.lenis.push(this);
  }

  on(event: string, cb: () => void): void {
    this.handlers.push({ event, cb });
  }

  raf(_time: number): void {}

  destroy(): void {
    this.destroyed = true;
  }
}

function makeElement(tag = "div"): FakeElement {
  const element: FakeElement = {
    tag,
    style: {},
    attrs: {},
    children: [],
    parentNode: null,
    scrollWidth: 1200,
    clientWidth: 400,
    width: 320,
    height: 180,
    appendChild(child) {
      const previous = child.parentNode;
      if (previous !== null) {
        const at = previous.children.indexOf(child);
        if (at >= 0) previous.children.splice(at, 1);
      }
      child.parentNode = element;
      element.children.push(child);
    },
    insertBefore(node, child) {
      const previous = node.parentNode;
      if (previous !== null && previous !== element) {
        const at = previous.children.indexOf(node);
        if (at >= 0) previous.children.splice(at, 1);
      }
      if (node.parentNode === element) {
        const at = element.children.indexOf(node);
        if (at >= 0) element.children.splice(at, 1);
      }
      node.parentNode = element;
      const index = child === null ? element.children.length : element.children.indexOf(child);
      element.children.splice(index < 0 ? element.children.length : index, 0, node);
    },
    removeChild(child) {
      const index = element.children.indexOf(child);
      if (index >= 0) element.children.splice(index, 1);
      if (child.parentNode === element) child.parentNode = null;
    },
    setAttribute(name, value) {
      element.attrs[name] = value;
    },
    getAttribute(name) {
      return element.attrs[name] ?? null;
    },
    getBoundingClientRect() {
      return { left: 10, top: 10, width: 80, height: 32 };
    },
    getContext(kind) {
      if (kind !== "2d") return null;
      return {
        drawImage(image) {
          state.drawn.push(image);
        },
        clearRect() {},
      };
    },
    addEventListener() {},
    removeEventListener() {},
    dispatch() {},
  };
  const listeners = bindListeners(element);
  element.addEventListener = listeners.addEventListener;
  element.removeEventListener = listeners.removeEventListener;
  element.dispatch = listeners.dispatch;
  return element;
}

function makeMedia(): FakeMedia {
  const media: FakeMedia = {
    src: "",
    complete: true,
    readyState: 4,
    decode() {
      return Promise.resolve();
    },
    addEventListener() {},
    removeEventListener() {},
    dispatch() {},
  };
  const listeners = bindListeners(media);
  media.addEventListener = listeners.addEventListener;
  media.removeEventListener = listeners.removeEventListener;
  media.dispatch = listeners.dispatch;
  return media;
}

const body = makeElement("body");

const fakeDocument = {
  get fonts() {
    return { ready: fontsReady };
  },
  images: [] as FakeMedia[],
  body,
  querySelector(): FakeElement | null {
    return null;
  },
  createElement(tag: string) {
    return makeElement(tag);
  },
  addEventListener(_type: string, _listener: Listener, _options?: { once?: boolean }): void {},
  removeEventListener(_type: string, _listener: Listener): void {},
  dispatch(_type: string, _event?: { clientX: number; clientY: number }): void {},
  get startViewTransition() {
    return viewTransition;
  },
  set startViewTransition(value: ((update: () => void) => { finished: Promise<void> }) | undefined) {
    viewTransition = value;
  },
};

const documentListeners = bindListeners(fakeDocument);
fakeDocument.addEventListener = documentListeners.addEventListener;
fakeDocument.removeEventListener = documentListeners.removeEventListener;
fakeDocument.dispatch = documentListeners.dispatch;

const fakeWindow = {
  matchMedia(query: string) {
    return { matches: queries.get(query) === true };
  },
  innerWidth: 1440,
  Image: class FakeImage {
    src = "";
    complete = true;
    readyState = 4;
    constructor() {
      state.imageBuilds += 1;
    }
    decode(): Promise<void> {
      return Promise.resolve();
    }
    addEventListener(): void {}
    removeEventListener(): void {}
  },
  addEventListener(_type: string, _listener: Listener, _options?: { once?: boolean }): void {},
  removeEventListener(_type: string, _listener: Listener): void {},
  dispatch(_type: string, _event?: { clientX: number; clientY: number }): void {},
};

const windowListeners = bindListeners(fakeWindow);
fakeWindow.addEventListener = windowListeners.addEventListener;
fakeWindow.removeEventListener = windowListeners.removeEventListener;
fakeWindow.dispatch = windowListeners.dispatch;

function defaultQueries(): void {
  queries.clear();
  queries.set("(prefers-reduced-motion: reduce)", false);
  queries.set("(prefers-reduced-motion: no-preference)", true);
  queries.set("(pointer: fine)", true);
  queries.set("(pointer: coarse)", false);
}

function reset(): void {
  state.triggers.length = 0;
  state.tweens.length = 0;
  state.sets.length = 0;
  state.splits.length = 0;
  state.lenis.length = 0;
  state.timelines.length = 0;
  state.ticker.length = 0;
  state.lag.length = 0;
  state.refresh = 0;
  state.drawn.length = 0;
  state.imageBuilds = 0;
  fontsReady = Promise.resolve();
  viewTransition = undefined;
  fakeDocument.images.length = 0;
  body.children.length = 0;
  clearListeners(body);
  clearListeners(fakeDocument);
  clearListeners(fakeWindow);
  state.listeners = 0;
  defaultQueries();
}

export const motionFake = {
  document: fakeDocument,
  window: fakeWindow,
  ScrollTrigger,
  get sets() {
    return state.sets;
  },
  get lenis() {
    return state.lenis;
  },
  get ticker() {
    return state.ticker;
  },
  get lag() {
    return state.lag;
  },
  get drawn() {
    return state.drawn;
  },
  get splits() {
    return state.splits;
  },
  get timelines() {
    return state.timelines;
  },
  get refreshCount() {
    return state.refresh;
  },
  get listenerTotal() {
    return state.listeners;
  },
  get imageBuilds() {
    return state.imageBuilds;
  },
  reset,
  setQuery(query: string, matches: boolean): void {
    queries.set(query, matches);
  },
  setFontsReady(promise: Promise<unknown>): void {
    fontsReady = promise;
  },
  element: makeElement,
  media: makeMedia,
  activeTriggers(): FakeTrigger[] {
    return state.triggers.filter((trigger) => !trigger.killed);
  },
  activeTweens(): FakeTween[] {
    return state.tweens.filter((tween) => !tween.killed);
  },
  listenerCount(target: object, type: string): number {
    return bags.get(target)?.get(type)?.size ?? 0;
  },
};

const hookBag = {
  gsap,
  ScrollTrigger,
  SplitText,
  Flip,
  Lenis: LenisInstance,
};

const globalHost = globalThis as typeof globalThis & {
  __hhMotionFake?: typeof hookBag;
  document?: typeof fakeDocument;
  window?: typeof fakeWindow;
};
globalHost.__hhMotionFake = hookBag;
globalHost.document = fakeDocument;
globalHost.window = fakeWindow;
defaultQueries();

const FAKE_PREFIX = "file:///hh-motion-fake/";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const known = specifier === "gsap" || specifier.startsWith("gsap/") || specifier === "lenis";
    if (!known) return nextResolve(specifier, context);
    const name = specifier.replaceAll("/", "_");
    return {
      url: `${FAKE_PREFIX}${name}.mjs`,
      shortCircuit: true,
    };
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(FAKE_PREFIX)) return nextLoad(url, context);
    const name = url.slice(FAKE_PREFIX.length).replace(/\.mjs$/, "");
    let source = "export default {};";
    if (name === "gsap") source = "export default globalThis.__hhMotionFake.gsap;";
    if (name === "gsap_ScrollTrigger") source = "export const ScrollTrigger = globalThis.__hhMotionFake.ScrollTrigger;";
    if (name === "gsap_SplitText") source = "export const SplitText = globalThis.__hhMotionFake.SplitText;";
    if (name === "gsap_Flip") source = "export const Flip = globalThis.__hhMotionFake.Flip;";
    if (name === "lenis") source = "export default globalThis.__hhMotionFake.Lenis;";
    return { format: "module", source, shortCircuit: true };
  },
});

export async function flushMotion(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
