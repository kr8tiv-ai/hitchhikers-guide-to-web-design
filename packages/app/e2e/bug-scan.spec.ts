import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { renderApproval } from "../src/approval.ts";
import { type BrandKitModel } from "../src/brand-kit.ts";
import { listAppRoutes } from "../src/polish.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const WIDTHS = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
] as const;

interface AxeNode {
  target: string[];
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

type AxeBuilderLike = { analyze(): Promise<AxeResults> };
type AxeBuilderCtor = new (options: { page: Page }) => AxeBuilderLike;

const requireFromQa = createRequire(path.resolve(here, "../../qa/package.json"));
const { AxeBuilder } = requireFromQa("@axe-core/playwright") as { AxeBuilder: AxeBuilderCtor };

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#14201c" d="M6 26 L16 6 L26 26 Z"/></svg>`;

test("every desk screen at 375 and 1440 has no console errors, broken links, or serious axe violations", async ({
  page,
}) => {
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

  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-bug-scan-"));
  const cacheDir = await mkdtemp(path.join(tmpdir(), "hh-bug-scan-cache-"));
  const packFile = path.join(projectDir, "gallery.json");
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const cardsFile = path.resolve(here, "../src/before-jump/cards.ts");
  await writeFile(packFile, JSON.stringify(fixturePack()));

  const desk = startChild(serverFile, {
    HH_E2E_PROJECT: projectDir,
    HH_GALLERY_FILE: packFile,
    HH_GALLERY_CACHE: cacheDir,
  });

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const httpFailures: string[] = [];
  const requestFailures: string[] = [];
  const findings: string[] = [];
  const checkedLinks = new Set<string>();

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const where = message.location().url || page.url();
    consoleErrors.push(`${where} :: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    if (isExpectedHttp(url, response.status(), response.request().resourceType())) return;
    httpFailures.push(`${response.status()} ${url}`);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    const reason = request.failure()?.errorText ?? "failed";
    if (url.includes("/api/events") || reason.includes("ERR_ABORTED")) return;
    requestFailures.push(`${reason} ${url}`);
  });

  try {
    const deskUrl = await readUrl(desk, "desk");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const screens = deskScreens(deskUrl, projectDir, packFile);

    for (const screen of screens) {
      for (const size of WIDTHS) {
        await page.setViewportSize({ width: size.width, height: size.height });
        try {
          await screen.open(page);
          await page.locator("[data-hh-ready]").waitFor({ timeout: 20_000 });
        } catch (error: unknown) {
          findings.push(`${screen.id} ${size.width} did not open: ${messageOf(error)}`);
          continue;
        }
        if (size.width === 1440) {
          findings.push(...(await brokenLinks(page, deskUrl, screen.id, checkedLinks)));
        }
        findings.push(...(await focusOrder(page, `${screen.id} ${size.width}`)));
        findings.push(...(await axeSerious(page, `${screen.id} ${size.width}`)));
      }
    }

    await stopChild(desk);

    const jumpOpen = await mkdtemp(path.join(tmpdir(), "hh-bug-scan-jump-"));
    seedJump(jumpOpen, false);
    const openChild = startChild(
      cardsFile,
      { HH_E2E_PROJECT: jumpOpen, HH_E2E_PHASE: "deep-thought" },
      jumpSource(),
    );
    try {
      const jumpUrl = await readUrl(openChild, "before we jump");
      await walkJump(page, jumpUrl, "before-jump-open", findings, checkedLinks);
    } finally {
      await stopChild(openChild);
      await rm(jumpOpen, { recursive: true, force: true });
    }

    const jumpClear = await mkdtemp(path.join(tmpdir(), "hh-bug-scan-jump-"));
    seedJump(jumpClear, true);
    const clearChild = startChild(
      cardsFile,
      { HH_E2E_PROJECT: jumpClear, HH_E2E_PHASE: "deep-thought" },
      jumpSource(),
    );
    try {
      const jumpUrl = await readUrl(clearChild, "before we jump");
      await walkJump(page, jumpUrl, "before-jump-clear", findings, checkedLinks);
    } finally {
      await stopChild(clearChild);
      await rm(jumpClear, { recursive: true, force: true });
    }

    const unexpected = consoleErrors.filter((line) => !isExpectedConsole(line));
    expect(findings, findings.join("\n")).toEqual([]);
    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
    expect(unexpected, unexpected.join("\n")).toEqual([]);
    expect(httpFailures, httpFailures.join("\n")).toEqual([]);
    expect(requestFailures, requestFailures.join("\n")).toEqual([]);
  } finally {
    await stopChild(desk);
    await rm(projectDir, { recursive: true, force: true });
    await rm(cacheDir, { recursive: true, force: true });
  }
});

interface Screen {
  id: string;
  open: (page: Page) => Promise<void>;
}

function deskScreens(deskUrl: string, projectDir: string, packFile: string): Screen[] {
  return [
    {
      id: "desk-question",
      async open(target) {
        await target.goto(deskUrl);
      },
    },
    {
      id: "gallery-walk",
      async open(target) {
        await resetGallery(projectDir);
        await writeFile(packFile, JSON.stringify(fixturePack()));
        await target.goto(`${deskUrl}gallery?industry=saas&styleWorld=editorial`);
      },
    },
    {
      id: "gallery-empty",
      async open(target) {
        await resetGallery(projectDir);
        await writeFile(packFile, "[]");
        await target.goto(`${deskUrl}gallery`);
      },
    },
    {
      id: "motion-preview",
      async open(target) {
        await target.goto(`${deskUrl}motion`);
      },
    },
    {
      id: "brand-empty",
      async open(target) {
        await rm(path.join(projectDir, ".hitchhiker", "brand", "brand-kit.json"), { force: true });
        await target.goto(`${deskUrl}brand`);
      },
    },
    {
      id: "brand-kit",
      async open(target) {
        const dir = path.join(projectDir, ".hitchhiker", "brand");
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, "brand-kit.json"), JSON.stringify(kitModel()));
        await target.goto(`${deskUrl}brand`);
      },
    },
    {
      id: "approve-empty",
      async open(target) {
        await target.unroute("**/*").catch(() => undefined);
        await target.goto(`${deskUrl}approve`);
      },
    },
    {
      id: "approve-gate",
      async open(target) {
        const html = absoluteAssets(
          renderApproval({
            titles: ["The stall at night", "A menu you can read", "Reserve a seat"],
            tokens: 8400,
            prdTitle: "North Glass",
            tiers: ["Towel", "Towel", "Fish"],
          }),
        );
        await fulfill(target, `${deskUrl}__scan/approve`, html);
      },
    },
    {
      id: "settings",
      async open(target) {
        await target.unroute("**/*").catch(() => undefined);
        await target.goto(`${deskUrl}settings`);
      },
    },
    {
      id: "dashboard-empty",
      async open(target) {
        await rm(path.join(projectDir, ".hitchhiker", "queue.json"), { force: true });
        await target.goto(`${deskUrl}hh-dashboard`);
      },
    },
    {
      id: "dashboard-queue",
      async open(target) {
        await writeQueue(projectDir, false);
        await target.goto(`${deskUrl}hh-dashboard`);
      },
    },
    {
      id: "dashboard-error",
      async open(target) {
        await writeQueue(projectDir, true);
        await target.goto(`${deskUrl}hh-dashboard`);
      },
    },
    {
      id: "missing-error",
      async open(target) {
        await target.goto(`${deskUrl}missing`);
      },
    },
  ];
}

async function walkJump(
  page: Page,
  jumpUrl: string,
  id: string,
  findings: string[],
  checkedLinks: Set<string>,
): Promise<void> {
  for (const size of WIDTHS) {
    await page.setViewportSize({ width: size.width, height: size.height });
    try {
      await page.goto(jumpUrl);
      await page.locator("[data-hh-ready]").waitFor({ timeout: 20_000 });
    } catch (error: unknown) {
      findings.push(`${id} ${size.width} did not open: ${messageOf(error)}`);
      continue;
    }
    if (size.width === 1440) findings.push(...(await brokenLinks(page, jumpUrl, id, checkedLinks)));
    findings.push(...(await focusOrder(page, `${id} ${size.width}`)));
    findings.push(...(await axeSerious(page, `${id} ${size.width}`)));
  }
}

async function brokenLinks(page: Page, base: string, id: string, seen: Set<string>): Promise<string[]> {
  const origin = new URL(base).origin;
  const hrefs = await page.locator("a[href]").evaluateAll((anchors) =>
    anchors.map((anchor) => anchor.getAttribute("href") ?? ""),
  );
  const notes: string[] = [];
  for (const href of hrefs) {
    if (href.length === 0) {
      notes.push(`${id} empty href`);
      continue;
    }
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      notes.push(`${id} unparsable href ${href}`);
      continue;
    }
    if (url.origin !== origin) continue;
    url.hash = "";
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    const response = await page.request.get(key, { failOnStatusCode: false });
    if (response.status() >= 400) notes.push(`${id} link ${response.status()} ${key}`);
  }
  return notes;
}

async function focusOrder(page: Page, id: string): Promise<string[]> {
  const notes: string[] = [];
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  const count = await page.evaluate(() => {
    const selector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return [...document.querySelectorAll(selector)].filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.hasAttribute("disabled") || node.getAttribute("aria-hidden") === "true") return false;
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    }).length;
  });
  let previous = -1;
  let landed = 0;
  const steps = Math.min(count, 16);
  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press("Tab");
    const spot = await page.evaluate(() => {
      const selector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const list = [...document.querySelectorAll(selector)].filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node.hasAttribute("disabled") || node.getAttribute("aria-hidden") === "true") return false;
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      const active = document.activeElement;
      if (active === null || active === document.body || active === document.documentElement) {
        return { index: -1, outline: "", tabindex: null as string | null };
      }
      const style = getComputedStyle(active);
      const tabindex = active.getAttribute("tabindex");
      return {
        index: list.indexOf(active),
        outline: `${style.outlineStyle} ${style.outlineWidth}`,
        tabindex,
      };
    });
    if (spot.index < 0) break;
    landed += 1;
    if (spot.tabindex !== null && Number(spot.tabindex) > 0) {
      notes.push(`${id} positive tabindex ${spot.tabindex}`);
    }
    if (previous >= 0 && spot.index <= previous) {
      notes.push(`${id} focus moved backwards from ${previous} to ${spot.index}`);
    }
    if (!/solid/.test(spot.outline)) notes.push(`${id} focus outline ${spot.outline}`);
    previous = spot.index;
  }
  if (count > 0 && landed === 0) notes.push(`${id} tab did not reach a control`);
  return notes;
}

async function axeSerious(page: Page, id: string): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  const notes: string[] = [];
  for (const violation of results.violations) {
    if (violation.impact !== "serious" && violation.impact !== "critical") continue;
    const target = violation.nodes[0]?.target.join(" ") ?? "";
    notes.push(`${id} ${violation.impact} ${violation.id} ${target}`);
  }
  return notes;
}

function isExpectedConsole(line: string): boolean {
  const dashboardError = line.includes("/hh-dashboard") && line.includes("status of 500");
  const missingPage =
    (line.includes("/missing") || line.includes("/not-on-the-desk")) && line.includes("status of 404");
  return dashboardError || missingPage;
}

function isExpectedHttp(url: string, status: number, resourceType: string): boolean {
  if (resourceType !== "document") return false;
  if (status === 404 && (url.includes("/missing") || url.includes("/not-on-the-desk"))) return true;
  if (status === 500 && url.includes("/hh-dashboard")) return true;
  return false;
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
      { purpose: true, voice: true, tokens: true, imagery: true, logo: clear, neighbors: true },
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
    const specifier = process.env.HH_E2E_SERVER;
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "open failed";
}
