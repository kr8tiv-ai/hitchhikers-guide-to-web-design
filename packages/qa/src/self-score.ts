/**
 * Measured self-score per Awwwards criterion (harness idea 20).
 *
 * One report calls the device, nav, palette, beauty, and reduced-motion
 * gates. Design, usability, creativity, and content use the jury weights
 * (40, 30, 20, 10). Creativity is a measured 0 to 10 stub. This module
 * does not call a model and does not change judgeBeauty.
 * The report ends with exactly three fixes, ordered by leverage.
 */

import type { DeviceProject } from "./device-matrix.ts";
import { judgeBeauty, type SectionShot } from "./beauty-gate.ts";
import { evaluateNavFooter, type NavFooterInput } from "./craft-gate.ts";
import { jury, type JuryInput } from "./jury.ts";
import { loadInstalledPresets } from "./lighthouse-preset.ts";
import { checkPaletteProportion, type PaletteProportionInput } from "./palette-proportion.ts";
import {
  evaluateDevicePerformance,
  type DeviceLab,
  type DevicePerformanceInput,
} from "./performance-gate.ts";
import { runReducedMotion, type ReducedSample } from "./reduced-motion.ts";
import type { PillarStatus } from "./pillars.ts";
import type { TruthCheck } from "./goal-backward.ts";
import { falseVisualBans, type ReviewVerdict } from "./zaphod-vision.ts";

const DESIGN = 40;
const USABILITY = 30;
const CREATIVITY = 20;
const CONTENT = 10;
const CREATIVITY_PASS = 8;

export interface SweepMeasurement {
  descriptorKey: string;
  viewport: { width: number; height: number };
  overflow: boolean;
}

export interface SelfScoreInput {
  nav: NavFooterInput;
  palette: PaletteProportionInput;
  devices: DevicePerformanceInput;
  coldLoadId: "mobile" | "desktop" | "tablet";
  headingsHtml: string;
  sweep: SweepMeasurement;
  motionProjects: readonly DeviceProject[];
  motionSamples: readonly ReducedSample[];
  creativity: number;
  shots: readonly SectionShot[];
}

export interface CriterionScore {
  id: "design" | "usability" | "creativity" | "content";
  weight: number;
  score: number;
}

export interface SelfScoreReport {
  status: "PASS" | "BLOCKER";
  criteria: readonly [CriterionScore, CriterionScore, CriterionScore, CriterionScore];
  lab: DeviceLab & { line: string };
  fixes: readonly [string, string, string];
  coldLoad: string;
  sweep: { descriptorKey: string; width: number; height: number; overflow: boolean };
  juryTotal: number;
  juryStatus: "PASS" | "FAIL";
  jury: JuryInput;
  reasons: string[];
}

interface Candidate {
  text: string;
  weight: number;
  points: number;
  hard: boolean;
}

export function readHeadings(html: string): { count: number; empty: boolean } {
  const tags = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  const texts = tags.map((match) => (match[1] ?? "").replace(/<[^>]+>/g, "").trim());
  return { count: texts.length, empty: texts.length === 0 || texts.some((text) => text.length === 0) };
}

function plainFix(value: string): string {
  return value
    .replaceAll("!", "")
    .replaceAll("$", "")
    .replaceAll("<", "")
    .replaceAll("\u2014", "-")
    .replaceAll("\u2013", "-")
    .trim();
}

function clampScore(loss: number): number {
  return Math.max(0, Math.min(10, 10 - loss));
}

function readCreativity(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error(`creativity is ${String(value)}. Expected a score from 0 to 10.`);
  }
  return value;
}

function labLine(lab: DeviceLab): string {
  const lcp = lab.lcpMs === null ? "missing" : String(lab.lcpMs);
  const cls = lab.cls === null ? "missing" : String(lab.cls);
  const tbt = lab.tbtMs === null ? "missing" : String(lab.tbtMs);
  const inp =
    lab.inpSampleMs === null ? `INP was not sampled. TBT is ${lab.tbtMs ?? 0} ms.` : `INP is ${lab.inpSampleMs} ms.`;
  return `LCP ${lcp} ms. CLS ${cls}. TBT ${tbt} ms. ${inp}`;
}

function pads(lab: DeviceLab): string[] {
  const lcp = lab.lcpMs === null ? "LCP was not measured." : `Keep LCP at ${lab.lcpMs} ms.`;
  const cls = lab.cls === null ? "CLS was not measured." : `Keep CLS at ${lab.cls}.`;
  const inp =
    lab.inpSampleMs === null
      ? `INP was not sampled. TBT is ${lab.tbtMs ?? 0} ms.`
      : `Keep INP at ${lab.inpSampleMs} ms.`;
  return [lcp, cls, inp];
}

function topFixes(candidates: readonly Candidate[], fillers: readonly string[]): [string, string, string] {
  const ranked = [...candidates].sort((a, b) => {
    const leverage = b.weight * b.points - a.weight * a.points;
    if (leverage !== 0) return leverage;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.text.localeCompare(b.text);
  });
  const fixes: string[] = [];
  for (const item of ranked) {
    if (fixes.length === 3) break;
    if (!fixes.includes(item.text)) fixes.push(item.text);
  }
  for (const filler of fillers) {
    if (fixes.length === 3) break;
    if (!fixes.includes(filler)) fixes.push(filler);
  }
  while (fixes.length < 3) fixes.push("Keep the measured lab.");
  const first = fixes[0];
  const second = fixes[1];
  const third = fixes[2];
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error("The self-score did not produce three fixes.");
  }
  return [first, second, third];
}

function add(
  list: Candidate[],
  text: string,
  weight: number,
  points: number,
  hard: boolean,
): void {
  const clean = plainFix(text);
  if (clean.length === 0) return;
  list.push({ text: clean, weight, points, hard });
}

function motionSample(project: DeviceProject, samples: readonly ReducedSample[]): ReducedSample {
  const found = samples.find((item) => item.projectId === project.id);
  if (found === undefined) throw new Error(`Reduced motion sample for ${project.id} is missing.`);
  return found;
}

/** Four criterion scores, the lab line, and the three highest-leverage fixes. */
export async function scoreSelf(input: SelfScoreInput): Promise<SelfScoreReport> {
  const creativity = readCreativity(input.creativity);
  const presets = await loadInstalledPresets();
  const installedMobile = presets.find((item) => item.id === "mobile");
  if (installedMobile === undefined) throw new Error("Installed Lighthouse has no mobile preset.");
  const nav = evaluateNavFooter(input.nav);
  const palette = checkPaletteProportion(input.palette);
  const beauty = judgeBeauty(input.shots);
  const perf = evaluateDevicePerformance(input.devices);
  const motion =
    input.motionProjects.length === 0
      ? null
      : runReducedMotion(input.motionProjects, (project) => motionSample(project, input.motionSamples));
  const headings = readHeadings(input.headingsHtml);
  const candidates: Candidate[] = [];
  let designLoss = 0;
  let usabilityLoss = 0;
  let contentLoss = 0;

  if (palette.flagged) {
    const text = palette.reasons.find((reason) => reason.includes("half the page")) ?? palette.reasons[0] ?? "The palette proportion is off.";
    designLoss += 3;
    add(candidates, text, DESIGN, 3, false);
  }
  const typeReason = nav.reasons.find((reason) => reason.startsWith("Nav type is"));
  if (typeReason !== undefined) {
    designLoss += 2;
    add(candidates, typeReason, DESIGN, 2, false);
  }
  const scene = nav.reasons.find((reason) => /wordmark|colophon/.test(reason));
  if (scene !== undefined) {
    designLoss += 2;
    add(candidates, scene, DESIGN, 2, false);
  }
  if (!beauty.pass) {
    designLoss += 2;
    add(candidates, beauty.failures[0]?.reason ?? "A section failed the beauty gate.", DESIGN, 2, false);
  }
  const keyboard = nav.reasons.find((reason) => /did not open|Escape did not|visual order/.test(reason));
  if (keyboard !== undefined) {
    usabilityLoss += 4;
    add(candidates, keyboard, USABILITY, 4, true);
  }
  if (headings.count !== 1) {
    usabilityLoss += 2;
    add(candidates, `The page has ${headings.count} h1 headings.`, USABILITY, 2, true);
  }
  if (input.sweep.descriptorKey !== "iPhone SE" || input.sweep.overflow) {
    usabilityLoss += 2;
    add(
      candidates,
      input.sweep.descriptorKey !== "iPhone SE"
        ? `The sweep descriptor is ${input.sweep.descriptorKey}. The installed iPhone SE descriptor is required.`
        : "The iPhone SE sweep overflows sideways.",
      USABILITY,
      2,
      true,
    );
  }
  if (motion === null || !motion.ok) {
    usabilityLoss += 3;
    add(candidates, motion?.problems[0] ?? "Reduced motion was not measured.", USABILITY, 3, true);
  }
  const footerUse = nav.reasons.find((reason) => /is not reached|focus ring/.test(reason));
  if (footerUse !== undefined) {
    usabilityLoss += 2;
    add(candidates, footerUse, USABILITY, 2, true);
  }
  const contrast = nav.reasons.find((reason) => reason.includes("4.5"));
  if (contrast !== undefined) {
    usabilityLoss += 2;
    add(candidates, contrast, USABILITY, 2, true);
  }
  const role = nav.reasons.find((reason) => reason.includes('role="menu"'));
  if (role !== undefined) {
    usabilityLoss += 3;
    add(candidates, role, USABILITY, 3, true);
  }
  if (perf.status === "BLOCKER") {
    usabilityLoss += 4;
    add(candidates, perf.reasons[0] ?? "A device preset missed the floor.", USABILITY, 4, true);
  }
  if (input.coldLoadId !== installedMobile.id) {
    usabilityLoss += 4;
    add(
      candidates,
      `Cold load uses the ${input.coldLoadId} preset. The phone preset is required.`,
      USABILITY,
      4,
      true,
    );
  }
  const credits = nav.reasons.find((reason) => /credit line/.test(reason));
  if (credits !== undefined) {
    contentLoss += 4;
    add(candidates, credits, CONTENT, 4, false);
  }
  if (headings.empty) {
    contentLoss += 3;
    add(candidates, "A heading is empty.", CONTENT, 3, true);
  }
  if (creativity < CREATIVITY_PASS) {
    add(candidates, `Creativity is ${creativity} out of 10.`, CREATIVITY, 10 - creativity, false);
  }

  const scores = {
    design: clampScore(designLoss),
    usability: clampScore(usabilityLoss),
    creativity,
    content: clampScore(contentLoss),
  };
  const hard = candidates.some((item) => item.hard);
  const juryInput: JuryInput = {
    brand: scores.design,
    craft: scores.usability,
    clarity: scores.creativity,
    performance: scores.content,
    blocked: hard,
  };
  const judged = jury(juryInput);
  const mobileLab = perf.lab.mobile;
  const line = labLine(mobileLab);
  const criteria = [
    { id: "design", weight: DESIGN, score: scores.design },
    { id: "usability", weight: USABILITY, score: scores.usability },
    { id: "creativity", weight: CREATIVITY, score: scores.creativity },
    { id: "content", weight: CONTENT, score: scores.content },
  ] as const;
  return {
    status: hard ? "BLOCKER" : "PASS",
    criteria,
    lab: { ...mobileLab, line },
    fixes: topFixes(candidates, pads(mobileLab)),
    coldLoad: input.coldLoadId === installedMobile.id ? installedMobile.id : input.coldLoadId,
    sweep: {
      descriptorKey: input.sweep.descriptorKey,
      width: input.sweep.viewport.width,
      height: input.sweep.viewport.height,
      overflow: input.sweep.overflow,
    },
    juryTotal: judged.total,
    juryStatus: judged.status,
    jury: juryInput,
    reasons: candidates.map((item) => item.text),
  };
}

/** Review verdict whose fixes are the three self-score lines. */
export function selfScoreVerdict(report: SelfScoreReport, fixRound: 0 | 1 | 2): ReviewVerdict {
  if (fixRound !== 0 && fixRound !== 1 && fixRound !== 2) {
    throw new Error("fixRound must be 0, 1, or 2.");
  }
  const hard = report.status === "BLOCKER";
  const verdict = !hard ? "PASS" : fixRound < 2 ? "FIX" : "ESCALATE";
  const worst: PillarStatus = hard ? "BLOCKER" : "PASS";
  const truths: TruthCheck[] = [
    { truth: "The self-score names four criteria and three fixes.", status: hard ? "MISSING" : "FOUND" },
  ];
  return {
    ...falseVisualBans(),
    verdict,
    reasons: [...report.reasons],
    truths,
    pillars: { worst, missing: [] },
    jury: report.jury,
    slopHits: 0,
    fixRound,
    boots: true,
    fixes: [...report.fixes],
    sections: [],
  };
}
