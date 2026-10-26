/**
 * Desk Run 11 design stages in the browser. The picked direction shapes
 * the sitemap, and the style guide follows the owner's sans wish.
 * Start build is not pressed. The model is stubbed.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const LINE = "Noted for this desk run.";
const TYPE_ANSWER =
  "No fonts yet. Light, wide, airy sans for headings like the logo; easy-reading body. Show me pairings.";
const COLOURS =
  "Jungle green, sunset gold, and ocean blue, from the hero photo, plus soft sand and a near-black green. Sunset gold is the accent. Soft sand is the page.";
const REFERENCES =
  "Patagonia: love. Big quiet photography and plain type. Aesop: love. Restraint, lots of empty space, small calm type. Kinfolk: love. Slow editorial scroll and soft color. Airbnb Luxe: love. Cereal: meh, too cold.";
const PAGES =
  "Pages: Home; Farms (grid plus map, filters, a detail page per farm with gallery, specs, map and prefilled inquiry); Live on the Land (caretaker program with sign-up form); How Buying Works (steps with independent lawyers, glossary: folio real, plano catastrado, escritura, ZMT); Eco-Building and Food; About; Contact. Footer: legal disclaimer, privacy, EN/ES switch, newsletter.";
const KEYS = [
  "goal",
  "visitor",
  "action",
  "offer",
  "vibe",
  "references",
  "exists",
  "protected",
  "motion",
  "limits",
  "hosting",
  "maintainer",
  "pages",
  "features",
  "cadence",
  "languages",
  "imagery",
  "budget",
  "session",
  "logo",
  "palette",
  "coverage",
];

function seed(dir: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  mkdirSync(path.join(dir, "interview"), { recursive: true });
  writeFileSync(
    path.join(dir, "interview", "tree.yaml"),
    "questions:\n  - id: DP-1.5\n    module: the-question\n    depth: [express]\n    ask: Type?\n    why: Type.\n    input: [text]\n    skip_default: Type not stated.\n    writes:\n      - SITE-BRIEF.md\n",
  );
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    `${JSON.stringify([
      { id: "DP-1.5", status: "ANSWERED", value: TYPE_ANSWER },
      { id: "DP-1.2", status: "ANSWERED", value: COLOURS },
      { id: "DP-2.8", status: "ANSWERED", value: PAGES },
      { id: "DP-5.5", status: "ANSWERED", value: "Bright and airy, on soft sand." },
      { id: "DP-5.2", status: "ANSWERED", value: REFERENCES },
    ])}\n`,
  );
  const draft: Record<string, string> = {};
  for (const key of KEYS) draft[key] = LINE;
  draft.offer = "Ocean-view farms in Costa Rica are sold direct, with free caretakers and independent lawyers.";
  draft.vibe = "The feel is calm, warm, and honest.";
  draft.references = REFERENCES;
  draft.motion = "Motion appetite is 4 of 10. Gentle parallax plays on the hero photo only.";
  draft.hosting = "Cloudflare Pages.";
  draft.pages = PAGES;
  draft.features = "A contact form.";
  draft.imagery = "Photography. Fields at dusk on soft sand.";
  draft.logo = "A thin crescent over a horizon line. Keep it.";
  draft.palette = COLOURS;
  writeFileSync(
    path.join(dir, ".hitchhiker", "brief-pending.json"),
    `${JSON.stringify({ status: "pending", draft, buildStarted: false, planApproved: false, error: "", fallback: false })}\n`,
  );
}

function sectionsOf(markdown: string, title: string): string[] {
  const lines = markdown.split(/\n/);
  const start = lines.findIndex((line) => line.trim().startsWith(`- ${title} at `));
  if (start < 0) return [];
  const sections: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? "").trim();
    if (trimmed === "") continue;
    if (/^- .+ at \S+/.test(trimmed) || trimmed.startsWith("## ")) break;
    const nested = /^- (.+)$/.exec(trimmed);
    if (nested?.[1] !== undefined) sections.push(nested[1].trim());
  }
  return sections;
}

test("the sitemap, wireframe, and style guide follow the Run 11 brief", async ({ page }) => {
  test.setTimeout(120_000);
  const sandbox = mkdtempSync(path.join(tmpdir(), "hh-run11-243g-"));
  const projectDir = path.join(sandbox, "site");
  mkdirSync(projectDir, { recursive: true });
  seed(projectDir);
  const priorHome = process.env.HH_PROJECT_HOME;
  const priorE2e = process.env.HH_E2E_PROJECT;
  const child = startChild(sandbox, projectDir);
  try {
    const url = await readUrl(child);
    await page.goto(`${url.replace(/\/$/, "")}/approve`);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    const kit = page.locator("[data-brand-kit] pre");
    await expect(kit).toBeVisible({ timeout: 30_000 });
    await expect(kit).toContainText("Dealt families: Syne and Spline Sans");
    await page.locator("[data-direction-reason]").fill("The owner loves Patagonia's big quiet photography.");
    await page.locator("[data-pick-direction='dir-patagonia']").click();
    await expect(kit).toContainText("Picked families: Boska and General Sans");
    await expect(kit).toContainText("The owner's words win over Boska");
    await page.getByRole("button", { name: "Approve plan", exact: true }).click();

    const sitemap = page.locator("[data-design-stage='sitemap'] pre");
    await expect(sitemap).toBeVisible({ timeout: 30_000 });
    const sitemapText = await sitemap.innerText();
    const home = sectionsOf(sitemapText, "Home");
    expect(home.length).toBeGreaterThan(1);
    for (const section of ["hero", "gallery", "story", "visit"]) expect(home).toContain(section);
    const farms = sectionsOf(sitemapText, "Farms");
    for (const section of ["grid", "map", "filters"]) expect(farms).toContain(section);
    const detail = sectionsOf(sitemapText, "Farm detail");
    for (const section of ["gallery", "specs", "map", "inquiry"]) expect(detail).toContain(section);

    await page.getByRole("button", { name: "Approve sitemap", exact: true }).click();
    const wireframe = page.locator("[data-design-stage='wireframe'] pre");
    await expect(wireframe).toBeVisible({ timeout: 30_000 });
    const wireText = await wireframe.innerText();
    for (const section of [...home, ...farms, ...detail]) expect(wireText).toContain(section);

    await page.getByRole("button", { name: "Approve wireframe", exact: true }).click();
    const guide = page.locator("[data-design-stage='style-guide'] pre");
    await expect(guide).toBeVisible({ timeout: 30_000 });
    const guideText = await guide.innerText();
    expect(guideText).toContain('fontFamily: "General Sans"');
    expect(guideText).not.toContain('fontFamily: "Boska"');
    const button = /Button text (#[0-9a-fA-F]{6}) on (#[0-9a-fA-F]{6}) at ([0-9.]+) to 1/.exec(guideText);
    expect(button).not.toBeNull();
    expect(Number(button?.[3])).toBeGreaterThanOrEqual(4.5);
    await expect(page.getByRole("button", { name: "Start build" })).toHaveCount(0);
  } finally {
    child.kill();
    if (priorHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = priorHome;
    if (priorE2e === undefined) delete process.env.HH_E2E_PROJECT;
    else process.env.HH_E2E_PROJECT = priorE2e;
    removeTempDir(sandbox);
  }
});

function startChild(sandbox: string, projectDir: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const env = { ...process.env };
  delete env.HH_CASSETTE;
  delete env.HH_GUIDE_CASSETTE;
  env.HH_E2E_PROJECT = sandbox;
  env.HH_PROJECT_HOME = path.join(sandbox, ".hh-save-home");
  env.HH_E2E_SITE = projectDir;
  env.HH_E2E_SERVER = pathToFileURL(serverFile).href;
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_SITE;
    const loaded = await import(specifier);
    const think = async (req) => {
      throw new Error(req.task);
    };
    const handle = await loaded.startServer({ projectDir, open: false, guideThink: think });
    process.stdout.write(handle.url + "\\n");
    await new Promise(() => {});
  `;
}

function readUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`desk did not print a URL\n${stderr}`)), 20_000);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout.split("\n").find((item) => item.startsWith("http://127.0.0.1:"));
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
      reject(new Error(`desk exited ${code ?? "null"}\n${stderr}\n${stdout}`));
    });
  });
}
