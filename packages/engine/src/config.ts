import { mkdir } from "node:fs/promises";
import path from "node:path";
import { replaceViaTemp, withStateLock } from "./lock.ts";
import { readUtf8Cached } from "./text-cache.ts";
import {
  ToolInstallRecordError,
  readToolInstalls,
  type ToolInstallRecord,
} from "./tool-install/record.ts";

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

/**
 * Per-task effort overrides live beside `default`. Values are effort names.
 * The index signature is `string` so a task key and `default` share one map.
 */
export interface AiEffort {
  default: Effort;
  /** Set when the person saves Guide effort. Absent means the factory medium. */
  picked?: "yes";
  [task: string]: string | undefined;
}

export interface AiConfig {
  model: string;
  effort: AiEffort;
  timeoutMs: number;
}

/**
 * Opt-in network integrations. Every flag defaults off.
 * Pinterest capture is a public-board scroll. It does not log in.
 */
export interface IntegrationsConfig {
  pinterestCapture: boolean;
}

/**
 * Encode caps. maxWidth never rises above 1920, so a 2560 variant is not written.
 * Keep the defaults in step with packages/assets/src/media-budget.ts.
 */
export interface MediaConfig {
  maxVariantsPerImage: number;
  maxRunBytes: number;
  maxWidth: number;
}

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
  ai: AiConfig;
  integrations: IntegrationsConfig;
  toolInstalls: ToolInstallRecord[];
  /** True after the first-five-minutes tour is skipped or finished. */
  tourSeen: boolean;
  media: MediaConfig;
  design: DesignGateConfig;
}

/**
 * Sketches drawn for each primary page before the build.
 * The model ids match the Imagine still models this repo already allows.
 */
export const COMP_IMAGE_MODELS = [
  "grok-imagine-image",
  "grok-imagine-image-2.0",
  "grok-imagine-image-quality",
] as const;

export type CompImageModel = (typeof COMP_IMAGE_MODELS)[number];

export interface CompConfig {
  /** How many sketches to draw for one view. */
  candidates: number;
  /** Imagine image model. Only the allowed image ids. */
  model: CompImageModel;
  /** Draw the tall desktop sketch as well as the fold and the phone. */
  long: boolean;
}

/**
 * Short motion clips drafted from an approved desktop sketch.
 * The ids match the Imagine video models this repo already allows.
 */
export const MOTION_VIDEO_MODELS = [
  "grok-imagine-video-1.5",
  "grok-imagine-video-1.5-lite",
  "grok-imagine-video",
] as const;

export type MotionVideoModel = (typeof MOTION_VIDEO_MODELS)[number];

export const MOTION_VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;

export type MotionVideoResolution = (typeof MOTION_VIDEO_RESOLUTIONS)[number];

export interface MotionRefConfig {
  /** Draft motion clips and section crops. Off skips both. */
  enabled: boolean;
  /** Imagine video model. Only the allowed video ids. */
  model: MotionVideoModel;
  /** Length of each clip, in seconds. */
  seconds: number;
  /** Frame size sent to Imagine. */
  resolution: MotionVideoResolution;
  /** How many motion clips one site may draft. */
  max: number;
}

/**
 * Optical micro-detail checks (245x). Defaults stay on. A project file that
 * only sets minReferenceImages still receives the optical block and comp defaults.
 */
export interface OpticalConfig {
  enabled: boolean;
  /** Body line boxes step on this grid unless DESIGN.md names another unit. */
  baselineUnit: number;
  /** Ink may sit this fraction of the line width off the box centre. */
  centringTolerance: number;
}

/**
 * Built page versus the approved sketch.
 * layoutMin is coarse luminance similarity on a 32 by 18 grid. 1 is the same layout.
 * paletteMax is the mean CIEDE2000 distance between two 5-colour palettes.
 * edgeMax is the mean per-band edge-density difference. It stays loose because
 * live text adds edges the sketch does not have.
 * rounds is how many times the page is compared. A miss before the last round
 * is handed back as one fix, then the page is shot again. Still missing after
 * the last round pauses the queue.
 * motionBlocking false means a choreography note is written and does not pause.
 */
export interface CompareConfig {
  layoutMin: number;
  paletteMax: number;
  edgeMax: number;
  rounds: number;
  motionBlocking: boolean;
}

/** How many reference images a design must have before the build. */
export interface DesignGateConfig {
  minReferenceImages: number;
  optical: OpticalConfig;
  comps: CompConfig;
  motionRefs: MotionRefConfig;
  compare: CompareConfig;
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

/** Per-image variant cap. The encode step also keeps at most three widths. */
export const MEDIA_MAX_VARIANTS_PER_IMAGE = 8;
/** Bytes one optimize-media run may write. */
export const MEDIA_MAX_RUN_BYTES = 400 * 1024 * 1024;
/** Longest variant edge. Values above this are stored as this cap. */
export const MEDIA_MAX_WIDTH = 1920;

/** think() wall clock. One hundred twenty seconds, then the child tree is killed. */
export const AI_TIMEOUT_MS = 120_000;
export const AI_TIMEOUT_MIN_MS = 1_000;
export const AI_TIMEOUT_MAX_MS = 3_600_000;

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
  "ai",
  "integrations",
  "toolInstalls",
  "tourSeen",
  "media",
  "design",
] as const;

const MEDIA_KEYS = ["maxVariantsPerImage", "maxRunBytes", "maxWidth"] as const;

const DESIGN_KEYS = ["minReferenceImages", "optical", "comps", "motionRefs", "compare"] as const;

const COMP_KEYS = ["candidates", "model", "long"] as const;

const MOTION_REF_KEYS = ["enabled", "model", "seconds", "resolution", "max"] as const;

const OPTICAL_KEYS = ["enabled", "baselineUnit", "centringTolerance"] as const;

const COMPARE_KEYS = ["layoutMin", "paletteMax", "edgeMax", "rounds", "motionBlocking"] as const;

/** Coarse layout similarity. Below this, the built page does not match the sketch. */
const COMPARE_LAYOUT_MIN = 0.55;
/** Mean CIEDE2000 between the two 5-colour palettes. Above this, the colours drifted. */
const COMPARE_PALETTE_MAX = 18;
/** Mean per-band edge difference. Loose, because live words add edges. */
const COMPARE_EDGE_MAX = 0.45;
/** Compare attempts. A miss before the last one is one fix, then a reshoot. */
const COMPARE_ROUNDS = 2;

/** A project with no design block still asks for six reference images. */
const MIN_REFERENCE_IMAGES = 6;

/** Keep these in step with the optical evaluators. DESIGN.md can override the unit. */
const OPTICAL_BASELINE_UNIT = 4;
const OPTICAL_CENTRING_TOLERANCE = 0.015;

const AI_KEYS = ["model", "effort", "timeoutMs"] as const;

const INTEGRATION_KEYS = ["pinterestCapture"] as const;

/** Public board capture stays off until a project opts in. */
const PINTEREST_CAPTURE_DEFAULT = false;

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

function rejectNull(field: string, value: unknown): unknown {
  if (value === null) fail(field, "null is not allowed.");
  return value;
}

function readAiEffort(value: unknown, fallback: Effort): AiEffort {
  const checked = rejectNull("ai.effort", value);
  if (!isRecord(checked)) fail("ai.effort", "expected an object.");
  const result: AiEffort = {
    default: Object.hasOwn(checked, "default")
      ? readEnum("ai.effort.default", rejectNull("ai.effort.default", checked.default), EFFORTS)
      : fallback,
  };
  for (const key of Object.keys(checked)) {
    if (key === "default") continue;
    if (key === "picked") {
      if (checked.picked !== "yes") fail("ai.effort.picked", "expected yes.");
      result.picked = "yes";
      continue;
    }
    if (key.trim().length === 0) fail("ai.effort", "task name is empty.");
    result[key] = readEnum(
      `ai.effort.${key}`,
      rejectNull(`ai.effort.${key}`, checked[key]),
      EFFORTS,
    );
  }
  return result;
}

/**
 * Missing `ai` copies the top-level model and effort so one config field still
 * drives think(). An explicit `ai.model` or `ai.effort` wins over that copy.
 */
function readIntegrationFlag(
  record: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const field = `integrations.${key}`;
  if (!Object.hasOwn(record, key)) return fallback;
  const value = record[key];
  if (value === null) fail(field, "null is not allowed.");
  if (typeof value !== "boolean") fail(field, "expected a boolean.");
  return value;
}

function readIntegrations(value: unknown): IntegrationsConfig {
  if (!isRecord(value)) fail("integrations", "expected an object.");
  rejectUnknown(value, INTEGRATION_KEYS, "integrations");
  return {
    pinterestCapture: readIntegrationFlag(
      value,
      "pinterestCapture",
      PINTEREST_CAPTURE_DEFAULT,
    ),
  };
}

function readAi(value: unknown, modelFallback: string, effortFallback: Effort): AiConfig {
  if (value === undefined) {
    return {
      model: modelFallback,
      effort: { default: effortFallback },
      timeoutMs: AI_TIMEOUT_MS,
    };
  }
  const checked = rejectNull("ai", value);
  if (!isRecord(checked)) fail("ai", "expected an object.");
  rejectUnknown(checked, AI_KEYS, "ai");
  const model = Object.hasOwn(checked, "model")
    ? readString("ai.model", rejectNull("ai.model", checked.model))
    : modelFallback;
  const effort = Object.hasOwn(checked, "effort")
    ? readAiEffort(checked.effort, effortFallback)
    : { default: effortFallback };
  const timeoutMs = Object.hasOwn(checked, "timeoutMs")
    ? readIntInRange(
        "ai.timeoutMs",
        rejectNull("ai.timeoutMs", checked.timeoutMs),
        AI_TIMEOUT_MIN_MS,
        AI_TIMEOUT_MAX_MS,
      )
    : AI_TIMEOUT_MS;
  return { model, effort, timeoutMs };
}

function readDesign(value: unknown): DesignGateConfig {
  if (!isRecord(value)) fail("design", "expected an object.");
  rejectUnknown(value, DESIGN_KEYS, "design");
  const defaults = defaultConfig().design;
  return {
    minReferenceImages: Object.hasOwn(value, "minReferenceImages")
      ? readIntInRange("design.minReferenceImages", value.minReferenceImages, 0, 100)
      : defaults.minReferenceImages,
    optical: Object.hasOwn(value, "optical") ? readOptical(value.optical) : defaults.optical,
    comps: Object.hasOwn(value, "comps") ? readComps(value.comps) : defaults.comps,
    motionRefs: Object.hasOwn(value, "motionRefs") ? readMotionRefs(value.motionRefs) : defaults.motionRefs,
    compare: Object.hasOwn(value, "compare") ? readCompare(value.compare) : defaults.compare,
  };
}

function readCompare(value: unknown): CompareConfig {
  const checked = rejectNull("design.compare", value);
  if (!isRecord(checked)) fail("design.compare", "expected an object.");
  rejectUnknown(checked, COMPARE_KEYS, "design.compare");
  const defaults = defaultConfig().design.compare;
  return {
    layoutMin: Object.hasOwn(checked, "layoutMin")
      ? readUnitInterval("design.compare.layoutMin", rejectNull("design.compare.layoutMin", checked.layoutMin))
      : defaults.layoutMin,
    paletteMax: Object.hasOwn(checked, "paletteMax")
      ? readBoundedNumber(
          "design.compare.paletteMax",
          rejectNull("design.compare.paletteMax", checked.paletteMax),
          100,
        )
      : defaults.paletteMax,
    edgeMax: Object.hasOwn(checked, "edgeMax")
      ? readUnitInterval("design.compare.edgeMax", rejectNull("design.compare.edgeMax", checked.edgeMax))
      : defaults.edgeMax,
    rounds: Object.hasOwn(checked, "rounds")
      ? readIntInRange("design.compare.rounds", rejectNull("design.compare.rounds", checked.rounds), 1, 5)
      : defaults.rounds,
    motionBlocking: Object.hasOwn(checked, "motionBlocking")
      ? readBoolean(
          "design.compare.motionBlocking",
          rejectNull("design.compare.motionBlocking", checked.motionBlocking),
        )
      : defaults.motionBlocking,
  };
}

function readUnitInterval(field: string, value: unknown): number {
  return readBoundedNumber(field, value, 1);
}

function readBoundedNumber(field: string, value: unknown, max: number): number {
  const amount = readFiniteNumber(field, value);
  if (amount < 0 || amount > max) fail(field, `${amount} is outside 0 to ${max}.`);
  return amount;
}

function readMotionRefs(value: unknown): MotionRefConfig {
  const checked = rejectNull("design.motionRefs", value);
  if (!isRecord(checked)) fail("design.motionRefs", "expected an object.");
  rejectUnknown(checked, MOTION_REF_KEYS, "design.motionRefs");
  const defaults = defaultConfig().design.motionRefs;
  return {
    enabled: Object.hasOwn(checked, "enabled")
      ? readBoolean("design.motionRefs.enabled", rejectNull("design.motionRefs.enabled", checked.enabled))
      : defaults.enabled,
    model: Object.hasOwn(checked, "model")
      ? readEnum(
          "design.motionRefs.model",
          rejectNull("design.motionRefs.model", checked.model),
          MOTION_VIDEO_MODELS,
        )
      : defaults.model,
    seconds: Object.hasOwn(checked, "seconds")
      ? readIntInRange(
          "design.motionRefs.seconds",
          rejectNull("design.motionRefs.seconds", checked.seconds),
          1,
          15,
        )
      : defaults.seconds,
    resolution: Object.hasOwn(checked, "resolution")
      ? readEnum(
          "design.motionRefs.resolution",
          rejectNull("design.motionRefs.resolution", checked.resolution),
          MOTION_VIDEO_RESOLUTIONS,
        )
      : defaults.resolution,
    max: Object.hasOwn(checked, "max")
      ? readIntInRange("design.motionRefs.max", rejectNull("design.motionRefs.max", checked.max), 0, 24)
      : defaults.max,
  };
}

function readComps(value: unknown): CompConfig {
  const checked = rejectNull("design.comps", value);
  if (!isRecord(checked)) fail("design.comps", "expected an object.");
  rejectUnknown(checked, COMP_KEYS, "design.comps");
  const defaults = defaultConfig().design.comps;
  return {
    candidates: Object.hasOwn(checked, "candidates")
      ? readIntInRange(
          "design.comps.candidates",
          rejectNull("design.comps.candidates", checked.candidates),
          1,
          4,
        )
      : defaults.candidates,
    model: Object.hasOwn(checked, "model")
      ? readEnum("design.comps.model", rejectNull("design.comps.model", checked.model), COMP_IMAGE_MODELS)
      : defaults.model,
    long: Object.hasOwn(checked, "long")
      ? readBoolean("design.comps.long", rejectNull("design.comps.long", checked.long))
      : defaults.long,
  };
}

function readOptical(value: unknown): OpticalConfig {
  const checked = rejectNull("design.optical", value);
  if (!isRecord(checked)) fail("design.optical", "expected an object.");
  rejectUnknown(checked, OPTICAL_KEYS, "design.optical");
  const defaults = defaultConfig().design.optical;
  return {
    enabled: Object.hasOwn(checked, "enabled")
      ? readBoolean("design.optical.enabled", rejectNull("design.optical.enabled", checked.enabled))
      : defaults.enabled,
    baselineUnit: Object.hasOwn(checked, "baselineUnit")
      ? readIntInRange(
          "design.optical.baselineUnit",
          rejectNull("design.optical.baselineUnit", checked.baselineUnit),
          1,
          64,
        )
      : defaults.baselineUnit,
    centringTolerance: Object.hasOwn(checked, "centringTolerance")
      ? readCentringTolerance(rejectNull("design.optical.centringTolerance", checked.centringTolerance))
      : defaults.centringTolerance,
  };
}

function readCentringTolerance(value: unknown): number {
  const amount = readFiniteNumber("design.optical.centringTolerance", value);
  if (amount < 0 || amount > 1) {
    fail("design.optical.centringTolerance", `${amount} is outside 0 to 1.`);
  }
  return amount;
}

function readMedia(value: unknown): MediaConfig {
  if (!isRecord(value)) fail("media", "expected an object.");
  rejectUnknown(value, MEDIA_KEYS, "media");
  const defaults = defaultConfig().media;
  const maxWidth = Object.hasOwn(value, "maxWidth")
    ? readIntInRange("media.maxWidth", value.maxWidth, 1, 8192)
    : defaults.maxWidth;
  return {
    maxVariantsPerImage: Object.hasOwn(value, "maxVariantsPerImage")
      ? readIntInRange("media.maxVariantsPerImage", value.maxVariantsPerImage, 1, 64)
      : defaults.maxVariantsPerImage,
    maxRunBytes: Object.hasOwn(value, "maxRunBytes")
      ? readIntInRange("media.maxRunBytes", value.maxRunBytes, 1, 50 * 1024 * 1024 * 1024)
      : defaults.maxRunBytes,
    maxWidth: Math.min(MEDIA_MAX_WIDTH, maxWidth),
  };
}

function readInstalls(value: unknown): ToolInstallRecord[] {
  try {
    return readToolInstalls(value);
  } catch (error: unknown) {
    if (error instanceof ToolInstallRecordError) fail("toolInstalls", error.message);
    throw error;
  }
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
    ai: {
      model: "grok-4.7",
      effort: { default: "medium" },
      timeoutMs: AI_TIMEOUT_MS,
    },
    integrations: {
      pinterestCapture: PINTEREST_CAPTURE_DEFAULT,
    },
    toolInstalls: [],
    tourSeen: false,
    media: {
      maxVariantsPerImage: MEDIA_MAX_VARIANTS_PER_IMAGE,
      maxRunBytes: MEDIA_MAX_RUN_BYTES,
      maxWidth: MEDIA_MAX_WIDTH,
    },
    design: {
      minReferenceImages: MIN_REFERENCE_IMAGES,
      optical: {
        enabled: true,
        baselineUnit: OPTICAL_BASELINE_UNIT,
        centringTolerance: OPTICAL_CENTRING_TOLERANCE,
      },
      comps: {
        candidates: 3,
        // Keep this id in step with RENDER_MODEL in spec/page-renders.ts.
        model: "grok-imagine-image",
        long: true,
      },
      motionRefs: {
        enabled: true,
        model: "grok-imagine-video-1.5-lite",
        seconds: 6,
        resolution: "480p",
        max: 3,
      },
      compare: {
        layoutMin: COMPARE_LAYOUT_MIN,
        paletteMax: COMPARE_PALETTE_MAX,
        edgeMax: COMPARE_EDGE_MAX,
        rounds: COMPARE_ROUNDS,
        motionBlocking: false,
      },
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
  const model = readOptional(raw, "model", defaults.model, (value) =>
    readString("model", value),
  );
  const effort = readOptional(raw, "effort", defaults.effort, (value) =>
    readEnum("effort", value, EFFORTS),
  );
  return {
    model,
    effort,
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
    ai: readAi(Object.hasOwn(raw, "ai") ? raw.ai : undefined, model, effort),
    integrations: readOptional(raw, "integrations", defaults.integrations, readIntegrations),
    toolInstalls: readOptional(raw, "toolInstalls", defaults.toolInstalls, readInstalls),
    tourSeen: readOptional(raw, "tourSeen", defaults.tourSeen, (value) => readBoolean("tourSeen", value)),
    media: readOptional(raw, "media", defaults.media, readMedia),
    design: readOptional(raw, "design", defaults.design, readDesign),
  };
}

/**
 * Reads `<dir>/.hitchhiker/config.json`. A missing file returns defaults and writes nothing.
 */
export function loadConfig(dir: string): GuideConfig {
  const file = path.join(dir, ".hitchhiker", "config.json");
  const loaded = readUtf8Cached(file);
  if (loaded === null) return defaultConfig();
  const text = loaded.replace(/^\uFEFF/, "");
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
