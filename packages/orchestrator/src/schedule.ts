/**
 * Insert review steps into an ordered list of site prompts.
 *
 * Within each contiguous phase group, a review follows every third build
 * and the last build. A build that is both gets one review, not two.
 * Phase-end reviews are xhigh and carry phaseEnd. Other reviews are high.
 * The list never starts with a review. Nothing here is executed.
 *
 * v2 section 11.1 also mentions a global prompt index. This function follows
 * the per-phase cadence already used by generateSkeleton review flags.
 */

import { requestFlowTransition, type FlowFrom } from "./phase-lock.ts";

export { FLOW_TRANSITIONS, requestFlowTransition } from "./phase-lock.ts";

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleError";
  }
}

const ID_PATTERN = /^[a-z0-9-]+$/;

const SECRET_PATTERN =
  /(?:^|-)(?:sk|pk|rk|xai)-[a-z0-9-]{8,}|(?:secret|apikey|api-key|password|bearer|access-token)/;

interface PromptRef {
  id: string;
  phase: string;
}

function looksLikeSecret(value: string): boolean {
  return SECRET_PATTERN.test(value.toLowerCase());
}

function assertPrompt(value: unknown): PromptRef {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ScheduleError("Prompt must include an id and a phase.");
  }
  const record = value as Record<string, unknown>;
  const { id, phase } = record;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new ScheduleError("Id must match /^[a-z0-9-]+$/.");
  }
  if (looksLikeSecret(id)) {
    throw new ScheduleError("Id looks like a secret.");
  }
  if (id.startsWith("review-")) {
    throw new ScheduleError("Prompt id already starts with review-.");
  }
  if (typeof phase !== "string" || phase.length === 0) {
    throw new ScheduleError("Prompt phase is empty.");
  }
  if (looksLikeSecret(phase)) {
    throw new ScheduleError("Phase looks like a secret.");
  }
  return { id, phase };
}

export function insertReviews(
  prompts: Array<{ id: string; phase: string }>,
): Array<{
  id: string;
  kind: "build" | "review";
  phaseEnd?: boolean;
  effort?: "high" | "xhigh";
}> {
  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new ScheduleError("Schedule needs at least one prompt.");
  }
  const held = requestFlowTransition({ from: "build", to: "build" });
  if (!held.ok) {
    throw new ScheduleError(held.reason.length > 0 ? held.reason : "Finish the earlier step before moving on.");
  }

  const clean: PromptRef[] = [];
  const seen = new Set<string>();
  for (const prompt of prompts) {
    const item = assertPrompt(prompt);
    if (seen.has(item.id)) {
      throw new ScheduleError("Duplicate prompt id.");
    }
    seen.add(item.id);
    clean.push(item);
  }

  const items: Array<{
    id: string;
    kind: "build" | "review";
    phaseEnd?: boolean;
    effort?: "high" | "xhigh";
  }> = [];

  let start = 0;
  while (start < clean.length) {
    const head = clean[start];
    if (head === undefined) break;
    const phase = head.phase;
    let end = start + 1;
    while (end < clean.length) {
      const next = clean[end];
      if (next === undefined || next.phase !== phase) break;
      end += 1;
    }
    const count = end - start;
    for (let offset = 0; offset < count; offset += 1) {
      const prompt = clean[start + offset];
      if (prompt === undefined) {
        throw new ScheduleError("Prompt is missing.");
      }
      items.push({ id: prompt.id, kind: "build" });
      const nth = (offset + 1) % 3 === 0;
      const last = offset === count - 1;
      if (!nth && !last) continue;
      const reviewId = `review-after-${prompt.id}`;
      if (last) {
        items.push({
          id: reviewId,
          kind: "review",
          phaseEnd: true,
          effort: "xhigh",
        });
      } else {
        items.push({ id: reviewId, kind: "review", effort: "high" });
      }
    }
    start = end;
  }

  return items;
}

/**
 * Phase 4, the Improbability Drive.
 * Accepted Elevate picks come back here. One pick is one build prompt.
 * Reviews stay on the build cadence in `insertReviews`. An Elevate pick
 * does not grow a second review, because that would be a second commit.
 */
export const ELEVATE_DRIVE_PHASE = "improbability-drive";

/**
 * Schedule accepted Elevate picks for the Drive.
 * An empty list schedules nothing, so the caller can commit nothing.
 * The list never starts with a review, because every row is a build.
 */
export function scheduleElevatePicks(
  picks: readonly { id: string }[],
  from: FlowFrom = "elevate",
): Array<{ id: string; kind: "build"; effort: "xhigh" }> {
  const step = requestFlowTransition({ from, to: "build" });
  if (!step.ok) {
    throw new ScheduleError(step.reason.length > 0 ? step.reason : "Finish the brief before building.");
  }
  if (!Array.isArray(picks)) {
    throw new ScheduleError("Elevate picks must be a list.");
  }
  if (picks.length === 0) return [];

  const clean: Array<{ id: string; kind: "build"; effort: "xhigh" }> = [];
  const seen = new Set<string>();
  for (const pick of picks) {
    const id = typeof pick === "object" && pick !== null ? pick.id : "";
    const item = assertPrompt({ id, phase: ELEVATE_DRIVE_PHASE });
    if (seen.has(item.id)) {
      throw new ScheduleError("Duplicate prompt id.");
    }
    seen.add(item.id);
    clean.push({ id: item.id, kind: "build", effort: "xhigh" });
  }
  return clean;
}
