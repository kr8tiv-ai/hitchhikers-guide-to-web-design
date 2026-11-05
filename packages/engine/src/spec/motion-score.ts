/**
 * Choreography score (245w). Static GSAP timelines plus the runtime registry
 * captured by the motion probe. 10 is a clean score. Each competing category
 * costs 2 points, floored at 0.
 *
 * The 245l screenshot loop is not in the tree yet. motionLoopFindings is the
 * hook that loop should call, and the final review calls it now.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseSignatureMoments } from "./design-md-lint.ts";
import { lintMotion } from "./motion-lint.ts";

export interface MotionTimelineChild {
  target: string;
  ease: string;
  duration: number;
  props: readonly string[];
  scrub: boolean;
}

export interface MotionProbeFacts {
  rafLoops: number;
  scrollTriggers: number;
  lenisInstances: number;
  scrubbedProperties: readonly string[];
  refreshedAfterFonts: boolean;
  refreshedAfterImages: boolean;
  triggersAfterUnmount: number;
  timelineChildren?: readonly MotionTimelineChild[];
}

export interface ChoreographyScore {
  score: number;
  findings: string[];
  easings: string[];
  bands: string[];
}

const LAYOUT_PROP =
  /^(width|height|top|left|right|bottom|margin|padding|marginTop|marginRight|marginBottom|marginLeft|paddingTop|paddingRight|paddingBottom|paddingLeft|fontSize|gap|minWidth|maxWidth|minHeight|maxHeight|filter)$/;

const SCROLL_RECIPES = [
  "pinnedTimeline",
  "horizontalTrack",
  "scrollCamera",
  "frameSequence",
  "parallaxLayers",
  "batchReveal",
  "kineticType",
  "snapToLabels",
  "preloaderHandoff",
  "pageTransition",
  "microInteractions",
] as const;

/** Beside the other review artifacts. A bare qa/ file would stop the next elevate round. */
const CHOREOGRAPHY_REL = path.join(".hitchhiker", "qa", "motion", "choreography.json");

export function motionProbeProblems(facts: MotionProbeFacts): string[] {
  const problems: string[] = [];
  if (facts.lenisInstances > 1) {
    problems.push(`Motion probe found ${facts.lenisInstances} Lenis instances. Keep one scroll owner.`);
  }
  if (facts.rafLoops > 1) {
    problems.push(`Motion probe found ${facts.rafLoops} requestAnimationFrame loops. Drive Lenis from gsap.ticker only.`);
  }
  if (facts.scrollTriggers > 0 && !facts.refreshedAfterFonts) {
    problems.push("ScrollTrigger did not refresh after fonts.");
  }
  if (facts.scrollTriggers > 0 && !facts.refreshedAfterImages) {
    problems.push("ScrollTrigger did not refresh after images.");
  }
  const layout = facts.scrubbedProperties.filter((prop) => LAYOUT_PROP.test(prop));
  if (layout.length > 0) {
    problems.push(`Scrubbed properties changed layout or filter: ${layout.join(", ")}.`);
  }
  if (facts.triggersAfterUnmount > 0) {
    problems.push(`Unmount left ${facts.triggersAfterUnmount} ScrollTrigger instances.`);
  }
  return problems;
}

export function scoreChoreography(projectDir: string, probe: MotionProbeFacts | null): ChoreographyScore {
  const facts = probe ?? emptyFacts();
  const sources = readSources(projectDir);
  const staticEasings = collectEasings(sources);
  const childEasings = (facts.timelineChildren ?? []).map((child) => child.ease).filter((ease) => ease !== "");
  const easings = unique([...staticEasings, ...childEasings].filter((ease) => ease !== "none" && ease !== "linear"));
  const durations = [
    ...collectDurations(sources),
    ...(facts.timelineChildren ?? []).map((child) => child.duration).filter((value) => value > 0),
  ];
  const bands = unique(durations.map(bandName));
  const findings: string[] = [];
  let score = 10;
  const deduct = (message: string): void => {
    score = Math.max(0, score - 2);
    findings.push(message);
  };

  if (easings.length > 1) deduct(`Competing easings: ${easings.join(", ")}.`);
  if (bands.length > 2) deduct(`More than 2 duration bands: ${bands.join(", ")}.`);
  const layout = layoutNames(sources, facts);
  if (layout.length > 0) deduct(`Layout-property tweens: ${layout.join(", ")}.`);
  if (facts.lenisInstances > 1 || facts.rafLoops > 1 || staticOwners(sources) > 1) {
    deduct("Multiple scroll owners.");
  }
  const overlap = overlappingScrubs(sources, facts.timelineChildren ?? []);
  if (overlap !== "") deduct(`Overlapping scrubs on ${overlap}.`);
  const signature = signatureCompetition(projectDir, sources);
  if (signature !== "") deduct(signature);

  const report: ChoreographyScore = { score, findings, easings, bands };
  writeReport(projectDir, report);
  return report;
}

/**
 * Findings for the 245l loop and the final review. Static constitution hits
 * are included. Structural recipe hits stay on checkRecipeDir so they are
 * not listed twice.
 */
export function motionLoopFindings(projectDir: string, probe: MotionProbeFacts | null): string[] {
  const problems = probe === null ? [] : motionProbeProblems(probe);
  const constitution = lintMotion(projectDir)
    .filter((finding) => finding.rule === "constitution-ease" || finding.rule === "constitution-duration" || finding.rule === "constitution-count")
    .map((finding) => `${finding.file}:${finding.line} ${finding.detail} Fix: ${finding.fix}`);
  const score = scoreChoreography(projectDir, probe);
  const lines = [...problems, ...constitution];
  if (score.findings.length > 0) {
    lines.push(`Choreography score ${score.score}/10.`);
    lines.push(...score.findings);
  }
  return lines;
}

function emptyFacts(): MotionProbeFacts {
  return {
    rafLoops: 0,
    scrollTriggers: 0,
    lenisInstances: 0,
    scrubbedProperties: [],
    refreshedAfterFonts: true,
    refreshedAfterImages: true,
    triggersAfterUnmount: 0,
  };
}

function readSources(projectDir: string): string[] {
  if (!existsSync(projectDir)) return [];
  const files: string[] = [];
  walk(projectDir, files);
  const sources: string[] = [];
  for (const file of files) {
    try {
      sources.push(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
  }
  return sources;
}

function walk(dir: string, into: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git" || entry.name === "coverage" || entry.name === "qa") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, into);
    else if (/\.(ts|tsx|js|jsx|astro|vue|svelte|css)$/.test(entry.name)) into.push(full);
  }
}

function collectEasings(sources: readonly string[]): string[] {
  const easings: string[] = [];
  for (const source of sources) {
    for (const match of source.matchAll(/\bease\s*:\s*["']([^"']+)["']/g)) {
      const value = match[1];
      if (value !== undefined) easings.push(value);
    }
  }
  return easings;
}

function collectDurations(sources: readonly string[]): number[] {
  const durations: number[] = [];
  for (const source of sources) {
    for (const match of source.matchAll(/\bduration\s*:\s*(\d+(?:\.\d+)?)/g)) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0) durations.push(value);
    }
  }
  return durations;
}

function bandName(seconds: number): string {
  if (seconds <= 0.4) return "micro";
  if (seconds >= 0.7 && seconds <= 1.6) return "story";
  return `other ${seconds}`;
}

function layoutNames(sources: readonly string[], facts: MotionProbeFacts): string[] {
  const names = new Set<string>(facts.scrubbedProperties.filter((prop) => LAYOUT_PROP.test(prop)));
  const key = /\b(width|height|top|left|right|bottom|margin|padding|fontSize|gap|filter)\s*:/g;
  for (const source of sources) {
    for (const match of source.matchAll(/\bgsap\s*\.\s*(?:to|from|fromTo|set)\s*\([^)]*\)/g)) {
      const block = match[0] ?? "";
      for (const prop of block.matchAll(key)) {
        const name = prop[1];
        if (name !== undefined) names.add(name);
      }
    }
  }
  return [...names];
}

function staticOwners(sources: readonly string[]): number {
  let owners = 0;
  for (const source of sources) {
    const lenis = /\bnew\s+Lenis\b/.test(source) || /from\s+["']lenis["']/.test(source);
    const css = /animation-timeline\s*:|scroll-timeline\s*:/.test(source);
    if (lenis && css) return 2;
    if (lenis) owners += 1;
    if (css) owners += 1;
  }
  return owners > 1 ? owners : owners;
}

function overlappingScrubs(sources: readonly string[], children: readonly MotionTimelineChild[]): string {
  const counts = new Map<string, number>();
  const note = (target: string): void => {
    const key = target.trim();
    if (key === "") return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const source of sources) {
    for (const match of source.matchAll(/\bgsap\s*\.\s*(?:to|from|fromTo)\s*\(\s*([^,]+),[\s\S]*?\bscrub\b/g)) {
      note((match[1] ?? "").replace(/["'`]/g, "").trim());
    }
  }
  for (const child of children) {
    if (child.scrub) note(child.target);
  }
  for (const [target, count] of counts) {
    if (count >= 2) return target;
  }
  return "";
}

function signatureCompetition(projectDir: string, sources: readonly string[]): string {
  const designPath = path.join(projectDir, "DESIGN.md");
  if (!existsSync(designPath)) return "";
  let markdown = "";
  try {
    markdown = readFileSync(designPath, "utf8");
  } catch {
    return "";
  }
  const recipes = new Set(parseSignatureMoments(markdown).map((moment) => moment.recipe).filter((recipe) => recipe !== ""));
  if (recipes.size === 0) return "";
  const corpus = sources.join("\n");
  for (const name of SCROLL_RECIPES) {
    if (recipes.has(name)) continue;
    if (new RegExp(`\\b${name}\\b`).test(corpus)) {
      return `Competes with the signature recipe ${[...recipes].join(", ")}: ${name}.`;
    }
  }
  return "";
}

function writeReport(projectDir: string, report: ChoreographyScore): void {
  if (!existsSync(projectDir)) return;
  if (!existsSync(path.join(projectDir, "src")) && !existsSync(path.join(projectDir, "DESIGN.md"))) return;
  const file = path.join(projectDir, CHOREOGRAPHY_REL);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function unique(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (value === "" || out.includes(value)) continue;
    out.push(value);
  }
  return out;
}
