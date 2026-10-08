/**
 * Slartibartfast detail pass (prompt 131, v1 §12.2).
 *
 * One prompt per area, plus Playwright checks where the page can prove it:
 * a real 404 page, a favicon, an og:image, a visible focus style, and a
 * print rule that hides navigation. Kerning, optical alignment, hover,
 * empty, and error are measured when the DOM exposes them and reported
 * either way.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Page } from "playwright";
import { withChromium } from "./playwright-opener.ts";

export const DETAIL_AREAS = [
  "kerning",
  "optical-alignment",
  "hover",
  "focus",
  "404",
  "favicon",
  "og-image",
  "empty",
  "error",
  "print",
] as const;

export type DetailArea = (typeof DETAIL_AREAS)[number];

export interface DetailCheck {
  area: string;
  ok: boolean;
  note: string;
}

const RULES = "packages/engine/src/spec/site-rules.ts";

const PROMPTS: Record<DetailArea, { goal: string; steps: string; truth: string; verify: string }> = {
  kerning: {
    goal: "Tighten tracking on display type where the letters collide.",
    steps: "Tighten letter spacing on the large display type. Loosen it on small capitals. Do not change the type family.",
    truth: "Display type has intentional tracking, and body text stays readable.",
    verify: "Measure the display line's letter spacing in a browser.",
  },
  "optical-alignment": {
    goal: "Align the display line to the optical edge, not the bounding box.",
    steps: "Shift the display heading so it sits on the same edge as the text below it. Do not center the stack.",
    truth: "The heading and the body share one edge, and the page is not a centered stack.",
    verify: "Compare the heading's start edge with the paragraph under it.",
  },
  hover: {
    goal: "Give every link and button a hover state that is more than a color swap.",
    steps: "Add a hover state for links and buttons. Keep it off touch if the state moves the control.",
    truth: "Links and buttons change on hover, and the change is not a magnetic pull.",
    verify: "Hover one link and one button and record what changes.",
  },
  focus: {
    goal: "Keep a visible focus style on every interactive element.",
    steps: "Tab through every link, button, and field. Each one needs a focus style that stays visible on the brand background.",
    truth: "Keyboard focus is visible on every interactive element.",
    verify: "Tab from the top of the page and confirm each stop shows a focus style.",
  },
  "404": {
    goal: "Add a 404 page in the brand voice, with a way back home.",
    steps: "Add a /404 route that returns a real page, not a plain server line. Include one heading and a link home.",
    truth: "A missing path renders a 404 page with a heading and a way home.",
    verify: "Open /404 and confirm the status and the heading.",
  },
  favicon: {
    goal: "Add a favicon that matches the mark.",
    steps: "Link a favicon from the document head and serve the file. Match the mark. Do not use a default framework icon.",
    truth: "The document links a favicon and the file is served.",
    verify: "Request the favicon URL and confirm it returns 200.",
  },
  "og-image": {
    goal: "Add an og:image that matches this page.",
    steps: "Add a meta og:image tag whose URL returns the share image. The image shows the real page, not a placeholder.",
    truth: "og:image is present and the image URL returns 200.",
    verify: "Read the og:image tag and request that URL.",
  },
  empty: {
    goal: "Add an empty state that says what is missing and what to do.",
    steps: "When a list has no rows, show a short empty state in the brand voice. Say what is absent and the next action.",
    truth: "An empty collection shows its own state instead of a blank region.",
    verify: "Open a page with no rows and read the empty state.",
  },
  error: {
    goal: "Add an error state that says what failed and what to do next.",
    steps: "When a form or a request fails, show an error state. Name the failure in plain language and the next step.",
    truth: "A failed action shows an error state the visitor can read.",
    verify: "Trigger one error and read the message.",
  },
  print: {
    goal: "Add a print stylesheet that hides navigation and keeps the article.",
    steps: "Add a print stylesheet. Hide the navigation. Keep the heading and the body. Do not hide the whole page.",
    truth: "Print styles hide the navigation and leave the article visible.",
    verify: "Emulate print and confirm the navigation is hidden.",
  },
};

function row(area: string, ok: boolean, note: string): DetailCheck {
  return { area, ok, note: note.replaceAll("!", ".").replaceAll("\u2014", "-").trim() };
}

function assertUrl(url: string): void {
  if (!/^https?:\/\//i.test(url)) throw new Error("detailChecks needs an http or https URL.");
}

async function textStatus(page: Page, target: string): Promise<number> {
  return page.evaluate(async (href: string) => {
    const view = globalThis as unknown as { fetch: (input: string) => Promise<{ status: number }> };
    try {
      const response = await view.fetch(href);
      return response.status;
    } catch {
      return 0;
    }
  }, target);
}

async function measureType(page: Page): Promise<{ kerning: DetailCheck; optical: DetailCheck }> {
  const measured = await page.evaluate(() => {
    const view = globalThis as unknown as {
      document: { querySelector: (selector: string) => { tagName: string } | null };
      getComputedStyle: (el: unknown) => { letterSpacing: string; textAlign: string };
    };
    const heading = view.document.querySelector("h1");
    if (heading === null) return null;
    const style = view.getComputedStyle(heading);
    return { letterSpacing: style.letterSpacing, textAlign: style.textAlign };
  });
  if (measured === null) {
    return {
      kerning: row("kerning", false, "No display heading to measure."),
      optical: row("optical-alignment", false, "No display heading to align."),
    };
  }
  const spacing = measured.letterSpacing.trim().toLowerCase();
  const pixels = Number.parseFloat(spacing);
  const tracked = spacing !== "normal" && spacing !== "0" && spacing !== "0px" && Number.isFinite(pixels) && Math.abs(pixels) > 0.2;
  const align = measured.textAlign.trim().toLowerCase();
  const centered = align === "center";
  return {
    kerning: row(
      "kerning",
      tracked,
      tracked ? `Display tracking is ${measured.letterSpacing}.` : "Display type uses default tracking.",
    ),
    optical: row(
      "optical-alignment",
      !centered,
      centered ? "The heading is centered." : "The heading aligns to the start edge.",
    ),
  };
}

async function measureHover(page: Page): Promise<DetailCheck> {
  const found = await page.evaluate(() => {
    const view = globalThis as unknown as {
      document: { styleSheets: ArrayLike<{ cssRules?: ArrayLike<{ selectorText?: string; cssRules?: unknown }> }> };
    };
    const visit = (rules: ArrayLike<{ selectorText?: string; cssRules?: unknown }> | undefined): boolean => {
      if (rules === undefined) return false;
      for (let index = 0; index < rules.length; index += 1) {
        const rule = rules[index];
        if (rule === undefined) continue;
        if (typeof rule.selectorText === "string" && rule.selectorText.includes(":hover")) return true;
        if (rule.cssRules !== undefined && visit(rule.cssRules as ArrayLike<{ selectorText?: string; cssRules?: unknown }>)) {
          return true;
        }
      }
      return false;
    };
    for (let index = 0; index < view.document.styleSheets.length; index += 1) {
      const sheet = view.document.styleSheets[index];
      if (sheet === undefined) continue;
      try {
        if (visit(sheet.cssRules)) return true;
      } catch {
        continue;
      }
    }
    return false;
  });
  return row(
    "hover",
    found,
    found ? "A hover state is defined." : "No hover state is defined for links or buttons.",
  );
}

interface FocusNode {
  tagName: string;
  textContent: string | null;
  getBoundingClientRect: () => {
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

async function measureFocus(page: Page): Promise<DetailCheck> {
  const expected = await page
    .locator(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    )
    .count();
  if (expected === 0) return row("focus", false, "No interactive element to focus.");
  const weak: string[] = [];
  const seen = new Set<string>();
  for (let step = 0; step < expected + 2; step += 1) {
    await page.keyboard.press("Tab");
    const current = await page.evaluate(() => {
      const view = globalThis as unknown as {
        document: { activeElement: FocusNode | null; body: FocusNode; documentElement: FocusNode };
        getComputedStyle: (el: FocusNode) => {
          outlineStyle: string;
          outlineWidth: string;
          outlineColor: string;
          boxShadow: string;
          visibility: string;
          display: string;
          opacity: string;
        };
        innerHeight: number;
        innerWidth: number;
      };
      const el = view.document.activeElement;
      if (el === null || el === view.document.body || el === view.document.documentElement) return null;
      const style = view.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const visible =
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number.parseFloat(style.opacity || "1") > 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < view.innerHeight &&
        rect.left < view.innerWidth;
      if (!visible) return null;
      const width = Number.parseFloat(style.outlineWidth);
      const outline =
        style.outlineStyle !== "none" &&
        style.outlineColor !== "transparent" &&
        Number.isFinite(width) &&
        width > 0;
      const shadow = style.boxShadow !== "none" && style.boxShadow !== "";
      const label = (el.textContent ?? "").trim().slice(0, 80) || el.tagName.toLowerCase();
      return { key: `${el.tagName}:${label}`, label, marked: outline || shadow };
    });
    if (current === null || seen.has(current.key)) continue;
    seen.add(current.key);
    if (!current.marked) weak.push(current.label);
  }
  if (seen.size < expected) {
    return row("focus", false, "Tab did not reach every interactive element.");
  }
  if (weak.length > 0) return row("focus", false, `Focus is missing on ${weak.join(", ")}.`);
  return row("focus", true, "Focus is visible on every interactive element.");
}

async function measureAsset(page: Page, pageUrl: string, area: DetailArea, selector: string, missing: string): Promise<DetailCheck> {
  const locator = page.locator(selector);
  if ((await locator.count()) === 0) return row(area, false, missing);
  const raw = await locator.first().getAttribute(area === "favicon" ? "href" : "content");
  if (raw === null || raw.trim().length === 0) return row(area, false, missing);
  let target: string;
  try {
    target = new URL(raw.trim(), pageUrl).href;
  } catch {
    return row(area, false, missing);
  }
  const status = await textStatus(page, target);
  const label = area === "favicon" ? "Favicon" : "og:image";
  if (status !== 200) return row(area, false, `${label} returned ${status}.`);
  return row(area, true, `${label} returned 200.`);
}

async function measureState(page: Page): Promise<{ empty: DetailCheck; error: DetailCheck }> {
  const found = await page.evaluate(() => {
    const view = globalThis as unknown as {
      document: { querySelector: (selector: string) => unknown };
    };
    return {
      empty: view.document.querySelector("[data-empty], .empty, .empty-state") !== null,
      error: view.document.querySelector("[role='alert'], [aria-invalid='true'], .error, .form-error") !== null,
    };
  });
  return {
    empty: row("empty", found.empty, found.empty ? "An empty state is on the page." : "No empty state is on this page."),
    error: row("error", found.error, found.error ? "An error state is on the page." : "No error state is on this page."),
  };
}

async function measurePrint(page: Page): Promise<DetailCheck> {
  await page.emulateMedia({ media: "print" });
  const hidden = await page.evaluate(() => {
    const view = globalThis as unknown as {
      document: { querySelectorAll: (selector: string) => ArrayLike<unknown> };
      getComputedStyle: (el: unknown) => { display: string; visibility: string };
    };
    const nodes = view.document.querySelectorAll("nav, [role='navigation']");
    const list: unknown[] = [];
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node !== undefined) list.push(node);
    }
    const targets: unknown[] = [...list];
    if (targets.length === 0) {
      const header = view.document.querySelectorAll("header");
      for (let index = 0; index < header.length; index += 1) {
        const node = header[index];
        if (node !== undefined) targets.push(node);
      }
    }
    if (targets.length === 0) return "missing";
    const concealed = (el: unknown): boolean => {
      const style = view.getComputedStyle(el);
      return style.display === "none" || style.visibility === "hidden";
    };
    return targets.every(concealed) ? "hidden" : "visible";
  });
  await page.emulateMedia({ media: "screen" });
  if (hidden === "missing") return row("print", false, "No navigation element is on the page.");
  if (hidden === "hidden") return row("print", true, "Print styles hide the navigation.");
  return row("print", false, "Print styles leave the navigation on the page.");
}

async function measure404(context: BrowserContext, url: string): Promise<DetailCheck> {
  const page = await context.newPage();
  try {
    const target = new URL("/404", url).href;
    const response = await page.goto(target, { waitUntil: "load", timeout: 20_000 });
    const status = response?.status() ?? 0;
    const type = response?.headers()["content-type"] ?? "";
    const html = type.includes("text/html");
    const heading = html ? await page.locator("h1, main").count() : 0;
    if (status === 404 && html && heading > 0) {
      return row("404", true, "The /404 path returns an HTML page.");
    }
    if (!html) return row("404", false, `The /404 path returned ${status} without an HTML page.`);
    return row("404", false, `The /404 path returned ${status} without a not-found page.`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The /404 path did not load.";
    return row("404", false, detail);
  } finally {
    await page.close();
  }
}

/**
 * Report every detail area for one URL. A failed area stays in the list.
 */
export async function detailChecks(url: string): Promise<DetailCheck[]> {
  assertUrl(url);
  return withChromium(async (browser) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 },
    });
    try {
      const page = await context.newPage();
      let response;
      try {
        response = await page.goto(url, { waitUntil: "load", timeout: 20_000 });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "The page did not load.";
        return DETAIL_AREAS.map((area) => row(area, false, detail));
      }
      if (response === null || response.status() >= 400) {
        return DETAIL_AREAS.map((area) => row(area, false, "The page did not load."));
      }
      const type = await measureType(page);
      const hover = await measureHover(page);
      const focus = await measureFocus(page);
      const favicon = await measureAsset(page, url, "favicon", "link[rel~='icon']", "A favicon link is missing.");
      const og = await measureAsset(page, url, "og-image", "meta[property='og:image']", "og:image is missing.");
      const state = await measureState(page);
      const print = await measurePrint(page);
      const missing = await measure404(context, url);
      const byArea = new Map<string, DetailCheck>([
        ["kerning", type.kerning],
        ["optical-alignment", type.optical],
        ["hover", hover],
        ["focus", focus],
        ["404", missing],
        ["favicon", favicon],
        ["og-image", og],
        ["empty", state.empty],
        ["error", state.error],
        ["print", print],
      ]);
      return DETAIL_AREAS.map((area) => byArea.get(area) ?? row(area, false, "This area was not measured."));
    } finally {
      await context.close();
    }
  });
}

function promptBody(area: DetailArea): string {
  const copy = PROMPTS[area];
  return [
    "# Goal",
    "",
    copy.goal,
    "",
    "# Files",
    "",
    "- The page and styles for this area.",
    `- Apply the shared RULES in ${RULES} by path. Do not paste that file.`,
    "",
    "# Steps",
    "",
    copy.steps,
    "Do not add a second job.",
    "",
    "# must_haves",
    "",
    "truths:",
    "",
    `- ${copy.truth}`,
    "",
    "artifacts:",
    "",
    "- The page or stylesheet this area changes.",
    "",
    "key_links:",
    "",
    `- RULES are the text of ${RULES}, referenced, not copied.`,
    "",
    "prohibitions:",
    "",
    "- Do not add a font outside the brand, and do not add an exclamation mark.",
    "",
    "# Verify",
    "",
    copy.verify,
    "",
  ].join("\n");
}

/** One prompt file per detail area. Nothing on the site is edited. */
export async function writeDetailPrompts(projectDir: string): Promise<string[]> {
  const dir = path.join(projectDir, ".hitchhiker", "prompts", "detail");
  await mkdir(dir, { recursive: true });
  const files: string[] = [];
  for (const area of DETAIL_AREAS) {
    const file = path.join(dir, `${area}.md`);
    await writeFile(file, promptBody(area), "utf8");
    files.push(file);
  }
  return files;
}
