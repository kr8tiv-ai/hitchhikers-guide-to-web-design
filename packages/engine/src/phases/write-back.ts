/**
 * Write a Before-we-jump answer into the file that owns that fact.
 * Brief fields go through renderBrief. Voice items go through renderVoice.
 * Motion rows go through planMotion. The stack pick goes through decideStack.
 * Deploy target goes through saveConfig. Brand sections are spliced, then
 * applyStatus keeps the approval line honest.
 * Approved brand sections are left untouched unless reopenSection names them.
 * Every successful answer is stored ANSWERED so the same fact is not asked again.
 * The state lock wraps the file replace. saveConfig and redoSection take that
 * same lock themselves, so they run outside this function's lock.
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { BRAND_SECTIONS, applyStatus, redoSection } from "../brand/approve.ts";
import { renderVoice } from "../brand/voice.ts";
import { loadConfig, saveConfig, type DeployTarget } from "../config.ts";
import { replaceViaTemp, withStateLock } from "../lock.ts";
import { renderBrief, type AnswerRecord } from "../required.ts";
import { planMotion } from "../spec/motion.ts";
import { decideStack, type StackPick } from "../spec/stack.ts";

export type BeforeJumpTarget =
  | "brief"
  | "brand"
  | "voice"
  | "motion"
  | "stack"
  | "deploy"
  | "assumed"
  | "jump";

export interface BeforeJumpCard {
  id: string;
  ask: string;
  why: string;
  target: BeforeJumpTarget;
  field: string;
  answerId: string | null;
  skippable: true;
}

export interface BeforeJumpAnswer {
  id: string;
  action: "answer" | "skip" | "jump";
  text: string;
  target: BeforeJumpTarget;
  field: string;
  answerId: string | null;
  reopen?: boolean;
  /** Brand section the user agreed to reopen. Absent means the file stays locked. */
  reopenSection?: string;
}

export interface BeforeJumpPartial {
  version: 1;
  phase: string;
  answers: BeforeJumpAnswer[];
}

export class BeforeJumpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BeforeJumpError";
  }
}

const STATUSES = ["ANSWERED", "SUGGESTED", "SKIPPED", "SOFT", "IMPORTED"] as const;
const DEPLOY_TARGETS = ["hostinger", "vercel", "netlify", "cloudflare", "undecided"] as const;
const BRIEF_COVERED = new Set(["DP-2.1", "DP-2.6", "DP-2.2", "DP-5.3", "DP-6.2", "DP-9.2"]);
const CANON_HEADINGS = new Set(["Goal", "Visitor", "Action", "Vibe", "Motion", "Hosting"]);
const DEPLOY_KEYS = ["deployTarget", "domain", "dns", "email", "analytics", "launchDate", "legal"] as const;

type DeployKey = (typeof DEPLOY_KEYS)[number];

interface InterviewFile {
  version: number;
  answers: AnswerRecord[];
  cursor: number;
  pushedIds: unknown;
  extra: Record<string, unknown>;
}

export async function writeBack(projectDir: string, answer: BeforeJumpAnswer): Promise<string> {
  if (answer.action === "jump" || answer.action === "skip") return "";
  if (answer.action !== "answer") {
    throw new BeforeJumpError("Unknown before-jump action.");
  }
  const text = cleanAnswer(answer.text);
  if (text === "") throw new BeforeJumpError("An empty answer is not stored.");
  const root = path.resolve(projectDir);
  const approvals = readApprovals(root);
  const blocked = blockedSection(answer, approvals);
  if (blocked !== null) return `blocked:${blocked}`;
  if (
    answer.reopenSection !== undefined &&
    isSection(answer.reopenSection) &&
    existsSync(brandPath(root))
  ) {
    await redoSection(root, answer.reopenSection);
  }

  const written = await withStateLock(root, async () => {
    const live = readApprovals(root);
    const still = blockedSection(answer, live);
    if (still !== null) return `blocked:${still}`;
    const interview = answer.answerId === null ? null : readInterview(root);
    if (interview !== null && answer.answerId !== null) {
      appendAnswer(interview, answer.answerId, text);
      await replaceViaTemp(interviewPath(root), renderInterview(interview));
    }
    const answers = interview?.answers ?? readInterview(root).answers;
    await replaceViaTemp(briefPath(root), renderBriefFile(root, answers, answer, text));
    const jump = withAnsweredId(readJump(root), answer.id);
    return writeTarget(root, answer, text, live, jump);
  });

  if (written.startsWith("blocked:")) return written;
  if (answer.target === "deploy" && answer.field === "deployTarget") {
    const deployTarget = parseDeployTarget(text) ?? "undecided";
    const config = loadConfig(root);
    await saveConfig(root, { ...config, deployTarget });
  }
  return written;
}

export async function savePartial(
  projectDir: string,
  phase: string,
  answers: readonly BeforeJumpAnswer[],
): Promise<void> {
  const root = path.resolve(projectDir);
  await withStateLock(root, async () => {
    const existing = readPartialSync(root);
    const byId = new Map<string, BeforeJumpAnswer>();
    for (const answer of existing) {
      if (answer.action === "answer") byId.set(answer.id, answer);
    }
    for (const answer of answers) {
      if (answer.action === "answer") byId.set(answer.id, answer);
    }
    const body: BeforeJumpPartial = { version: 1, phase, answers: [...byId.values()] };
    await replaceViaTemp(partialPath(root), `${JSON.stringify(body, null, 2)}\n`);
  });
}

export async function loadPartial(projectDir: string): Promise<BeforeJumpPartial | null> {
  const file = partialPath(path.resolve(projectDir));
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as unknown;
  } catch {
    throw new BeforeJumpError("before-jump-partial.json is not valid JSON.");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.answers) || typeof parsed.phase !== "string") {
    throw new BeforeJumpError("before-jump-partial.json is missing answers.");
  }
  const answers: BeforeJumpAnswer[] = [];
  for (const item of parsed.answers) {
    const answer = readAnswer(item);
    if (answer !== null && answer.action === "answer") answers.push(answer);
  }
  if (answers.length === 0) return null;
  return { version: 1, phase: parsed.phase, answers };
}

export async function clearPartial(projectDir: string): Promise<void> {
  const root = path.resolve(projectDir);
  const file = partialPath(root);
  if (!existsSync(file)) return;
  await withStateLock(root, async () => {
    await replaceViaTemp(file, `${JSON.stringify({ version: 1, phase: "", answers: [] }, null, 2)}\n`);
  });
}

export function loadAnswers(projectDir: string): AnswerRecord[] {
  return readInterview(path.resolve(projectDir)).answers;
}

export function brandApprovals(projectDir: string): Record<string, boolean> {
  return readApprovals(path.resolve(projectDir));
}

export function blockingSection(projectDir: string, answer: BeforeJumpAnswer): string | null {
  return blockedSection(answer, readApprovals(path.resolve(projectDir)));
}

export function readAnsweredIds(projectDir: string): Set<string> {
  const data = readJump(path.resolve(projectDir));
  const ids = new Set<string>();
  if (!Array.isArray(data.answered)) return ids;
  for (const item of data.answered) {
    if (typeof item === "string" && item !== "") ids.add(item);
  }
  return ids;
}

export async function noteAssumed(projectDir: string, phase: string, note: string): Promise<void> {
  const root = path.resolve(projectDir);
  await withStateLock(root, async () => {
    const data = readJump(root);
    data.version = 1;
    data.assumed = upsertAssumed(data.assumed, {
      status: "ASSUMED",
      kind: "overflow",
      phase,
      note,
    });
    await replaceViaTemp(jumpPath(root), `${JSON.stringify(data, null, 2)}\n`);
  });
}

export async function clearOverflow(projectDir: string, phase: string): Promise<void> {
  const root = path.resolve(projectDir);
  const file = jumpPath(root);
  if (!existsSync(file)) return;
  await withStateLock(root, async () => {
    const data = readJump(root);
    if (!Array.isArray(data.assumed)) return;
    const next = data.assumed.filter((item) => {
      if (!isRecord(item)) return true;
      return !(item.kind === "overflow" && item.phase === phase);
    });
    if (next.length === data.assumed.length) return;
    data.assumed = next;
    data.version = 1;
    await replaceViaTemp(file, `${JSON.stringify(data, null, 2)}\n`);
  });
}

function withAnsweredId(data: Record<string, unknown>, id: string): Record<string, unknown> {
  const current = Array.isArray(data.answered)
    ? data.answered.filter((item): item is string => typeof item === "string")
    : [];
  if (!current.includes(id)) current.push(id);
  current.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { ...data, version: 1, answered: current };
}

async function writeTarget(
  projectDir: string,
  answer: BeforeJumpAnswer,
  text: string,
  approvals: Record<string, boolean>,
  jump: Record<string, unknown>,
): Promise<string> {
  if (answer.target === "assumed") return writeAssumed(projectDir, text, jump);
  await replaceViaTemp(jumpPath(projectDir), `${JSON.stringify(jump, null, 2)}\n`);
  switch (answer.target) {
    case "brief":
      return briefPath(projectDir);
    case "brand":
      return writeBrand(projectDir, answer.field, text, approvals);
    case "voice":
      return writeVoice(projectDir, answer.field, text);
    case "motion":
      return writeMotion(projectDir, answer.field, text);
    case "stack":
      return writeStack(projectDir, text);
    case "deploy":
      return writeDeploy(projectDir, answer.field, text);
    case "jump":
      return "";
    default: {
      const unexpected: never = answer.target;
      throw new BeforeJumpError(`Unknown before-jump target ${String(unexpected)}.`);
    }
  }
}

async function writeBrand(
  projectDir: string,
  field: string,
  text: string,
  approvals: Record<string, boolean>,
): Promise<string> {
  if (!isSection(field)) throw new BeforeJumpError(`Unknown brand section: ${field}.`);
  const file = brandPath(projectDir);
  const current = existsSync(file) ? await readFile(file, "utf8") : blankBrand();
  const spliced = upsertSection(current, titleCase(field), text);
  const next = applyStatus(spliced, approvals);
  await replaceViaTemp(file, next.endsWith("\n") ? next : `${next}\n`);
  return file;
}

async function writeVoice(projectDir: string, field: string, text: string): Promise<string> {
  const vibe = text.includes(",") ? text : "direct, specific, plain";
  const doc = renderVoice({
    vibe,
    antiVibe: "loud, flash, clutter",
    positioning: "For the visitor, the site is the offer that does the job.",
    offer: "the work",
  });
  const heading = field === "" ? "item" : field;
  const markdown = `${doc.markdown.trimEnd()}\n\n## ${heading}\n\n${text}\n`;
  const file = voicePath(projectDir);
  await replaceViaTemp(file, markdown);
  return file;
}

async function writeMotion(projectDir: string, field: string, text: string): Promise<string> {
  const appetite = lastLevel(text) ?? lastLevel(latestValue(readInterview(projectDir).answers, "DP-6.2")) ?? 4;
  const plan = planMotion({
    requests: [{ id: "hero-fade", kind: "tiny-fade", element: "hero", page: "home" }],
    appetite,
    stack: "astro",
  });
  const heading = field === "" ? "appetite" : field;
  const markdown = `${plan.markdown.trimEnd()}\n\n## ${heading}\n\n${text}\n`;
  const file = motionPath(projectDir);
  await replaceViaTemp(file, markdown);
  return file;
}

async function writeStack(projectDir: string, text: string): Promise<string> {
  const motionLevel = lastLevel(latestValue(readInterview(projectDir).answers, "DP-6.2")) ?? 4;
  const decision = decideStack({
    siteType: "marketing",
    motionLevel,
    persistentCanvas: false,
    userOverride: parsePick(text),
  });
  const markdown = `${decision.markdown.trimEnd()}\n\n## Before we jump\n\n${text}\n`;
  const file = stackPath(projectDir);
  await mkdir(path.dirname(file), { recursive: true });
  await replaceViaTemp(file, markdown);
  return file;
}

async function writeDeploy(projectDir: string, field: string, text: string): Promise<string> {
  const file = deployPath(projectDir);
  const settings = readDeploy(existsSync(file) ? await readFile(file, "utf8") : "");
  if (settings.deployTarget === "") settings.deployTarget = loadConfig(projectDir).deployTarget;
  const key = deployKey(field);
  if (key === "deployTarget") {
    settings.deployTarget = parseDeployTarget(text) ?? "undecided";
  } else {
    settings[key] = text;
  }
  await replaceViaTemp(file, renderDeploy(settings));
  return file;
}

async function writeAssumed(
  projectDir: string,
  text: string,
  jump: Record<string, unknown>,
): Promise<string> {
  const data: Record<string, unknown> = { ...jump, version: 1 };
  data.assumed = upsertAssumed(data.assumed, { status: "ASSUMED", kind: "reply", note: text });
  const file = jumpPath(projectDir);
  await replaceViaTemp(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

function renderBriefFile(
  projectDir: string,
  answers: readonly AnswerRecord[],
  answer: BeforeJumpAnswer,
  text: string,
): string {
  const previous = existsSync(briefPath(projectDir)) ? readFileSync(briefPath(projectDir), "utf8") : "";
  const extras = extraSections(previous);
  if (answer.target === "brief" && answer.answerId !== null && !BRIEF_COVERED.has(answer.answerId)) {
    const heading = answer.field === "" ? "notes" : answer.field;
    extras.set(heading, text);
  }
  if (answer.target === "brief" && answer.answerId === null && answer.field !== "") {
    extras.set(answer.field, text);
  }
  const brief = renderBrief([...answers]);
  return withExtras(brief, extras);
}

function extraSections(markdown: string): Map<string, string> {
  const map = new Map<string, string>();
  const parts = markdown.split(/^## /m).slice(1);
  for (const part of parts) {
    const breakAt = part.indexOf("\n");
    const title = (breakAt === -1 ? part : part.slice(0, breakAt)).trim();
    if (title === "" || CANON_HEADINGS.has(title)) continue;
    const body = breakAt === -1 ? "" : part.slice(breakAt + 1).replace(/\nCoverage:[\s\S]*$/, "").trim();
    map.set(title, body);
  }
  return map;
}

function withExtras(brief: string, extras: Map<string, string>): string {
  const matched = brief.match(/\nCoverage:[\s\S]*$/);
  const head = matched?.index === undefined ? brief : brief.slice(0, matched.index);
  const tail = matched?.[0] ?? "";
  const blocks = [...extras.entries()]
    .map(([title, body]) => `## ${title}\n\n${body}\n\n`)
    .join("");
  const core = blocks === "" ? `${head.trimEnd()}\n` : `${head.trimEnd()}\n\n${blocks}`;
  return `${core}${tail.replace(/^\n/, "")}\n`;
}

function blankBrand(): string {
  const sections = BRAND_SECTIONS.map((section) => `## ${titleCase(section)}\n\nNot stated yet.\n`).join("\n");
  return `# BRAND\n\nStatus: draft\n\n${sections}`;
}

function upsertSection(markdown: string, heading: string, body: string): string {
  const pattern = new RegExp(`(^## ${escapeRegExp(heading)}\\n)[\\s\\S]*?(?=^## |$)`, "m");
  const block = `## ${heading}\n\n${body.trim()}\n\n`;
  if (pattern.test(markdown)) return markdown.replace(pattern, block);
  return `${markdown.trimEnd()}\n\n${block}`;
}

function readDeploy(markdown: string): Record<DeployKey, string> {
  const settings = emptyDeploy();
  for (const line of markdown.split("\n")) {
    const match = /^- ([A-Za-z]+): (.*)$/.exec(line);
    const key = match?.[1];
    const value = match?.[2];
    if (key === undefined || value === undefined || !isDeployKey(key)) continue;
    settings[key] = value.trim();
  }
  return settings;
}

function renderDeploy(settings: Record<DeployKey, string>): string {
  const lines = [
    "# DEPLOY",
    "",
    "Deploy runs only after an explicit yes.",
    "",
    "## Settings",
    "",
  ];
  for (const key of DEPLOY_KEYS) lines.push(`- ${key}: ${settings[key]}`);
  lines.push("");
  return lines.join("\n");
}

function emptyDeploy(): Record<DeployKey, string> {
  return {
    deployTarget: "",
    domain: "",
    dns: "",
    email: "",
    analytics: "",
    launchDate: "",
    legal: "",
  };
}

function deployKey(field: string): DeployKey {
  if (isDeployKey(field)) return field;
  return "legal";
}

function isDeployKey(value: string): value is DeployKey {
  return (DEPLOY_KEYS as readonly string[]).includes(value);
}

function parseDeployTarget(text: string): DeployTarget | null {
  const lower = text.toLowerCase();
  for (const target of DEPLOY_TARGETS) {
    if (lower.includes(target)) return target;
  }
  if (/\bno idea\b/.test(lower)) return "undecided";
  return null;
}

function parsePick(text: string): StackPick | null {
  const lower = text.toLowerCase();
  if (/\bvite[-\s+]?react\b/.test(lower)) return "vite-react";
  if (/\bsveltekit\b/.test(lower) || /\bsvelte\b/.test(lower)) return "sveltekit";
  if (/\bnext(?:\.js)?\b/.test(lower)) return "next";
  if (/\bastro\b/.test(lower)) return "astro";
  return null;
}

function lastLevel(text: string): number | null {
  const matches = text.match(/\b(10|[1-9])\b/g);
  if (matches === null || matches.length === 0) return null;
  const digits = matches[matches.length - 1];
  if (digits === undefined) return null;
  const level = Number(digits);
  if (level < 1 || level > 10) return null;
  return level;
}

function latestValue(answers: readonly AnswerRecord[], id: string): string {
  let value = "";
  for (const answer of answers) {
    if (answer.id === id) value = answer.value;
  }
  return value;
}

function touchedSection(answer: BeforeJumpAnswer): string | null {
  if (answer.target === "brand" && isSection(answer.field)) return answer.field;
  if (answer.target === "voice") return "voice";
  return null;
}

function blockedSection(answer: BeforeJumpAnswer, approvals: Record<string, boolean>): string | null {
  const section = touchedSection(answer);
  if (section === null) return null;
  if (approvals[section] !== true) return null;
  if (answer.reopenSection === section) return null;
  return section;
}

function readApprovals(projectDir: string): Record<string, boolean> {
  const approvals: Record<string, boolean> = {};
  for (const section of BRAND_SECTIONS) approvals[section] = false;
  const file = approvalPath(projectDir);
  if (!existsSync(file)) return approvals;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as unknown;
  } catch {
    throw new BeforeJumpError("brand-approval.json is not valid JSON.");
  }
  if (!isRecord(parsed)) throw new BeforeJumpError("brand-approval.json is not an object.");
  for (const section of BRAND_SECTIONS) {
    const value = parsed[section];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      throw new BeforeJumpError(`brand-approval.json ${section} is not a boolean.`);
    }
    approvals[section] = value;
  }
  return approvals;
}

function readInterview(projectDir: string): InterviewFile {
  const file = interviewPath(projectDir);
  if (!existsSync(file)) {
    return { version: 1, answers: [], cursor: 0, pushedIds: [], extra: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as unknown;
  } catch {
    throw new BeforeJumpError("interview.json is not valid JSON.");
  }
  if (Array.isArray(parsed)) {
    return { version: 1, answers: parsed.map((item, index) => requireAnswer(item, index)), cursor: 0, pushedIds: [], extra: {} };
  }
  if (!isRecord(parsed)) throw new BeforeJumpError("interview.json must be an array of answers or version 1.");
  const list = Array.isArray(parsed.answers) ? parsed.answers : null;
  if (list === null) throw new BeforeJumpError("interview.json answers must be an array.");
  const cursor = typeof parsed.cursor === "number" && parsed.cursor >= 0 ? parsed.cursor : 0;
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "version" || key === "answers" || key === "cursor" || key === "pushedIds") continue;
    extra[key] = value;
  }
  return {
    version: 1,
    answers: list.map((item, index) => requireAnswer(item, index)),
    cursor,
    pushedIds: parsed.pushedIds ?? [],
    extra,
  };
}

function requireAnswer(value: unknown, index: number): AnswerRecord {
  if (!isRecord(value) || typeof value.id !== "string" || value.id === "") {
    throw new BeforeJumpError(`interview.json item ${index + 1} is missing an id.`);
  }
  if (typeof value.status !== "string" || !isStatus(value.status)) {
    throw new BeforeJumpError(`interview.json item ${index + 1} has an unknown status.`);
  }
  if (typeof value.value !== "string") {
    throw new BeforeJumpError(`interview.json item ${index + 1} is missing a value.`);
  }
  return { id: value.id, status: value.status, value: value.value };
}

function appendAnswer(file: InterviewFile, id: string, text: string): void {
  const latest = file.answers.filter((item) => item.id === id).at(-1);
  if (latest?.status === "ANSWERED" && latest.value === text) return;
  file.answers = [...file.answers, { id, status: "ANSWERED", value: text }];
}

function renderInterview(file: InterviewFile): string {
  const body = {
    ...file.extra,
    version: 1,
    answers: file.answers,
    cursor: file.cursor,
    pushedIds: file.pushedIds,
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

function readJump(projectDir: string): Record<string, unknown> {
  const file = jumpPath(projectDir);
  if (!existsSync(file)) return { version: 1 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as unknown;
  } catch {
    throw new BeforeJumpError("before-we-jump.json is not valid JSON.");
  }
  if (!isRecord(parsed)) throw new BeforeJumpError("before-we-jump.json is not an object.");
  return { ...parsed, version: 1 };
}

function upsertAssumed(current: unknown, entry: Record<string, string>): Record<string, string>[] {
  const list = Array.isArray(current) ? current.filter(isRecord) : [];
  const kept = list.filter((item) => {
    if (entry.kind === "overflow" && item.kind === "overflow" && item.phase === entry.phase) return false;
    return true;
  });
  const next: Record<string, string>[] = [];
  for (const item of kept) {
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(item)) {
      if (typeof value === "string") record[key] = value;
    }
    next.push(record);
  }
  next.push(entry);
  return next;
}

function readPartialSync(projectDir: string): BeforeJumpAnswer[] {
  const file = partialPath(projectDir);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.answers)) return [];
    const answers: BeforeJumpAnswer[] = [];
    for (const item of parsed.answers) {
      const answer = readAnswer(item);
      if (answer !== null) answers.push(answer);
    }
    return answers;
  } catch {
    return [];
  }
}

function readAnswer(value: unknown): BeforeJumpAnswer | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.text !== "string") return null;
  if (value.action !== "answer" && value.action !== "skip" && value.action !== "jump") return null;
  if (!isTarget(value.target)) return null;
  if (typeof value.field !== "string") return null;
  const answerId = value.answerId === null || typeof value.answerId === "string" ? value.answerId : null;
  const answer: BeforeJumpAnswer = {
    id: value.id,
    action: value.action,
    text: value.text,
    target: value.target,
    field: value.field,
    answerId: answerId ?? null,
  };
  if (typeof value.reopenSection === "string") answer.reopenSection = value.reopenSection;
  return answer;
}

function isTarget(value: unknown): value is BeforeJumpTarget {
  return (
    value === "brief" ||
    value === "brand" ||
    value === "voice" ||
    value === "motion" ||
    value === "stack" ||
    value === "deploy" ||
    value === "assumed" ||
    value === "jump"
  );
}

function isStatus(value: string): value is AnswerRecord["status"] {
  return (STATUSES as readonly string[]).includes(value);
}

function isSection(value: string): value is (typeof BRAND_SECTIONS)[number] {
  return (BRAND_SECTIONS as readonly string[]).includes(value);
}

function titleCase(section: string): string {
  return `${section.slice(0, 1).toUpperCase()}${section.slice(1)}`;
}

function cleanAnswer(text: string): string {
  return text
    .replace(/[!！]/g, "")
    .replace(/\u2014/g, ", ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hitch(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker");
}

function interviewPath(projectDir: string): string {
  return path.join(hitch(projectDir), "interview.json");
}

function briefPath(projectDir: string): string {
  return path.join(hitch(projectDir), "SITE-BRIEF.md");
}

function brandPath(projectDir: string): string {
  return path.join(hitch(projectDir), "BRAND.md");
}

function voicePath(projectDir: string): string {
  return path.join(hitch(projectDir), "VOICE.md");
}

function motionPath(projectDir: string): string {
  return path.join(hitch(projectDir), "MOTION.md");
}

function stackPath(projectDir: string): string {
  return path.join(hitch(projectDir), "research", "STACK-DECISION.md");
}

function deployPath(projectDir: string): string {
  return path.join(hitch(projectDir), "DEPLOY.md");
}

function approvalPath(projectDir: string): string {
  return path.join(hitch(projectDir), "brand-approval.json");
}

function jumpPath(projectDir: string): string {
  return path.join(hitch(projectDir), "before-we-jump.json");
}

function partialPath(projectDir: string): string {
  return path.join(hitch(projectDir), "before-jump-partial.json");
}
