/**
 * 241k. One offline brief through prepareSiteBuild and the three review
 * runners. Device, mobile, motion, and state sweeps stay stubbed.
 * Nothing is deployed and no model is called.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { phonePerformanceBudget, prepareSiteBuild, setReferenceTransport, type ReferenceTransport } from "@hitchhiker/engine";
import { judgeBeauty, type SectionShot } from "../src/beauty-gate.ts";
import { elevateRound, screenshotFixWidths } from "../src/elevate-loop.ts";
import { checkRecipeDir, checkRecipes } from "../src/recipe-check.ts";
import {
  realQualityGates,
  runElevateReview,
  runJuryReview,
  runVerdictReview,
  type QualityGates,
  type ReviewProject,
} from "../src/review-runners.ts";
import { falseVisualBans } from "../src/zaphod-vision.ts";
import { REVIEW_WIDTHS } from "../src/screenshots.ts";
import { removeTempDir } from "./remove-temp.ts";

const STUBBED = ["runDeviceMatrix", "runMobileChecks", "runReducedMotion", "evaluateStateSweeps"] as const;

const PAGE = `<!DOCTYPE html><html><body>
<header data-landmark="hero"><h1>Kiln</h1></header>
<section data-landmark="story"><p>Short.</p></section>
</body></html>`;

function shot(): SectionShot {
  return {
    page: "home",
    section: "hero",
    screenshot: ".hitchhiker/review/home-hero.png",
    textOnly: false,
    todoImage: false,
    placeholderImage: false,
    score: 9,
    reason: "Layered media and a real type scale.",
    slop: "",
    ...falseVisualBans(),
  };
}

test("an offline towel brief runs the desk gates without a model or a deploy", { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-e2e-241k-"));
  const transport: ReferenceTransport = {
    robots: () => Promise.resolve({ status: 404, body: "" }),
    page: () => Promise.resolve({ status: 200, body: PAGE }),
  };
  setReferenceTransport(transport);
  const called: string[] = [];
  try {
    const brief = [
      "## Vibe",
      "",
      "A towel shop. Paper, ink, and one green stitch. Bold editorial, warm and specific.",
      "",
      "## Motion",
      "",
      "Motion score: 9. Pinned scroll stories.",
      "",
      "## Pages",
      "",
      "Home (hero, story)",
      "",
      phonePerformanceBudget(),
      "",
      "Reference URL: https://example.com/work",
      "",
      "@section:asymmetric-editorial-grid",
      "",
    ].join("\n");
    const promptIds = await prepareSiteBuild(dir, brief);
    const webgl = readFileSync(path.join(dir, ".hitchhiker", "reference-phases", "webgl.md"), "utf8");
    const library = readFileSync(path.join(dir, ".hitchhiker", "sections", "library.html"), "utf8");
    const real = await realQualityGates();
    const gates = { ...real } as QualityGates;
    for (const name of STUBBED) {
      const stub = gates[name];
      gates[name] = ((...args: unknown[]) => {
        called.push(name);
        void args;
        void stub;
        if (name === "runDeviceMatrix") {
          return Promise.resolve({ projects: [], captures: [], limits: [], optionalEngines: [], optionalLabs: [] });
        }
        return { ok: true, problems: [], reports: [], states: [], projects: [], p0ProjectId: "iphone-15", hoverByProject: {} };
      }) as QualityGates[typeof name];
    }
    const note = (name: keyof QualityGates, fn: QualityGates[keyof QualityGates]): void => {
      const wrapped = ((...args: unknown[]) => {
        called.push(name);
        return (fn as (...inner: unknown[]) => unknown)(...args);
      }) as QualityGates[keyof QualityGates];
      (gates as Record<string, unknown>)[name] = wrapped;
    };
    note("judgeBeauty", (shots: readonly SectionShot[], rubric?: Parameters<typeof judgeBeauty>[1]) => judgeBeauty(shots, rubric));
    note("checkRecipes", checkRecipes);
    note("checkRecipeDir", checkRecipeDir);
    note("auditBuiltType", real.auditBuiltType);
    note("assertPhoneBudgetBefore3d", real.assertPhoneBudgetBefore3d);
    note("auditHandoffMarkup", real.auditHandoffMarkup);
    note("shouldUsePoster", real.shouldUsePoster);
    note("evaluateDevicePerformance", real.evaluateDevicePerformance);
    note("evaluateNavFooter", real.evaluateNavFooter);
    note("checkPaletteProportion", real.checkPaletteProportion);
    note("scoreSelf", real.scoreSelf);

    const project = {
      root: dir,
      pageSource: 'export const towel = "field";\n',
      pageFile: "src/page.ts",
      shots: [shot()],
      world: "editorial",
      matrixProjects: [],
      matrixSections: ["hero"],
      matrixHooks: {
        engineReady() {
          return undefined;
        },
        async screenshot() {
          return undefined;
        },
        async detail() {
          return undefined;
        },
        async scrollStrip() {
          return undefined;
        },
      },
      mobileDocument: () => {
        throw new Error("stub");
      },
      motionSample: () => {
        throw new Error("stub");
      },
      sweepSample: () => {
        throw new Error("stub");
      },
      brief,
      asksFor3d: true,
      html: "<main><h1>Field notes</h1></main>",
      phoneSignals: {
        reducedMotion: false,
        viewportWidth: 390,
        saveData: false,
        cores: 8,
        webglAvailable: true,
        tierOverride: 3,
      },
      devices: {},
      nav: {},
      palette: { enabled: false, shares: { dominant: 0.6, secondary: 0.3, accent: 0.1 } },
      self: {},
      scores: { brand: 9, craft: 9, clarity: 9, performance: 9 },
      queue: { items: promptIds.map((id) => ({ id, kind: "build" as const, status: "queued" as const })) },
      gateIds: promptIds.slice(0, 1),
      round: 1,
      artDirection: "Editorial world, slow Lenis, warm film grade.",
      designLanguage: "This is direction and vocabulary, not a limit.",
      now: "2026-10-20T15:00:00.000Z",
      page: "home",
      section: "hero",
    } as ReviewProject;

    const reviews = [];
    for (const [name, run] of [
      ["elevate", runElevateReview],
      ["verdict", runVerdictReview],
      ["jury", runJuryReview],
    ] as const) {
      const result = await run(project, gates);
      reviews.push({
        runner: name,
        blocked: result.blocked,
        verdict: result.verdict,
        reasons: result.failures.map((failure) => failure.reason),
      });
    }

    const shotDir = path.join(dir, ".hitchhiker", "elevate", "shots");
    mkdirSync(shotDir, { recursive: true });
    for (const width of REVIEW_WIDTHS) writeFileSync(path.join(shotDir, `full-${width}.png`), Buffer.from("png"));
    let captures = 0;
    const elevate = await elevateRound(dir, {
      think: async () => ({ value: { upgrades: [] }, raw: "{}", durationMs: 1, cassette: "live" }),
      pick: async () => [],
      runPrompt: async () => undefined,
      gates: async () => ({ lh: "PASS", a11y: "PASS", console: "PASS", links: "PASS", weight: "PASS" }),
      captureShots: async () => {
        captures += 1;
        return [shot()];
      },
    });

    const summary = {
      promptIds,
      webglHasThree: webgl.includes("@skill:three"),
      libraryHasGrid: library.includes('data-landmark="asymmetric-editorial-grid"'),
      referenceTokens: readFileSync(
        path.join(dir, ".hitchhiker", "references", "tokens", "ref-example-com-work.json"),
        "utf8",
      ).includes("#"),
      gates: called,
      stubbed: STUBBED,
      reviews,
      elevate: { applied: elevate.applied, refused: elevate.refused.map((row) => row.reason), captures },
    };
    console.log(`SWEEP241K ${JSON.stringify(summary)}`);
    assert.ok(promptIds.length > 0);
    assert.equal(summary.webglHasThree, true);
    assert.equal(summary.libraryHasGrid, true);
    assert.equal(summary.referenceTokens, true);
    assert.ok(called.includes("judgeBeauty"));
    assert.ok(called.includes("auditBuiltType"));
    assert.equal(captures, screenshotFixWidths().length);
    for (const name of STUBBED) assert.ok(called.includes(name), name);
  } finally {
    setReferenceTransport(null);
    removeTempDir(dir);
  }
});
