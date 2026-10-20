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
import { jury, type JuryInput } from "./jury.ts";
import { captureAll, REVIEW_WIDTHS } from "./screenshots.ts";
import { zaphodReviewSections, type VisualSectionScore } from "./zaphod-vision.ts";

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

export function judgeBeauty(shots: readonly SectionShot[]): { pass: boolean; failures: BeautyFailure[] } {
  const failures: BeautyFailure[] = [];
  for (const shot of shots) {
    if (!Number.isFinite(shot.score) || shot.score < 0 || shot.score > 10) {
      throw new Error(`Visual richness for ${shot.section} must be from 0 to 10.`);
    }
    const reason = failureReason(shot);
    if (reason === null) continue;
    failures.push({
      page: shot.page.trim(),
      section: shot.section.trim(),
      screenshot: relativeShot(shot.screenshot),
      reason,
    });
  }
  return { pass: failures.length === 0, failures };
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
