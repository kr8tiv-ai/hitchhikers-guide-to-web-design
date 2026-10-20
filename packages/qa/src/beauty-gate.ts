/**
 * Beauty gate (239a). Scores each section from stubbed or live vision,
 * fails the brand gate and the jury together, and queues one remediation
 * prompt per failing section. Three failed rounds stop the queue.
 *
 * Vision goes through zaphodReview at grok-4.7-build-fast and xhigh.
 * This module does not launch a browser or call a model by itself.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DESIGN_FILE_LINES, saveQueue, type QueueFile } from "@hitchhiker/engine";
import {
  AWWWARDS_USABILITY_FLOOR,
  AWWWARDS_WEIGHTS,
  awwwardsTotal,
  jury,
  type AwwwardsScores,
  type JuryInput,
} from "./jury.ts";
import { captureAll, REVIEW_WIDTHS } from "./screenshots.ts";
import {
  VISUAL_BAN_KEYS,
  VISUAL_BAN_REASONS,
  zaphodReviewSections,
  type VisualSectionScore,
} from "./zaphod-vision.ts";

export const BEAUTY_MIN = 8;
export const BEAUTY_MAX_ROUNDS = 3;
export { REVIEW_WIDTHS };

export interface SectionShot extends VisualSectionScore {
  screenshot: string;
}

export interface BeautyFailure {
  page: string;
  section: string;
  screenshot: string;
  reason: string;
}

export interface BeautyPrompt {
  id: string;
  title: string;
  body: string;
}

export interface BeautyRoundResult {
  queue: QueueFile;
  prompts: BeautyPrompt[];
  stopped: boolean;
  driveCopy: string;
  brand: "PASS" | "FAIL";
  jury: "PASS" | "FAIL";
}

export function failureReason(shot: SectionShot): string | null {
  if (shot.textOnly) return "Text only. No image, media, illustration, or effect is in view.";
  if (shot.todoImage || shot.placeholderImage) return "A TODO or placeholder image is in view.";
  const slop = shot.slop.trim();
  if (slop !== "") return `AI slop: ${slop}`;
  if (shot.score < BEAUTY_MIN) {
    const reason = shot.reason.trim();
    return reason !== "" ? reason : `Visual richness is ${shot.score} out of 10.`;
  }
  return null;
}

export interface AwwwardsSubscore {
  id: "design" | "usability" | "creativity" | "content";
  score: number;
  weight: number;
  points: number;
}

export interface AwwwardsRubricReport {
  pass: boolean;
  enforced: boolean;
  reasons: string[];
  total: number;
  flatAverage: number;
  subscores: readonly [AwwwardsSubscore, AwwwardsSubscore, AwwwardsSubscore, AwwwardsSubscore];
}

export interface BeautyJudgement {
  pass: boolean;
  failures: BeautyFailure[];
  rubric: AwwwardsRubricReport;
}

const RUBRIC_FIELDS = ["design", "usability", "creativity", "content"] as const;

function readRubricScore(name: string, value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error(`${name} is ${String(value)}. Expected a score from 0 to 10.`);
  }
  return value;
}

function derivedRubric(shots: readonly SectionShot[]): AwwwardsScores {
  let design = 10;
  for (const shot of shots) {
    if (shot.score < design) design = shot.score;
  }
  return { design, usability: 10, creativity: 10, content: 10 };
}

function scoreRubric(scores: AwwwardsScores, enforced: boolean): AwwwardsRubricReport {
  const design = readRubricScore("design", scores.design);
  const usability = readRubricScore("usability", scores.usability);
  const creativity = readRubricScore("creativity", scores.creativity);
  const content = readRubricScore("content", scores.content);
  const read = { design, usability, creativity, content };
  const total = awwwardsTotal(read);
  const flatAverage = (design + usability + creativity + content) / RUBRIC_FIELDS.length;
  const subscores = [
    { id: "design", score: design, weight: AWWWARDS_WEIGHTS.design, points: (design * AWWWARDS_WEIGHTS.design) / 10 },
    {
      id: "usability",
      score: usability,
      weight: AWWWARDS_WEIGHTS.usability,
      points: (usability * AWWWARDS_WEIGHTS.usability) / 10,
    },
    {
      id: "creativity",
      score: creativity,
      weight: AWWWARDS_WEIGHTS.creativity,
      points: (creativity * AWWWARDS_WEIGHTS.creativity) / 10,
    },
    {
      id: "content",
      score: content,
      weight: AWWWARDS_WEIGHTS.content,
      points: (content * AWWWARDS_WEIGHTS.content) / 10,
    },
  ] as const;
  const reasons: string[] = [];
  if (enforced && usability < AWWWARDS_USABILITY_FLOOR) {
    reasons.push(
      `Usability is ${usability} out of 10. The floor is ${AWWWARDS_USABILITY_FLOOR}. Usability is ${AWWWARDS_WEIGHTS.usability} of 100.`,
    );
  }
  if (enforced && total < 70) {
    reasons.push(
      `The weighted total is ${total} out of 100. The floor is 70. Weights are design ${AWWWARDS_WEIGHTS.design}, usability ${AWWWARDS_WEIGHTS.usability}, creativity ${AWWWARDS_WEIGHTS.creativity}, and content ${AWWWARDS_WEIGHTS.content}.`,
    );
  }
  return { pass: reasons.length === 0, enforced, reasons, total, flatAverage, subscores };
}

function rubricFailure(shots: readonly SectionShot[], reason: string): BeautyFailure {
  const shot = shots[0];
  if (shot !== undefined) {
    return {
      page: shot.page.trim() || "site",
      section: shot.section.trim() || "rubric",
      screenshot: relativeShot(shot.screenshot),
      reason,
    };
  }
  return {
    page: "site",
    section: "rubric",
    screenshot: ".hitchhiker/review/site-rubric.txt",
    reason,
  };
}

export function judgeBeauty(shots: readonly SectionShot[], rubric?: AwwwardsScores): BeautyJudgement {
  const failures: BeautyFailure[] = [];
  for (const shot of shots) {
    if (!Number.isFinite(shot.score) || shot.score < 0 || shot.score > 10) {
      throw new Error(`Visual richness for ${shot.section} must be from 0 to 10.`);
    }
    const reasons: string[] = [];
    const reason = failureReason(shot);
    if (reason !== null) reasons.push(reason);
    for (const key of VISUAL_BAN_KEYS) {
      if (shot[key] === true) reasons.push(VISUAL_BAN_REASONS[key]);
    }
    for (const item of reasons) {
      failures.push({
        page: shot.page.trim(),
        section: shot.section.trim(),
        screenshot: relativeShot(shot.screenshot),
        reason: item,
      });
    }
  }
  const enforced = rubric !== undefined;
  const scored = scoreRubric(enforced ? rubric : derivedRubric(shots), enforced);
  if (enforced) {
    for (const reason of scored.reasons) failures.push(rubricFailure(shots, reason));
  }
  return { pass: failures.length === 0, failures, rubric: scored };
}

export interface RankedBeautyIssue extends BeautyFailure {
  id: string;
  score: number;
}

/** Worst score first. One issue per page and section. The first reason is kept. */
export function rankBeautyIssues(shots: readonly SectionShot[]): { pass: boolean; issues: RankedBeautyIssue[] } {
  const judged = judgeBeauty(shots);
  const worst = new Map<string, number>();
  for (const shot of shots) {
    const id = `${shot.page.trim()}::${shot.section.trim()}`;
    const prev = worst.get(id);
    if (prev === undefined || shot.score < prev) worst.set(id, shot.score);
  }
  const seen = new Set<string>();
  const issues: RankedBeautyIssue[] = [];
  for (const failure of judged.failures) {
    const id = `${failure.page}::${failure.section}`;
    if (seen.has(id)) continue;
    seen.add(id);
    issues.push({
      id,
      page: failure.page,
      section: failure.section,
      screenshot: failure.screenshot,
      reason: failure.reason,
      score: worst.get(id) ?? 10,
    });
  }
  issues.sort((left, right) => left.score - right.score || left.id.localeCompare(right.id));
  return { pass: judged.pass, issues };
}

/** A section failure blocks the jury even when the weighted total would pass. */
export function juryWithBeauty(
  scores: Omit<JuryInput, "blocked">,
  failures: readonly BeautyFailure[],
): { total: number; status: "PASS" | "FAIL" } {
  return jury({ ...scores, blocked: failures.length > 0 });
}

export async function captureSitePages(
  pages: readonly string[],
  openPage: (page: string, width: number) => Promise<Buffer>,
): Promise<Array<{ page: string; width: number }>> {
  const seen: Array<{ page: string; width: number }> = [];
  for (const page of pages) {
    await captureAll(async (width) => {
      seen.push({ page, width });
      return openPage(page, width);
    });
  }
  return seen;
}

export function applyBeautyRound(input: {
  queue: QueueFile;
  gateIds: readonly string[];
  round: number;
  failures: readonly BeautyFailure[];
  artDirection: string;
  designLanguage: string;
  now: string;
}): BeautyRoundResult {
  if (!Number.isInteger(input.round) || input.round < 1) {
    throw new Error("Beauty round must be 1, 2, or 3.");
  }
  const queue = cloneQueue(input.queue);
  if (input.failures.length === 0) {
    return { queue, prompts: [], stopped: false, driveCopy: "", brand: "PASS", jury: "PASS" };
  }
  if (input.round >= BEAUTY_MAX_ROUNDS) {
    const gates = new Set(input.gateIds);
    for (const item of queue.items) {
      if (gates.has(item.id)) item.status = "failed";
      else if (item.status === "queued") item.status = "paused";
    }
    let after = "";
    for (const item of queue.items) {
      if (item.status === "passed" || item.status === "failed") after = item.id;
    }
    queue.pause = { at: input.now, after };
    return {
      queue,
      prompts: [],
      stopped: true,
      driveCopy: driveFailed(input.failures),
      brand: "FAIL",
      jury: "FAIL",
    };
  }

  const gates = new Set(input.gateIds);
  const firstGate = queue.items.findIndex((item) => gates.has(item.id));
  const keptGates = queue.items.filter((item) => gates.has(item.id)).map((item) => ({ ...item, status: "queued" as const }));
  const before = firstGate < 0 ? queue.items.filter((item) => !gates.has(item.id)) : queue.items.slice(0, firstGate);
  const after = firstGate < 0 ? [] : queue.items.slice(firstGate).filter((item) => !gates.has(item.id));
  let next = highestId(queue.items);
  const prompts: BeautyPrompt[] = [];
  const added = [];
  for (const failure of input.failures) {
    next += 1;
    if (next > 999) throw new Error("No prompt id is left.");
    const id = String(next).padStart(3, "0");
    const title = `Remediate the ${failure.section} section on ${failure.page}.`;
    prompts.push({ id, title, body: remediationBody(id, title, failure, input.artDirection, input.designLanguage) });
    added.push({ id, kind: "build" as const, status: "queued" as const });
  }
  queue.items = [...before, ...added, ...keptGates, ...after];
  return { queue, prompts, stopped: false, driveCopy: "", brand: "FAIL", jury: "FAIL" };
}

export async function writeBeautyRound(projectDir: string, result: BeautyRoundResult): Promise<void> {
  const dir = path.join(projectDir, ".hitchhiker", "prompts");
  await mkdir(dir, { recursive: true });
  for (const prompt of result.prompts) {
    await writeFile(path.join(dir, `${prompt.id}.md`), prompt.body, "utf8");
  }
  if (result.stopped) {
    await writeFile(path.join(projectDir, ".hitchhiker", "beauty.md"), `${result.driveCopy}\n`, "utf8");
  }
  await saveQueue(projectDir, result.queue);
}

export async function scoreSections(
  sections: readonly { page: string; section: string; screenshot: string }[],
  shots: readonly string[],
  think: Parameters<typeof zaphodReviewSections>[1]["think"],
): Promise<SectionShot[]> {
  const scored = await zaphodReviewSections(
    { sections: sections.map((row) => ({ page: row.page, section: row.section })), shots },
    { think },
  );
  return sections.map((row, index) => {
    const found = scored.find((item) => item.page === row.page && item.section === row.section) ?? scored[index];
    if (found === undefined) throw new Error(`No score for ${row.section}.`);
    return { ...found, screenshot: relativeShot(row.screenshot) };
  });
}

function remediationBody(
  id: string,
  title: string,
  failure: BeautyFailure,
  artDirection: string,
  designLanguage: string,
): string {
  const requirement = `REQ-BEAUTY-FIX-${slug(failure.page)}-${slug(failure.section)}`;
  return [
    "---",
    `id: ${id}`,
    `title: ${title}`,
    "model: grok-4.7-build-fast",
    "effort: xhigh",
    "---",
    "",
    `# ${title}`,
    "",
    "## Task",
    "",
    `Art-direct and rebuild the ${failure.section} section on ${failure.page}.`,
    "",
    "## Art direction",
    "",
    artDirection.trim(),
    "",
    "## Screenshot",
    "",
    failure.screenshot,
    "",
    "## Reason",
    "",
    failure.reason,
    "",
    "## Design language",
    "",
    designLanguage.trim(),
    "",
    "## Design files",
    "",
    ...DESIGN_FILE_LINES,
    "",
    `Requirements: ${requirement}`,
    "",
  ].join("\n");
}

function driveFailed(failures: readonly BeautyFailure[]): string {
  const lines = ["Failed. The beauty gate stopped after three rounds.", ""];
  for (const failure of failures) {
    lines.push(`${failure.page} ${failure.section}: ${failure.reason}`);
  }
  lines.push("", "The queue is stopped for a human.");
  return lines.join("\n");
}

function relativeShot(file: string): string {
  const trimmed = file.trim().replace(/\\/g, "/");
  if (trimmed === "" || trimmed.startsWith("/") || trimmed.startsWith("../") || /^[A-Za-z]:/.test(trimmed)) {
    throw new Error("Screenshot path must stay inside the project.");
  }
  return trimmed;
}

function slug(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned === "" ? "section" : cleaned;
}

function highestId(items: readonly { id: string }[]): number {
  let max = 0;
  for (const item of items) {
    if (/^\d{3}$/.test(item.id)) max = Math.max(max, Number(item.id));
  }
  return max;
}

function cloneQueue(queue: QueueFile): QueueFile {
  const copy: QueueFile = {
    items: queue.items.map((item) => ({ id: item.id, kind: item.kind, status: item.status })),
  };
  if (queue.pause !== undefined) copy.pause = { at: queue.pause.at, after: queue.pause.after };
  return copy;
}
