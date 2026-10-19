/**
 * Visual benchmark scorer. Fixture scores and DOM facts only.
 * The live runner is bench/visual and is not part of the test suite.
 */

export const RUBRIC_LINES = [
  "visualRichness",
  "originality",
  "artDirection",
  "typography",
  "motion",
  "imagery",
  "accessibility",
  "performance",
] as const;

export type RubricLine = (typeof RUBRIC_LINES)[number];

export interface SectionScore {
  id: string;
  visualRichness: number;
  beautyFail?: boolean;
}

export interface HardFlags {
  textOnlyHero?: boolean;
  inventedTestimonial?: boolean;
  inventedPriceOrAddress?: boolean;
  generatedAsRealPlace?: boolean;
  noReducedMotion?: boolean;
  contrastFail?: boolean;
  phoneUnder90?: boolean;
  audioAutoplay?: boolean;
  slop?: boolean;
  templateClone?: boolean;
}

export interface PageScore {
  sections: readonly SectionScore[];
  originality: number;
  rubric: Record<RubricLine, number>;
  richnessIndex: number;
  techniques: readonly string[];
  skeleton: string;
  hard: HardFlags;
}

export interface PairVote {
  viewport: "375" | "1440";
  prefer: "desk" | "plain" | "aura" | "tie";
  swappedPrefer: "desk" | "plain" | "aura" | "tie";
}

export interface BriefComparison {
  id: string;
  desk: PageScore;
  plain: PageScore;
  aura?: PageScore;
  pairs: readonly PairVote[];
  auraPairs?: readonly PairVote[];
}

export interface BenchVerdict {
  pass: boolean;
  reasons: string[];
  auraWins: number;
}

export function benchMayStart(argv: readonly string[]): boolean {
  return argv.includes("--run");
}

export function richnessIndex(
  sections: readonly { images: number; videos: number; techniques: readonly string[] }[],
): number {
  const techniques = new Set<string>();
  let media = 0;
  const layouts = new Set<string>();
  for (const section of sections) {
    media += Math.max(0, section.images) + Math.max(0, section.videos);
    for (const technique of section.techniques) techniques.add(technique);
    layouts.add([...section.techniques].sort().join("+") || "plain");
  }
  return techniques.size + media + layouts.size;
}

export function isTemplateClone(pageText: string, snippets: readonly string[]): boolean {
  const page = tokens(pageText);
  if (page.length === 0) return false;
  const pageSet = new Set(page);
  for (const snippet of snippets) {
    const sample = tokens(snippet);
    if (sample.length < 12) continue;
    let covered = 0;
    for (const token of sample) if (pageSet.has(token)) covered += 1;
    if (covered / sample.length >= 0.85) return true;
  }
  return false;
}

export function deskPagesDiffer(
  pages: readonly { techniques: readonly string[]; skeleton: string }[],
): boolean {
  for (let left = 0; left < pages.length; left += 1) {
    for (let right = left + 1; right < pages.length; right += 1) {
      const a = pages[left];
      const b = pages[right];
      if (a === undefined || b === undefined) continue;
      if (a.skeleton === b.skeleton && sameSet(a.techniques, b.techniques)) return false;
    }
  }
  return true;
}

export function compareBrief(input: BriefComparison): BenchVerdict {
  const reasons: string[] = [];
  reasons.push(...hardReasons(input.desk));
  const deskMean = mean(input.desk.sections.map((section) => section.visualRichness));
  const plainMean = mean(input.plain.sections.map((section) => section.visualRichness));
  for (const section of input.desk.sections) {
    if (section.visualRichness < 9) reasons.push(`${input.id} ${section.id} richness is under 9.`);
    if (section.beautyFail === true) reasons.push(`${input.id} ${section.id} fails the beauty gate.`);
  }
  if (input.desk.sections.length === 0) reasons.push(`${input.id} has no desk sections.`);
  if (deskMean + 1e-9 < plainMean + 3) reasons.push(`${input.id} richness is not 3 above plain Grok.`);
  if (input.desk.richnessIndex + 1e-9 < input.plain.richnessIndex * 10) {
    reasons.push(`${input.id} richness index is under 10 times plain Grok.`);
  }
  if (input.desk.originality < 8) reasons.push(`${input.id} originality is under 8.`);
  if (input.desk.originality + 1e-9 < input.plain.originality + 4) {
    reasons.push(`${input.id} originality is under 4 above plain Grok.`);
  }
  if (!pairWins(input.pairs, "desk")) reasons.push(`${input.id} pairwise judgement does not prefer the desk.`);
  let auraWins = 0;
  if (input.aura !== undefined) {
    for (const line of RUBRIC_LINES) {
      if (input.desk.rubric[line] < input.aura.rubric[line]) {
        reasons.push(`${input.id} scores lower than aura on ${line}.`);
      }
    }
    if (pairWins(input.auraPairs ?? [], "desk")) auraWins = 1;
    else reasons.push(`${input.id} does not win the aura pairwise judgement.`);
  }
  return { pass: reasons.length === 0, reasons, auraWins };
}

export function compareCampaign(briefs: readonly BriefComparison[]): BenchVerdict {
  const reasons: string[] = [];
  let auraWins = 0;
  let auraBriefs = 0;
  for (const brief of briefs) {
    const verdict = compareBrief(brief);
    reasons.push(...verdict.reasons);
    if (brief.aura !== undefined) {
      auraBriefs += 1;
      auraWins += verdict.auraWins;
    }
  }
  if (auraBriefs > 0 && auraWins < 2) reasons.push("The desk must win the aura pairwise judgement on at least two briefs.");
  const pages = briefs.map((brief) => ({ techniques: brief.desk.techniques, skeleton: brief.desk.skeleton }));
  if (!deskPagesDiffer(pages)) reasons.push("Desk pages share a technique set and a layout skeleton.");
  return { pass: reasons.length === 0, reasons, auraWins };
}

function hardReasons(page: PageScore): string[] {
  const reasons: string[] = [];
  const flags: [keyof HardFlags, string][] = [
    ["textOnlyHero", "text-only hero"],
    ["inventedTestimonial", "invented testimonial"],
    ["inventedPriceOrAddress", "invented price or address"],
    ["generatedAsRealPlace", "generated image captioned as the real place"],
    ["noReducedMotion", "no reduced-motion path"],
    ["contrastFail", "body contrast under WCAG"],
    ["phoneUnder90", "phone performance under 90"],
    ["audioAutoplay", "audio starts by itself"],
    ["slop", "AI slop"],
    ["templateClone", "template clone"],
  ];
  for (const [key, label] of flags) {
    if (page.hard[key] === true) reasons.push(`Hard fail: ${label}.`);
  }
  return reasons;
}

function pairWins(pairs: readonly PairVote[], winner: "desk" | "aura"): boolean {
  const widths = new Set(pairs.map((pair) => pair.viewport));
  if (!widths.has("375") || !widths.has("1440")) return false;
  return pairs.every((pair) => pair.prefer === winner && pair.swappedPrefer === winner);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const a = [...left].sort().join("|");
  const b = [...right].sort().join("|");
  return a === b;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}
