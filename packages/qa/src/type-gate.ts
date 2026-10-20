/**
 * Built-site type gate. Outcomes at 375 and 1440: family count, loaded
 * faces, display-to-body ratio, body size, line-height, measure, preload,
 * self-hosted woff2, fallback metrics, and the font byte budget.
 * A library name is not a failure. A hotlink host is, because the file
 * is not in the handoff.
 */

import { createServer, type Server } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { withChromium } from "./playwright-opener.ts";

export const TYPE_WIDTHS = [375, 1440] as const;

export const TYPE_BYTE_BUDGET = {
  headlineWoff2Max: 40_960,
  bodyWoff2Max: 46_080,
  allFontFilesMax: 122_880,
} as const;

export const TYPE_MIN_BODY_PX = 16;
export const TYPE_LINE_HEIGHT = { min: 1.45, max: 1.6 } as const;
export const TYPE_MEASURE_CH = { min: 45, max: 75 } as const;

/** World minimums from the 240r font appendix. Ratio is the modular step. */
export const TYPE_WORLD_MINIMUMS = {
  editorial: { ratio: 1.333, minDisplayOverBody: 3.2 },
  "3d-world": { ratio: 1.414, minDisplayOverBody: 3.5 },
  playful: { ratio: 1.25, minDisplayOverBody: 2.6 },
  brutalist: { ratio: 1.5, minDisplayOverBody: 4 },
  product: { ratio: 1.2, minDisplayOverBody: 2.2 },
  fashion: { ratio: 1.414, minDisplayOverBody: 3.5 },
  civic: { ratio: 1.25, minDisplayOverBody: 2.6 },
} as const;

export type TypeWorld = keyof typeof TYPE_WORLD_MINIMUMS;

const HOTLINK = /fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.fontshare\.com/i;

export interface TypeWidthSample {
  width: number;
  displayPx: number;
  bodyPx: number;
  ratio: number;
  lineHeight: number;
  measureCh: number;
  families: readonly string[];
  loaded: readonly string[];
}

export interface TypeAudit {
  ok: boolean;
  problems: readonly string[];
  samples: readonly TypeWidthSample[];
}

interface FaceRecord {
  family: string;
  display: string;
  src: string;
  sizeAdjust: string;
  ascent: string;
  descent: string;
  lineGap: string;
}

interface RawSample {
  width: number;
  displayPx: number;
  bodyPx: number;
  lineHeightPx: number;
  measurePx: number;
  chPx: number;
  families: string[];
  loaded: string[];
  faces: FaceRecord[];
  preloads: string[];
  hotlinks: string[];
}

interface ServedFont {
  url: string;
  bytes: number;
}

export async function auditBuiltType(dir: string, world: TypeWorld): Promise<TypeAudit> {
  const index = path.join(dir, "index.html");
  if (!existsSync(index)) {
    return { ok: false, problems: ["index.html is missing."], samples: [] };
  }
  const minimum = TYPE_WORLD_MINIMUMS[world].minDisplayOverBody;
  const site = await serveDir(dir);
  try {
    return await withChromium(async (browser) => {
      const page = await browser.newPage();
      const transfers: ServedFont[] = [];
      const pending: Promise<void>[] = [];
      await page.route("**/*", (route) => {
        const url = route.request().url();
        if (HOTLINK.test(url)) {
          transfers.push({ url, bytes: 0 });
          return route.abort();
        }
        return route.continue();
      });
      page.on("response", (response) => {
        const url = response.url();
        const type = response.headers()["content-type"] ?? "";
        if (!/\.woff2(?:$|\?)/i.test(url) && !type.includes("font")) return;
        pending.push(
          response
            .body()
            .then((body) => {
              transfers.push({ url, bytes: body.byteLength });
            })
            .catch(() => {
              transfers.push({ url, bytes: 0 });
            }),
        );
      });
      const samples: TypeWidthSample[] = [];
      let faces: FaceRecord[] = [];
      let preloads: string[] = [];
      let cssHotlinks: string[] = [];
      for (const width of TYPE_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(site.url, { waitUntil: "networkidle" });
        await page.evaluate(async () => {
          const view = globalThis as unknown as { document: { fonts: { ready: Promise<unknown> } } };
          await view.document.fonts.ready;
        });
        await Promise.all(pending);
        const raw = await page.evaluate(readPage, width);
        faces = raw.faces;
        preloads = raw.preloads;
        cssHotlinks = raw.hotlinks;
        const lineHeight = raw.bodyPx > 0 ? raw.lineHeightPx / raw.bodyPx : 0;
        const measureCh = raw.chPx > 0 ? raw.measurePx / raw.chPx : 0;
        const ratio = raw.bodyPx > 0 ? raw.displayPx / raw.bodyPx : 0;
        samples.push({
          width,
          displayPx: raw.displayPx,
          bodyPx: raw.bodyPx,
          ratio,
          lineHeight,
          measureCh,
          families: raw.families,
          loaded: raw.loaded,
        });
      }
      await page.close();
      const problems = judge({
        world,
        minimum,
        samples,
        faces,
        preloads,
        cssHotlinks,
        transfers,
      });
      return { ok: problems.length === 0, problems, samples };
    });
  } finally {
    await site.close();
  }
}

function judge(input: {
  world: TypeWorld;
  minimum: number;
  samples: readonly TypeWidthSample[];
  faces: readonly FaceRecord[];
  preloads: readonly string[];
  cssHotlinks: readonly string[];
  transfers: readonly ServedFont[];
}): string[] {
  const problems: string[] = [];
  const families = new Set<string>();
  for (const sample of input.samples) {
    if (sample.displayPx <= 0 || sample.bodyPx <= 0) {
      problems.push(`Display and body roles are missing at ${sample.width}.`);
      continue;
    }
    if (sample.bodyPx < TYPE_MIN_BODY_PX) {
      problems.push(`Body is ${sample.bodyPx.toFixed(2)}px at ${sample.width}. Minimum is ${TYPE_MIN_BODY_PX}px.`);
    }
    if (sample.ratio + 1e-6 < input.minimum) {
      problems.push(
        `Display to body ratio is ${sample.ratio.toFixed(2)} at ${sample.width}. ${input.world} minimum is ${input.minimum}.`,
      );
    }
    if (sample.lineHeight + 1e-6 < TYPE_LINE_HEIGHT.min || sample.lineHeight - 1e-6 > TYPE_LINE_HEIGHT.max) {
      problems.push(
        `Body line-height is ${sample.lineHeight.toFixed(2)} at ${sample.width}. Required range is ${TYPE_LINE_HEIGHT.min} to ${TYPE_LINE_HEIGHT.max}.`,
      );
    }
    if (sample.measureCh + 0.05 < TYPE_MEASURE_CH.min || sample.measureCh - 0.05 > TYPE_MEASURE_CH.max) {
      problems.push(
        `Measure is ${sample.measureCh.toFixed(1)}ch at ${sample.width}. Required range is ${TYPE_MEASURE_CH.min} to ${TYPE_MEASURE_CH.max}.`,
      );
    }
    for (const family of sample.families) families.add(family);
    for (const family of sample.families) {
      if (!sample.loaded.includes(family)) problems.push(`${family} is not loaded at ${sample.width}.`);
    }
  }
  if (families.size === 0) problems.push("Visible text has no brand family.");
  if (families.size > 2) problems.push(`Visible text uses ${families.size} brand families.`);
  const brandFaces = input.faces.filter((face) => !isFallback(face.family) && /woff2/i.test(face.src));
  for (const family of families) {
    const fallback = input.faces.find((face) => isFallbackFor(face.family, family));
    if (
      fallback === undefined ||
      fallback.sizeAdjust === "" ||
      fallback.ascent === "" ||
      fallback.descent === "" ||
      fallback.lineGap === ""
    ) {
      problems.push(
        `${family} is missing a fallback with size-adjust, ascent-override, descent-override, and line-gap-override.`,
      );
    }
  }
  for (const face of brandFaces) {
    const mode = face.display.trim().toLowerCase();
    if (mode !== "swap" && mode !== "optional") {
      problems.push(`${unquote(face.family)} uses font-display ${mode === "" ? "auto" : mode}.`);
    }
    if (HOTLINK.test(face.src) || !/woff2/i.test(face.src)) {
      problems.push(`${unquote(face.family)} is not a self-hosted woff2.`);
    }
  }
  for (const hit of input.cssHotlinks) {
    if (!problems.some((line) => line.includes("hotlink"))) {
      problems.push(`Font request uses a hotlink host: ${hit}.`);
    }
  }
  const fontTransfers = uniqueFonts(
    input.transfers.filter((item) => /\.woff2(?:$|\?)/i.test(item.url) && !HOTLINK.test(item.url)),
  );
  const headlineHref = input.preloads.filter((href) => /\.woff2(?:$|\?)/i.test(href));
  if (headlineHref.length !== 1) {
    problems.push(headlineHref.length === 0 ? "Headline preload is missing." : "More than one headline font is preloaded.");
  }
  const headline = headlineHref[0];
  let total = 0;
  for (const file of fontTransfers) {
    total += file.bytes;
    const isHeadline = headline !== undefined && file.url.includes(stripQuery(headline));
    if (isHeadline && file.bytes > TYPE_BYTE_BUDGET.headlineWoff2Max) {
      problems.push(`Headline font is ${file.bytes} bytes. Maximum is ${TYPE_BYTE_BUDGET.headlineWoff2Max}.`);
    }
    if (!isHeadline && file.bytes > TYPE_BYTE_BUDGET.bodyWoff2Max) {
      problems.push(`Body font is ${file.bytes} bytes. Maximum is ${TYPE_BYTE_BUDGET.bodyWoff2Max}.`);
    }
  }
  if (total > TYPE_BYTE_BUDGET.allFontFilesMax) {
    problems.push(`Font files total ${total} bytes. Maximum is ${TYPE_BYTE_BUDGET.allFontFilesMax}.`);
  }
  return problems;
}

function readPage(width: number): RawSample {
  function ownText(node: ElementLike): boolean {
    const children = node.childNodes;
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child !== undefined && child.nodeType === 3 && (child.textContent ?? "").trim() !== "") return true;
    }
    return false;
  }
  function bare(value: string): string {
    return value.trim().replace(/^["']|["']$/g, "");
  }
  function fallbackName(family: string): boolean {
    return /\bfallback\b/i.test(bare(family));
  }
  function brandName(stack: string): string | null {
    const generics = new Set([
      "serif",
      "sans-serif",
      "monospace",
      "cursive",
      "fantasy",
      "system-ui",
      "ui-serif",
      "ui-sans-serif",
      "ui-monospace",
      "ui-rounded",
      "emoji",
      "math",
      "fangsong",
      "inherit",
      "initial",
      "unset",
    ]);
    for (const part of stack.split(",")) {
      const name = bare(part);
      if (name === "" || generics.has(name.toLowerCase()) || fallbackName(name)) continue;
      return name;
    }
    return null;
  }
  const view = globalThis as unknown as {
    document: {
      querySelector: (selector: string) => ElementLike | null;
      querySelectorAll: (selector: string) => ArrayLike<ElementLike>;
      body: ElementLike;
      styleSheets: ArrayLike<StyleSheetLike>;
      fonts: { check: (font: string) => boolean };
      createElement: (tag: string) => ElementLike;
    };
    getComputedStyle: (element: ElementLike) => StyleLike;
  };
  const display = view.document.querySelector('[data-type-role="display"]');
  const body = view.document.querySelector('[data-type-role="body"]');
  const displayStyle = display === null ? null : view.getComputedStyle(display);
  const bodyStyle = body === null ? null : view.getComputedStyle(body);
  const displayPx = displayStyle === null ? 0 : Number.parseFloat(displayStyle.fontSize);
  const bodyPx = bodyStyle === null ? 0 : Number.parseFloat(bodyStyle.fontSize);
  const lineHeightPx = bodyStyle === null ? 0 : Number.parseFloat(bodyStyle.lineHeight);
  const measurePx = body === null ? 0 : body.getBoundingClientRect().width;
  let chPx = 0;
  if (body !== null && bodyStyle !== null) {
    const probe = view.document.createElement("span");
    probe.textContent = "0";
    probe.style.cssText = `position:absolute;visibility:hidden;font:${bodyStyle.font}`;
    view.document.body.appendChild(probe);
    chPx = probe.getBoundingClientRect().width;
    probe.remove();
  }
  const families: string[] = [];
  const loaded: string[] = [];
  const nodes = view.document.querySelectorAll("body *");
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node === undefined || !ownText(node)) continue;
    const style = view.getComputedStyle(node);
    const family = brandName(style.fontFamily);
    if (family === null || families.includes(family)) continue;
    families.push(family);
    const weight = style.fontWeight;
    const size = style.fontSize;
    if (view.document.fonts.check(`${weight} ${size} "${family}"`)) loaded.push(family);
  }
  const faces: FaceRecord[] = [];
  const sheets = view.document.styleSheets;
  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
    const sheet = sheets[sheetIndex];
    if (sheet === undefined) continue;
    let rules: ArrayLike<RuleLike> = [];
    try {
      rules = sheet.cssRules;
    } catch {
      rules = [];
    }
    for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
      const rule = rules[ruleIndex];
      if (rule === undefined || rule.type !== 5) continue;
      const style = rule.style;
      faces.push({
        family: style.getPropertyValue("font-family"),
        display: style.getPropertyValue("font-display"),
        src: style.getPropertyValue("src"),
        sizeAdjust: style.getPropertyValue("size-adjust"),
        ascent: style.getPropertyValue("ascent-override"),
        descent: style.getPropertyValue("descent-override"),
        lineGap: style.getPropertyValue("line-gap-override"),
      });
    }
  }
  const preloads: string[] = [];
  const links = view.document.querySelectorAll('link[rel="preload"]');
  for (let index = 0; index < links.length; index += 1) {
    const link = links[index];
    if (link === undefined) continue;
    if ((link.getAttribute("as") ?? "") !== "font") continue;
    const href = link.getAttribute("href") ?? "";
    if (href !== "") preloads.push(href);
  }
  const hotlinks: string[] = [];
  for (const face of faces) {
    const match = face.src.match(/https?:\/\/[^)"'\s]+/i);
    if (match?.[0] && /fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.fontshare\.com/i.test(match[0])) {
      hotlinks.push(match[0]);
    }
  }
  return {
    width,
    displayPx,
    bodyPx,
    lineHeightPx,
    measurePx,
    chPx,
    families,
    loaded,
    faces,
    preloads,
    hotlinks,
  };
}

function isFallback(family: string): boolean {
  return /\bfallback\b/i.test(unquote(family));
}

function isFallbackFor(faceFamily: string, brand: string): boolean {
  const name = unquote(faceFamily);
  return isFallback(name) && name.toLowerCase().startsWith(brand.toLowerCase());
}

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function uniqueFonts(files: readonly ServedFont[]): ServedFont[] {
  const byUrl = new Map<string, number>();
  for (const file of files) byUrl.set(file.url, Math.max(byUrl.get(file.url) ?? 0, file.bytes));
  return [...byUrl.entries()].map(([url, bytes]) => ({ url, bytes }));
}

function stripQuery(href: string): string {
  const cut = href.split("?")[0] ?? href;
  return cut;
}

interface ElementLike {
  textContent: string | null;
  style: { cssText: string };
  childNodes: ArrayLike<{ nodeType: number; textContent: string | null }>;
  appendChild: (child: ElementLike) => void;
  remove: () => void;
  getAttribute: (name: string) => string | null;
  getBoundingClientRect: () => { width: number };
}

interface StyleLike {
  font: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
}

interface StyleSheetLike {
  cssRules: ArrayLike<RuleLike>;
}

interface RuleLike {
  type: number;
  style: { getPropertyValue: (name: string) => string };
}

function contentType(file: string): string {
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "text/html; charset=utf-8";
}

function serveDir(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const root = path.resolve(dir);
  const server: Server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = path.resolve(root, relative);
    const fromRoot = path.relative(root, file);
    if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("missing");
      return;
    }
    const body = readFileSync(file);
    res.writeHead(200, {
      "content-type": contentType(file),
      "content-length": String(body.byteLength),
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    });
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${address.port}/`,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}
