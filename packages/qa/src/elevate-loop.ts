/**
 * One Elevate round (prompt 131, v2 §12, v1 §12.2).
 *
 * The prompt text names a 142 opener. Prompt 142 is the deploy handoff and
 * does not export one. Fresh shots come from captureReviewShots (126) when
 * `.hitchhiker/elevate/preview-url` is an http(s) URL. Without that file, four
 * full-width shots already on disk are the cold read, so a cassette can run
 * without Chrome.
 *
 * planElevateModel (128) ranks at most eight upgrades at xhigh. Each pick
 * becomes one golden prompt (092). runPrompt is the live runner. runElevate
 * (130) refuses a Lighthouse or accessibility BLOCKER. Console, links, and
 * weight use the same rule. A refusal reverts commits made after the pre-pick
 * HEAD. An empty pick list writes the round log and changes nothing.
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hiddenChildOptions, type think } from "@hitchhiker/engine";
import {
  ELEVATE_CAP,
  planElevateModel,
  type ElevateColdRead,
  type ElevateItem,
} from "./elevate.ts";
import { runElevate } from "./elevate-run.ts";
import { captureReviewShots } from "./playwright-opener.ts";
import { REVIEW_WIDTHS } from "./screenshots.ts";

export type GateStatus = "PASS" | "BLOCKER";

/** Statuses from the 126 runners: Lighthouse, axe, console, links, and weight. */
export interface GateResult {
  lh: GateStatus;
  a11y: GateStatus;
  console: GateStatus;
  links: GateStatus;
  weight: GateStatus;
}

export interface ElevateRoundDeps {
  think: typeof think;
  pick: (items: ElevateItem[]) => Promise<ElevateItem[]>;
  runPrompt: (file: string) => Promise<void>;
  gates: () => Promise<GateResult>;
}

export interface ElevateRoundResult {
  applied: string[];
  refused: Array<{ id: string; reason: string }>;
}

const SOURCE_EXT = new Set([".astro", ".css", ".html", ".svelte", ".ts", ".tsx", ".vue"]);
const PASS_ORDER = ["motion", "imagery", "copy", "standout"] as const;

type PassName = (typeof PASS_ORDER)[number] | "type";

export function elevatePreviewFile(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "elevate", "preview-url");
}

export function toGateResult(report: {
  lighthouse: readonly { status: string }[];
  axe: { status: string };
  console: { errors: number; failedRequests: number };
  links: { pass: boolean };
  weight: { status: string };
}): GateResult {
  const rows = Array.isArray(report.lighthouse) ? report.lighthouse : [];
  const lh = rows.length > 0 && rows.every((row) => row.status === "PASS") ? "PASS" : "BLOCKER";
  const consoleClear =
    report.console.errors === 0 &&
    report.console.failedRequests === 0 &&
    Number.isFinite(report.console.errors) &&
    Number.isFinite(report.console.failedRequests);
  return {
    lh,
    a11y: report.axe.status === "PASS" ? "PASS" : "BLOCKER",
    console: consoleClear ? "PASS" : "BLOCKER",
    links: report.links.pass === true ? "PASS" : "BLOCKER",
    weight: report.weight.status === "PASS" ? "PASS" : "BLOCKER",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function calm(value: string): string {
  return value.replaceAll("!", ".").replaceAll("\u2014", "-").replace(/[\r\n]+/g, " ").trim();
}

function repoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 8; hop += 1) {
    const marker = path.join(dir, "packages", "knowledge", "golden", "elevate-type.md");
    if (existsSync(marker)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Golden Elevate templates are missing.");
}

function readPreview(projectDir: string): string | null {
  const file = elevatePreviewFile(projectDir);
  if (!existsSync(file)) return null;
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  if (line === undefined) return null;
  if (!/^https?:\/\//i.test(line)) {
    throw new Error("The preview URL must start with http:// or https://.");
  }
  return line;
}

function selectFull(files: readonly string[]): string[] {
  const byName = new Map(files.map((file) => [path.basename(file), file]));
  const shots: string[] = [];
  for (const width of REVIEW_WIDTHS) {
    const found = byName.get(`full-${width}.png`);
    if (found === undefined) {
      throw new Error(`Review shots are missing the ${width} width.`);
    }
    shots.push(found);
  }
  return shots;
}

async function coldShots(projectDir: string): Promise<string[]> {
  const url = readPreview(projectDir);
  if (url !== null) {
    const outDir = path.join(projectDir, ".hitchhiker", "elevate", "shots");
    const files = await captureReviewShots(url, [], outDir);
    return selectFull(files);
  }
  const dir = path.join(projectDir, ".hitchhiker", "elevate", "shots");
  const shots = REVIEW_WIDTHS.map((width) => path.join(dir, `full-${width}.png`));
  if (shots.some((file) => !existsSync(file))) {
    throw new Error("Set a preview URL before this round. Four review shots are missing.");
  }
  return shots;
}

function readFirst(projectDir: string, relatives: readonly string[], fallback: string): string {
  for (const relative of relatives) {
    const full = path.join(projectDir, relative);
    if (!existsSync(full)) continue;
    try {
      const text = readFileSync(full, "utf8").trim();
      if (text.length > 0) return text.slice(0, 4000);
    } catch {
      continue;
    }
  }
  return fallback;
}

function walkSource(dir: string, into: string[], cap: number): void {
  if (into.length >= cap) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const sorted = [...entries].sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of sorted) {
    if (into.length >= cap) return;
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".hitchhiker") continue;
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSource(full, into, cap);
    else if (entry.isFile() && SOURCE_EXT.has(path.extname(entry.name).toLowerCase())) into.push(full);
  }
}

function readCode(projectDir: string): string {
  const root = existsSync(path.join(projectDir, "src")) ? path.join(projectDir, "src") : projectDir;
  const files: string[] = [];
  walkSource(root, files, 6);
  const chunks: string[] = [];
  for (const file of files) {
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const relative = path.relative(projectDir, file);
    chunks.push(`FILE ${relative}\n${text.slice(0, 1500)}`);
  }
  const joined = chunks.join("\n\n").slice(0, 8000).trim();
  return joined.length > 0 ? joined : "No source files were read.";
}

function coldRead(projectDir: string, shots: readonly string[]): ElevateColdRead {
  return {
    shots,
    code: readCode(projectDir),
    brand: readFirst(
      projectDir,
      [path.join(".hitchhiker", "brand", "BRAND.md"), path.join(".hitchhiker", "BRAND.md"), "BRAND.md"],
      "No brand file in this project.",
    ),
    voice: readFirst(
      projectDir,
      [path.join(".hitchhiker", "brand", "VOICE.md"), path.join(".hitchhiker", "VOICE.md"), "VOICE.md"],
      "No voice file in this project.",
    ),
    motion: readFirst(
      projectDir,
      [path.join(".hitchhiker", "brand", "MOTION.md"), path.join(".hitchhiker", "MOTION.md"), "MOTION.md"],
      "No motion file in this project.",
    ),
  };
}

function nextRound(projectDir: string): number {
  const folder = path.join(projectDir, ".hitchhiker", "elevate");
  if (!existsSync(folder)) return 1;
  let max = 0;
  for (const name of readdirSync(folder)) {
    const match = /^ROUND-(\d+)\.md$/i.exec(name);
    const digits = match?.[1];
    if (digits === undefined) continue;
    const value = Number(digits);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max + 1;
}

function asItem(value: unknown): ElevateItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.file !== "string" || typeof value.change !== "string") return null;
  const file = value.file.trim();
  const change = value.change.trim();
  if (file.length === 0 || change.length === 0) return null;
  return { file, change };
}

function sameItem(left: ElevateItem, right: ElevateItem): boolean {
  return left.file === right.file && left.change === right.change;
}

function passOf(change: string): PassName {
  for (const name of PASS_ORDER) {
    if (new RegExp(`Pass ${name}\\b`, "i").test(change)) return name;
  }
  return "type";
}

function sectionLabel(pass: PassName): string {
  if (pass === "type") return "type and spacing";
  if (pass === "standout") return "standout feature";
  return pass;
}

function templateName(pass: PassName): string {
  if (pass === "motion") return "elevate-motion.md";
  if (pass === "imagery") return "elevate-imagery.md";
  if (pass === "copy") return "elevate-copy.md";
  if (pass === "standout") return "feature.md";
  return "elevate-type.md";
}

function slot(value: string): string {
  return calm(value).replaceAll("{{", "").replaceAll("}}", "");
}

function elementName(file: string): string {
  const base = path.basename(file, path.extname(file)).replace(/[^A-Za-z0-9]+/g, " ").trim();
  return base.length > 0 ? base : "page";
}

function fillTemplate(template: string, slots: Record<string, string>): string {
  let text = template;
  for (const [key, value] of Object.entries(slots)) {
    text = text.replaceAll(`{{${key}}}`, value);
  }
  return text;
}

async function writePickPrompt(projectDir: string, id: string, item: ElevateItem): Promise<string> {
  const pass = passOf(item.change);
  const templatePath = path.join(repoRoot(), "packages", "knowledge", "golden", templateName(pass));
  const template = readFileSync(templatePath, "utf8");
  const section = sectionLabel(pass);
  const body = fillTemplate(template, {
    files: slot(item.file),
    library: "vanilla",
    element: slot(elementName(item.file)),
    page: "/",
    section,
    anchor: section.replaceAll(" ", "-"),
  });
  const extra = [
    "",
    "Apply only this upgrade.",
    "",
    `File: ${slot(item.file)}`,
    `Change: ${slot(item.change)}`,
    "",
    "Do not apply a second upgrade in this prompt.",
    "",
  ].join("\n");
  const dir = path.join(projectDir, ".hitchhiker", "prompts", "elevate");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  await writeFile(file, `${body.trim()}\n${extra}`, "utf8");
  return file;
}

function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: "Hitchhiker",
    GIT_AUTHOR_EMAIL: "hh@localhost",
    GIT_COMMITTER_NAME: "Hitchhiker",
    GIT_COMMITTER_EMAIL: "hh@localhost",
  };
}

function emptyHooks(): string {
  const dir = path.join(os.tmpdir(), "hh-elevate-no-hooks");
  mkdirSync(dir, { recursive: true });
  return dir.replaceAll("\\", "/");
}

function git(dir: string, args: readonly string[]): Promise<string> {
  // An empty hooks path keeps a machine-level hook from blocking the revert.
  const full = [
    "-c",
    "user.name=Hitchhiker",
    "-c",
    "user.email=hh@localhost",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.editor=true",
    "-c",
    `core.hooksPath=${emptyHooks()}`,
    "-C",
    dir,
    ...args,
  ];
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      full,
      hiddenChildOptions({ encoding: "utf8", env: gitEnv(), maxBuffer: 8 * 1024 * 1024 }),
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim().length > 0 ? stderr.trim() : error.message;
          reject(new Error(calm(detail)));
          return;
        }
        resolve(String(stdout).trim());
      },
    );
  });
}

function isSecretPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  const base = path.posix.basename(normalized).toLowerCase();
  if (base === ".env" || base.startsWith(".env.") || base.endsWith(".pem")) return true;
  if (base === "credentials.json") return true;
  return base === "config.json" && path.posix.basename(path.posix.dirname(normalized)) === ".hitchhiker";
}

async function headOf(dir: string): Promise<string> {
  try {
    const head = await git(dir, ["rev-parse", "HEAD"]);
    if (/^[0-9a-f]+$/i.test(head)) return head;
  } catch {
    // A missing HEAD is reported by the caller.
  }
  throw new Error("This project is not a git repository, so a round cannot revert a commit.");
}

function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function untrackedFiles(porcelain: string): string[] {
  const files: string[] = [];
  for (const line of porcelain.split(/\r?\n/)) {
    if (!line.startsWith("?? ")) continue;
    let file = line.slice(3).trim();
    if (file.startsWith("\"") && file.endsWith("\"") && file.length >= 2) file = file.slice(1, -1);
    if (file.length > 0) files.push(file.replaceAll("\\", "/"));
  }
  return files;
}

function insideProject(projectDir: string, relative: string): string | null {
  if (relative.split(/[/\\]/).includes("..")) return null;
  const root = path.resolve(projectDir);
  const full = path.resolve(projectDir, relative);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (full !== root && !full.startsWith(prefix)) return null;
  return full;
}

async function assertClean(projectDir: string): Promise<void> {
  await headOf(projectDir);
  const foreign = linesOf(await git(projectDir, ["status", "--porcelain"])).filter(
    (line) => !line.replaceAll("\\", "/").includes(".hitchhiker/"),
  );
  if (foreign.length > 0) {
    throw new Error("Commit or stash project changes before a round.");
  }
}

async function commitPick(projectDir: string, message: string): Promise<void> {
  await git(projectDir, ["add", "-A"]);
  const staged = linesOf(await git(projectDir, ["diff", "--cached", "--name-only"]));
  const secrets = staged.filter((file) => isSecretPath(file));
  if (secrets.length > 0) {
    await git(projectDir, ["reset", "-q", "HEAD", "--", ...secrets]);
  }
  const remaining = linesOf(await git(projectDir, ["diff", "--cached", "--name-only"]));
  if (remaining.length === 0) return;
  if (remaining.some((file) => isSecretPath(file))) {
    throw new Error("A secret path was staged. The pick was not committed.");
  }
  await git(projectDir, ["commit", "-m", message]);
}

async function removeNewUntracked(projectDir: string, before: readonly string[]): Promise<void> {
  const known = new Set(before);
  const current = untrackedFiles(await git(projectDir, ["status", "--porcelain"]));
  for (const relative of current) {
    if (known.has(relative)) continue;
    if (relative.startsWith(".hitchhiker/")) continue;
    const full = insideProject(projectDir, relative);
    if (full === null) continue;
    await rm(full, { recursive: true, force: true });
  }
}

async function revertTo(projectDir: string, before: string, untracked: readonly string[]): Promise<void> {
  const list = linesOf(await git(projectDir, ["rev-list", "--reverse", `${before}..HEAD`]));
  const commits = list.filter((line) => /^[0-9a-f]+$/i.test(line));
  if (commits.length > 0) {
    try {
      for (const commit of [...commits].reverse()) {
        await git(projectDir, ["revert", "--no-edit", commit]);
      }
    } catch {
      await git(projectDir, ["reset", "--hard", before]);
    }
  } else {
    await git(projectDir, ["checkout", "--", "."]).catch(() => undefined);
  }
  await removeNewUntracked(projectDir, untracked);
}

const GATE_LABEL: Record<keyof GateResult, string> = {
  lh: "Lighthouse",
  a11y: "Accessibility",
  console: "Console",
  links: "Links",
  weight: "Weight",
};

function refusalReasons(before: GateResult, after: GateResult): string[] {
  const reasons: string[] = [];
  const keys = Object.keys(GATE_LABEL) as Array<keyof GateResult>;
  for (const key of keys) {
    if (after[key] !== "BLOCKER") continue;
    const label = GATE_LABEL[key];
    if (before[key] === "PASS") reasons.push(`${label} regressed to BLOCKER.`);
    else reasons.push(`${label} stayed BLOCKER.`);
  }
  return reasons.length > 0 ? reasons : ["A gate regressed."];
}

function blockedResult(): GateResult {
  return { lh: "BLOCKER", a11y: "BLOCKER", console: "BLOCKER", links: "BLOCKER", weight: "BLOCKER" };
}

function otherBlocked(result: GateResult): boolean {
  return result.console === "BLOCKER" || result.links === "BLOCKER" || result.weight === "BLOCKER";
}

async function writeRound(
  projectDir: string,
  round: number,
  ranked: readonly ElevateItem[],
  lines: readonly string[],
): Promise<void> {
  const dir = path.join(projectDir, ".hitchhiker", "elevate");
  await mkdir(dir, { recursive: true });
  const rankedLines =
    ranked.length === 0
      ? ["No upgrades this round."]
      : ranked.map((item, index) => `${index + 1}. ${calm(item.file)}: ${calm(item.change)}`);
  const body = [`# Round ${round}`, "", "How could this be better?", "", "Ranked:", ...rankedLines, "", ...lines, ""].join(
    "\n",
  );
  await writeFile(path.join(dir, `ROUND-${round}.md`), body, "utf8");
}

/**
 * One round. Picks nothing and the log says so. A gate that is BLOCKER
 * after a pick reverts that pick and is listed in `refused`.
 */
export async function elevateRound(projectDir: string, deps: ElevateRoundDeps): Promise<ElevateRoundResult> {
  if (!isRecord(deps) || typeof deps.think !== "function" || typeof deps.pick !== "function") {
    throw new Error("elevateRound needs think, pick, runPrompt, and gates.");
  }
  if (typeof deps.runPrompt !== "function" || typeof deps.gates !== "function") {
    throw new Error("elevateRound needs think, pick, runPrompt, and gates.");
  }
  const root = path.resolve(projectDir);
  const round = nextRound(root);
  const shots = await coldShots(root);
  const plan = await planElevateModel(coldRead(root, shots), { think: deps.think });
  const ranked = plan.items.slice(0, ELEVATE_CAP);
  const pickedRaw = await deps.pick(ranked);
  if (!Array.isArray(pickedRaw)) throw new Error("pick must return a list of upgrades.");

  const chosen: ElevateItem[] = [];
  for (const value of pickedRaw) {
    if (chosen.length >= ELEVATE_CAP) break;
    const item = asItem(value);
    if (item === null) continue;
    if (!ranked.some((planned) => sameItem(planned, item))) continue;
    if (chosen.some((planned) => sameItem(planned, item))) continue;
    chosen.push(item);
  }

  if (chosen.length === 0) {
    await writeRound(root, round, ranked, ["No picks. This round changes nothing."]);
    return { applied: [], refused: [] };
  }

  await assertClean(root);
  let prior = await deps.gates();
  const applied: string[] = [];
  const refused: Array<{ id: string; reason: string }> = [];

  for (let index = 0; index < chosen.length; index += 1) {
    const item = chosen[index];
    if (item === undefined) continue;
    const id = `r${round}-${String(index + 1).padStart(2, "0")}`;
    const headBefore = await headOf(root);
    const untracked = untrackedFiles(await git(root, ["status", "--porcelain"]));
    const file = await writePickPrompt(root, id, item);
    let next = prior;
    let gateError = "";
    const rollback = (): Promise<void> => revertTo(root, headBefore, untracked);
    const outcome = await runElevate({
      apply: async () => {
        await deps.runPrompt(file);
        await commitPick(root, id);
        try {
          next = await deps.gates();
        } catch (error) {
          gateError = error instanceof Error ? error.message : "Gate runner failed.";
          next = blockedResult();
        }
      },
      rollback,
      before: () => ({ lh: prior.lh, a11y: prior.a11y }),
      after: () => ({ lh: next.lh, a11y: next.a11y }),
    });
    const failed = outcome.status === "refused" || otherBlocked(next) || gateError.length > 0;
    if (!failed) {
      applied.push(id);
      prior = next;
      continue;
    }
    if (outcome.status !== "refused") await rollback();
    const reason =
      gateError.length > 0
        ? `Gates failed closed. ${calm(gateError)}`
        : refusalReasons(prior, next).join(" ");
    refused.push({ id, reason });
  }

  const outcomeLines = [
    ...applied.map((id) => `${id} kept.`),
    ...refused.map((row) => `${row.id} refused. ${row.reason}`),
  ];
  if (applied.length === 0) outcomeLines.push("Nothing was kept.");
  await writeRound(root, round, ranked, outcomeLines);
  return { applied, refused };
}
