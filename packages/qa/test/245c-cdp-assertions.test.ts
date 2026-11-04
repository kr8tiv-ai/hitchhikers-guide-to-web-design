/**
 * 245c. Collected facts become blockers and fixes. The runner asks the
 * browser layer for 375, 768, and 1440 and does not open the desk port.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUMMARY_MAX_BYTES,
  assertionsFromDesign,
  designChecksFrom,
  evaluateCollectedFacts,
  sectionSpecsForPage,
  summaryForModel,
  type CdpAssertionReport,
  type CollectedFacts,
  type Finding,
  type SectionSpec,
  type StyleSample,
} from "../src/cdp-assertions.ts";
import { CDP_NAV_TIMEOUT_MS, CDP_WIDTHS, runCdpAssertions, type CdpCollectRequest } from "../src/cdp-runner.ts";

const TIMEOUT = 5_000;

const DESIGN = `---
name: "Sample"
colors:
  paper: "#f4f1ea"
  ink: "#1a1a1a"
  accent: "#2f6b4f"
  muted: "#8a8478"
typography:
  display:
    fontFamily: "General Sans"
    fontSize: "64px"
  body:
    fontFamily: "Satoshi"
    fontSize: "18px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "24px"
  space-6: "40px"
  space-7: "64px"
  space-8: "96px"
---

## Typography

Families: General Sans and Satoshi.
Ratio: 1.25 (major third).

- display: 64px, line-height 0.95
- heading: 40px, line-height 1.1
- title: 28px, line-height 1.2
- body: 18px, line-height 1.5
- caption: 14px, line-height 1.4
`;

const CLAMP_DESIGN = `---
name: "Clamp"
colors:
  ink: "#111111"
typography:
  display:
    fontFamily: "General Sans"
    fontSize: "clamp(2rem, 1rem + 2vw, 4rem)"
  body:
    fontFamily: "Satoshi"
    fontSize: "18px"
spacing:
  space-4: "16px"
---

## Typography

Families: General Sans and Satoshi.
Ratio: 1.25 (major third).

- display: clamp(2rem, 1rem + 2vw, 4rem), line-height 0.95
- body: 18px, line-height 1.5
`;

function style(overrides: Partial<StyleSample> = {}): StyleSample {
  return {
    selector: overrides.selector ?? "h1.hero__title",
    role: overrides.role ?? "h1",
    fontFamily: overrides.fontFamily ?? "General Sans",
    fontSizePx: overrides.fontSizePx ?? 64,
    color: overrides.color ?? "#1a1a1a",
    backgroundColor: overrides.backgroundColor ?? "#f4f1ea",
    ...(overrides.paddingPx !== undefined ? { paddingPx: overrides.paddingPx } : {}),
  };
}

function facts(overrides: Partial<CollectedFacts> = {}): CollectedFacts {
  return {
    url: overrides.url ?? "http://127.0.0.1:4599/",
    width: overrides.width ?? 375,
    styles: overrides.styles ?? [
      style(),
      style({ selector: "h2.hero__sub", role: "h2", fontSizePx: 40 }),
      style({ selector: "p.hero__body", role: "body", fontFamily: "Satoshi", fontSizePx: 18 }),
      style({ selector: "section.hero", role: "section", fontSizePx: 18, paddingPx: [64, 16, 64, 16] }),
    ],
    boxes: overrides.boxes ?? {
      scrollWidth: 375,
      clientWidth: 375,
      interactives: [
        { selector: "a.one", x: 0, y: 0, width: 80, height: 44 },
        { selector: "a.two", x: 100, y: 0, width: 80, height: 44 },
      ],
      texts: [{ selector: "h1.hero__title", scrollWidth: 200, clientWidth: 300, overflowX: "visible" }],
      taps: [{ selector: "button.buy", width: 44, height: 44 }],
    },
    interactions: overrides.interactions ?? [
      { probe: "nav-toggle", selector: "button.nav-toggle", changed: true, withinMs: 200 },
    ],
    axe: overrides.axe ?? [],
  };
}

function report(overrides: Partial<CollectedFacts> = {}, sections: readonly SectionSpec[] = []): CdpAssertionReport {
  return evaluateCollectedFacts({
    designMd: DESIGN,
    sections,
    scope: "page",
    facts: facts(overrides),
  });
}

function kinds(findings: readonly Finding[]): string[] {
  return findings.map((finding) => finding.kind);
}

test("a wrong font is a blocker", { timeout: TIMEOUT }, () => {
  const result = report({
    styles: [style({ fontFamily: "Syne" })],
  });
  const hit = result.blockers.find((finding) => finding.kind === "style.font-family");
  assert.ok(hit);
  assert.equal(hit.selector, "h1.hero__title");
  assert.equal(hit.actual, "Syne");
  assert.equal(hit.expected, "General Sans");
  assert.equal(result.passed, false);
  assert.match(result.summaryForModel, /h1\.hero__title font-family: actual Syne, expected General Sans/);
});

test("an off-scale h1 is a blocker and one pixel still passes", { timeout: TIMEOUT }, () => {
  const off = report({ styles: [style({ fontSizePx: 30 })] });
  const hit = off.blockers.find((finding) => finding.kind === "style.font-size");
  assert.ok(hit);
  assert.equal(hit.selector, "h1.hero__title");
  assert.match(hit.actual, /30/);
  assert.match(hit.expected, /40/);
  const near = report({ styles: [style({ fontSizePx: 41 })] });
  assert.equal(kinds(near.blockers).includes("style.font-size"), false);
  const far = report({ styles: [style({ fontSizePx: 42 })] });
  assert.equal(kinds(far.blockers).includes("style.font-size"), true);
});

test("a clamp type step is evaluated at the viewport width", { timeout: TIMEOUT }, () => {
  const checks = designChecksFrom(CLAMP_DESIGN);
  const atPhone = checks.typeStepsPx(375);
  const atDesk = checks.typeStepsPx(1440);
  assert.ok(atPhone.some((step) => Math.abs(step - 32) < 0.05));
  assert.ok(atDesk.some((step) => Math.abs(step - 44.8) < 0.05));
  const result = evaluateCollectedFacts({
    designMd: CLAMP_DESIGN,
    sections: [],
    scope: "page",
    facts: facts({
      width: 375,
      styles: [style({ fontSizePx: 20, color: "#111111", backgroundColor: "transparent" })],
      boxes: {
        scrollWidth: 375,
        clientWidth: 375,
        interactives: [],
        texts: [],
        taps: [],
      },
      interactions: [],
    }),
  });
  assert.equal(kinds(result.blockers).includes("style.font-size"), true);
});

test("a 30px button at 375 is a blocker and the same button at 768 is not", { timeout: TIMEOUT }, () => {
  const phone = report({
    boxes: {
      scrollWidth: 375,
      clientWidth: 375,
      interactives: [],
      texts: [],
      taps: [{ selector: "button.buy", width: 30, height: 30 }],
    },
  });
  const hit = phone.blockers.find((finding) => finding.kind === "box.tap-target");
  assert.ok(hit);
  assert.equal(hit.selector, "button.buy");
  assert.equal(hit.actual, "30x30");
  assert.equal(hit.expected, "44x44");
  const tablet = report({
    width: 768,
    boxes: {
      scrollWidth: 768,
      clientWidth: 768,
      interactives: [],
      texts: [],
      taps: [{ selector: "button.buy", width: 30, height: 30 }],
    },
  });
  assert.equal(kinds(tablet.blockers).includes("box.tap-target"), false);
  assert.equal(kinds(tablet.fixes).includes("box.tap-target"), false);
});

test("document overflow is a blocker", { timeout: TIMEOUT }, () => {
  const result = report({
    boxes: {
      scrollWidth: 800,
      clientWidth: 375,
      interactives: [],
      texts: [],
      taps: [],
    },
  });
  const hit = result.blockers.find((finding) => finding.kind === "box.overflow");
  assert.ok(hit);
  assert.equal(hit.selector, "document");
  assert.match(hit.actual, /800/);
  assert.match(hit.expected, /375/);
  const slop = report({
    boxes: {
      scrollWidth: 376,
      clientWidth: 375,
      interactives: [],
      texts: [],
      taps: [],
    },
  });
  assert.equal(kinds(slop.blockers).includes("box.overflow"), false);
});

test("two overlapping links are a blocker and touching edges are not", { timeout: TIMEOUT }, () => {
  const result = report({
    boxes: {
      scrollWidth: 375,
      clientWidth: 375,
      interactives: [
        { selector: "a.one", x: 0, y: 0, width: 100, height: 40 },
        { selector: "a.two", x: 50, y: 10, width: 100, height: 40 },
      ],
      texts: [],
      taps: [],
    },
  });
  const hit = result.blockers.find((finding) => finding.kind === "box.collision");
  assert.ok(hit);
  assert.match(hit.selector, /a\.one/);
  assert.match(hit.selector, /a\.two/);
  assert.match(hit.actual, /overlap/i);
  assert.match(hit.expected, /separat/i);
  const edges = report({
    boxes: {
      scrollWidth: 375,
      clientWidth: 375,
      interactives: [
        { selector: "a.one", x: 0, y: 0, width: 100, height: 40 },
        { selector: "a.two", x: 100, y: 0, width: 80, height: 40 },
      ],
      texts: [],
      taps: [],
    },
  });
  assert.equal(kinds(edges.blockers).includes("box.collision"), false);
});

test("a clipped heading is a blocker", { timeout: TIMEOUT }, () => {
  const result = report({
    boxes: {
      scrollWidth: 375,
      clientWidth: 375,
      interactives: [],
      texts: [{ selector: "h1.hero__title", scrollWidth: 420, clientWidth: 300, overflowX: "hidden" }],
      taps: [],
    },
  });
  const hit = result.blockers.find((finding) => finding.kind === "box.clipped");
  assert.ok(hit);
  assert.equal(hit.selector, "h1.hero__title");
  assert.match(hit.actual, /420/);
  assert.match(hit.expected, /visible/i);
  const scrolls = report({
    boxes: {
      scrollWidth: 375,
      clientWidth: 375,
      interactives: [],
      texts: [{ selector: "h1.hero__title", scrollWidth: 420, clientWidth: 300, overflowX: "visible" }],
      taps: [],
    },
  });
  assert.equal(kinds(scrolls.blockers).includes("box.clipped"), false);
});

test("a nav toggle that changes nothing is a blocker", { timeout: TIMEOUT }, () => {
  const result = report(
    {
      interactions: [{ probe: "nav-toggle", selector: "button.nav-toggle", changed: false, withinMs: 1500 }],
    },
    [{ id: "nav" }],
  );
  const hit = result.blockers.find((finding) => finding.kind === "interaction.nav-toggle");
  assert.ok(hit);
  assert.equal(hit.selector, "button.nav-toggle");
  assert.match(hit.actual, /no change/i);
  assert.match(hit.expected, /1500/);
  const slow = report({
    interactions: [{ probe: "nav-toggle", selector: "button.nav-toggle", changed: true, withinMs: 1600 }],
  });
  assert.equal(kinds(slow.blockers).includes("interaction.nav-toggle"), true);
});

test("an axe critical violation is a blocker and moderate is a fix", { timeout: TIMEOUT }, () => {
  const critical = report({
    axe: [{ id: "button-name", impact: "critical", selector: "button.submit" }],
  });
  const hit = critical.blockers.find((finding) => finding.kind === "axe");
  assert.ok(hit);
  assert.equal(hit.selector, "button.submit");
  assert.match(hit.actual, /critical/);
  assert.match(hit.actual, /button-name/);
  assert.equal(critical.passed, false);
  const serious = report({
    axe: [{ id: "color-contrast", impact: "serious", selector: "p.hero__body" }],
  });
  assert.equal(kinds(serious.blockers).includes("axe"), true);
  const moderate = report({
    axe: [{ id: "region", impact: "moderate", selector: "div.hero" }],
  });
  assert.equal(moderate.passed, true);
  assert.equal(kinds(moderate.blockers).includes("axe"), false);
  assert.equal(kinds(moderate.fixes).includes("axe"), true);
});

test("a colour outside the roles is a blocker and off-scale padding is a fix", { timeout: TIMEOUT }, () => {
  const colour = report({
    styles: [style({ color: "#ff00ff" })],
  });
  const hit = colour.blockers.find((finding) => finding.kind === "style.color");
  assert.ok(hit);
  assert.match(hit.actual, /#ff00ff/);
  assert.match(hit.expected, /#1a1a1a/);
  const spacing = report({
    styles: [style({ selector: "section.hero", role: "section", paddingPx: [30] })],
  });
  assert.equal(kinds(spacing.blockers).includes("style.spacing"), false);
  const fix = spacing.fixes.find((finding) => finding.kind === "style.spacing");
  assert.ok(fix);
  assert.equal(fix.selector, "section.hero");
  assert.match(fix.actual, /30/);
  assert.equal(spacing.passed, true);
});

test("a clean fixture passes", { timeout: TIMEOUT }, () => {
  const result = report({}, [{ id: "hero" }, { id: "nav" }]);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.fixes, []);
  assert.equal(result.passed, true);
  assert.equal(result.url, "http://127.0.0.1:4599/");
  assert.equal(result.width, 375);
  assert.match(result.summaryForModel, /^BLOCKERS\n/);
  assert.match(result.summaryForModel, /\nFIXES\n/);
});

test("summaryForModel lists blockers before fixes and stays under the cap", { timeout: TIMEOUT }, () => {
  const result = report({
    styles: [
      style({ fontFamily: "Syne" }),
      style({ selector: "section.hero", role: "section", paddingPx: [30] }),
    ],
  });
  const summary = result.summaryForModel;
  const blockersAt = summary.indexOf("BLOCKERS");
  const fixesAt = summary.indexOf("FIXES");
  const fontAt = summary.indexOf("h1.hero__title font-family: actual Syne, expected General Sans");
  const spaceAt = summary.indexOf("section.hero spacing:");
  assert.ok(blockersAt >= 0 && fontAt > blockersAt);
  assert.ok(fixesAt > fontAt && spaceAt > fixesAt);
  assert.match(summary, /actual Syne, expected General Sans/);
  assert.match(summary, /section\.hero spacing: actual 30px, expected /);
  assert.ok(Buffer.byteLength(summary, "utf8") <= SUMMARY_MAX_BYTES);

  const blockers: Finding[] = [];
  for (let index = 0; index < 4; index += 1) {
    blockers.push({
      kind: "style.font-family",
      selector: `h1.item-${index}`,
      actual: "Syne",
      expected: "General Sans",
      detail: "Heading family.",
    });
  }
  const fixes: Finding[] = [];
  for (let index = 0; index < 80; index += 1) {
    fixes.push({
      kind: "style.spacing",
      selector: `section.block-${index}`,
      actual: "30px",
      expected: `4, 8, 12, 16, 24, 40, 64, or 96 ${"x".repeat(40)}`,
      detail: "Padding.",
    });
  }
  const capped = summaryForModel(blockers, fixes);
  assert.ok(Buffer.byteLength(capped, "utf8") <= SUMMARY_MAX_BYTES);
  assert.ok(capped.indexOf("BLOCKERS") < capped.indexOf("FIXES"));
  assert.match(capped, /h1\.item-0 font-family: actual Syne, expected General Sans/);
  assert.match(capped, /Omitted \d+ lines\./);
  assert.equal(capped.includes("section.block-79"), false);
  const omitted = /Omitted (\d+) lines\./.exec(capped);
  assert.ok(omitted?.[1]);
  assert.ok(Number(omitted[1]) > 0);
});

test("hero scope assertions stay on the hero and the nav", { timeout: TIMEOUT }, () => {
  const sections: SectionSpec[] = [{ id: "hero" }, { id: "story" }, { id: "faq" }, { id: "nav" }];
  const hero = assertionsFromDesign({ designMd: DESIGN, sections, scope: "hero", width: 375 });
  const ids = new Set(hero.map((assertion) => assertion.sectionId).filter((id) => id !== ""));
  assert.deepEqual([...ids].sort(), ["hero", "nav"]);
  assert.equal(hero.some((assertion) => assertion.kind === "box.tap-target"), true);
  assert.equal(
    hero.some((assertion) => assertion.kind === "style.font-family" && assertion.expected === "General Sans"),
    true,
  );
  const desk = assertionsFromDesign({ designMd: DESIGN, sections, scope: "page", width: 1440 });
  assert.equal(desk.some((assertion) => assertion.sectionId === "story"), true);
  assert.equal(desk.some((assertion) => assertion.kind === "box.tap-target"), false);
  assert.equal(desk.some((assertion) => assertion.kind === "interaction.scroll-reveal"), true);
  assert.equal(desk.some((assertion) => assertion.kind === "interaction.accordion"), true);
});

test("section specs come from the sitemap and the wireframe", { timeout: TIMEOUT }, () => {
  const specs = sectionSpecsForPage({
    route: "/",
    sitemap: ["# Sitemap", "", "## Primary", "", "- Home at /", "  - hero", "  - story", "  - nav", ""].join("\n"),
    wireframe: ["# Wireframe", "", "## Home", "", "+------+", "| hero |", "+------+", "", "+-----+", "| faq |", "+-----+", ""].join("\n"),
  });
  assert.deepEqual(specs.map((spec) => spec.id), ["hero", "story", "nav", "faq"]);
});

test("the runner calls the browser at 375, 768, and 1440 and respects scope", { timeout: TIMEOUT }, async () => {
  const seen: CdpCollectRequest[] = [];
  const sections: SectionSpec[] = [{ id: "hero" }, { id: "story" }, { id: "faq" }, { id: "nav" }];
  const hero = await runCdpAssertions({
    baseUrl: "http://127.0.0.1:4599",
    pages: [{ path: "/", sections }],
    scope: "hero",
    designMd: DESIGN,
    collect: async (request) => {
      seen.push(request);
      return facts({ url: request.url, width: request.width, interactions: [] });
    },
  });
  assert.deepEqual(seen.map((request) => request.width), [...CDP_WIDTHS]);
  assert.deepEqual(CDP_WIDTHS, [375, 768, 1440]);
  for (const request of seen) {
    assert.deepEqual(request.sections.map((section) => section.id), ["hero", "nav"]);
    assert.equal(request.scope, "hero");
    assert.equal(request.timeoutMs, CDP_NAV_TIMEOUT_MS);
    assert.equal(request.url, "http://127.0.0.1:4599/");
  }
  assert.equal(hero.reports.length, 3);
  seen.length = 0;
  await runCdpAssertions({
    baseUrl: "http://127.0.0.1:4599",
    pages: ["/"],
    scope: "page",
    designMd: DESIGN,
    sitemap: ["# Sitemap", "", "## Primary", "", "- Home at /", "  - hero", "  - story", "  - faq", "  - nav", ""].join("\n"),
    collect: async (request) => {
      seen.push(request);
      return facts({ url: request.url, width: request.width, interactions: [] });
    },
  });
  assert.deepEqual(seen.map((request) => request.width), [375, 768, 1440]);
  for (const request of seen) {
    assert.deepEqual(request.sections.map((section) => section.id), ["hero", "story", "faq", "nav"]);
    assert.equal(request.scope, "page");
  }
});

test("the runner refuses the desk port and does not call the browser", { timeout: TIMEOUT }, async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      runCdpAssertions({
        baseUrl: "http://127.0.0.1:4175/desk",
        pages: ["/"],
        scope: "hero",
        designMd: DESIGN,
        collect: async () => {
          calls += 1;
          return facts();
        },
      }),
    /4175/,
  );
  assert.equal(calls, 0);
});
