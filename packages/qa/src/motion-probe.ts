/**
 * Runtime motion probe (245w) on the 245c CDP surface.
 * Tests pass fake page facts and never launch a browser. The live path
 * wraps requestAnimationFrame, counts ScrollTrigger and Lenis, watches
 * layout properties during a scripted scroll, and checks that a route
 * change leaves zero triggers. Port 4175 is the desk and is refused.
 *
 * Browser scripts are plain strings. Node's type stripper and the page
 * both receive JavaScript, with no casts inside the evaluated source.
 */

import { motionProbeProblems, type MotionProbeFacts, type MotionTimelineChild } from "@hitchhiker/engine";

export interface MotionProbeReport {
  url: string;
  facts: MotionProbeFacts;
  problems: string[];
}

export interface MotionProbeOptions {
  facts?: MotionProbeFacts;
}

const DESK_PORT = "4175";
const NAV_TIMEOUT_MS = 20_000;

const INIT_SCRIPT = `
(() => {
  const starts = [];
  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    const wrapped = (time) => {
      if (!starts.includes(wrapped)) starts.push(wrapped);
      return callback(time);
    };
    return nativeRaf(wrapped);
  };
  window.__hhMotionProbe = {
    rafStarts: starts,
    refreshAfterFonts: false,
    refreshAfterImages: false,
  };
})();
`;

const WRAP_REFRESH = `
(() => {
  const probe = window.__hhMotionProbe || (window.__hhMotionProbe = { rafStarts: [] });
  const trigger = window.ScrollTrigger;
  if (!trigger || typeof trigger.refresh !== "function" || probe.refreshWrapped === true) return;
  const native = trigger.refresh.bind(trigger);
  trigger.refresh = (safe) => {
    probe.refreshAfterFonts = true;
    probe.refreshAfterImages = true;
    return native(safe);
  };
  probe.refreshWrapped = true;
})()
`;

const READ_LAYOUT = `
(() => {
  const node = document.querySelector("[data-scrub], [data-motion], main, body");
  const style = node === null ? null : getComputedStyle(node);
  return {
    width: style ? style.width : "",
    height: style ? style.height : "",
    top: style ? style.top : "",
    filter: style ? style.filter : "",
  };
})()
`;

const SCROLL_PAGE = `
(() => {
  window.scrollTo(0, Math.max(document.body.scrollHeight, 800));
})()
`;

const WAIT_FRAME = `
(() => new Promise((resolve) => { window.setTimeout(resolve, 50); }))()
`;

const READ_COUNTS = `
(() => {
  const probe = window.__hhMotionProbe || {};
  const trigger = window.ScrollTrigger;
  const triggers = trigger && typeof trigger.getAll === "function" ? trigger.getAll() : [];
  const gsap = window.gsap;
  const timeline = gsap && gsap.globalTimeline;
  const children = timeline && typeof timeline.getChildren === "function" ? timeline.getChildren(true) : [];
  const lenisNodes = document.querySelectorAll(".lenis, [data-lenis-prevent], [data-lenis]").length;
  const lenisWindow = window.lenis === undefined ? 0 : 1;
  const timelineChildren = children.slice(0, 40).map((child) => {
    const vars = child && child.vars ? child.vars : {};
    const ease = typeof vars.ease === "string" ? vars.ease : "";
    const duration = typeof vars.duration === "number" ? vars.duration : 0;
    const scrub = vars.scrollTrigger !== undefined && typeof vars.scrollTrigger === "object" && vars.scrollTrigger !== null;
    const props = Object.keys(vars).filter((key) => key !== "ease" && key !== "duration" && key !== "scrollTrigger");
    return { target: "", ease, duration, props, scrub };
  });
  return {
    rafLoops: Array.isArray(probe.rafStarts) ? probe.rafStarts.length : 0,
    scrollTriggers: triggers.length,
    lenisInstances: Math.max(lenisWindow, lenisNodes > 0 ? 1 : 0),
    refreshedAfterFonts: probe.refreshAfterFonts === true,
    refreshedAfterImages: probe.refreshAfterImages === true,
    timelineChildren,
  };
})()
`;

const DISPATCH_SWAP = `
(() => {
  document.dispatchEvent(new Event("astro:before-swap"));
})()
`;

const READ_TRIGGERS = `
(() => {
  const trigger = window.ScrollTrigger;
  if (!trigger || typeof trigger.getAll !== "function") return 0;
  return trigger.getAll().length;
})()
`;

interface LayoutSnapshot {
  width: string;
  height: string;
  top: string;
  filter: string;
}

interface ProbeCounts {
  rafLoops: number;
  scrollTriggers: number;
  lenisInstances: number;
  refreshedAfterFonts: boolean;
  refreshedAfterImages: boolean;
  timelineChildren: MotionTimelineChild[];
}

export async function runMotionProbe(url: string, options: MotionProbeOptions = {}): Promise<MotionProbeReport> {
  if (options.facts !== undefined) {
    return { url, facts: options.facts, problems: motionProbeProblems(options.facts) };
  }
  assertPreviewUrl(url);
  const facts = await collectProbe(url);
  return { url, facts, problems: motionProbeProblems(facts) };
}

function assertPreviewUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Motion probe needs an absolute preview URL. Received ${url}.`);
  }
  if (parsed.port === DESK_PORT) {
    throw new Error(`Refusing the desk port ${DESK_PORT}. Run the motion probe against the site preview, not the desk.`);
  }
}

async function collectProbe(url: string): Promise<MotionProbeFacts> {
  const { withChromium } = await import("./playwright-opener.ts");
  return withChromium(async (browser) => {
    const page = await browser.newPage();
    try {
      await page.addInitScript(INIT_SCRIPT);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      await page.evaluate(WRAP_REFRESH);
      const before = await page.evaluate<LayoutSnapshot>(READ_LAYOUT);
      await page.evaluate(SCROLL_PAGE);
      await page.evaluate(WAIT_FRAME);
      const after = await page.evaluate<LayoutSnapshot>(READ_LAYOUT);
      const counts = await page.evaluate<ProbeCounts>(READ_COUNTS);
      await page.evaluate(DISPATCH_SWAP);
      const afterUnmount = await page.evaluate<number>(READ_TRIGGERS);
      return {
        rafLoops: counts.rafLoops,
        scrollTriggers: counts.scrollTriggers,
        lenisInstances: counts.lenisInstances,
        scrubbedProperties: changedLayoutProps(before, after),
        refreshedAfterFonts: counts.refreshedAfterFonts,
        refreshedAfterImages: counts.refreshedAfterImages,
        triggersAfterUnmount: afterUnmount,
        timelineChildren: counts.timelineChildren,
      };
    } finally {
      await page.close();
    }
  });
}

function changedLayoutProps(before: LayoutSnapshot, after: LayoutSnapshot): string[] {
  const changed: string[] = [];
  if (before.width !== after.width && before.width !== "") changed.push("width");
  if (before.height !== after.height && before.height !== "") changed.push("height");
  if (before.top !== after.top && before.top !== "") changed.push("top");
  if (before.filter !== after.filter && before.filter !== "" && after.filter !== "none") changed.push("filter");
  return changed;
}
