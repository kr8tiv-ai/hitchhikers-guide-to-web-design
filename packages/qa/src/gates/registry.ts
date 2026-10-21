/**
 * Quality-gate registry (spec 243, G1).
 *
 * Eleven dimensions, each a PASS, FIX, or BLOCKER with a reason a
 * non-programmer can read. Motion and 3D are the motion-3d pair, two
 * entries because the spec counts them separately. Device is the
 * mobile/device matrix. Console, links, and weight are folded in:
 * console with device, links with copy, weight with speed.
 *
 * Runners are injected. This file does not open a browser or the network.
 * Spacing is a stub until the spacing gate exists. Font licenses are not checked.
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateA11y, type A11yGateInput, type A11yGateResult } from "../a11y-gate.ts";
import { lintSlop, type SlopHit } from "../antislop.ts";
import type { ConsoleGateResult } from "../console-gate.ts";
import {
  runDeviceMatrix,
  type DeviceMatrixRun,
  type DeviceProject,
  type MatrixHooks,
} from "../device-matrix.ts";
import { checkImageryGrade, type ImageryGradeResult, type ImagerySample } from "../imagery-grade.ts";
import { evaluateLh, type LhGateResult } from "../lighthouse-gate.ts";
import type { LinkResult } from "../link-check.ts";
import {
  checkPaletteProportion,
  type PaletteProportionInput,
  type PaletteProportionResult,
} from "../palette-proportion.ts";
import { runReducedMotion, type ReducedRun, type ReducedSample } from "../reduced-motion.ts";
import type { TypeAudit } from "../type-gate.ts";
import { evaluatePage, type PageWeightInput, type PageWeightResult } from "../weight-gate.ts";

export const GATE_IDS = [
  "fonts",
  "type-scale",
  "spacing",
  "color",
  "imagery",
  "motion",
  "3d",
  "copy",
  "device",
  "accessibility",
  "speed",
] as const;

export type GateId = (typeof GATE_IDS)[number];

export type GateStatus = "PASS" | "FIX" | "BLOCKER";

export interface GateResult {
  id: GateId;
  status: GateStatus;
  reason: string;
  evidence: unknown;
}

export interface GateReport {
  head: string;
  ranAt: string;
  results: GateResult[];
}

export interface GateProject {
  /** Site directory. The report is written to `.hitchhiker/qa/GATES.json` here. */
  root: string;
}

export interface MotionRunInput {
  projects: readonly DeviceProject[];
  sampleFor(project: DeviceProject): ReducedSample;
}

export interface MatrixRunInput {
  projects: readonly DeviceProject[];
  sections: readonly string[];
  hooks: MatrixHooks;
}

export type LighthouseRunInput = Parameters<typeof evaluateLh>[0];

export interface GateRunners {
  typeAudit(project: GateProject): Promise<TypeAudit> | TypeAudit;
  palette(project: GateProject): Promise<PaletteProportionInput> | PaletteProportionInput;
  imagery(project: GateProject): Promise<readonly ImagerySample[]> | readonly ImagerySample[];
  motion(project: GateProject): Promise<MotionRunInput> | MotionRunInput;
  copyText(project: GateProject): Promise<string> | string;
  device(project: GateProject): Promise<MatrixRunInput> | MatrixRunInput;
  console(project: GateProject): Promise<ConsoleGateResult> | ConsoleGateResult;
  links(project: GateProject): Promise<LinkResult> | LinkResult;
  a11y(project: GateProject): Promise<A11yGateInput> | A11yGateInput;
  lighthouse(project: GateProject): Promise<LighthouseRunInput> | LighthouseRunInput;
  weight(project: GateProject): Promise<PageWeightInput> | PageWeightInput;
}

export interface GateEntry {
  id: GateId;
  /** Existing modules this entry calls. Empty for the spacing stub. */
  modules: readonly string[];
}

interface GateFacts {
  typeAudit: TypeAudit;
  palette: PaletteProportionResult;
  imagery: ImageryGradeResult;
  motion: ReducedRun;
  any3d: boolean;
  slop: readonly SlopHit[];
  links: LinkResult;
  matrix: { ok: true; run: DeviceMatrixRun } | { ok: false; message: string };
  console: ConsoleGateResult;
  a11y: A11yGateResult;
  lighthouse: LhGateResult;
  weight: PageWeightResult;
}

const MODULES: Record<GateId, readonly string[]> = {
  fonts: ["type-gate.ts"],
  "type-scale": ["type-gate.ts"],
  spacing: [],
  color: ["palette-proportion.ts"],
  imagery: ["imagery-grade.ts"],
  motion: ["reduced-motion.ts"],
  "3d": ["reduced-motion.ts"],
  copy: ["antislop.ts", "link-check.ts"],
  device: ["device-matrix.ts", "console-gate.ts"],
  accessibility: ["a11y-gate.ts"],
  speed: ["lighthouse-gate.ts", "weight-gate.ts"],
};

const RUN: Record<GateId, (facts: GateFacts) => GateResult> = {
  fonts: fontsFrom,
  "type-scale": scaleFrom,
  spacing: spacingFrom,
  color: colorFrom,
  imagery: imageryFrom,
  motion: motionFrom,
  "3d": threeFrom,
  copy: copyFrom,
  device: deviceFrom,
  accessibility: accessFrom,
  speed: speedFrom,
};

export const GATE_REGISTRY: readonly GateEntry[] = GATE_IDS.map((id) => ({
  id,
  modules: MODULES[id],
}));

export function gatesJsonPath(root: string): string {
  return path.join(root, ".hitchhiker", "qa", "GATES.json");
}

/**
 * Run every dimension and write `.hitchhiker/qa/GATES.json`.
 * `head` is the git commit of `project.root`.
 */
export async function runAllGates(project: GateProject, runners: GateRunners): Promise<GateReport> {
  const head = await readHead(project.root);
  const facts = await collect(project, runners);
  const results = GATE_IDS.map((id) => RUN[id](facts));
  const report: GateReport = {
    head,
    ranAt: new Date().toISOString(),
    results,
  };
  const file = gatesJsonPath(project.root);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function collect(project: GateProject, runners: GateRunners): Promise<GateFacts> {
  const [
    typeAudit,
    paletteInput,
    imagerySamples,
    motionInput,
    copyText,
    deviceInput,
    consoleResult,
    linkResult,
    a11yInput,
    lighthouseInput,
    weightInput,
  ] = await Promise.all([
    runners.typeAudit(project),
    runners.palette(project),
    runners.imagery(project),
    runners.motion(project),
    runners.copyText(project),
    runners.device(project),
    runners.console(project),
    runners.links(project),
    runners.a11y(project),
    runners.lighthouse(project),
    runners.weight(project),
  ]);
  const measured = measureMotion(motionInput);
  return {
    typeAudit,
    palette: checkPaletteProportion(paletteInput),
    imagery: checkImageryGrade(imagerySamples),
    motion: measured.run,
    any3d: measured.any3d,
    slop: lintSlop(copyText, "site"),
    links: linkResult,
    matrix: await runMatrix(deviceInput),
    console: consoleResult,
    a11y: evaluateA11y(a11yInput),
    lighthouse: evaluateLh(lighthouseInput),
    weight: evaluatePage(weightInput),
  };
}

function measureMotion(input: MotionRunInput): { run: ReducedRun; any3d: boolean } {
  const samples = input.projects.map((project) => input.sampleFor(project));
  const byProject = new Map<DeviceProject, ReducedSample>();
  input.projects.forEach((project, index) => {
    const sample = samples[index];
    if (sample !== undefined) byProject.set(project, sample);
  });
  const run = runReducedMotion(input.projects, (project) => {
    const sample = byProject.get(project);
    if (sample === undefined) {
      throw new Error("A device is missing its motion measurement.");
    }
    return sample;
  });
  return { run, any3d: samples.some((sample) => sample.has3d) };
}

async function runMatrix(
  input: MatrixRunInput,
): Promise<{ ok: true; run: DeviceMatrixRun } | { ok: false; message: string }> {
  try {
    const run = await runDeviceMatrix(input.projects, input.sections, input.hooks);
    return { ok: true, run };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The device check failed.";
    return { ok: false, message };
  }
}

function readHead(root: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }, (error, stdout) => {
      const head = stdout.trim().toLowerCase();
      const valid = /^[0-9a-f]{40}$/.test(head) || /^[0-9a-f]{64}$/.test(head);
      if (error !== null || !valid) {
        reject(new Error("This folder has no git commit to attach the gate report to."));
        return;
      }
      resolve(head);
    });
  });
}

function row(id: GateId, status: GateStatus, reason: string, evidence: unknown): GateResult {
  const text = reason.trim();
  if (text.length === 0) throw new Error(`Gate ${id} has an empty reason.`);
  return { id, status, reason: text, evidence };
}

function fontsFrom(facts: GateFacts): GateResult {
  const problems = splitType(typeProblems(facts.typeAudit)).fonts;
  const status = fontStatus(problems);
  const reason =
    status === "PASS"
      ? "The fonts are on the page and within the size limit."
      : status === "BLOCKER"
        ? "The page is missing a font a reader needs."
        : "A font file is too large, or a backup font is missing its size match.";
  return row("fonts", status, reason, { problems, sampleCount: facts.typeAudit.samples.length });
}

function scaleFrom(facts: GateFacts): GateResult {
  const problems = splitType(typeProblems(facts.typeAudit)).scale;
  const status = scaleStatus(problems);
  const reason =
    status === "PASS"
      ? "The heading and the body text sizes work together."
      : status === "BLOCKER"
        ? "The heading or the body text could not be measured."
        : "The heading or the body text needs a size change.";
  return row("type-scale", status, reason, { problems, sampleCount: facts.typeAudit.samples.length });
}

/** Stub. The spacing gate replaces this. */
function spacingFrom(_facts: GateFacts): GateResult {
  return row("spacing", "PASS", "not measured yet", { measured: false });
}

function colorFrom(facts: GateFacts): GateResult {
  if (!facts.palette.flagged) {
    return row("color", "PASS", "The colors cover the page in a balanced way.", {
      reasons: facts.palette.reasons,
    });
  }
  return row("color", "FIX", "One color covers more of the page than it should.", {
    reasons: facts.palette.reasons,
  });
}

function imageryFrom(facts: GateFacts): GateResult {
  const { imagery } = facts;
  if (imagery.ok && imagery.grade === "none") {
    return row("imagery", "PASS", "No pictures were graded.", { grade: imagery.grade, problems: imagery.problems });
  }
  if (imagery.ok) {
    return row("imagery", "PASS", "The pictures share one look.", {
      grade: imagery.grade,
      problems: imagery.problems,
    });
  }
  const blocked = imagery.problems.some((line) => line.includes("Expected a number"));
  return row(
    "imagery",
    blocked ? "BLOCKER" : "FIX",
    blocked ? "A picture on the page could not be measured." : "The pictures do not share one look.",
    { grade: imagery.grade, problems: imagery.problems },
  );
}

function motionFrom(facts: GateFacts): GateResult {
  const problems = splitMotion(facts.motion.problems).motion;
  const status = motionStatus(problems);
  return row("motion", status, motionReason(status, problems), { problems });
}

function threeFrom(facts: GateFacts): GateResult {
  const problems = splitMotion(facts.motion.problems).three;
  const status = threeStatus(problems);
  return row("3d", status, threeReason(status, problems, facts.any3d), { problems, any3d: facts.any3d });
}

function copyFrom(facts: GateFacts): GateResult {
  const linkBad = facts.links.pass !== true || facts.links.broken.length > 0;
  const lorem = facts.slop.some((hit) => hit.rule === "lorem");
  const other = facts.slop.some((hit) => hit.rule !== "lorem");
  const parts: string[] = [];
  let status: GateStatus = "PASS";
  if (lorem) {
    status = "BLOCKER";
    parts.push("The page still has filler text where real words should be.");
  } else if (other) {
    status = "FIX";
    parts.push("Some words should be rewritten in plainer language.");
  }
  if (linkBad) {
    status = "BLOCKER";
    parts.push("A link on the page does not open.");
  }
  if (parts.length === 0) parts.push("The words read like a finished page.");
  return row("copy", status, parts.join(" "), {
    hits: facts.slop.map((hit) => ({ line: hit.line, rule: hit.rule })),
    links: { broken: facts.links.broken, pass: facts.links.pass },
  });
}

function deviceFrom(facts: GateFacts): GateResult {
  const consoleBad =
    facts.console.pass !== true || facts.console.errors !== 0 || facts.console.failedRequests !== 0;
  const parts: string[] = [];
  if (!facts.matrix.ok) parts.push("The phone, tablet, or desktop check did not finish.");
  if (consoleBad) parts.push("The page reports errors while it opens.");
  const status: GateStatus = parts.length === 0 ? "PASS" : "BLOCKER";
  if (parts.length === 0) parts.push("The device check finished.");
  const matrixEvidence = facts.matrix.ok
    ? { limits: facts.matrix.run.limits, projectCount: facts.matrix.run.projects.length }
    : { failure: facts.matrix.message };
  return row("device", status, parts.join(" "), {
    matrix: matrixEvidence,
    console: {
      errors: facts.console.errors,
      failedRequests: facts.console.failedRequests,
      pass: facts.console.pass,
    },
  });
}

function accessFrom(facts: GateFacts): GateResult {
  if (facts.a11y.status === "PASS") {
    return row("accessibility", "PASS", "People can move through the page and read the text.", {
      notes: facts.a11y.notes,
    });
  }
  const parts: string[] = [];
  if (facts.a11y.notes.some((note) => note.startsWith("Axe ") || note.startsWith("Moderate is included"))) {
    parts.push("Some people cannot use part of the page.");
  }
  if (facts.a11y.notes.some((note) => note.includes("Keyboard"))) {
    parts.push("There is no way to move through the page with a keyboard.");
  }
  if (facts.a11y.notes.some((note) => note.includes("reduced-motion"))) {
    parts.push("Motion keeps playing when a person asks for less motion.");
  }
  if (facts.a11y.notes.some((note) => note.includes("contrast"))) {
    parts.push("The body text does not stand out from its background.");
  }
  if (parts.length === 0) parts.push("The page blocks some people from using it.");
  return row("accessibility", "BLOCKER", parts.join(" "), { notes: facts.a11y.notes });
}

function speedFrom(facts: GateFacts): GateResult {
  const parts: string[] = [];
  if (facts.lighthouse.status !== "PASS") {
    parts.push("On a phone, the page is slower or harder to use than it should be.");
  }
  if (facts.weight.status !== "PASS") {
    parts.push("The page is over its size limit, or it is missing a title, one main heading, or enough text.");
  }
  const status: GateStatus = parts.length === 0 ? "PASS" : "BLOCKER";
  if (parts.length === 0) parts.push("The page loads well on a phone and stays within its size limit.");
  return row("speed", status, parts.join(" "), {
    lighthouse: { status: facts.lighthouse.status, reasons: facts.lighthouse.reasons },
    weight: { status: facts.weight.status, reasons: facts.weight.reasons },
  });
}

function typeProblems(audit: TypeAudit): readonly string[] {
  if (audit.problems.length > 0) return audit.problems;
  if (!audit.ok) return ["The type measurement failed."];
  return [];
}

function isFontLine(line: string): boolean {
  return /famil|not loaded|fallback|font-display|woff2|hotlink|preload|Headline font|Body font|Font files/i.test(line);
}

function isScaleLine(line: string): boolean {
  return /roles are missing|Body is |Display to body ratio|line-height|Measure is /i.test(line);
}

function splitType(problems: readonly string[]): { fonts: string[]; scale: string[] } {
  const fonts: string[] = [];
  const scale: string[] = [];
  for (const line of problems) {
    const font = isFontLine(line);
    const scaleHit = isScaleLine(line);
    if (!font && !scaleHit) {
      fonts.push(line);
      scale.push(line);
      continue;
    }
    if (font) fonts.push(line);
    if (scaleHit) scale.push(line);
  }
  return { fonts, scale };
}

function fontStatus(problems: readonly string[]): GateStatus {
  if (problems.length === 0) return "PASS";
  const blocked = /index\.html is missing|no brand family|hotlink|not a self-hosted|is not loaded/i;
  if (problems.some((line) => blocked.test(line))) return "BLOCKER";
  return "FIX";
}

function scaleStatus(problems: readonly string[]): GateStatus {
  if (problems.length === 0) return "PASS";
  if (problems.some((line) => /roles are missing|index\.html is missing/i.test(line))) return "BLOCKER";
  return "FIX";
}

function splitMotion(problems: readonly string[]): { motion: string[]; three: string[] } {
  const motion: string[] = [];
  const three: string[] = [];
  for (const line of problems) {
    if (/3D scene|tier-0|camera is still|canvas loop/i.test(line)) three.push(line);
    else motion.push(line);
  }
  return { motion, three };
}

function motionStatus(problems: readonly string[]): GateStatus {
  if (problems.length === 0) return "PASS";
  if (
    problems.some((line) =>
      /missing its text|missing its image|only after scroll|No section text|WebKit is missing/i.test(line),
    )
  ) {
    return "BLOCKER";
  }
  return "FIX";
}

function motionReason(status: GateStatus, problems: readonly string[]): string {
  if (status === "PASS") return "Motion eases off when a person asks for less of it.";
  const parts: string[] = [];
  if (problems.some((line) => /WebKit is missing/i.test(line))) {
    parts.push("The less-motion check did not cover an iPhone-style browser.");
  }
  if (problems.some((line) => /missing its text|missing its image|only after scroll|No section text/i.test(line))) {
    parts.push("Words or pictures drop out when a person asks for less motion.");
  }
  if (parts.length === 0) parts.push("Some motion keeps playing after a person asks for less.");
  return parts.join(" ");
}

function threeStatus(problems: readonly string[]): GateStatus {
  if (problems.length === 0) return "PASS";
  if (problems.some((line) => /no tier-0 still/i.test(line))) return "BLOCKER";
  return "FIX";
}

function threeReason(status: GateStatus, problems: readonly string[], any3d: boolean): string {
  if (status === "PASS" && !any3d) return "This page has no three-dimensional scene.";
  if (status === "PASS") return "The scene has a still picture for when motion is turned down.";
  if (problems.some((line) => /no tier-0 still/i.test(line))) {
    return "The scene has no still picture when motion is turned down.";
  }
  if (problems.some((line) => /camera is still moving|canvas loop/i.test(line))) {
    return "The three-dimensional scene keeps moving when a person asks for less motion.";
  }
  return "The still picture does not match the scene.";
}
