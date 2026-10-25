/**
 * Secrets stay out of the project file.
 * The id pattern matches SECRET_PATTERN in packages/orchestrator/src/progress.ts.
 * Free text is scanned for token shapes, bearer tokens, credential assignments,
 * and userinfo in URLs. Allow-listed settings keys are copied before this pass.
 * Path fields (sourceDir, snapshot path) and exact keep strings are copied
 * byte-exact. A token needs a boundary before its prefix, so desk-, task-,
 * and kiosk- stay words. A real token in other text still redacts, including
 * one that sits in an unquoted path. A quoted Windows path is left whole.
 */

import { isRecord } from "./schema.ts";

/** Same shape as the orchestrator queue id check, applied to lowercased text. */
export const SECRET_PATTERN =
  /(?<![a-z0-9])(?:sk|pk|rk|xai)-[a-z0-9-]{8,}|(?:secret|apikey|api-key|password|bearer|access-token)/;

const SECRET_KEY =
  /(?:^|[._-])(?:secrets?|apikey|api[-_]?key|passwords?|passwd|tokens?|cookies?|authorization|bearer|credentials?|access[-_]?token)(?:$|[._-])|\.env$/i;

const TOKEN = /(?<![A-Za-z0-9])(?:sk|pk|rk|xai)-[A-Za-z0-9_-]{8,}/gi;
const QUOTED_WIN_PATH = /"(?:[A-Za-z]:[\\/]|\\\\)[^"]*"/g;
const PATH_FIELDS = new Set(["sourceDir", "path"]);
const BEARER = /bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const ENV_ASSIGN =
  /[A-Za-z_][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|COOKIE)[A-Za-z0-9_]*=[^\s"'\\]+/g;
const URL_USERINFO = /\/\/[^/\s:@]+:[^/\s@]+@/g;
const JSON_PAIR =
  /"((?:[^"\\]|\\.)*)"\s*:\s*("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/g;

export const SETTINGS_KEYS = [
  "model",
  "effort",
  "interviewDepth",
  "voiceEngine",
  "sessionIdMode",
  "deployTarget",
  "worktrees",
  "imagineBudgetUsd",
  "tokenBudget",
  "gates",
  "ai",
  "integrations",
  "toolInstalls",
  "tourSeen",
] as const;

const INSTALL_KEYS = ["tool", "version", "installPath", "installedAt", "recipeId", "source"] as const;

const GATE_KEYS = [
  "phonePerfMin",
  "a11yMin",
  "bestPracticesMin",
  "seoMin",
  "desktopFpsMin",
] as const;

const AI_KEYS = ["model", "effort", "timeoutMs"] as const;

export function secretKey(name: string): boolean {
  return SECRET_KEY.test(name) || SECRET_PATTERN.test(name.toLowerCase());
}

export function scrubText(value: string, keep: readonly string[] = []): string {
  const masks: string[] = [];
  const hold = (text: string): string => {
    const token = `\u0000P${masks.length}\u0000`;
    masks.push(text);
    return token;
  };
  let shielded = value;
  const exact = [...keep].filter((item) => item.length > 0).sort((left, right) => right.length - left.length);
  for (const item of exact) {
    if (!shielded.includes(item)) continue;
    shielded = shielded.split(item).join(hold(item));
  }
  shielded = shielded.replace(QUOTED_WIN_PATH, (span) => hold(span));
  const replaced = shielded
    .replace(TOKEN, "[redacted]")
    .replace(BEARER, "Bearer [redacted]")
    .replace(ENV_ASSIGN, "[redacted]")
    .replace(URL_USERINFO, "//[redacted]@")
    .replace(JSON_PAIR, (full, key: string) => {
      if (!secretKey(key)) return full;
      return `"${key}": "[redacted]"`;
    });
  return replaced.replace(/\u0000P(\d+)\u0000/g, (full, index: string) => masks[Number(index)] ?? full);
}

export function scrubValue(value: unknown, keep: readonly string[] = []): unknown {
  if (typeof value === "string") return scrubText(value, keep);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, keep));
  if (!isRecord(value)) return null;
  const nextKeep = keepPaths(value, keep);
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (secretKey(key)) continue;
    if (PATH_FIELDS.has(key) && typeof item === "string") {
      next[key] = item;
      continue;
    }
    next[key] = scrubValue(item, nextKeep);
  }
  return next;
}

function keepPaths(record: Record<string, unknown>, keep: readonly string[]): readonly string[] {
  if (typeof record.sourceDir !== "string" || record.sourceDir.length === 0) return keep;
  return [...keep, record.sourceDir];
}

function copyAllow(record: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const key of keys) {
    if (!Object.hasOwn(record, key)) continue;
    if (secretKey(key)) continue;
    next[key] = record[key];
  }
  return next;
}

/** Keep the settings allow-list. Drop every other key, then scrub values. */
export function allowSettings(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const picked = copyAllow(value, SETTINGS_KEYS);
  if (isRecord(picked.gates)) picked.gates = copyAllow(picked.gates, GATE_KEYS);
  else delete picked.gates;
  if (isRecord(picked.ai)) {
    const ai = copyAllow(picked.ai, AI_KEYS);
    if (isRecord(ai.effort)) ai.effort = scrubValue(ai.effort);
    picked.ai = ai;
  } else {
    delete picked.ai;
  }
  if (isRecord(picked.integrations)) {
    const flag = picked.integrations.pinterestCapture;
    picked.integrations = typeof flag === "boolean" ? { pinterestCapture: flag } : {};
  } else {
    delete picked.integrations;
  }
  if (Array.isArray(picked.toolInstalls)) {
    const next: Record<string, unknown>[] = [];
    for (const item of picked.toolInstalls) {
      if (!isRecord(item)) continue;
      next.push(copyAllow(item, INSTALL_KEYS));
    }
    picked.toolInstalls = next;
  } else {
    delete picked.toolInstalls;
  }
  const scrubbed = scrubValue(picked);
  return isRecord(scrubbed) ? scrubbed : {};
}
