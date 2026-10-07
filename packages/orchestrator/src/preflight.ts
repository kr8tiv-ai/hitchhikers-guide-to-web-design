/**
 * Checks before the first drive prompt.
 *
 * preflight does not start the queue, spawn git, open a server, push,
 * or delete a baselines directory. Status is porcelain the caller already
 * collected. backup is backupBranchName(date). This module does not create
 * that ref, and its messages do not claim a branch was created.
 *
 * ok is false when approved is not true, when porcelain lists a secret
 * path, when a tracked or untracked file entry is present, when
 * serverProbe returns false, or when serverRequired is true and no probe
 * was passed. Empty porcelain and a branch header such as `## main`
 * (including ahead or behind) are clean. Ignored entries are not a dirty
 * tree. A missing probe adds `dev server not checked` and can still be ok.
 *
 * Secret paths are the same set as assertNoSecrets: .env files, pem
 * files, credentials.json, and .hitchhiker/config.json. Matching is a
 * path segment, not a substring, so notenv is not a secret.
 *
 * The interface block omitted projectRoot, mkdir, and serverRequired.
 * The goal asks for a baselines directory and for a required server to
 * fail closed, so those fields are optional. mkdir receives
 * projectRoot/baselines and is never used to remove it.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { GitFlowError, assertNoSecrets, backupBranchName } from "./git-flow.ts";

export class PreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreflightError";
  }
}

const NOT_APPROVED = "Drive is not approved.";
const DIRTY = "Working tree is not clean.";
const SECRET = "Git status lists a secret path.";
const SERVER_DOWN = "dev server down";
const SERVER_UNCHECKED = "dev server not checked";
const SERVER_REQUIRED = "Dev server is required.";
const BASELINES_FAILED = "Baselines directory was not created.";
const PROJECT_MISSING = "Project directory is missing.";

const STATUS_CHARS = " MTADRCU?!";

export interface PreflightInput {
  approved: boolean;
  statusPorcelain: string;
  date: string;
  serverProbe?: () => boolean;
  /** Present when baselines/ should be ensured under the project. */
  projectRoot?: string;
  /** Injected directory create. Must not delete. */
  mkdir?: (dir: string) => void;
  /** When true, a missing probe is a failure instead of a warning. */
  serverRequired?: boolean;
}

export interface PreflightResult {
  ok: boolean;
  warnings: string[];
  backup: string;
  reasons: string[];
}

export function preflight(input: PreflightInput): PreflightResult {
  assertInput(input);
  const backup = backupBranchName(input.date);
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (input.approved !== true) reasons.push(NOT_APPROVED);

  const scan = scanPorcelain(input.statusPorcelain);
  if (scan.dirty) reasons.push(DIRTY);
  if (scan.secret) reasons.push(SECRET);

  noteServer(input, reasons, warnings);

  if (input.projectRoot !== undefined) {
    ensureBaselines(input.projectRoot, input.mkdir, reasons);
  }

  return {
    ok: reasons.length === 0,
    warnings,
    backup,
    reasons,
  };
}

function assertInput(input: PreflightInput): void {
  if (typeof input !== "object" || input === null) {
    throw new PreflightError("preflight input must be an object.");
  }
  if (typeof input.statusPorcelain !== "string") {
    throw new PreflightError("statusPorcelain must be a string.");
  }
  if (typeof input.date !== "string") {
    throw new PreflightError("date must be a string.");
  }
  if (input.serverProbe !== undefined && typeof input.serverProbe !== "function") {
    throw new PreflightError("serverProbe must be a function.");
  }
  if (input.projectRoot !== undefined && typeof input.projectRoot !== "string") {
    throw new PreflightError("projectRoot must be a string.");
  }
  if (input.mkdir !== undefined && typeof input.mkdir !== "function") {
    throw new PreflightError("mkdir must be a function.");
  }
  if (input.serverRequired !== undefined && typeof input.serverRequired !== "boolean") {
    throw new PreflightError("serverRequired must be a boolean.");
  }
}

function noteServer(input: PreflightInput, reasons: string[], warnings: string[]): void {
  if (input.serverProbe === undefined) {
    if (input.serverRequired === true) reasons.push(SERVER_REQUIRED);
    else warnings.push(SERVER_UNCHECKED);
    return;
  }
  if (input.serverProbe() !== true) reasons.push(SERVER_DOWN);
}

function ensureBaselines(
  projectRoot: string,
  mkdir: ((dir: string) => void) | undefined,
  reasons: string[],
): void {
  if (projectRoot.trim() === "") {
    reasons.push(PROJECT_MISSING);
    return;
  }
  const dir = path.join(projectRoot, "baselines");
  try {
    if (mkdir !== undefined) mkdir(dir);
    else mkdirSync(dir, { recursive: true });
  } catch {
    reasons.push(BASELINES_FAILED);
  }
}

interface PorcelainScan {
  dirty: boolean;
  secret: boolean;
}

function scanPorcelain(porcelain: string): PorcelainScan {
  const candidates: string[] = [];
  let dirty = false;
  for (const line of recordsOf(porcelain)) {
    if (line === "") continue;
    candidates.push(...pathTokens(line));
    if (isDirtyLine(line)) dirty = true;
  }
  return { dirty, secret: listsSecret(candidates) };
}

function recordsOf(porcelain: string): string[] {
  const parts = porcelain.includes("\0") ? porcelain.split("\0") : porcelain.split("\n");
  const lines: string[] = [];
  for (const part of parts) {
    lines.push(part.endsWith("\r") ? part.slice(0, -1) : part);
  }
  return lines;
}

function isHeader(line: string): boolean {
  return line.startsWith("##") || line.startsWith("# ");
}

function isDirtyLine(line: string): boolean {
  if (isHeader(line)) return false;
  const kind = v1Kind(line);
  if (kind === "ignored") return false;
  if (kind === "dirty") return true;
  if (line.startsWith("? ")) return true;
  if (line.startsWith("! ")) return false;
  return /^[12u] /.test(line);
}

function v1Kind(line: string): "dirty" | "ignored" | null {
  if (line.length < 3) return null;
  const x = line[0];
  const y = line[1];
  const gap = line[2];
  if (x === undefined || y === undefined || gap !== " ") return null;
  if (!STATUS_CHARS.includes(x) || !STATUS_CHARS.includes(y)) return null;
  if (x === " " && y === " ") return null;
  if (`${x}${y}` === "!!") return "ignored";
  return "dirty";
}

function pathTokens(text: string): string[] {
  const normalized = text.replaceAll("\\", "/").replaceAll('"', " ");
  const tokens: string[] = [];
  for (const part of normalized.split(/\s+/)) {
    if (part === "" || part === "->" || part === "=>") continue;
    tokens.push(part);
  }
  return tokens;
}

function listsSecret(paths: readonly string[]): boolean {
  if (paths.length === 0) return false;
  try {
    assertNoSecrets(paths.slice());
    return false;
  } catch (error) {
    if (error instanceof GitFlowError) return true;
    throw error;
  }
}
