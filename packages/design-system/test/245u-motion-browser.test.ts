/**
 * 245u. Static Chromium smoke for pin and batch. No network and no browser download.
 * Skips when the local Playwright Chromium binary or the app GSAP build is missing.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

interface PlaywrightPage {
  emulateMedia(options: { reducedMotion: "no-preference" }): Promise<void>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  route(pattern: string, handler: (route: { abort(): Promise<void> }) => void): Promise<void>;
  setContent(html: string, options: { waitUntil: "domcontentloaded" }): Promise<void>;
  evaluate<T>(fn: () => Promise<T> | T): Promise<T>;
}

interface PlaywrightBrowser {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}

interface PlaywrightChromium {
  executablePath(): string;
  launch(options: { headless: boolean; executablePath: string; args: string[] }): Promise<PlaywrightBrowser>;
}

function escapeScript(source: string): string {
  return source.replaceAll("</", "<\\/");
}

function bundleRecipes(): string {
  const ts = createRequire(path.join(repoRoot, "package.json"))("typescript") as typeof import("typescript");
  const files = ["host.ts", "handle.ts", "token-choice.ts", "pinned-timeline.ts", "batch-reveal.ts"];
  const parts = files.map((name) => {
    const source = readFileSync(path.join(here, "..", "src", "motion", name), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
      fileName: name,
    }).outputText;
    return compiled
      .split("\n")
      .filter((line) => !/^\s*import\s/.test(line))
      .join("\n")
      .replace(/\bexport\s+(?=function|const|class)/g, "");
  });
  return [
    "const gsap = window.gsap;",
    "const ScrollTrigger = window.ScrollTrigger;",
    "if (!gsap || !ScrollTrigger) throw new Error('gsap globals missing');",
    ...parts,
    "globalThis.__hhMotion = { createPinnedTimeline: createPinnedTimeline, createBatchReveal: createBatchReveal };",
  ].join("\n");
}

function localChromium(): PlaywrightChromium | undefined {
  const pkg = path.join(repoRoot, "packages", "qa", "node_modules", "playwright", "package.json");
  const gsap = path.join(repoRoot, "packages", "app", "node_modules", "gsap", "dist", "gsap.min.js");
  const scroll = path.join(repoRoot, "packages", "app", "node_modules", "gsap", "dist", "ScrollTrigger.min.js");
  if (!existsSync(pkg) || !existsSync(gsap) || !existsSync(scroll)) return undefined;
  const require = createRequire(pkg);
  const loaded: unknown = require("playwright");
  if (typeof loaded !== "object" || loaded === null || !("chromium" in loaded)) return undefined;
  const chromium: unknown = loaded.chromium;
  if (typeof chromium !== "object" || chromium === null) return undefined;
  if (!("executablePath" in chromium) || typeof chromium.executablePath !== "function") return undefined;
  if (!("launch" in chromium) || typeof chromium.launch !== "function") return undefined;
  const executable = chromium.executablePath() as string;
  if (!existsSync(executable)) return undefined;
  return chromium as PlaywrightChromium;
}

test("pinnedTimeline and batchReveal change transforms only", { timeout: 20_000 }, async (t) => {
  const chromium = localChromium();
  if (chromium === undefined) {
    t.skip("local Chromium helper or GSAP build is unavailable");
    return;
  }
  const gsap = readFileSync(path.join(repoRoot, "packages", "app", "node_modules", "gsap", "dist", "gsap.min.js"), "utf8");
  const scroll = readFileSync(
    path.join(repoRoot, "packages", "app", "node_modules", "gsap", "dist", "ScrollTrigger.min.js"),
    "utf8",
  );
  const html = [
    "<!doctype html><html><head><style>",
    "html,body{margin:0;height:400vh}",
    "#pin{height:100vh} #headline{font:48px sans-serif}",
    ".spacer{height:120vh} .card{height:40vh}",
    "</style></head><body>",
    "<section id='pin'><h2 id='headline'>Pin</h2></section>",
    "<div class='spacer'></div>",
    "<article class='card'>One</article><article class='card'>Two</article>",
    "<script>",
    escapeScript(gsap),
    "</script><script>",
    escapeScript(scroll),
    "</script><script>",
    escapeScript(bundleRecipes()),
    "</script></body></html>",
  ].join("");

  const executablePath = chromium.executablePath();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route("**/*", (route) => {
      void route.abort();
    });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const api = globalThis.__hhMotion as
        | {
            createPinnedTimeline: (target: unknown, options: unknown) => { kill(): void; refresh(): void };
            createBatchReveal: (target: unknown) => { kill(): void; refresh(): void };
          }
        | undefined;
      if (api === undefined) throw new Error("motion bundle missing");
      const headline = document.querySelector("#headline");
      const pin = document.querySelector("#pin");
      const card = document.querySelector(".card");
      const cards = document.querySelectorAll(".card");
      if (headline === null || pin === null || card === null) throw new Error("fixture nodes missing");
      const read = (node: Element) => {
        const box = node as HTMLElement;
        return {
          transform: getComputedStyle(box).transform,
          width: box.style.width,
          height: box.style.height,
          top: box.style.top,
          left: box.style.left,
        };
      };
      const media = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        if (query.includes("prefers-reduced-motion")) return { matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; }, onchange: null };
        return media(query);
      };
      const pinned = api.createPinnedTimeline(pin, {
        scrub: true,
        beats: [{ target: headline, vars: { yPercent: 40, opacity: 0 } }],
      });
      const batch = api.createBatchReveal(cards);
      pinned.refresh();
      batch.refresh();
      const before = { headline: read(headline), card: read(card) };
      window.scrollTo(0, 700);
      window.ScrollTrigger.update();
      window.scrollTo(0, 2400);
      window.ScrollTrigger.update();
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve(undefined));
      });
      const after = { headline: read(headline), card: read(card) };
      const triggers = window.ScrollTrigger.getAll().length;
      pinned.kill();
      batch.kill();
      return { before, after, triggers };
    });
    assert.ok(result.triggers >= 1, "scroll triggers");
    assert.notEqual(result.after.headline.transform, result.before.headline.transform, JSON.stringify(result));
    assert.notEqual(result.after.card.transform, result.before.card.transform, JSON.stringify(result));
    for (const shot of [result.before.headline, result.after.headline, result.before.card, result.after.card]) {
      assert.equal(shot.width, "");
      assert.equal(shot.height, "");
      assert.equal(shot.top, "");
      assert.equal(shot.left, "");
    }
  } finally {
    await browser.close();
  }
});
