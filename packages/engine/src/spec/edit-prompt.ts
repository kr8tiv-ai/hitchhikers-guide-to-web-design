/**
 * Edit the goal of one site prompt. Pure. This function does not write files
 * and does not start Improbability Drive. The caller deletes drive approval.
 *
 * Any save returns approvalStillValid false, including a goal whose text
 * matches the objective already stored. A stale yes must not survive an edit.
 *
 * Assumptions, because the notes and the existing modules disagree:
 * - patch.goal is required. The session note marked it optional. The interface
 *   block requires a string, so a missing goal throws.
 * - The goal is the text of the single <objective> element. SitePrompt has no
 *   goal field. v1 section 10.5 stores that sentence in <objective>.
 * - The generator export is generateSkeleton. Prompt 093 did not rename it
 *   generateSitePrompts. This file does not add that alias.
 * - A one-page package stays under 50 and warns. The 50 to 150 check belongs
 *   on the 3-page calm site, the smallest fixture that meets the floor.
 * - Libraries are read from the goal text and from prompt.library. A mention
 *   counts even inside a prohibition. "motion" counts only as a bound,
 *   imported, or quoted library id. "reduced-motion" does not count.
 * - Saving a goal that names two libraries throws, including an unchanged goal
 *   that already named two.
 * - Every filesModified entry must show up in the goal as its stored path or
 *   its basename. An empty file list cannot be edited into a concrete goal.
 * - Whitespace around the goal is trimmed before the 80-character check.
 */

import { MOTION_LIBS, type MotionLib } from "./motion.ts";
import { type SitePrompt } from "./site-prompts.ts";
import { SITE_RULES } from "./site-rules.ts";

export class EditPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditPromptError";
  }
}

const MIN_GOAL = 80;

const LIBRARY_SOURCE =
  "css-scroll|anime\\.js|three\\.js|theatre\\.js|vanilla\\.js|gsap|lenis|three|ogl|anime|theatre|vanilla|motion";

const TOKEN_TO_LIB: Record<string, MotionLib> = {
  "css-scroll": "css-scroll",
  "anime.js": "anime",
  anime: "anime",
  "three.js": "three",
  three: "three",
  "theatre.js": "theatre",
  theatre: "theatre",
  "vanilla.js": "vanilla",
  vanilla: "vanilla",
  gsap: "gsap",
  lenis: "lenis",
  ogl: "ogl",
  motion: "motion",
};

export function editSitePrompt(
  prompts: SitePrompt[],
  id: string,
  patch: { goal: string },
): { prompts: SitePrompt[]; approvalStillValid: false } {
  if (!Array.isArray(prompts)) {
    throw new EditPromptError("Prompts must be a list.");
  }
  if (typeof id !== "string" || id.trim() === "") {
    throw new EditPromptError("The prompt id is missing.");
  }
  if (patch === null || typeof patch !== "object" || typeof patch.goal !== "string") {
    throw new EditPromptError("The patch needs a goal string.");
  }

  const ids = new Map<string, number>();
  prompts.forEach((prompt, index) => {
    const promptId = readId(prompt, index);
    ids.set(promptId, (ids.get(promptId) ?? 0) + 1);
  });
  for (const [promptId, count] of ids) {
    if (count > 1) {
      throw new EditPromptError(`Two prompts use the id ${promptId}.`);
    }
  }

  const index = prompts.findIndex((prompt) => prompt.id === id);
  if (index < 0) {
    throw new EditPromptError(`No prompt has the id ${id}.`);
  }
  const current = prompts[index];
  if (current === undefined) {
    throw new EditPromptError(`No prompt has the id ${id}.`);
  }

  assertRules(current);
  const mustHaves = readMustHaves(current.body);
  const goal = cleanGoal(patch.goal);
  const originalGoal = objectiveInner(current.body);
  assertConcrete(goal, current.filesModified);
  assertOneLibrary(originalGoal, goal, current.library);

  const body = replaceObjective(current.body, goal);
  if (readMustHaves(body) !== mustHaves) {
    throw new EditPromptError("must_haves changed. An edit cannot drop the gates.");
  }

  const next = prompts.slice();
  next[index] = withGoal(current, body);
  return { prompts: next, approvalStillValid: false };
}

function readId(prompt: unknown, index: number): string {
  if (!isRecord(prompt)) {
    throw new EditPromptError(`Prompt ${index + 1} must be an object.`);
  }
  const id = prompt.id;
  if (typeof id !== "string" || id.trim() === "") {
    throw new EditPromptError(`Prompt ${index + 1} is missing an id.`);
  }
  return id;
}

function assertRules(prompt: SitePrompt): void {
  if (typeof prompt.rules !== "string" || prompt.rules.length === 0) {
    throw new EditPromptError("RULES is missing. An edit cannot remove the shared rules.");
  }
  if (prompt.rules !== SITE_RULES) {
    throw new EditPromptError("RULES does not match the shared block. An edit cannot replace it.");
  }
}

function cleanGoal(goal: string): string {
  const text = goal.trim();
  if (text.length < MIN_GOAL) {
    throw new EditPromptError(
      `The goal has ${text.length} characters. A goal needs at least 80 characters.`,
    );
  }
  if (text.includes("!") || text.includes("\uFF01")) {
    throw new EditPromptError("The goal cannot contain an exclamation mark.");
  }
  if (text.includes("<") || text.includes(">")) {
    throw new EditPromptError("The goal cannot contain markup.");
  }
  return text;
}

function assertConcrete(goal: string, files: readonly string[]): void {
  if (!Array.isArray(files) || files.length === 0) {
    throw new EditPromptError("This prompt names no file, so the goal cannot stay concrete.");
  }
  const missing: string[] = [];
  files.forEach((file, index) => {
    if (typeof file !== "string" || file.trim() === "") {
      throw new EditPromptError(`File ${index + 1} on this prompt is empty.`);
    }
    if (!goalNamesFile(goal, file)) missing.push(basename(file) || file);
  });
  if (missing.length > 0) {
    throw new EditPromptError(
      `The goal must include the file name already in this prompt: ${missing.join(", ")}.`,
    );
  }
}

function goalNamesFile(goal: string, file: string): boolean {
  if (goal.includes(file)) return true;
  const base = basename(file);
  return base.length > 0 && goal.includes(base);
}

function basename(file: string): string {
  const hashCut = file.split("#")[0] ?? file;
  const cut = hashCut.split("?")[0] ?? hashCut;
  const parts = cut.split(/[/\\]/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? "";
}

function assertOneLibrary(originalGoal: string, goal: string, field: string | undefined): void {
  const original = librariesIn(originalGoal);
  const named = asMotionLib(field);
  if (named !== undefined) original.add(named);
  const next = librariesIn(goal);
  const added = MOTION_LIBS.filter((lib) => next.has(lib) && !original.has(lib));
  if (original.size >= 1 && added.length > 0) {
    throw new EditPromptError(
      `This prompt already names ${listLibs(original)}. The goal adds ${added.join(", ")}.`,
    );
  }
  if (next.size > 1) {
    throw new EditPromptError(`A prompt keeps one motion library. The goal names ${listLibs(next)}.`);
  }
}

function librariesIn(text: string): Set<MotionLib> {
  const found = new Set<MotionLib>();
  const pattern = new RegExp(`\\b(?:${LIBRARY_SOURCE})\\b`, "gi");
  for (const match of text.matchAll(pattern)) {
    const raw = match[0].toLowerCase();
    const index = match.index;
    if (index === undefined) continue;
    if (raw === "motion" && !motionMeansLibrary(text, index)) continue;
    const lib = TOKEN_TO_LIB[raw];
    if (lib !== undefined) found.add(lib);
  }
  return found;
}

function motionMeansLibrary(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 24), index);
  if (/reduced[\s-]*$/i.test(before)) return false;
  const after = text.slice(index + "motion".length, index + "motion".length + 12);
  if (/^[\s-]*toolkit\b/i.test(after)) return false;
  if (/[`'"]$/.test(before)) return true;
  if (/(?:bind|import|library|named|only)\s+$/i.test(before)) return true;
  if (/^\s+library\b/i.test(after)) return true;
  return false;
}

function asMotionLib(value: string | undefined): MotionLib | undefined {
  if (value === undefined) return undefined;
  for (const lib of MOTION_LIBS) {
    if (lib === value) return lib;
  }
  return undefined;
}

function listLibs(libs: ReadonlySet<MotionLib>): string {
  return MOTION_LIBS.filter((lib) => libs.has(lib)).join(", ");
}

function objectiveInner(body: string): string {
  return objectiveSpan(body).inner.trim();
}

function replaceObjective(body: string, goal: string): string {
  const span = objectiveSpan(body);
  return `${body.slice(0, span.start)}<objective>\n${goal}\n</objective>${body.slice(span.end)}`;
}

function objectiveSpan(body: string): { inner: string; start: number; end: number } {
  if (typeof body !== "string") {
    throw new EditPromptError("The prompt body must be a string.");
  }
  const opens = body.match(/<objective\b[^>]*>/gi);
  if (opens === null || opens.length === 0) {
    throw new EditPromptError("This prompt has no objective, so there is no goal to replace.");
  }
  if (opens.length !== 1) {
    throw new EditPromptError("This prompt has more than one objective.");
  }
  const match = /<objective\b[^>]*>([\s\S]*?)<\/objective>/i.exec(body);
  if (match === null || match.index === undefined) {
    throw new EditPromptError("This prompt has no objective, so there is no goal to replace.");
  }
  return {
    inner: match[1] ?? "",
    start: match.index,
    end: match.index + match[0].length,
  };
}

function readMustHaves(body: string): string {
  if (typeof body !== "string") {
    throw new EditPromptError("must_haves is empty. An edit cannot drop the gates.");
  }
  const opens = body.match(/<must_haves\b[^>]*>/gi);
  if (opens === null || opens.length !== 1) {
    throw new EditPromptError("must_haves is empty. An edit cannot drop the gates.");
  }
  const match = /<must_haves\b[^>]*>([\s\S]*?)<\/must_haves>/i.exec(body);
  const inner = match?.[1];
  if (inner === undefined || inner.trim().length === 0 || itemCount(inner) === 0) {
    throw new EditPromptError("must_haves is empty. An edit cannot drop the gates.");
  }
  return inner;
}

function itemCount(inner: string): number {
  let count = 0;
  const withoutArrays = inner.replace(/\[[\s\S]*?\]/g, (array) => {
    const quotes = array.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g);
    if (quotes !== null) {
      count += quotes.filter((quote) => quote.length > 2).length;
    } else {
      const body = array.slice(1, -1);
      count += body.split(",").filter((part) => part.trim().length > 0).length;
    }
    return " ";
  });
  for (const line of withoutArrays.split(/\r?\n/)) {
    if (/^\s*-\s+\S/.test(line)) count += 1;
  }
  return count;
}

function withGoal(prompt: SitePrompt, body: string): SitePrompt {
  return {
    ...prompt,
    dependsOn: [...prompt.dependsOn],
    filesModified: [...prompt.filesModified],
    requirements: [...prompt.requirements],
    protected: [...prompt.protected],
    rules: prompt.rules,
    body,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
