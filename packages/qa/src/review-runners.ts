/**
 * Elevate, verdict, and jury runners (BUG-054).
 * Each one calls judgeBeauty, the recipe checker, and the 241a-241d gates.
 * A failure blocks that runner and becomes a remediation prompt.
 * The checks measure outcomes. They do not ban a library or a technique.
 * Heavy gates are injected so tests can stub the browser.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertPhoneBudgetBefore3d, type QueueFile } from "@hitchhiker/engine";
import { AI_CLUSTER_VISION_KEYS, judgeAiCluster, type AiClusterVisionKey } from "./antislop.ts";
import { applyBeautyRound, judgeBeauty, type BeautyFailure, type BeautyRoundResult, type SectionShot } from "./beauty-gate.ts";
import {
  readCreditsFile,
  readDefectsFile,
  readImageryFile,
  readJurorFile,
  readRedesignFile,
  readVariantsFile,
} from "./desk-artifacts.ts";
import { judgeDefectLog, type DefectRecord } from "./defect-log.ts";
import { checkImageryGrade, type ImagerySample } from "./imagery-grade.ts";
import { jury, type AwwwardsScores, type JuryResult } from "./jury.ts";
import { measureJurorFloor, type JurorSample } from "./juror-floor.ts";
import { auditImageCredits, auditSourcedMedia } from "./licenses.ts";
import { checkRecipeDir, checkRecipes } from "./recipe-check.ts";
import { judgeRedesignOrder, type RedesignStepShot } from "./redesign-order.ts";
import { combineSectionVariants, type ApprovedDirection, type SectionVariant, type VariantPick } from "./variants.ts";

export interface PhonePictureSignals {
  reducedMotion: boolean;
  viewportWidth: number;
  saveData: boolean;
  cores: number;
  webglAvailable?: boolean;
  tierOverride?: 0 | 1 | 2 | 3;
}

export interface QualityGates {
  judgeBeauty: typeof import("./beauty-gate.ts").judgeBeauty;
  checkRecipes: typeof import("./recipe-check.ts").checkRecipes;
  checkRecipeDir: typeof import("./recipe-check.ts").checkRecipeDir;
  auditBuiltType: typeof import("./type-gate.ts").auditBuiltType;
  runDeviceMatrix: typeof import("./device-matrix.ts").runDeviceMatrix;
  runMobileChecks: typeof import("./mobile-checks.ts").runMobileChecks;
  runReducedMotion: typeof import("./reduced-motion.ts").runReducedMotion;
  evaluateStateSweeps: typeof import("./state-sweep.ts").evaluateStateSweeps;
  assertPhoneBudgetBefore3d: typeof import("@hitchhiker/engine").assertPhoneBudgetBefore3d;
  auditHandoffMarkup: (
    html: string,
  ) => { cls: number; blankFirstFrame: boolean } | Promise<{ cls: number; blankFirstFrame: boolean }>;
  shouldUsePoster: (signals: PhonePictureSignals) => boolean | Promise<boolean>;
  evaluateDevicePerformance: typeof import("./performance-gate.ts").evaluateDevicePerformance;
  evaluateNavFooter: typeof import("./craft-gate.ts").evaluateNavFooter;
  checkPaletteProportion: typeof import("./palette-proportion.ts").checkPaletteProportion;
  scoreSelf: typeof import("./self-score.ts").scoreSelf;
}

export interface ReviewProject {
  root: string;
  pageSource: string;
  pageFile: string;
  shots: readonly SectionShot[];
  world: import("./type-gate.ts").TypeWorld;
  matrixProjects: Parameters<QualityGates["runDeviceMatrix"]>[0];
  matrixSections: readonly string[];
  matrixHooks: Parameters<QualityGates["runDeviceMatrix"]>[2];
  mobileDocument: Parameters<QualityGates["runMobileChecks"]>[1];
  motionSample: Parameters<QualityGates["runReducedMotion"]>[1];
  sweepSample: Parameters<QualityGates["evaluateStateSweeps"]>[1];
  brief: string;
  asksFor3d: boolean;
  html: string;
  phoneSignals: PhonePictureSignals;
  devices: Parameters<QualityGates["evaluateDevicePerformance"]>[0];
  nav: Parameters<QualityGates["evaluateNavFooter"]>[0];
  palette: Parameters<QualityGates["checkPaletteProportion"]>[0];
  self: Parameters<QualityGates["scoreSelf"]>[0];
  scores: { brand: number; craft: number; clarity: number; performance: number };
  /** Measured image grade. Absent means read `.hitchhiker/review/imagery.json` when it exists. */
  imagery?: readonly ImagerySample[];
  /** CREDITS.json. Absent means read the file beside the project when it exists. */
  credits?: unknown;
  juror?: JurorSample;
  defects?: readonly DefectRecord[];
  redesign?: { namedFamilies: readonly string[]; steps: readonly RedesignStepShot[] };
  variants?: {
    approved: ApprovedDirection;
    variants: readonly SectionVariant[];
    picks: readonly VariantPick[];
  };
  queue: QueueFile;
  gateIds: readonly string[];
  round: number;
  artDirection: string;
  designLanguage: string;
  now: string;
  page: string;
  section: string;
}

export interface ReviewRun {
  runner: "elevate" | "verdict" | "jury";
  blocked: boolean;
  failures: BeautyFailure[];
  remediation: BeautyRoundResult;
  verdict: "PASS" | "FIX" | "ESCALATE";
  jury: JuryResult;
  fixes: readonly string[];
}

let realGates: QualityGates | null = null;

function templateHref(file: string): string {
  return pathToFileURL(path.resolve(import.meta.dirname, "..", "..", "templates", "shared", file)).href;
}

/** Real gate functions. Tests pass spies instead of calling this. */
export async function realQualityGates(): Promise<QualityGates> {
  if (realGates !== null) return realGates;
  const [typeGate, devices, mobile, motion, sweep, performance, craft, palette, self, preloader, webgl] =
    await Promise.all([
      import("./type-gate.ts"),
      import("./device-matrix.ts"),
      import("./mobile-checks.ts"),
      import("./reduced-motion.ts"),
      import("./state-sweep.ts"),
      import("./performance-gate.ts"),
      import("./craft-gate.ts"),
      import("./palette-proportion.ts"),
      import("./self-score.ts"),
      import(templateHref("preloader.ts")) as Promise<{
        auditHandoffMarkup: QualityGates["auditHandoffMarkup"];
      }>,
      import(templateHref("webgl.ts")) as Promise<{
        shouldUsePoster: (signals: PhonePictureSignals) => boolean;
      }>,
    ]);
  realGates = {
    judgeBeauty,
    checkRecipes,
    checkRecipeDir,
    auditBuiltType: typeGate.auditBuiltType,
    runDeviceMatrix: devices.runDeviceMatrix,
    runMobileChecks: mobile.runMobileChecks,
    runReducedMotion: motion.runReducedMotion,
    evaluateStateSweeps: sweep.evaluateStateSweeps,
    assertPhoneBudgetBefore3d,
    auditHandoffMarkup: (html) => preloader.auditHandoffMarkup(html),
    shouldUsePoster: (signals) => webgl.shouldUsePoster(signals),
    evaluateDevicePerformance: performance.evaluateDevicePerformance,
    evaluateNavFooter: craft.evaluateNavFooter,
    checkPaletteProportion: palette.checkPaletteProportion,
    scoreSelf: self.scoreSelf,
  };
  return realGates;
}

function remember(reasons: string[], failures: BeautyFailure[], project: ReviewProject, text: string): void {
  const reason = text.trim();
  if (reason.length === 0 || reasons.includes(reason)) return;
  reasons.push(reason);
  failures.push({
    page: project.page.trim(),
    section: project.section.trim(),
    screenshot: ".hitchhiker/review/quality.txt",
    reason,
  });
}

function takeProblems(
  reasons: string[],
  failures: BeautyFailure[],
  project: ReviewProject,
  problems: readonly string[],
  empty: string,
): void {
  const list = problems.length > 0 ? problems : [empty];
  for (const problem of list) remember(reasons, failures, project, problem);
}

async function gateProblems(project: ReviewProject, gates: QualityGates): Promise<BeautyFailure[]> {
  const reasons: string[] = [];
  const failures: BeautyFailure[] = [];
  const note = (text: string): void => {
    remember(reasons, failures, project, text);
  };

  try {
    const beauty = await gates.judgeBeauty(project.shots, rubricFrom(project));
    for (const failure of beauty.failures) {
      if (reasons.includes(failure.reason)) continue;
      reasons.push(failure.reason);
      failures.push(failure);
    }
  } catch (error) {
    note(error instanceof Error ? error.message : "The beauty gate failed.");
  }

  try {
    for (const finding of await gates.checkRecipes(project.pageSource, project.pageFile)) note(finding.detail);
  } catch (error) {
    note(error instanceof Error ? error.message : "The recipe checker failed.");
  }

  try {
    for (const finding of await gates.checkRecipeDir(project.root)) note(finding.detail);
  } catch (error) {
    note(error instanceof Error ? error.message : "The recipe directory check failed.");
  }

  try {
    const typed = await gates.auditBuiltType(project.root, project.world);
    if (!typed.ok) takeProblems(reasons, failures, project, typed.problems, "The type gate failed.");
  } catch (error) {
    note(error instanceof Error ? error.message : "The type gate failed.");
  }

  try {
    await gates.runDeviceMatrix(project.matrixProjects, project.matrixSections, project.matrixHooks);
  } catch (error) {
    note(error instanceof Error ? error.message : "The device matrix failed.");
  }

  try {
    const mobile = await gates.runMobileChecks(project.matrixProjects, project.mobileDocument);
    if (!mobile.ok) takeProblems(reasons, failures, project, mobile.problems, "Mobile checks failed.");
  } catch (error) {
    note(error instanceof Error ? error.message : "Mobile checks failed.");
  }

  try {
    const reduced = await gates.runReducedMotion(project.matrixProjects, project.motionSample);
    if (!reduced.ok) takeProblems(reasons, failures, project, reduced.problems, "Reduced motion failed.");
  } catch (error) {
    note(error instanceof Error ? error.message : "Reduced motion failed.");
  }

  try {
    const states = await gates.evaluateStateSweeps(project.matrixProjects, project.sweepSample);
    if (!states.ok) takeProblems(reasons, failures, project, states.problems, "The state sweep failed.");
  } catch (error) {
    note(error instanceof Error ? error.message : "The state sweep failed.");
  }

  try {
    await gates.assertPhoneBudgetBefore3d(project.brief, project.asksFor3d);
  } catch (error) {
    note(error instanceof Error ? error.message : "The phone performance budget is missing.");
  }

  try {
    const handoff = await gates.auditHandoffMarkup(project.html);
    if (/<canvas\b/i.test(project.html) && (handoff.blankFirstFrame || handoff.cls > 0)) {
      note("The preloader handoff blanks the first frame or shifts layout.");
    }
  } catch (error) {
    note(error instanceof Error ? error.message : "The preloader handoff failed.");
  }

  try {
    const poster = await gates.shouldUsePoster(project.phoneSignals);
    const capable =
      project.phoneSignals.reducedMotion === false &&
      (project.phoneSignals.tierOverride ?? 0) > 0 &&
      project.phoneSignals.viewportWidth > 0;
    if (capable && poster) note("A phone width replaced the scene with a poster.");
  } catch (error) {
    note(error instanceof Error ? error.message : "The phone picture check failed.");
  }

  try {
    const perf = await gates.evaluateDevicePerformance(project.devices);
    if (perf.status === "BLOCKER") takeProblems(reasons, failures, project, perf.reasons, "A device preset missed the floor.");
  } catch (error) {
    note(error instanceof Error ? error.message : "The device Lighthouse gate failed.");
  }

  try {
    const nav = await gates.evaluateNavFooter(project.nav);
    if (nav.status === "BLOCKER") takeProblems(reasons, failures, project, nav.reasons, "Nav and footer craft failed.");
  } catch (error) {
    note(error instanceof Error ? error.message : "Nav and footer craft failed.");
  }

  try {
    const proportion = await gates.checkPaletteProportion(project.palette);
    if (proportion.flagged) takeProblems(reasons, failures, project, proportion.reasons, "The palette proportion is off.");
  } catch (error) {
    note(error instanceof Error ? error.message : "The palette proportion check failed.");
  }

  try {
    const vision: Partial<Record<AiClusterVisionKey, boolean>> = {};
    for (const shot of project.shots) {
      for (const key of AI_CLUSTER_VISION_KEYS) {
        if (shot[key] === true) vision[key] = true;
      }
    }
    const cluster = judgeAiCluster({
      css: project.pageSource,
      html: project.html,
      brief: project.brief,
      vision,
    });
    for (const hit of cluster.hits) note(hit.detail);
  } catch (error) {
    note(error instanceof Error ? error.message : "The AI-cluster gate failed.");
  }

  try {
    const scored = await gates.scoreSelf(project.self);
    if (scored.status === "BLOCKER") takeProblems(reasons, failures, project, scored.reasons, "The self-score failed.");
  } catch (error) {
    note(error instanceof Error ? error.message : "The self-score failed.");
  }

  try {
    const samples = project.imagery ?? readImageryFile(project.root) ?? [];
    const grade = checkImageryGrade(samples);
    if (!grade.ok) takeProblems(reasons, failures, project, grade.problems, "The imagery grade is mixed.");
  } catch (error) {
    note(error instanceof Error ? error.message : "The imagery grade check failed.");
  }

  try {
    const credits = project.credits !== undefined ? project.credits : (readCreditsFile(project.root) ?? { assets: [] });
    const images = auditImageCredits(project.html, credits);
    if (!images.ok) takeProblems(reasons, failures, project, images.problems, "An image is missing from CREDITS.json.");
    const media = auditSourcedMedia(project.html, credits);
    if (!media.ok) takeProblems(reasons, failures, project, media.problems, "Imagery or footage is missing a credit.");
  } catch (error) {
    note(error instanceof Error ? error.message : "The image credit check failed.");
  }

  try {
    const juror = project.juror ?? readJurorFile(project.root);
    if (juror !== null) {
      const floor = measureJurorFloor(juror);
      if (!floor.ok) {
        takeProblems(
          reasons,
          failures,
          project,
          floor.rows.filter((row) => !row.yes).map((row) => row.evidence),
          "The juror floor failed.",
        );
      }
    }
  } catch (error) {
    note(error instanceof Error ? error.message : "The juror floor failed.");
  }

  try {
    const defects = project.defects ?? readDefectsFile(project.root);
    if (defects !== null) {
      const judged = judgeDefectLog(defects);
      if (!judged.ok) takeProblems(reasons, failures, project, judged.problems, "The defect log failed.");
    }
  } catch (error) {
    note(error instanceof Error ? error.message : "The defect log failed.");
  }

  try {
    const redesign = project.redesign ?? readRedesignFile(project.root);
    if (redesign !== null) {
      const order = judgeRedesignOrder(redesign);
      if (!order.ok) takeProblems(reasons, failures, project, order.problems, "The redesign order failed.");
    }
  } catch (error) {
    note(error instanceof Error ? error.message : "The redesign order failed.");
  }

  try {
    const variants = project.variants ?? readVariantsFile(project.root);
    if (variants !== null) {
      const combined = combineSectionVariants(variants);
      if (!combined.ok) takeProblems(reasons, failures, project, combined.problems, "The section variants did not combine.");
    }
  } catch (error) {
    note(error instanceof Error ? error.message : "The variant combine failed.");
  }

  return failures;
}

function rubricFrom(project: ReviewProject): AwwwardsScores {
  return {
    design: project.scores.brand,
    usability: project.scores.craft,
    creativity: project.scores.clarity,
    content: project.scores.performance,
  };
}

async function runReview(
  runner: ReviewRun["runner"],
  project: ReviewProject,
  gates: QualityGates | undefined,
): Promise<ReviewRun> {
  const used = gates ?? (await realQualityGates());
  const failures = await gateProblems(project, used);
  const blocked = failures.length > 0;
  const remediation = applyBeautyRound({
    queue: project.queue,
    gateIds: project.gateIds,
    round: project.round,
    failures,
    artDirection: project.artDirection,
    designLanguage: project.designLanguage,
    now: project.now,
  });
  const verdict = !blocked ? "PASS" : project.round >= 3 ? "ESCALATE" : "FIX";
  return {
    runner,
    blocked,
    failures,
    remediation,
    verdict,
    jury: jury({ ...project.scores, blocked }),
    fixes: failures.slice(0, 3).map((failure) => failure.reason),
  };
}

/** Elevate runner. Failures refuse the round and queue remediation. */
export async function runElevateReview(project: ReviewProject, gates?: QualityGates): Promise<ReviewRun> {
  return runReview("elevate", project, gates);
}

/** Verdict runner. Failures leave FIX or ESCALATE and the remediation lines. */
export async function runVerdictReview(project: ReviewProject, gates?: QualityGates): Promise<ReviewRun> {
  return runReview("verdict", project, gates);
}

/** Jury runner. A gate failure blocks the jury even when the weighted total would pass. */
export async function runJuryReview(project: ReviewProject, gates?: QualityGates): Promise<ReviewRun> {
  return runReview("jury", project, gates);
}
