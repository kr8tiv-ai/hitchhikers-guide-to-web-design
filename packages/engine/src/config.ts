import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { replaceViaTemp, withStateLock } from "./lock.ts";

export type Effort = "medium" | "high" | "xhigh";
export type InterviewDepth = "express" | "standard" | "deep";
export type VoiceEngine = "local" | "xai";
export type SessionIdMode = "unknown" | "uuid" | "alias";
export type DeployTarget =
  | "hostinger"
  | "vercel"
  | "netlify"
  | "cloudflare"
  | "undecided";

export interface GuideConfig {
  model: string;
  effort: Effort;
  interviewDepth: InterviewDepth;
  voiceEngine: VoiceEngine;
  sessionIdMode: SessionIdMode;
  deployTarget: DeployTarget;
  worktrees: boolean;
  imagineBudgetUsd: number;
  tokenBudget: number;
  gates: {
    phonePerfMin: number;
    a11yMin: number;
    bestPracticesMin: number;
    seoMin: number;
    desktopFpsMin: number;
  };
}

/**
 * Imagine spend cap in USD. 0 means DIY until the user raises it.
 * A later settings prompt may raise this only by editing the constant and its test.
 * This is a cap, not a price.
 */
export const IMAGINE_BUDGET_USD_MAX = 1000;

/**
 * Per-request token cap. v2 stays under 200k so the long-context rate does not apply.
 * This is a cap, not a price.
 */
export const TOKEN_BUDGET_MAX = 200_000;

const EFFORTS = ["medium", "high", "xhigh"] as const;
const INTERVIEW_DEPTHS = ["express", "standard", "deep"] as const;
const VOICE_ENGINES = ["local", "xai"] as const;
const SESSION_ID_MODES = ["unknown", "uuid", "alias"] as const;
const DEPLOY_TARGETS = [
  "hostinger",
  "vercel",
  "netlify",
  "cloudflare",
  "undecided",
] as const;

const TOP_KEYS = [
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
] as const;

const GATE_KEYS = [
  "phonePerfMin",
  "a11yMin",
  "bestPracticesMin",
  "seoMin",
  "desktopFpsMin",
] as const;

const LIGHTHOUSE_MIN = 0;
const LIGHTHOUSE_MAX = 100;
const DESKTOP_FPS_MIN = 1;
const DESKTOP_FPS_MAX = 120;

export class ConfigError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "ConfigError";
    this.field = field;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(field: string, detail: string): never {
  throw new ConfigError(field, `${field}: ${detail}`);
}

function rejectUnknown(
  record: Record<string, unknown>,
  allowed: readonly string[],
  prefix: string,
): void {
  const allow = new Set<string>(allowed);
  for (const key of Object.keys(record)) {
    if (!allow.has(key)) {
      const field = prefix.length > 0 ? `${prefix}.${key}` : key;
      fail(field, "unknown key.");
    }
  }
}

function isOneOf<T extends string>(
  value: string,
  allowed: readonly T[],
): value is T {
  return (allowed as readonly string[]).includes(value);
}

function readEnum<T extends string>(
  field: string,
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value === "string" && isOneOf(value, allowed)) return value;
  const shown = typeof value === "string" ? `"${value}"` : typeof value;
  fail(field, `${shown} is not allowed. Allowed: ${allowed.join(", ")}.`);
}

function readString(field: string, value: unknown): string {
  if (typeof value !== "string") fail(field, "expected a string.");
  return value;
}

function readBoolean(field: string, value: unknown): boolean {
  if (typeof value !== "boolean") fail(field, "expected a boolean.");
  return value;
}

function readFiniteNumber(field: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    const kind = typeof value === "string" ? "a string" : typeof value;
    fail(field, `expected a finite number, received ${kind}.`);
  }
  return value;
}

function readIntInRange(
  field: string,
  value: unknown,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    const kind = typeof value === "string" ? "a string" : typeof value;
    fail(field, `expected an integer from ${min} to ${max}, received ${kind}.`);
  }
  if (value < min || value > max) {
    fail(field, `${value} is outside ${min} to ${max}.`);
  }
  return value;
}

function readOptional<T>(
  record: Record<string, unknown>,
  key: string,
  fallback: T,
  parse: (value: unknown) => T,
): T {
  if (!Object.hasOwn(record, key)) return fallback;
  const value = record[key];
  if (value === null) fail(key, "null is not allowed.");
  return parse(value);
}

function readGate(
  record: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const field = `gates.${key}`;
  if (!Object.hasOwn(record, key)) return fallback;
  const value = record[key];
  if (value === null) fail(field, "null is not allowed.");
  return readIntInRange(field, value, min, max);
}

function readGates(value: unknown): GuideConfig["gates"] {
  if (!isRecord(value)) fail("gates", "expected an object.");
  rejectUnknown(value, GATE_KEYS, "gates");
  const defaults = defaultConfig().gates;
  return {
    phonePerfMin: readGate(
      value,
      "phonePerfMin",
      defaults.phonePerfMin,
      LIGHTHOUSE_MIN,
      LIGHTHOUSE_MAX,
    ),
    a11yMin: readGate(value, "a11yMin", defaults.a11yMin, LIGHTHOUSE_MIN, LIGHTHOUSE_MAX),
    bestPracticesMin: readGate(
      value,
      "bestPracticesMin",
      defaults.bestPracticesMin,
      LIGHTHOUSE_MIN,
      LIGHTHOUSE_MAX,
    ),
    seoMin: readGate(value, "seoMin", defaults.seoMin, LIGHTHOUSE_MIN, LIGHTHOUSE_MAX),
    desktopFpsMin: readGate(
      value,
      "desktopFpsMin",
      defaults.desktopFpsMin,
      DESKTOP_FPS_MIN,
      DESKTOP_FPS_MAX,
    ),
  };
}

function readImagineBudget(value: unknown): number {
  const amount = readFiniteNumber("imagineBudgetUsd", value);
  if (amount < 0 || amount > IMAGINE_BUDGET_USD_MAX) {
    fail(
      "imagineBudgetUsd",
      `${amount} is outside 0 to ${IMAGINE_BUDGET_USD_MAX}.`,
    );
  }
  return amount;
}

function readTokenBudget(value: unknown): number {
  const amount = readIntInRange("tokenBudget", value, 0, TOKEN_BUDGET_MAX);
  return amount;
}

export function defaultConfig(): GuideConfig {
  return {
    model: "grok-4.7",
    effort: "medium",
    interviewDepth: "deep",
    voiceEngine: "local",
    sessionIdMode: "unknown",
    deployTarget: "undecided",
    worktrees: false,
    imagineBudgetUsd: 0,
    tokenBudget: TOKEN_BUDGET_MAX,
    gates: {
      phonePerfMin: 90,
      a11yMin: 90,
      bestPracticesMin: 90,
      seoMin: 90,
      desktopFpsMin: 30,
    },
  };
}

/**
 * Validates a JSON object into GuideConfig. Missing keys take defaults.
 * Null, the wrong type, and unknown keys throw ConfigError. Does not read the environment.
 */
export function parseConfig(raw: unknown): GuideConfig {
  if (!isRecord(raw)) fail("config", "expected a JSON object.");
  rejectUnknown(raw, TOP_KEYS, "");
  const defaults = defaultConfig();
  return {
    model: readOptional(raw, "model", defaults.model, (value) =>
      readString("model", value),
    ),
    effort: readOptional(raw, "effort", defaults.effort, (value) =>
      readEnum("effort", value, EFFORTS),
    ),
    interviewDepth: readOptional(
      raw,
      "interviewDepth",
      defaults.interviewDepth,
      (value) => readEnum("interviewDepth", value, INTERVIEW_DEPTHS),
    ),
    voiceEngine: readOptional(raw, "voiceEngine", defaults.voiceEngine, (value) =>
      readEnum("voiceEngine", value, VOICE_ENGINES),
    ),
    sessionIdMode: readOptional(
      raw,
      "sessionIdMode",
      defaults.sessionIdMode,
      (value) => readEnum("sessionIdMode", value, SESSION_ID_MODES),
    ),
    deployTarget: readOptional(
      raw,
      "deployTarget",
      defaults.deployTarget,
      (value) => readEnum("deployTarget", value, DEPLOY_TARGETS),
    ),
    worktrees: readOptional(raw, "worktrees", defaults.worktrees, (value) =>
      readBoolean("worktrees", value),
    ),
    imagineBudgetUsd: readOptional(
      raw,
      "imagineBudgetUsd",
      defaults.imagineBudgetUsd,
      readImagineBudget,
    ),
    tokenBudget: readOptional(
      raw,
      "tokenBudget",
      defaults.tokenBudget,
      readTokenBudget,
    ),
    gates: readOptional(raw, "gates", defaults.gates, readGates),
  };
}

/**
 * Reads `<dir>/.hitchhiker/config.json`. A missing file returns defaults and writes nothing.
 */
export function loadConfig(dir: string): GuideConfig {
  const file = path.join(dir, ".hitchhiker", "config.json");
  if (!existsSync(file)) return defaultConfig();
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    fail("config.json", detail);
  }
  return parseConfig(raw);
}

/**
 * Write `.hitchhiker/config.json` under the state lock.
 * parseConfig runs first and rejects a key it would not load, before any mkdir.
 * The directory is created before the lock is acquired. The bytes land via a temp rename.
 */
export async function saveConfig(
  projectDir: string,
  config: GuideConfig,
): Promise<void> {
  const checked = parseConfig(config);
  const dir = path.join(projectDir, ".hitchhiker");
  await mkdir(dir, { recursive: true });
  await withStateLock(projectDir, async () => {
    await replaceViaTemp(
      path.join(dir, "config.json"),
      `${JSON.stringify(checked, null, 2)}\n`,
    );
  });
}
