/**
 * Improbability Drive gate.
 * A missing file is null, and null is not a yes.
 * promptIdsHash is the sha256 hex of prompt ids joined by newlines.
 * Those ids come from generateSkeleton. Prompt 093 calls that generator
 * generateSitePrompts. This file does not rename it.
 * Q10 also requires a recorded yes and a file sha256 for PRD.md, CONTEXT.md,
 * and the prompt package. The interface block listed only count and
 * promptIdsHash. The goal requires the three file hashes, so they are required.
 * assertDriveAllowed returns void and throws. It does not return true, and it
 * does not start a build.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { SitePromptSkeleton } from "./site-prompts.ts";

export class DriveApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveApprovalError";
  }
}

export interface RecordedYes {
  approved: true;
  at: string;
  /** Lowercase sha256 hex of the approved file bytes. */
  sha256: string;
}

export interface DriveApproval {
  approved: true;
  at: string;
  count: number;
  promptIdsHash: string;
  prd: RecordedYes;
  context: RecordedYes;
  promptPackage: RecordedYes;
}

export interface DriveExpected {
  count: number;
  promptIdsHash: string;
  prdSha256: string;
  contextSha256: string;
  promptPackageSha256: string;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function driveApprovalPath(projectDir: string): string {
  if (typeof projectDir !== "string" || projectDir.trim() === "") {
    throw new DriveApprovalError("Project directory is missing.");
  }
  return path.join(projectDir, ".hitchhiker", "drive-approval.json");
}

/** Missing file returns null. Null is not a yes. Does not create the file. */
export function readDriveApproval(projectDir: string): unknown {
  const file = driveApprovalPath(projectDir);
  if (!existsSync(file)) return null;
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "read failed";
    throw new DriveApprovalError(`Could not read drive approval. ${message}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DriveApprovalError("drive-approval.json is not JSON.");
  }
}

/** sha256 hex of ids joined by "\n". A title is not an input. */
export function hashPromptIds(ids: readonly string[]): string {
  const lines: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string") {
      throw new DriveApprovalError("A prompt id must be a string.");
    }
    if (id.includes("\n") || id.includes("\r")) {
      throw new DriveApprovalError("A prompt id contains a newline.");
    }
    lines.push(id);
  }
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

/** Ids from a generateSkeleton package. Title changes do not change the hash. */
export function hashPromptIdsFromPackage(prompts: readonly Pick<SitePromptSkeleton, "id">[]): string {
  return hashPromptIds(prompts.map((prompt) => prompt.id));
}

/** sha256 hex of an approved file. Strings are hashed as UTF-8. */
export function hashApprovedFile(contents: string | Uint8Array): string {
  const hash = createHash("sha256");
  if (typeof contents === "string") hash.update(contents, "utf8");
  else if (contents instanceof Uint8Array) hash.update(contents);
  else throw new DriveApprovalError("A file hash needs a string or bytes.");
  return hash.digest("hex");
}

export function assertDriveAllowed(raw: unknown, expected: DriveExpected): void {
  if (raw === null || raw === undefined) {
    throw new DriveApprovalError("Missing drive approval. A missing file is not a yes.");
  }
  if (!isRecord(expected)) {
    throw new DriveApprovalError("Expected package is missing.");
  }
  if (!isRecord(raw)) {
    throw new DriveApprovalError("Drive approval must be an object.");
  }
  assertBooleanTrue(own(raw, "approved"), "Drive approval");
  assertAt(own(raw, "at"), "Drive approval");
  const count = assertPositiveCount(own(raw, "count"), "Drive approval");
  const expectedCount = assertPositiveCount(expected.count, "Expected package");
  if (count !== expectedCount) {
    throw new DriveApprovalError(
      `Drive approval count is ${count}, and the package has ${expectedCount}. They approved a different package.`,
    );
  }
  const promptIdsHash = assertHash(own(raw, "promptIdsHash"), "Drive approval promptIdsHash");
  const expectedHash = assertHash(expected.promptIdsHash, "Expected promptIdsHash");
  if (promptIdsHash !== expectedHash) {
    throw new DriveApprovalError(
      "Drive approval hash does not match the prompt ids. They approved a different package.",
    );
  }
  assertFileYes(own(raw, "prd"), "PRD.md", expected.prdSha256);
  assertFileYes(own(raw, "context"), "CONTEXT.md", expected.contextSha256);
  assertFileYes(own(raw, "promptPackage"), "Prompt package", expected.promptPackageSha256);
}

function assertFileYes(value: unknown, label: string, expectedHash: string): void {
  if (!isRecord(value)) {
    throw new DriveApprovalError(`${label} has no recorded yes.`);
  }
  assertBooleanTrue(own(value, "approved"), label);
  assertAt(own(value, "at"), label);
  const sha256 = assertHash(own(value, "sha256"), `${label} sha256`);
  const want = assertHash(expectedHash, `Expected ${label} sha256`);
  if (sha256 !== want) {
    throw new DriveApprovalError(`${label} hash does not match the approved file.`);
  }
}

function assertBooleanTrue(value: unknown, label: string): void {
  if (value === true) return;
  const kind = value === undefined ? "missing" : typeof value;
  throw new DriveApprovalError(`${label} requires boolean true. Received ${kind}.`);
}

function assertPositiveCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new DriveApprovalError(`${label} count must be an integer.`);
  }
  if (value <= 0) {
    throw new DriveApprovalError(`${label} count is ${value}. An empty package is not approved.`);
  }
  return value;
}

function assertHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    throw new DriveApprovalError(`${label} must be a lowercase sha256 hex string.`);
  }
  return value;
}

function assertAt(value: unknown, label: string): void {
  if (typeof value !== "string" || value.trim() === "" || value.trim() !== value) {
    throw new DriveApprovalError(`${label} is missing the time of the yes.`);
  }
  if (value.includes("\n") || value.includes("\r")) {
    throw new DriveApprovalError(`${label} time contains a newline.`);
  }
  if (Number.isNaN(Date.parse(value))) {
    throw new DriveApprovalError(`${label} time is not a date.`);
  }
}

function own(record: Record<string, unknown>, key: string): unknown {
  if (!Object.hasOwn(record, key)) return undefined;
  return record[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
