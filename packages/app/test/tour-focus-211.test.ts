/**
 * BUG-007. The first-five-minutes tour must not take focus on load.
 * A short or narrow viewport focuses the question heading. A tall desktop focuses the answer box.
 * After the splash, the plate scroll yields when a live question is already on the desk.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { mountDesk, questionFocusTarget, type DeskEnv } from "../src/client/desk.ts";
import { mountTour, type TourDocument, type TourNode } from "../src/client/tour.ts";

test("mountTour does not focus the tour", () => {
  let focused = 0;
  const tour: TourNode = {
    focus() {
      focused += 1;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const doc: TourDocument = {
    querySelector(selector: string) {
      return selector === "[data-tour]" ? tour : null;
    },
  };
  const stop = mountTour(doc);
  stop();
  assert.equal(focused, 0);
});

test("a short or narrow viewport focuses the question heading", () => {
  assert.equal(questionFocusTarget(1024, 640), "heading");
  assert.equal(questionFocusTarget(390, 800), "heading");
  assert.equal(questionFocusTarget(1280, 800), "draft");
});

interface ScrollCall {
  block?: string;
  behavior?: string;
}

function node(attrs: Record<string, string> = {}) {
  const store = new Map(Object.entries(attrs));
  return {
    innerHTML: "",
    parentElement: null,
    getAttribute: (name: string) => (store.has(name) ? (store.get(name) ?? "") : null),
    setAttribute: (name: string, value: string) => {
      store.set(name, value);
    },
    removeAttribute: (name: string) => {
      store.delete(name);
    },
    querySelector: () => null,
  };
}

function tourPlate(
  options: {
    live?: boolean;
    search?: string;
    href?: string;
    /** False when the cover was already cleared before mountDesk runs. */
    covered?: boolean;
    /** Viewport top of #hh-card-ask. Omit when the heading is not in the document. */
    headingTop?: number;
    innerHeight?: number;
  } = {},
): {
  env: DeskEnv;
  scrolls: ScrollCall[];
  focused: string[];
  dismiss: () => void;
} {
  const live = options.live === true;
  const scrolls: ScrollCall[] = [];
  const focused: string[] = [];
  const question = node(live ? { "data-live": "true" } : {});
  const tour = node();
  tour.scrollIntoView = (call?: { block?: string; behavior?: string }) => {
    scrolls.push({ block: call?.block, behavior: call?.behavior });
  };
  tour.focus = () => {
    focused.push("tour");
  };
  tour.addEventListener = () => undefined;
  tour.removeEventListener = () => undefined;
  const splash = node({ "data-splash": "" });
  let covered = options.covered !== false;
  const cover = node({ "data-splash-cover": "" });
  cover.removeAttribute = (name: string) => {
    if (name === "data-splash-cover") covered = false;
  };
  const heading = options.headingTop === undefined ? null : node({ id: "hh-card-ask" });
  if (heading !== null) {
    heading.getBoundingClientRect = () => ({ top: options.headingTop ?? 0 });
  }
  const active = options.href === undefined ? null : node({ href: options.href });
  const listeners = new Map<string, () => void>();
  const env: DeskEnv = {
    document: {
      querySelector(selector: string) {
        if (selector === "[data-splash]") return splash;
        if (selector === "[data-splash-cover]") return covered ? cover : null;
        if (selector === '[data-region="question"]') return question;
        if (selector === '[data-region="question"][data-live="true"]') return live ? question : null;
        if (selector === "[data-tour]") return tour;
        if (selector === "#hh-card-ask") return heading;
        return null;
      },
      addEventListener(type: string, listener: () => void) {
        listeners.set(type, listener);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
      get activeElement() {
        return active;
      },
      defaultView: {
        location: { search: options.search ?? "" },
        innerHeight: options.innerHeight,
        addEventListener() {},
        removeEventListener() {},
      } as DeskEnv["document"]["defaultView"],
    },
    fetch: async () => {
      throw new Error("this test does not load a session");
    },
    EventSource: class {
      addEventListener(): void {}
      close(): void {}
    },
  };
  return {
    env,
    scrolls,
    focused,
    dismiss: () => {
      covered = false;
      listeners.get("hh-splash-dismissed")?.();
    },
  };
}

test("Skip to the app does not scroll the tour when a live question is on the desk", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const plate = tourPlate({ live: true, href: "#desk-heading" });
  const stop = mountDesk(plate.env);
  try {
    plate.dismiss();
    mock.timers.tick(180);
    mock.timers.tick(240);
    assert.deepEqual(plate.scrolls, []);
    assert.deepEqual(plate.focused, []);
  } finally {
    stop();
    mock.timers.reset();
  }
});

test("Enter the Guide still scrolls the tour when a live question is on the desk", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const plate = tourPlate({ live: true });
  const stop = mountDesk(plate.env);
  try {
    plate.dismiss();
    mock.timers.tick(180);
    mock.timers.tick(240);
    assert.equal(plate.scrolls.length, 2);
    assert.equal(plate.scrolls[0]?.block, "start");
    assert.equal(plate.scrolls[0]?.behavior, "auto");
    assert.equal(plate.scrolls[1]?.block, "start");
    assert.deepEqual(plate.focused, []);
  } finally {
    stop();
    mock.timers.reset();
  }
});

test("a splash dismiss still scrolls the tour when no live question is on the desk", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const plate = tourPlate({ href: "#desk-heading" });
  const stop = mountDesk(plate.env);
  try {
    plate.dismiss();
    mock.timers.tick(180);
    mock.timers.tick(240);
    assert.equal(plate.scrolls.length, 2);
    assert.equal(plate.scrolls[0]?.block, "start");
    assert.equal(plate.scrolls[1]?.behavior, "auto");
    assert.deepEqual(plate.focused, []);
  } finally {
    stop();
    mock.timers.reset();
  }
});

test("a cue already gone at mount does not scroll when a live question is on the desk", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const plate = tourPlate({ live: true, covered: false });
  const stop = mountDesk(plate.env);
  try {
    mock.timers.tick(180);
    mock.timers.tick(240);
    assert.deepEqual(plate.scrolls, []);
    assert.deepEqual(plate.focused, []);
  } finally {
    stop();
    mock.timers.reset();
  }
});

test("a cue already gone at mount does not scroll when the question heading is already in view", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const plate = tourPlate({ covered: false, headingTop: 120, innerHeight: 640 });
  const stop = mountDesk(plate.env);
  try {
    mock.timers.tick(180);
    mock.timers.tick(240);
    assert.deepEqual(plate.scrolls, []);
    assert.deepEqual(plate.focused, []);
  } finally {
    stop();
    mock.timers.reset();
  }
});

test("a cue already gone at mount still scrolls when no question is in view", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const plate = tourPlate({ covered: false, headingTop: -900, innerHeight: 640 });
  const stop = mountDesk(plate.env);
  try {
    mock.timers.tick(180);
    mock.timers.tick(240);
    assert.equal(plate.scrolls.length, 2);
    assert.equal(plate.scrolls[0]?.block, "start");
    assert.equal(plate.scrolls[1]?.behavior, "auto");
    assert.deepEqual(plate.focused, []);
  } finally {
    stop();
    mock.timers.reset();
  }
});

test("an explicit tour request still scrolls the plate and focuses it when a question is live", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const plate = tourPlate({ live: true, search: "?tour=1", href: "#desk-heading" });
  const stop = mountDesk(plate.env);
  try {
    assert.equal(plate.scrolls[0]?.block, "start");
    assert.equal(plate.focused[0], "tour");
    mock.timers.tick(180);
    mock.timers.tick(240);
    assert.equal(plate.scrolls.length, 3);
    assert.deepEqual(plate.focused, ["tour"]);
  } finally {
    stop();
    mock.timers.reset();
  }
});
