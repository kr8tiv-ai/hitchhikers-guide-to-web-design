import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { renderApproval } from "../src/approval.ts";
import { renderBrandKit, type BrandKitModel } from "../src/brand-kit.ts";
import { listAppRoutes } from "../src/polish.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, "screens", "polish");
const WIDTHS = [375, 768, 1440] as const;
const THEMES = ["light", "dark"] as const;

const BANNED =
  /\b(unlock|seamless|revolutionize|empower|game-changer|delve|leverage|synergy|robust|cutting-edge|journey|tapestry|landscape|lorem)\b|learn more|get started|build the future of/i;

interface AxeNode {
  target: string[];
  failureSummary?: string;
}

interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  nodes: AxeNode[];
}

interface AxeResults {
  violations: AxeViolation[];
}

type AxeBuilderLike = {
  analyze(): Promise<AxeResults>;
};

type AxeBuilderCtor = new (options: { page: Page }) => AxeBuilderLike;

const requireFromQa = createRequire(path.resolve(here, "../../qa/package.json"));
const { AxeBuilder } = requireFromQa("@axe-core/playwright") as { AxeBuilder: AxeBuilderCtor };

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#14201c" d="M6 26 L16 6 L26 26 Z"/></svg>`;

test("every screen at 375, 768, and 1440 in light and dark", async ({ page }) => {
  test.setTimeout(600_000);
  const routes = listAppRoutes();
  expect(routes.map((route) => route.path)).toEqual([
    "/",
    "/gallery",
    "/motion",
    "/brand",
    "/approve",
    "/hh-dashboard",
    "/before-jump",
    "/missing",
  ]);
  for (const route of routes) {
    expect(route.states.length).toBeGreaterThan(0);
  }

  rmSync(shotDir, { recursive: true, force: true });
  mkdirSync(shotDir, { recursive: true });

  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-polish-"));
  const cacheDir = await mkdtemp(path.join(tmpdir(), "hh-polish-cache-"));
  const packFile = path.join(projectDir, "gallery.json");
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const cardsFile = path.resolve(here, "../src/before-jump/cards.ts");
  await writeFile(packFile, JSON.stringify(fixturePack()));

  const desk = startChild(serverFile, {
    HH_E2E_PROJECT: projectDir,
    HH_E2E_SERVER: pathToFileURL(serverFile).href,
    HH_GALLERY_FILE: packFile,
    HH_GALLERY_CACHE: cacheDir,
  });

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const assetFailures: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const where = message.location().url || page.url();
    consoleErrors.push(`${where} :: ${message.text()}`);
  });
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() < 400) return;
    if (url.includes(".woff2") || url.includes("favicon")) {
      assetFailures.push(`${response.status()} ${url}`);
    }
  });

  const axeNotes: string[] = [];

  try {
    const deskUrl = await readUrl(desk, "desk");
    await page.emulateMedia({ reducedMotion: "reduce" });

    const shots: Shot[] = [
      {
        id: "desk-question",
        path: "/",
        state: "question",
        ready: "[data-hh-ready]",
        async open(target) {
          await target.goto(deskUrl);
        },
      },
      {
        id: "gallery-walk",
        path: "/gallery",
        state: "walk",
        ready: "[data-hh-ready]",
        async open(target) {
          await resetGallery(projectDir);
          await writeFile(packFile, JSON.stringify(fixturePack()));
          await target.goto(`${deskUrl}gallery?industry=saas&styleWorld=editorial`);
        },
      },
      {
        id: "gallery-empty",
        path: "/gallery",
        state: "empty",
        ready: "[data-hh-ready]",
        async open(target) {
          await resetGallery(projectDir);
          await writeFile(packFile, "[]");
          await target.goto(`${deskUrl}gallery`);
        },
      },
      {
        id: "motion-preview",
        path: "/motion",
        state: "preview",
        ready: "[data-hh-ready]",
        async open(target) {
          await target.goto(`${deskUrl}motion`);
        },
      },
      {
        id: "brand-empty",
        path: "/brand",
        state: "empty",
        ready: "[data-hh-ready]",
        async open(target) {
          await target.goto(`${deskUrl}brand`);
        },
      },
      {
        id: "brand-kit",
        path: "/brand",
        state: "kit",
        ready: "[data-hh-ready]",
        async open(target) {
          const html = absoluteAssets(renderBrandKit(kitModel()));
          await fulfill(target, `${deskUrl}__polish/brand-kit`, html);
        },
      },
      {
        id: "approve-empty",
        path: "/approve",
        state: "empty",
        ready: "[data-hh-ready]",
        async open(target) {
          await target.goto(`${deskUrl}approve`);
        },
      },
      {
        id: "approve-gate",
        path: "/approve",
        state: "gate",
        ready: "[data-hh-ready]",
        async open(target) {
          const html = absoluteAssets(
            renderApproval({
              titles: ["The stall at night", "A menu you can read", "Reserve a seat"],
              tokens: 8400,
              prdTitle: "North Glass",
              tiers: ["Towel", "Towel", "Fish"],
            }),
          );
          await fulfill(target, `${deskUrl}__polish/approve`, html);
        },
      },
      {
        id: "dashboard-empty",
        path: "/hh-dashboard",
        state: "empty",
        ready: "[data-hh-ready]",
        async open(target) {
          await rm(path.join(projectDir, ".hitchhiker", "queue.json"), { force: true });
          await target.goto(`${deskUrl}hh-dashboard`);
        },
      },
      {
        id: "dashboard-queue",
        path: "/hh-dashboard",
        state: "queue",
        ready: "[data-hh-ready]",
        async open(target) {
          await writeQueue(projectDir, false);
          await target.goto(`${deskUrl}hh-dashboard`);
        },
      },
      {
        id: "dashboard-error",
        path: "/hh-dashboard",
        state: "error",
        ready: "[data-hh-ready]",
        async open(target) {
          await writeQueue(projectDir, true);
          await target.goto(`${deskUrl}hh-dashboard`);
        },
      },
      {
        id: "missing-error",
        path: "/missing",
        state: "error",
        ready: "[data-hh-ready]",
        async open(target) {
          await target.goto(`${deskUrl}not-on-the-desk`);
        },
      },
    ];

    expect(covered(shots)).toEqual(coveredFromRoutes(routes.filter((route) => route.path !== "/before-jump")));

    for (const shot of shots) {
      await shoot(page, shot, axeNotes);
    }

    await stopChild(desk);

    const jumpOpen = await mkdtemp(path.join(tmpdir(), "hh-polish-jump-"));
    seedJump(jumpOpen, false);
    const openChild = startChild(cardsFile, {
      HH_E2E_PROJECT: jumpOpen,
      HH_E2E_PHASE: "deep-thought",
      HH_E2E_CARDS: pathToFileURL(cardsFile).href,
    }, jumpSource());
    try {
      const jumpUrl = await readUrl(openChild, "before we jump");
      await shoot(page, {
        id: "before-jump-open",
        path: "/before-jump",
        state: "open",
        ready: "[data-hh-ready]",
        async open(target) {
          await target.goto(jumpUrl);
        },
      }, axeNotes);
    } finally {
      await stopChild(openChild);
      await rm(jumpOpen, { recursive: true, force: true });
    }

    const jumpClear = await mkdtemp(path.join(tmpdir(), "hh-polish-jump-"));
    seedJump(jumpClear, true);
    const clearChild = startChild(cardsFile, {
      HH_E2E_PROJECT: jumpClear,
      HH_E2E_PHASE: "deep-thought",
      HH_E2E_CARDS: pathToFileURL(cardsFile).href,
    }, jumpSource());
    try {
      const jumpUrl = await readUrl(clearChild, "before we jump");
      await shoot(page, {
        id: "before-jump-clear",
        path: "/before-jump",
        state: "clear",
        ready: "[data-hh-ready]",
        async open(target) {
          await target.goto(jumpUrl);
        },
      }, axeNotes);
    } finally {
      await stopChild(clearChild);
      await rm(jumpClear, { recursive: true, force: true });
    }

    const unexpected = consoleErrors.filter((line) => !isExpectedConsole(line));
    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
    expect(unexpected, unexpected.join("\n")).toEqual([]);
    expect(assetFailures, assetFailures.join("\n")).toEqual([]);
    expect(axeNotes, axeNotes.join("\n")).toEqual([]);
  } finally {
    await stopChild(desk);
    await rm(projectDir, { recursive: true, force: true });
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test("the desk meets the same phone gate as a generated site", async () => {
  test.setTimeout(900_000);
  const routes = ["/", "/brand", "/approve", "/gallery", "/hh-dashboard", "/motion"];
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-polish-lh-"));
  const cacheDir = await mkdtemp(path.join(tmpdir(), "hh-polish-lh-cache-"));
  const packFile = path.join(projectDir, "gallery.json");
  const serverFile = path.resolve(here, "../src/server/server.ts");
  await writeFile(packFile, JSON.stringify(fixturePack()));
  const desk = startChild(serverFile, {
    HH_E2E_PROJECT: projectDir,
    HH_GALLERY_FILE: packFile,
    HH_GALLERY_CACHE: cacheDir,
  });
  try {
    const deskUrl = await readUrl(desk, "desk");
    const results = await phoneGate(deskUrl, routes);
    expect(results.map((result) => result.route).sort()).toEqual([...routes].sort());
    for (const result of results) {
      const detail = result.reasons.join("; ");
      expect(result.status, `${result.route} ${detail}`).toBe("PASS");
      expect(result.runs, result.route).toBe(3);
      const scores = result.scores;
      expect(scores, result.route).not.toBeNull();
      if (scores === null) continue;
      expect(points(scores.performance), `${result.route} performance`).toBeGreaterThanOrEqual(90);
      expect(points(scores.accessibility), `${result.route} accessibility`).toBeGreaterThanOrEqual(90);
      expect(points(scores.bestPractices), `${result.route} best practices`).toBeGreaterThanOrEqual(90);
      expect(points(scores.seo), `${result.route} seo`).toBeGreaterThanOrEqual(90);
    }
  } finally {
    await stopChild(desk);
    await rm(projectDir, { recursive: true, force: true });
    await rm(cacheDir, { recursive: true, force: true });
  }
});

function points(value: number): number {
  return value <= 1 ? value * 100 : value;
}

interface PhoneGateRow {
  route: string;
  status: string;
  reasons: string[];
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  } | null;
  runs: number;
}

/**
 * Same runner as generated sites. A static import of qa source leaves this package.
 */
function phoneGate(origin: string, routes: string[]): Promise<PhoneGateRow[]> {
  const file = pathToFileURL(path.resolve(here, "../../qa/src/lhci-run.ts")).href;
  const runner = [
    "const loaded = await import(process.argv[1]);",
    "if (typeof loaded.runLhci !== 'function') throw new Error('runLhci is missing.');",
    "const results = await loaded.runLhci(process.argv[2], process.argv.slice(3));",
    "process.stdout.write(JSON.stringify(results));",
  ].join("\n");
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", runner, file, origin, ...routes],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`phone gate timed out\n${stderr.slice(-1500)}`));
    }, 840_000);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`phone gate exited ${code ?? "null"}\n${stderr.slice(-1500)}`));
        return;
      }
      try {
        resolve(readPhoneGate(JSON.parse(stdout) as unknown));
      } catch (error) {
        const message = error instanceof Error ? error.message : "bad phone gate output";
        reject(new Error(`${message}\n${stdout.slice(0, 500)}\n${stderr.slice(-500)}`));
      }
    });
  });
}

function readPhoneGate(value: unknown): PhoneGateRow[] {
  if (!Array.isArray(value)) throw new Error("phone gate did not return a list");
  return value.map((row) => {
    if (typeof row !== "object" || row === null) throw new Error("phone gate row is incomplete");
    if (!("route" in row) || !("status" in row) || !("reasons" in row) || !("runs" in row) || !("scores" in row)) {
      throw new Error("phone gate row is incomplete");
    }
    if (typeof row.route !== "string" || typeof row.status !== "string" || typeof row.runs !== "number") {
      throw new Error("phone gate row is incomplete");
    }
    if (!Array.isArray(row.reasons) || row.reasons.some((reason) => typeof reason !== "string")) {
      throw new Error("phone gate row is incomplete");
    }
    return {
      route: row.route,
      status: row.status,
      reasons: row.reasons,
      scores: readScores(row.scores),
      runs: row.runs,
    };
  });
}

function readScores(value: unknown): PhoneGateRow["scores"] {
  if (value === null) return null;
  if (typeof value !== "object") throw new Error("phone gate scores are incomplete");
  if (
    !("performance" in value) ||
    !("accessibility" in value) ||
    !("bestPractices" in value) ||
    !("seo" in value)
  ) {
    throw new Error("phone gate scores are incomplete");
  }
  const scores = {
    performance: value.performance,
    accessibility: value.accessibility,
    bestPractices: value.bestPractices,
    seo: value.seo,
  };
  if (
    typeof scores.performance !== "number" ||
    typeof scores.accessibility !== "number" ||
    typeof scores.bestPractices !== "number" ||
    typeof scores.seo !== "number"
  ) {
    throw new Error("phone gate scores are incomplete");
  }
  return scores;
}

interface Shot {
  id: string;
  path: string;
  state: string;
  ready: string;
  open(page: Page): Promise<void>;
}

function covered(shots: readonly Shot[]): string[] {
  return shots.map((shot) => `${shot.path} ${shot.state}`).sort();
}

function coveredFromRoutes(routes: ReturnType<typeof listAppRoutes>): string[] {
  return routes.flatMap((route) => route.states.map((state) => `${route.path} ${state}`)).sort();
}

async function shoot(page: Page, shot: Shot, axeNotes: string[]): Promise<void> {
  await shot.open(page);
  await page.locator(shot.ready).first().waitFor();
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    for (const animation of document.getAnimations()) animation.finish();
    return {
      text: document.fonts.check("16px Literata"),
      ui: document.fonts.check("600 16px 'Bricolage Grotesque'"),
      display: document.fonts.check("800 40px 'Bricolage Grotesque'"),
    };
  });
  expect(fonts.text, `${shot.id} Literata`).toBe(true);
  expect(fonts.ui || fonts.display, `${shot.id} Bricolage Grotesque`).toBe(true);

  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const width of WIDTHS) {
      const height = width === 375 ? 812 : width === 768 ? 1024 : 900;
      await page.setViewportSize({ width, height });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const file = path.join(shotDir, `${shot.id}-${width}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const fits = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth <= root.clientWidth + 1;
      });
      expect(fits, file).toBe(true);
      const copy = await page.locator("body").innerText();
      expect(copy.includes("!"), `${shot.id} copy`).toBe(false);
      expect(copy.includes("\u2014"), `${shot.id} em dash`).toBe(false);
      expect(BANNED.test(copy), `${shot.id} banned copy: ${copy.slice(0, 180)}`).toBe(false);
      const designed = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const shell = document.querySelector(".hh-shell");
        return {
          font: body.fontFamily,
          surface: getComputedStyle(document.documentElement).backgroundColor,
          shell: shell !== null,
          wordmark: document.querySelector(".hh-wordmark") !== null,
        };
      });
      expect(designed.shell, shot.id).toBe(true);
      expect(designed.wordmark, shot.id).toBe(true);
      expect(designed.font.toLowerCase(), shot.id).toContain("literata");
      expect(designed.surface === "rgba(0, 0, 0, 0)" || designed.surface === "rgb(255, 255, 255)", shot.id).toBe(false);
    }
  }

  await page.keyboard.press("Tab");
  const focusRing = await page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return "none";
    const style = getComputedStyle(active);
    return `${style.outlineStyle} ${style.outlineWidth}`;
  });
  expect(focusRing, `${shot.id} focus`).toMatch(/solid/);

  for (const theme of THEMES) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.setViewportSize({ width: theme === "light" ? 1440 : 375, height: theme === "light" ? 900 : 812 });
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((item) => item.impact !== "minor");
    for (const violation of blocking) {
      const target = violation.nodes[0]?.target.join(" ") ?? "";
      axeNotes.push(`${shot.id} ${theme} ${violation.impact ?? "unknown"} ${violation.id} ${target}`);
    }
  }
}

async function fulfill(page: Page, url: string, html: string): Promise<void> {
  const pathname = new URL(url).pathname;
  await page.unroute("**/*").catch(() => undefined);
  await page.route(`**${pathname}`, (route) => {
    void route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: html,
    });
  });
  await page.goto(url);
}

function absoluteAssets(html: string): string {
  const icon = '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />';
  const withIcon = html.includes('rel="icon"') ? html : html.replace("<head>", `<head>\n    ${icon}`);
  return withIcon
    .replaceAll('href="design/', 'href="/src/design/')
    .replaceAll('href="brand-kit.css"', 'href="/src/brand-kit.css"')
    .replaceAll('href="src/', 'href="/src/');
}

function isExpectedConsole(line: string): boolean {
  const dashboardError = line.includes("/hh-dashboard") && line.includes("status of 500");
  const missingPage = line.includes("/not-on-the-desk") && line.includes("status of 404");
  return dashboardError || missingPage;
}

function kitModel(): BrandKitModel {
  return {
    purpose: "North Glass cuts architectural glass for houses that want the view.",
    why: "So a room can keep the weather out and the daylight in.",
    archetype: "Maker, assumed until you approve it.",
    positioning: "For people building a house, North Glass is the shop that cuts the view to size.",
    stories: {
      s25: "North Glass cuts the pane that fits the room.",
      s100: "The shop measures twice, then cuts the sheet that the window actually needs.",
      s300: "A house gets one chance at the opening. North Glass treats that opening as the whole brief.",
    },
    voiceItems: [
      { id: "trait-direct", text: "Direct, not rude." },
      { id: "vocab-pane", text: "Say pane, sheet, and opening." },
      { id: "micro-empty", text: "Nothing is listed yet." },
    ],
    taglines: ["Glass, cut slow.", "The view, to size.", "Daylight, kept in.", "Measure twice.", "A pane with a job."],
    palette: { paper: "#f4efe6", ink: "#14201c", signal: "#b6401a" },
    typeNames: ["Fraunces", "Source Serif 4"],
    logoSvg: MARK,
    logoSet: { master: MARK, oneColor: MARK, reversed: MARK, favicon: MARK },
    images: ["Night stall, tungsten practicals, no stock smiles."],
  };
}

function fixturePack(): unknown[] {
  const rows: unknown[] = [];
  for (let index = 1; index <= 4; index += 1) {
    rows.push(row("godly", `Godly ${index}`, `https://example.com/godly/${index}`));
    rows.push(row("awwwards", `Awwwards ${index}`, `https://example.com/awwwards/${index}`));
  }
  return rows;
}

function row(source: string, name: string, url: string): unknown {
  return {
    industry: "saas",
    styleWorld: "editorial",
    motionLevel: 3,
    name,
    url,
    source,
    award: "none",
    noted: `Look at the thinking in ${name}.`,
  };
}

async function resetGallery(projectDir: string): Promise<void> {
  await rm(path.join(projectDir, ".hitchhiker", "gallery-walk.json"), { force: true });
}

async function writeQueue(projectDir: string, broken: boolean): Promise<void> {
  const dir = path.join(projectDir, ".hitchhiker");
  await mkdir(dir, { recursive: true });
  const body = broken
    ? "{"
    : `${JSON.stringify({
        items: [
          { id: "prompt-001", kind: "build", status: "running" },
          { id: "prompt-002", kind: "review", status: "queued" },
          { id: "prompt-003", kind: "build", status: "escalated" },
        ],
      })}\n`;
  await writeFile(path.join(dir, "queue.json"), body);
}

function seedJump(projectDir: string, clear: boolean): void {
  const hitch = path.join(projectDir, ".hitchhiker");
  mkdirSync(hitch, { recursive: true });
  const answers = [
    ["DP-2.1", "A night stall for regulars."],
    ["DP-2.6", "Night stall regulars."],
    ["DP-2.2", "Reserve a seat."],
    ["DP-5.3", "paper, ink, night"],
    ["DP-6.2", "4"],
    ["DP-9.2", "Hostinger. Domain owned at Namecheap. DNS records are at Cloudflare. Email is on the domain."],
    ["DP-3.8", "Plausible. No cookie banner."],
    ["DP-9.1", "2026-11-01"],
    ["DP-8.4", "Privacy and terms."],
  ].map(([id, value]) => ({ id, status: "ANSWERED", value }));
  writeFileSync(
    path.join(hitch, "interview.json"),
    `${JSON.stringify({ version: 1, answers, cursor: 3, pushedIds: ["DP-0.1"] }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(hitch, "brand-approval.json"),
    `${JSON.stringify(
      {
        purpose: true,
        voice: true,
        tokens: true,
        imagery: true,
        logo: clear,
        neighbors: true,
      },
      null,
      2,
    )}\n`,
  );
  if (clear) writeFileSync(path.join(hitch, "LEGAL.md"), "# LEGAL\n\nPrivacy and terms.\n");
}

function startChild(serverFile: string, env: Record<string, string>, source = deskSource()): ChildProcess {
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", source], {
    env: { ...process.env, ...env, HH_E2E_SERVER: pathToFileURL(serverFile).href },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function deskSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const loaded = await import(specifier);
    const handle = await loaded.startServer({ projectDir, open: false });
    process.stdout.write(handle.url + "\\n");
    const shutdown = () => { handle.close().then(() => process.exit(0), () => process.exit(1)); };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    await new Promise(() => {});
  `;
}

function jumpSource(): string {
  return `
    const specifier = process.env.HH_E2E_CARDS;
    const projectDir = process.env.HH_E2E_PROJECT;
    const phase = process.env.HH_E2E_PHASE;
    const loaded = await import(specifier);
    const handle = await loaded.startBeforeJumpServer({ projectDir, phase });
    process.stdout.write(handle.url + "\\n");
    const shutdown = () => { handle.close().then(() => process.exit(0), () => process.exit(1)); };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    await new Promise(() => {});
  `;
}

function readUrl(child: ChildProcess, label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`${label} did not print a URL\n${stderr}`));
    }, 30_000);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout.split(/\r?\n/).find((item) => item.startsWith("http://127.0.0.1:"));
      if (line !== undefined) {
        clearTimeout(timer);
        resolve(line.trim());
      }
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${label} exited ${code ?? "null"}\n${stderr}\n${stdout}`));
    });
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
