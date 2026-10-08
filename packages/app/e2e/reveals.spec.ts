import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import type { SiteBrief } from "@hitchhiker/engine";
import type { BrandRevealModel } from "../src/reveals/brand-reveal.ts";
import { renderBrandReveal } from "../src/reveals/brand-reveal.ts";
import {
  gateSummaryFromReport,
  readDeployedUrl,
  renderJourneyFromProject,
  renderJourneyReveal,
  type GateSummary,
} from "../src/reveals/journey-reveal.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const screens = path.join(here, "screens");

const MARK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#14201c" d="M6 26 L16 6 L26 26 L20 26 L16 16 L12 26 Z"/></svg>';

const TAGLINE = "Hold the weather out.";
const PURPOSE = "Unapproved purpose must stay off the page.";

test("brand and journey reveals settle at 375 and 1440", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  mkdirSync(screens, { recursive: true });
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-reveal-"));
  const preview = path.join(projectDir, "preview.html");
  writeFileSync(
    preview,
    "<!DOCTYPE html><html lang='en'><body style='margin:0;background:#f4efe6;color:#14201c;font-family:Georgia,serif'><p style='padding:24px'>Northglass preview</p></body></html>",
    "utf8",
  );
  const previewUrl = pathToFileURL(preview).href;

  const brand = renderBrandReveal(brandModel());
  const journey = renderJourneyReveal({
    brief: brief(),
    liveUrl: previewUrl,
    scores: passingScores(),
    jury: 70,
    deployed: false,
  });
  expect(hasBang(brand)).toBe(false);
  expect(hasBang(journey)).toBe(false);
  expect(journey.toLowerCase().includes("journey")).toBe(false);
  expect(brand.includes(TAGLINE)).toBe(false);
  expect(brand.includes(PURPOSE)).toBe(false);
  expect(brand.includes(MARK)).toBe(false);
  expect(brand.includes("data-slot=\"palette\"")).toBe(true);
  expect(brand.includes("data-slot=\"voice\"")).toBe(true);
  expect(brand.includes("data-slot=\"logo\"")).toBe(false);
  expect(journey.includes("This is the local preview. The site is not deployed yet.")).toBe(true);
  expect(journey.includes('data-badge="earned"')).toBe(true);
  expect(journey.includes("Every gate on this page passed. The badge is earned.")).toBe(true);

  const empty = renderBrandReveal(brandModel());
  const { approved: _approved, ...draft } = brandModel();
  const withheld = renderBrandReveal(draft);
  expect(withheld.includes("Nothing here is approved yet.")).toBe(true);
  expect(withheld.includes("#f4efe6")).toBe(false);
  expect(empty.includes("#F4EFE6") || empty.includes("#f4efe6")).toBe(true);

  try {
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await shoot(page, brand, "reveal-brand");
    await shoot(page, journey, "reveal-journey");
    await expect(page.locator("[data-badge='earned']")).toBeVisible();
    await expect(page.getByText("This is the local preview. The site is not deployed yet.")).toBeVisible();
    await expect(page.locator(".rv-badge__mark")).toHaveCount(1);

    await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
    await page.reload();
    const moving = await page.locator("[data-reveal-step]").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(moving).toBe("rv-enter");
    expect(errors).toEqual([]);
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("a failed gate withholds the badge and a deploy record picks the live URL", async ({ page }) => {
  const failed = renderJourneyReveal({
    brief: brief(),
    liveUrl: "https://northglass.example/",
    scores: { ...passingScores(), lighthouse: { ...passingScores().lighthouse, status: "BLOCKER" } },
    jury: 70,
    deployed: true,
  });
  expect(failed.includes('data-badge="earned"')).toBe(false);
  expect(failed.includes("Fix Lighthouse.")).toBe(true);
  expect(failed.includes("This is the live site.")).toBe(true);
  expect(failed.includes("The badge is not earned.")).toBe(true);

  const lowJury = renderJourneyReveal({
    brief: brief(),
    liveUrl: "http://127.0.0.1:4173/",
    scores: passingScores(),
    jury: 69,
  });
  expect(lowJury.includes('data-badge="earned"')).toBe(false);
  expect(lowJury.includes("Fix the jury.")).toBe(true);
  expect(lowJury.includes("This is the local preview. The site is not deployed yet.")).toBe(true);

  const earned = renderJourneyReveal({
    brief: brief(),
    liveUrl: "https://northglass.example/",
    scores: passingScores(),
    jury: 70,
    deployed: true,
  });
  expect(earned.includes('data-badge="earned"')).toBe(true);
  expect(earned.includes('data-award="towel"')).toBe(true);

  const consoleBlock = renderJourneyReveal({
    brief: brief(),
    liveUrl: "https://northglass.example/",
    scores: { ...passingScores(), console: "BLOCKER" },
    jury: 82,
    deployed: true,
  });
  expect(consoleBlock.includes("Fix console.")).toBe(true);
  expect(consoleBlock.includes('data-badge="earned"')).toBe(false);

  const fromReport = gateSummaryFromReport({
    lighthouse: [{ status: "PASS" }, { status: "PASS" }],
    axe: { status: "PASS", notes: ["One note."] },
    console: { errors: 0, failedRequests: 0 },
    links: { pass: true },
    weight: { status: "PASS" },
  });
  expect(fromReport.lighthouse.status).toBe("PASS");
  expect(fromReport.lighthouse.performance).toBeNull();
  const scaled = gateSummaryFromReport({
    lighthouse: { status: "PASS", performance: 0.96, accessibility: 90, bestPractices: null, seo: null },
    axe: { status: "BLOCKER" },
  });
  expect(scaled.lighthouse.performance).toBe(96);
  expect(scaled.lighthouse.accessibility).toBe(90);
  const rendered = renderJourneyReveal({
    brief: brief(),
    liveUrl: "https://northglass.example/",
    scores: scaled,
    jury: 70,
    deployed: true,
  });
  expect(rendered.includes("Not recorded")).toBe(true);
  expect(rendered.includes("Fix axe.")).toBe(true);
  expect(rendered.includes('data-badge="earned"')).toBe(false);

  const record = [
    "- 2026-10-01T00:00:00.000Z — production — static — failed — https://old.example/",
    "- 2026-10-08T12:00:00.000Z — production — static — completed — https://northglass.example/live",
    "  Via: hostinger",
  ].join("\n");
  expect(readDeployedUrl(record)).toBe("https://northglass.example/live");
  expect(readDeployedUrl("- 2026-10-01T00:00:00.000Z — production — static — started — https://northglass.example/")).toBeNull();

  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-reveal-deploy-"));
  try {
    const deployDir = path.join(projectDir, ".hitchhiker", "deploy");
    mkdirSync(deployDir, { recursive: true });
    writeFileSync(path.join(deployDir, "DEPLOYS.md"), `${record}\n`, "utf8");
    const fromDisk = renderJourneyFromProject({
      projectDir,
      brief: brief(),
      previewUrl: "http://localhost:4173/",
      scores: passingScores(),
      jury: 70,
    });
    expect(fromDisk.includes("https://northglass.example/live")).toBe(true);
    expect(fromDisk.includes("This is the live site.")).toBe(true);
    expect(fromDisk.includes('data-badge="earned"')).toBe(true);

    const missing = renderJourneyFromProject({
      projectDir: path.join(projectDir, "empty"),
      brief: brief(),
      previewUrl: "http://localhost:4173/preview",
      scores: passingScores(),
      jury: 70,
    });
    expect(missing.includes("This is the local preview. The site is not deployed yet.")).toBe(true);
    expect(missing.includes("http://localhost:4173/preview")).toBe(true);
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }

  await page.setContent(failed);
  await expect(page.getByText("Fix Lighthouse.")).toBeVisible();
  await expect(page.locator("[data-badge='earned']")).toHaveCount(0);
});

async function shoot(page: Page, html: string, name: string): Promise<void> {
  const file = path.join(screens, `${name}.html`);
  writeFileSync(file, html, "utf8");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  for (const viewport of [
    { width: 375, height: 812, label: "375" },
    { width: 1440, height: 900, label: "1440" },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(pathToFileURL(file).href);
    await page.locator("[data-reveal-step], [data-reveal-empty]").first().waitFor();
    if ((await page.locator("iframe").count()) > 0) {
      await expect(page.frameLocator("iframe").getByText("Northglass preview")).toBeVisible();
    }
    const motion = await page.locator("[data-reveal-step]").first().evaluate((el) => {
      const style = getComputedStyle(el);
      return { name: style.animationName, opacity: style.opacity };
    });
    expect(motion.name).toBe("none");
    expect(motion.opacity).toBe("1");
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth <= root.clientWidth + 1;
    });
    expect(overflow).toBe(true);
    const text = await page.locator("body").innerText();
    expect(text.includes("!")).toBe(false);
    await page.screenshot({
      path: path.join(screens, `${name}-${viewport.label}.png`),
      fullPage: true,
    });
  }
}

function brandModel(): BrandRevealModel {
  return {
    why: "Why stays off this page.",
    archetype: "maker",
    stories: { s25: "Short.", s100: "Medium story.", s300: "Longer story that stays off the reveal." },
    voiceItems: [
      { id: "v1", text: "Direct, not rude." },
      { id: "v2", text: "Name the material." },
    ],
    logoSet: { master: MARK, oneColor: MARK, reversed: MARK, favicon: MARK },
    images: [],
    purpose: PURPOSE,
    positioning: "Unapproved positioning.",
    taglines: [TAGLINE, "Cut once."],
    palette: { paper: "#f4efe6", ink: "#14201c", signal: "#c4552a" },
    typeNames: ["Bricolage Grotesque", "Literata"],
    logoSvg: null,
    approved: { palette: true, type: true, logo: false, voice: true, taglines: false },
  };
}

function brief(): SiteBrief {
  return {
    goal: "Show the glass before the visit.",
    visitor: "A homeowner choosing a facade.",
    action: "Book a site measure.",
    offer: "Architectural glass, cut to the opening.",
    vibe: "Quiet, exact, warm paper.",
    references: "A workshop wall, not a showroom.",
    exists: "A one-page site.",
    protected: "The family name stays as written.",
    motion: "Still, unless the visitor asks.",
    limits: "No stock photography.",
    hosting: "A static host the client already pays for.",
    coverage: "One city, by appointment.",
  };
}

function hasBang(html: string): boolean {
  const copy = html.replace("<!DOCTYPE html>", "");
  return copy.includes("!") || copy.includes("！");
}

function passingScores(): GateSummary {
  return {
    lighthouse: {
      status: "PASS",
      performance: 96,
      accessibility: 98,
      bestPractices: 95,
      seo: 100,
    },
    axe: { status: "PASS", notes: [] },
    console: "PASS",
    links: "PASS",
    weight: "PASS",
  };
}
