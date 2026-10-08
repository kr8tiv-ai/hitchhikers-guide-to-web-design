/**
 * Forty-Two once-over, placed on the drive queue before Mostly Harmless.
 *
 * queue.json accepts id, kind, and status only. Phase stays on the
 * in-memory entry. The prompt file is effort xhigh. runGates composes the
 * phone tools and fails closed when any of them throws.
 *
 * Appetite is 5. runGates has no appetite argument, and 5 is the mid
 * page-weight band from prompt 124.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { replaceViaTemp, withStateLock } from "@hitchhiker/engine";
import { runAxe, type AxeResult } from "./axe-run.ts";
import { runConsoleGate } from "./console-gate.ts";
import { runLhci, type LhResult } from "./lhci-run.ts";
import { checkLinks, type LinkResult } from "./link-check.ts";
import { budgetBytes, evaluatePage } from "./weight-gate.ts";

export const ONCE_OVER_ID = "forty-two-once-over";

export const ONCE_OVER_PROMPT = `---
id: forty-two-once-over
kind: once-over
effort: xhigh
tier: Forty-Two
phase: improbability-drive
---

Read PRD.md, CONTEXT.md, the summaries, and the reviews.
Look for drift, dead code, token mismatches, missed requirements, and protected-path edits.
Write the fix list as prompts. Do not start Mostly Harmless in this pass.
`;

const PAGE_APPETITE = 5;
const ID_PATTERN = /^[a-z0-9-]+$/;

export type OnceStatus = "queued" | "running" | "passed" | "fixing" | "escalated" | "paused";

export interface QueueEntry {
  id: string;
  kind: "build" | "review";
  status: OnceStatus;
  phase?: string;
}

export interface WeightResult {
  status: "PASS" | "BLOCKER";
  reasons: string[];
  bytes: number;
  budget: number;
}

function isStatus(value: string): value is OnceStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "passed" ||
    value === "fixing" ||
    value === "escalated" ||
    value === "paused"
  );
}

export function insertOnceOver(items: readonly QueueEntry[]): QueueEntry[] {
  const copy = items.map((item) => ({ ...item }));
  if (copy.some((item) => item.id === ONCE_OVER_ID)) return copy;
  const entry: QueueEntry = {
    id: ONCE_OVER_ID,
    kind: "review",
    status: "queued",
    phase: "improbability-drive",
  };
  const index = copy.findIndex((item) => item.phase === "mostly-harmless");
  if (index < 0) copy.push(entry);
  else copy.splice(index, 0, entry);
  return copy;
}

function diskItem(item: QueueEntry): { id: string; kind: "build" | "review"; status: OnceStatus } {
  if (!ID_PATTERN.test(item.id)) throw new Error("Id must match /^[a-z0-9-]+$/.");
  if (item.kind !== "build" && item.kind !== "review") throw new Error("Queue kind must be build or review.");
  if (!isStatus(item.status)) throw new Error("Queue status is not a known value.");
  return { id: item.id, kind: item.kind, status: item.status };
}

export async function writeOnceOver(
  projectDir: string,
  items: readonly QueueEntry[],
): Promise<QueueEntry[]> {
  const next = insertOnceOver(items);
  const body = `${JSON.stringify({ items: next.map(diskItem) }, null, 2)}\n`;
  await withStateLock(projectDir, async () => {
    await mkdir(path.join(projectDir, ".hitchhiker", "prompts"), { recursive: true });
    await writeFile(
      path.join(projectDir, ".hitchhiker", "prompts", `${ONCE_OVER_ID}.md`),
      ONCE_OVER_PROMPT,
      "utf8",
    );
    await replaceViaTemp(path.join(projectDir, ".hitchhiker", "queue.json"), body);
  });
  return next;
}

function failedLh(routes: string[], error: unknown): LhResult[] {
  const message = error instanceof Error ? error.message : "Lighthouse crashed.";
  const list = routes.length > 0 ? routes : ["/"];
  return list.map((route) => ({
    route,
    status: "BLOCKER" as const,
    reasons: [`Lighthouse failed closed. ${message}`],
    scores: null,
    runs: 0,
  }));
}

function failedAxe(error: unknown): AxeResult {
  const message = error instanceof Error ? error.message : "Axe crashed.";
  return {
    status: "BLOCKER",
    violations: [],
    notes: [`Axe failed closed. ${message}`],
    keyboard: false,
    reducedMotion: false,
    contrastRatio: 0,
  };
}

function failedLinks(url: string, error: unknown): LinkResult {
  const message = error instanceof Error ? error.message : "Link check crashed.";
  return {
    broken: [url],
    bytes: 0,
    pages: [{ url, title: "", h1Count: 0, textLength: 0, brokenLinks: [message], bytes: 0 }],
    pass: false,
  };
}

function weigh(links: LinkResult): WeightResult {
  const budget = budgetBytes(PAGE_APPETITE);
  if (links.pages.length === 0) {
    return {
      status: "BLOCKER",
      reasons: ["No page was measured. The weight gate fails closed."],
      bytes: 0,
      budget,
    };
  }
  const reasons: string[] = [];
  let bytes = 0;
  let blocked = false;
  for (const page of links.pages) {
    if (page.bytes > bytes) bytes = page.bytes;
    try {
      const judged = evaluatePage({
        title: page.title,
        h1Count: page.h1Count,
        textLength: page.textLength,
        brokenLinks: page.brokenLinks,
        bytes: page.bytes,
        appetite: PAGE_APPETITE,
      });
      if (judged.status !== "PASS") {
        blocked = true;
        for (const reason of judged.reasons) reasons.push(`${page.url} ${reason}`);
      }
    } catch (error) {
      blocked = true;
      reasons.push(error instanceof Error ? error.message : "Weight gate failed closed.");
    }
  }
  return { status: blocked ? "BLOCKER" : "PASS", reasons, bytes, budget };
}

export async function runGates(
  url: string,
  routes: string[],
): Promise<{
  lighthouse: LhResult[];
  axe: AxeResult;
  console: { errors: number; failedRequests: number };
  links: LinkResult;
  weight: WeightResult;
  pass: boolean;
}> {
  const lighthouse = await runLhci(url, routes).catch((error: unknown) => failedLh(routes, error));
  const axe = await runAxe(url).catch((error: unknown) => failedAxe(error));
  const consoleGate = await runConsoleGate(url).catch(() => ({
    errors: 1,
    failedRequests: 1,
    pass: false,
  }));
  const links = await checkLinks(url, routes).catch((error: unknown) => failedLinks(url, error));
  const weight = weigh(links);
  const lighthousePass = lighthouse.length > 0 && lighthouse.every((row) => row.status === "PASS" && row.scores !== null);
  const pass =
    lighthousePass &&
    axe.status === "PASS" &&
    consoleGate.errors === 0 &&
    consoleGate.failedRequests === 0 &&
    links.pass &&
    weight.status === "PASS";
  return {
    lighthouse,
    axe,
    console: { errors: consoleGate.errors, failedRequests: consoleGate.failedRequests },
    links,
    weight,
    pass,
  };
}
