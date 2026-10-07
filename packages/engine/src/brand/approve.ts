/**
 * Per-section gate for BRAND.md.
 * Sections are purpose, voice, tokens, imagery, logo, and neighbors.
 * Status stays `Status: draft` until every section is true, then `Status: approved`.
 * Redo clears one section and forces draft. Approving logo does not look for an SVG.
 * That records acceptance of no logo yet.
 * The record is `.hitchhiker/brand-approval.json`, written under the state lock
 * by a temp rename. Nothing here compiles the brand or starts a later phase.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { replaceViaTemp, withStateLock } from "../lock.ts";

export const BRAND_SECTIONS: readonly ["purpose", "voice", "tokens", "imagery", "logo", "neighbors"] = [
  "purpose",
  "voice",
  "tokens",
  "imagery",
  "logo",
  "neighbors",
];

type Section = (typeof BRAND_SECTIONS)[number];

export class BrandApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrandApprovalError";
  }
}

const STATUS_LINE = /^Status: (?:draft|approved)$/m;

/**
 * Rewrite the status line compileBrand wrote.
 * All six sections true becomes `Status: approved`. Any miss becomes `Status: draft`.
 * A missing status line throws, so a hand edit cannot skip the gate.
 */
export function applyStatus(markdown: string, approvals: Record<string, boolean>): string {
  if (!STATUS_LINE.test(markdown)) {
    throw new BrandApprovalError("BRAND.md is missing a Status line.");
  }
  const line = allApproved(approvals) ? "Status: approved" : "Status: draft";
  return markdown.replace(/^Status: (?:draft|approved)$/gm, line);
}

/** Set one section true. Rewrites BRAND.md only from the approval file. */
export async function approveSection(
  projectDir: string,
  section: string,
): Promise<{ allApproved: boolean }> {
  const approved = await writeSection(projectDir, section, true);
  return { allApproved: approved };
}

/** Set one section false and force `Status: draft`. Does not delete BRAND.md. */
export async function redoSection(projectDir: string, section: string): Promise<void> {
  await writeSection(projectDir, section, false);
}

function allApproved(approvals: Record<string, boolean>): boolean {
  for (const section of BRAND_SECTIONS) {
    if (approvals[section] !== true) return false;
  }
  return true;
}

function isSection(value: string): value is Section {
  for (const section of BRAND_SECTIONS) {
    if (section === value) return true;
  }
  return false;
}

function assertSection(section: string): asserts section is Section {
  if (!isSection(section)) {
    throw new BrandApprovalError(`Unknown brand section: ${section}.`);
  }
}

function blank(): Record<Section, boolean> {
  return {
    purpose: false,
    voice: false,
    tokens: false,
    imagery: false,
    logo: false,
    neighbors: false,
  };
}

function approvalFile(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "brand-approval.json");
}

function brandFile(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "BRAND.md");
}

function withFlag(
  approvals: Record<Section, boolean>,
  section: Section,
  value: boolean,
): Record<Section, boolean> {
  const next: Record<Section, boolean> = { ...approvals };
  next[section] = value;
  return next;
}

function serialize(approvals: Record<Section, boolean>): string {
  const ordered: Record<string, boolean> = {};
  for (const section of BRAND_SECTIONS) {
    ordered[section] = approvals[section] === true;
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

async function writeSection(projectDir: string, section: string, value: boolean): Promise<boolean> {
  assertSection(section);
  return withStateLock(projectDir, async () => {
    const approvals = await readApprovals(approvalFile(projectDir));
    const markdown = await readBrand(brandFile(projectDir));
    const next = withFlag(approvals, section, value);
    const rewritten = applyStatus(markdown, next);
    await replaceViaTemp(approvalFile(projectDir), serialize(next));
    await replaceViaTemp(brandFile(projectDir), rewritten);
    return allApproved(next);
  });
}

async function readApprovals(file: string): Promise<Record<Section, boolean>> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return blank();
    throw error;
  }
  const text = raw.replace(/^\uFEFF/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new BrandApprovalError("brand-approval.json is not valid JSON.");
  }
  if (!isPlainObject(parsed)) {
    throw new BrandApprovalError("brand-approval.json is not an object.");
  }
  const next = blank();
  for (const section of BRAND_SECTIONS) {
    if (!Object.hasOwn(parsed, section)) continue;
    const value = parsed[section];
    if (typeof value !== "boolean") {
      throw new BrandApprovalError(`brand-approval.json ${section} is not a boolean.`);
    }
    next[section] = value;
  }
  return next;
}

async function readBrand(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") {
      throw new BrandApprovalError("BRAND.md is missing.");
    }
    throw error;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
