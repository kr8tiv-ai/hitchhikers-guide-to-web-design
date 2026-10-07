/**
 * Stage-3 gate for a site prompt package. 092 runs this on every body.
 * Paths are repo ids with forward slashes, matching the v1 §10.5 examples.
 * The stack is inferred from those paths. Shared files (styles, scripts,
 * data, tests, public) are allowed once one stack is identified.
 * .hitchhiker/DEPLOY.md, HANDOFF.md, and the once-over note are the spec
 * docs So Long and the final pass write. They are not a second stack.
 */

import { MOTION_LIBS, type MotionLib } from "./motion.ts";
import { SITE_RULES } from "./site-rules.ts";
import {
  MOTION_BIND_SENTENCE,
  SITE_PHASES,
  SLICES_BY_PHASE,
  type SitePhase,
  type SitePrompt,
  type SiteStack,
  type Tier,
} from "./site-prompts.ts";

export interface ValidationReport {
  ok: boolean;
  errors: Array<{ id: string; rule: string; detail: string }>;
}

export type SiteValidateRule =
  | "rules-identical"
  | "frontmatter-complete"
  | "read-first-anchor"
  | "must-haves"
  | "no-as-before"
  | "no-see-above"
  | "no-same-as-previous"
  | "one-job"
  | "stack-paths"
  | "phase-coverage"
  | "review-cadence"
  | "depends-forward"
  | "motion-library";

const TIERS: readonly Tier[] = [
  "Towel",
  "Cup of Tea",
  "Gargle Blaster",
  "Heart of Gold",
  "Forty-Two",
];

const EFFORTS = ["medium", "high", "xhigh"] as const;

const STACKS: readonly SiteStack[] = ["astro", "next", "vite-react", "sveltekit"];

const MUST_KEYS = ["truths", "artifacts", "key_links", "prohibitions"] as const;

const BANS: ReadonlyArray<{ phrase: string; rule: SiteValidateRule }> = [
  { phrase: "as before", rule: "no-as-before" },
  { phrase: "see above", rule: "no-see-above" },
  { phrase: "same as previous", rule: "no-same-as-previous" },
];

const SHARED_PATHS: readonly RegExp[] = [
  /^tsconfig\.json$/,
  /^src\/styles\/[a-z0-9]+(?:-[a-z0-9]+)*\.css$/,
  /^src\/scripts\/[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/,
  /^src\/scripts\/integrations\/[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/,
  /^src\/data\/[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/,
  /^src\/data\/seo\/[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/,
  /^public\/[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+$/,
  /^tests\/[a-z0-9]+(?:-[a-z0-9]+)*\.spec\.ts$/,
  /^\.hitchhiker\/DEPLOY\.md$/,
  /^\.hitchhiker\/HANDOFF\.md$/,
  /^\.hitchhiker\/reviews\/once-over\.md$/,
];

const SPECIFIC_PATHS: Record<SiteStack, readonly RegExp[]> = {
  astro: [
    /^astro\.config\.ts$/,
    /^src\/pages\/[a-z0-9]+(?:-[a-z0-9]+)*\.astro$/,
    /^src\/layouts\/[A-Za-z][A-Za-z0-9]*\.astro$/,
    /^src\/components\/[A-Za-z][A-Za-z0-9]*\.astro$/,
  ],
  next: [
    /^next\.config\.ts$/,
    /^src\/app\/page\.tsx$/,
    /^src\/app\/layout\.tsx$/,
    /^src\/app\/[a-z0-9]+(?:-[a-z0-9]+)*\/page\.tsx$/,
    /^src\/components\/[A-Za-z][A-Za-z0-9]*\.tsx$/,
  ],
  "vite-react": [
    /^vite\.config\.ts$/,
    /^index\.html$/,
    /^src\/world\/[A-Za-z][A-Za-z0-9]*\.tsx$/,
  ],
  sveltekit: [
    /^svelte\.config\.js$/,
    /^src\/routes\/\+page\.svelte$/,
    /^src\/routes\/\+layout\.svelte$/,
    /^src\/routes\/[a-z0-9]+(?:-[a-z0-9]+)*\/\+page\.svelte$/,
    /^src\/lib\/components\/[A-Za-z][A-Za-z0-9]*\.svelte$/,
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPhase(value: unknown): value is SitePhase {
  return typeof value === "string" && (SITE_PHASES as readonly string[]).includes(value);
}

function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

function isMotionLib(value: unknown): value is MotionLib {
  return typeof value === "string" && (MOTION_LIBS as readonly string[]).includes(value);
}

function isShared(file: string): boolean {
  return SHARED_PATHS.some((pattern) => pattern.test(file));
}

function stacksFor(file: string): SiteStack[] {
  const found: SiteStack[] = [];
  for (const stack of STACKS) {
    const patterns = SPECIFIC_PATHS[stack];
    if (patterns.some((pattern) => pattern.test(file))) found.push(stack);
  }
  return found;
}

function tagInner(body: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i").exec(body);
  const inner = match?.[1];
  return inner === undefined ? null : inner;
}

function hasKeyedItems(inner: string, key: string): boolean {
  const arrayForm = new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`, "i").exec(inner);
  if (arrayForm !== null) {
    return (arrayForm[1] ?? "").trim().length > 0;
  }
  return new RegExp(`${key}:\\s*(?:\\n\\s*-\\s+\\S[^\\n]*)+`, "i").test(inner);
}

function promptLabel(prompt: unknown, index: number): string {
  if (isRecord(prompt) && typeof prompt.id === "string" && prompt.id.trim().length > 0) {
    return prompt.id;
  }
  return `index-${index}`;
}

function stringList(value: unknown, label: string, allowEmpty: boolean): string | null {
  if (!Array.isArray(value)) return `${label} must be an array.`;
  if (!allowEmpty && value.length === 0) return `${label} must not be empty.`;
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      return `${label} must contain only non-empty strings.`;
    }
  }
  return null;
}

function frontmatterErrors(prompt: unknown, id: string): ValidationReport["errors"] {
  const errors: ValidationReport["errors"] = [];
  const fail = (detail: string): void => {
    errors.push({ id, rule: "frontmatter-complete", detail });
  };
  if (!isRecord(prompt)) {
    fail("Prompt must be an object.");
    return errors;
  }
  if (typeof prompt.id !== "string" || !/^\d{3}$/.test(prompt.id)) {
    fail("id must be three digits.");
  }
  if (!isPhase(prompt.phase)) {
    fail("phase must be one of the six locked names.");
  } else {
    const slice = prompt.slice;
    if (typeof slice !== "string" || !SLICES_BY_PHASE[prompt.phase].includes(slice)) {
      fail("slice must belong to that phase in the v2 catalog.");
    }
  }
  if (typeof prompt.title !== "string" || prompt.title.trim().length === 0) {
    fail("title must not be empty.");
  } else if (prompt.title.includes("!") || prompt.title.includes("\uFF01")) {
    fail("title cannot contain an exclamation mark.");
  }
  if (!isTier(prompt.tier)) fail("tier must be a locked tier name.");
  if (typeof prompt.effort !== "string" || !(EFFORTS as readonly string[]).includes(prompt.effort)) {
    fail("effort must be medium, high, or xhigh.");
  }
  if (typeof prompt.model !== "string" || prompt.model.trim().length === 0 || /[\r\n]/.test(prompt.model)) {
    fail("model must be a non-empty string.");
  }
  const depends = stringList(prompt.dependsOn, "depends_on", true);
  if (depends !== null) fail(depends);
  const files = stringList(prompt.filesModified, "files_modified", false);
  if (files !== null) fail(files);
  const requirements = stringList(prompt.requirements, "requirements", false);
  if (requirements !== null) fail(requirements);
  const protectedPaths = stringList(prompt.protected, "protected", true);
  if (protectedPaths !== null) fail(protectedPaths);
  if (typeof prompt.reviewAfter !== "boolean") fail("review_after must be a boolean.");
  if (typeof prompt.maxTurns !== "number" || !Number.isInteger(prompt.maxTurns) || prompt.maxTurns < 1 || prompt.maxTurns > 100) {
    fail("max_turns must be an integer from 1 to 100.");
  }
  if (prompt.kind !== "build" && prompt.kind !== "once-over") {
    fail("kind must be build or once-over.");
  }
  if (prompt.library !== undefined && !isMotionLib(prompt.library)) {
    fail("library must be one motion library name.");
  }
  if (typeof prompt.body !== "string") {
    fail("body must be a string.");
  } else {
    for (const tag of ["objective", "verify", "report_back", "commit"] as const) {
      const inner = tagInner(prompt.body, tag);
      if (inner === null || inner.trim().length === 0) {
        fail(`missing <${tag}>.`);
      }
    }
  }
  return errors;
}

function bodyErrors(body: string, library: unknown, id: string): ValidationReport["errors"] {
  const errors: ValidationReport["errors"] = [];
  const lower = body.toLowerCase();
  for (const ban of BANS) {
    if (lower.includes(ban.phrase)) {
      errors.push({ id, rule: ban.rule, detail: `Body contains "${ban.phrase}".` });
    }
  }
  const readFirst = tagInner(body, "read_first");
  if (readFirst === null || !/@\.hitchhiker\/CONTEXT\.md#[A-Za-z0-9][A-Za-z0-9_-]*/.test(readFirst)) {
    errors.push({
      id,
      rule: "read-first-anchor",
      detail: "read_first must include @.hitchhiker/CONTEXT.md#anchor.",
    });
  }
  const must = tagInner(body, "must_haves");
  if (must === null) {
    errors.push({ id, rule: "must-haves", detail: "missing <must_haves>." });
  } else {
    for (const key of MUST_KEYS) {
      if (!hasKeyedItems(must, key)) {
        errors.push({ id, rule: "must-haves", detail: `${key} needs at least one item.` });
      }
    }
  }
  const tasks = [...body.matchAll(/<task>([\s\S]*?)<\/task>/gi)];
  const openCount = body.match(/<task>/gi)?.length ?? 0;
  const closeCount = body.match(/<\/task>/gi)?.length ?? 0;
  if (tasks.length !== 1 || openCount !== 1 || closeCount !== 1 || (tasks[0]?.[1] ?? "").trim().length === 0) {
    errors.push({ id, rule: "one-job", detail: "A prompt has one <task>." });
  }
  if (isMotionLib(library)) {
    const named = new RegExp(`\\b${library}\\b`).test(body);
    if (!body.includes(MOTION_BIND_SENTENCE) || !named) {
      errors.push({
        id,
        rule: "motion-library",
        detail: `Motion prompt must name ${library} and include the single-library sentence.`,
      });
    }
  }
  return errors;
}

function phaseErrors(prompts: readonly SitePrompt[]): ValidationReport["errors"] {
  const errors: ValidationReport["errors"] = [];
  const seen = new Set<string>();
  let lastRank = -1;
  let interleaved = false;
  for (const prompt of prompts) {
    if (!isRecord(prompt) || !isPhase(prompt.phase)) continue;
    seen.add(prompt.phase);
    const rank = SITE_PHASES.indexOf(prompt.phase);
    if (rank < lastRank) interleaved = true;
    else lastRank = rank;
  }
  for (const phase of SITE_PHASES) {
    if (!seen.has(phase)) {
      errors.push({ id: "package", rule: "phase-coverage", detail: `Phase ${phase} has no prompt.` });
    }
  }
  if (interleaved) {
    errors.push({
      id: "package",
      rule: "phase-coverage",
      detail: "Phases are not grouped in the locked order.",
    });
  }
  return errors;
}

function reviewErrors(prompts: readonly SitePrompt[]): ValidationReport["errors"] {
  const errors: ValidationReport["errors"] = [];
  const flags = prompts.map(() => false);
  let start = 0;
  while (start < prompts.length) {
    const phase = isRecord(prompts[start]) ? prompts[start]?.phase : undefined;
    if (!isPhase(phase)) {
      start += 1;
      continue;
    }
    let end = start + 1;
    while (end < prompts.length) {
      const next = prompts[end];
      if (!isRecord(next) || next.phase !== phase) break;
      end += 1;
    }
    const count = end - start;
    for (let offset = 0; offset < count; offset += 1) {
      flags[start + offset] = (offset + 1) % 3 === 0 || offset === count - 1;
    }
    start = end;
  }
  prompts.forEach((prompt, index) => {
    if (!isRecord(prompt) || typeof prompt.reviewAfter !== "boolean") return;
    if (!isPhase(prompt.phase)) return;
    if (prompt.reviewAfter !== flags[index]) {
      errors.push({
        id: promptLabel(prompt, index),
        rule: "review-cadence",
        detail: `review_after is ${String(prompt.reviewAfter)} and the cadence expects ${String(flags[index])}.`,
      });
    }
  });
  return errors;
}

function dependsErrors(prompts: readonly SitePrompt[]): ValidationReport["errors"] {
  const errors: ValidationReport["errors"] = [];
  const at = new Map<string, number>();
  prompts.forEach((prompt, index) => {
    if (!isRecord(prompt) || typeof prompt.id !== "string") return;
    if (!at.has(prompt.id)) at.set(prompt.id, index);
  });
  prompts.forEach((prompt, index) => {
    if (!isRecord(prompt) || !Array.isArray(prompt.dependsOn)) return;
    for (const dep of prompt.dependsOn) {
      if (typeof dep !== "string") continue;
      const found = at.get(dep);
      if (found === undefined || found >= index) {
        errors.push({
          id: promptLabel(prompt, index),
          rule: "depends-forward",
          detail: `depends_on "${dep}" points forward or is not an earlier id.`,
        });
      }
    }
  });
  return errors;
}

function stackErrors(prompts: readonly SitePrompt[]): ValidationReport["errors"] {
  const errors: ValidationReport["errors"] = [];
  const inferred = new Set<SiteStack>();
  const files: Array<{ id: string; file: string }> = [];
  prompts.forEach((prompt, index) => {
    if (!isRecord(prompt) || !Array.isArray(prompt.filesModified)) return;
    const id = promptLabel(prompt, index);
    for (const file of prompt.filesModified) {
      if (typeof file !== "string") continue;
      files.push({ id, file });
      for (const stack of stacksFor(file)) inferred.add(stack);
    }
  });
  if (inferred.size === 0) {
    errors.push({ id: "package", rule: "stack-paths", detail: "No file identifies the stack." });
    return errors;
  }
  if (inferred.size > 1) {
    errors.push({
      id: "package",
      rule: "stack-paths",
      detail: `Files mix stacks: ${[...inferred].join(", ")}.`,
    });
    return errors;
  }
  const stack = [...inferred][0];
  if (stack === undefined) return errors;
  for (const entry of files) {
    const owners = stacksFor(entry.file);
    const onStack = owners.includes(stack);
    if (onStack || (owners.length === 0 && isShared(entry.file))) continue;
    errors.push({
      id: entry.id,
      rule: "stack-paths",
      detail: `"${entry.file}" is not a ${stack} path.`,
    });
  }
  return errors;
}

export function validatePackage(prompts: SitePrompt[]): ValidationReport {
  if (!Array.isArray(prompts)) {
    return {
      ok: false,
      errors: [{ id: "package", rule: "frontmatter-complete", detail: "Package must be an array." }],
    };
  }
  const errors: ValidationReport["errors"] = [];
  const seen = new Set<string>();
  prompts.forEach((prompt, index) => {
    const id = promptLabel(prompt, index);
    if (isRecord(prompt) && typeof prompt.id === "string") {
      if (seen.has(prompt.id)) {
        errors.push({ id, rule: "frontmatter-complete", detail: `Duplicate id "${prompt.id}".` });
      }
      seen.add(prompt.id);
    }
    errors.push(...frontmatterErrors(prompt, id));
    if (!isRecord(prompt) || prompt.rules !== SITE_RULES) {
      errors.push({ id, rule: "rules-identical", detail: "RULES text is not the shared constant." });
    }
    if (isRecord(prompt) && typeof prompt.body === "string") {
      errors.push(...bodyErrors(prompt.body, prompt.library, id));
    }
  });
  errors.push(...phaseErrors(prompts));
  errors.push(...reviewErrors(prompts));
  errors.push(...dependsErrors(prompts));
  errors.push(...stackErrors(prompts));
  return { ok: errors.length === 0, errors };
}
