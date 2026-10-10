/**
 * Before we jump, at the start of Babel Fish, Deep Thought, Improbability
 * Drive, Mostly Harmless, and So Long.
 *
 * Questions come from beforeWeJump (132). That generator pads to three
 * announcement lines when real gaps are fewer. This hook drops those lines.
 * Zero real gaps show one jump card and ask nothing. 132 hides items past
 * eight inside one line, so that hidden count is stored as ASSUMED.
 * An answer that would change an approved section is held until the user
 * reopens that approval.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { think, type JsonSchema, type ThinkRequest } from "../ai/index.ts";
import { BRAND_SECTIONS } from "../brand/approve.ts";
import type { AnswerRecord } from "../required.ts";
import { beforeWeJump } from "../spec/before-jump.ts";
import { loadTree, type Question } from "../tree.ts";
import {
  BeforeJumpError,
  blockingSection,
  brandApprovals,
  clearOverflow,
  clearPartial,
  loadAnswers,
  loadPartial,
  noteAssumed,
  readAnsweredIds,
  writeBack,
  type BeforeJumpAnswer,
  type BeforeJumpCard,
  type BeforeJumpTarget,
} from "./write-back.ts";

export {
  BeforeJumpError,
  clearPartial,
  loadPartial,
  savePartial,
  writeBack,
} from "./write-back.ts";
export type { BeforeJumpAnswer, BeforeJumpCard, BeforeJumpPartial, BeforeJumpTarget } from "./write-back.ts";

const PHASES = [
  "babel-fish",
  "deep-thought",
  "improbability-drive",
  "mostly-harmless",
  "so-long",
] as const;

export type BeforeJumpPhase = (typeof PHASES)[number];

const FILLERS = new Set([
  "What should the launch announcement avoid claiming?",
  "Which page should the launch announcement link to first?",
  "Who should read the launch announcement before it is sent?",
]);

const TESTIMONIAL = /\btestimonials?\b/i;
const ASSUMED_PREFIX = /^\s*ASSUMED:\s*/i;

const BRAND_ANCHOR: Record<string, string> = {
  logo: "logo",
  color: "tokens",
  type: "tokens",
  why: "purpose",
  slogan: "voice",
  mood: "imagery",
  kindred: "neighbors",
  imported: "purpose",
  imagery: "imagery",
  voice: "voice",
  purpose: "purpose",
  tokens: "tokens",
  neighbors: "neighbors",
};

const CONTRADICTION_SCHEMA: JsonSchema = {
  type: "object",
  required: ["contradicts", "section"],
  properties: {
    contradicts: { type: "boolean" },
    section: { type: "string", maxLength: 40 },
  },
};

export async function onPhaseStart(
  phase: BeforeJumpPhase,
  projectDir: string,
  deps: {
    ask: (cards: BeforeJumpCard[]) => Promise<BeforeJumpAnswer[]>;
    think: typeof think;
  },
): Promise<{ asked: number; written: string[] }> {
  assertPhase(phase);
  const root = path.resolve(projectDir);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new BeforeJumpError(`Project directory does not exist: ${root}`);
  }

  const drained = await drainPartial(root, deps.think);
  const answered = readAnsweredIds(root);
  const generated = beforeWeJump(
    generatorInput(loadAnswers(root), brandApprovals(root), await hasLegalPage(root), answered),
  );
  const tree = loadTree(resolveTree(root));
  const cards: BeforeJumpCard[] = [];
  let overflow: string | null = null;
  for (const question of generated.questions) {
    if (FILLERS.has(question) || TESTIMONIAL.test(question)) continue;
    const hidden = overflowNote(question);
    if (hidden !== null) overflow = hidden;
    const card = cardFor(question, tree);
    if (card === null || answered.has(card.id)) continue;
    cards.push(withWhy(card, phase));
  }
  if (overflow !== null) await noteAssumed(root, phase, overflow);
  else await clearOverflow(root, phase);

  const shown = cards.slice(0, 8);
  if (shown.length < cards.length) {
    const hidden = cards.length - shown.length;
    const noun = hidden === 1 ? "item is" : "items are";
    const verb = hidden === 1 ? "was" : "were";
    await noteAssumed(
      root,
      phase,
      `${hidden} more ${noun} still open and ${verb} not asked. Status: ASSUMED.`,
    );
  }
  if (shown.length === 0) {
    await deps.ask([jumpCard(phase)]);
    return { asked: 0, written: drained };
  }

  const replies = await deps.ask(shown);
  const written = [...drained];
  const pending: { answer: BeforeJumpAnswer; section: string }[] = [];
  for (const reply of takeUntilJump(replies)) {
    if (reply.action !== "answer") continue;
    const section = await findContradiction(root, reply, deps.think);
    if (section !== null) {
      pending.push({ answer: reply, section });
      continue;
    }
    const result = await writeBack(root, reply);
    if (result.startsWith("blocked:")) {
      pending.push({ answer: reply, section: result.slice("blocked:".length) });
      continue;
    }
    if (result !== "") written.push(result);
  }

  let followCount = 0;
  if (pending.length > 0) {
    const follow = pending.map((item) => reopenCard(phase, item.answer, item.section));
    followCount = follow.length;
    const followReplies = await deps.ask(follow);
    for (const reply of takeUntilJump(followReplies)) {
      if (reply.action !== "answer" || !affirms(reply.text)) continue;
      const original = pending.find((item) => reply.id === reopenId(item.section, item.answer.id));
      if (original === undefined || !isSection(original.section)) continue;
      const result = await writeBack(root, {
        ...original.answer,
        reopen: true,
        reopenSection: original.section,
      });
      if (result !== "" && !result.startsWith("blocked:")) written.push(result);
    }
  }

  await clearPartial(root);
  return { asked: shown.length + followCount, written };
}

async function drainPartial(projectDir: string, model: typeof think): Promise<string[]> {
  const partial = await loadPartial(projectDir);
  if (partial === null) return [];
  const written: string[] = [];
  for (const answer of partial.answers) {
    if (answer.action !== "answer") continue;
    const section = await findContradiction(projectDir, answer, model);
    if (section !== null) continue;
    const result = await writeBack(projectDir, answer);
    if (result === "" || result.startsWith("blocked:")) continue;
    written.push(result);
  }
  await clearPartial(projectDir);
  return written;
}

async function findContradiction(
  projectDir: string,
  answer: BeforeJumpAnswer,
  model: typeof think,
): Promise<string | null> {
  if (answer.reopenSection !== undefined && answer.reopenSection !== "") return null;
  const direct = blockingSection(projectDir, answer);
  if (direct !== null) return direct;
  const approvals = brandApprovals(projectDir);
  const approved = BRAND_SECTIONS.filter((section) => approvals[section] === true);
  if (approved.length === 0) return null;
  const request: ThinkRequest<{ contradicts: boolean; section: string }> = {
    task: "before-jump-contradiction",
    schema: CONTRADICTION_SCHEMA,
    effort: "medium",
    input: JSON.stringify({
      answer: answer.text.slice(0, 500),
      target: answer.target,
      field: answer.field,
      approved,
      excerpts: sectionExcerpts(projectDir),
    }),
  };
  const result = await model(request);
  const verdict = readVerdict(result.value);
  if (!verdict.contradicts || !isSection(verdict.section)) return null;
  if (approvals[verdict.section] !== true) return null;
  return verdict.section;
}

function generatorInput(
  answers: readonly AnswerRecord[],
  approvals: Record<string, boolean>,
  legal: boolean,
  answered: ReadonlySet<string>,
): { answers: AnswerRecord[]; approvals: Record<string, boolean>; hasLegalPage: boolean } {
  const nextApprovals = { ...approvals };
  for (const section of BRAND_SECTIONS) {
    if (answered.has(`brand:${section}`)) nextApprovals[section] = true;
  }
  const next = answers.map((answer) => ({ ...answer }));
  if (answered.has("domain")) {
    next.push({ id: "before-jump:domain", status: "ANSWERED", value: "domain owned. registrar is recorded." });
  }
  if (answered.has("dns")) {
    next.push({ id: "before-jump:dns", status: "ANSWERED", value: "dns records are recorded." });
  }
  if (answered.has("email")) {
    next.push({ id: "before-jump:email", status: "ANSWERED", value: "email is on the domain." });
  }
  if (answered.has("contradiction")) {
    const vibe = latest(next, "DP-5.3");
    const motion = latest(next, "DP-6.2");
    if (vibe !== undefined && isSettled(vibe)) {
      next.push({ ...vibe, value: vibe.value.replace(/\bcalm\b/gi, "quiet") });
    }
    if (motion !== undefined && isSettled(motion)) {
      next.push({ id: "DP-6.2", status: "ANSWERED", value: "4" });
    }
  }
  return {
    answers: next,
    approvals: nextApprovals,
    hasLegalPage: legal || answered.has("legal"),
  };
}

function cardFor(question: string, tree: readonly Question[]): BeforeJumpCard | null {
  const hidden = overflowNote(question);
  if (hidden !== null) {
    return draft("overflow", question, "The rest stay marked assumed.", "assumed", "overflow", null);
  }
  const brand = /^Brand section ([a-z]+) is unapproved\./.exec(question);
  if (brand?.[1] !== undefined && isSection(brand[1])) {
    return draft(`brand:${brand[1]}`, question, "This lands in that brand section.", "brand", brand[1], null);
  }
  if (question.startsWith("The host is still ")) {
    return draft("DP-9.2", question, "This lands in the deploy settings.", "deploy", "deployTarget", "DP-9.2");
  }
  if (question.startsWith("There is no legal page yet.")) {
    return draft("legal", question, "This lands in the site brief.", "brief", "legal", "DP-8.4");
  }
  if (question.startsWith("The voice says calm, but motion is ")) {
    return draft("contradiction", question, "This lands on the motion row.", "motion", "appetite", "DP-6.2");
  }
  if (question.startsWith("The domain is still open.")) {
    return draft("domain", question, "This lands in the deploy settings.", "deploy", "domain", null);
  }
  if (question.startsWith("DNS is still open.")) {
    return draft("dns", question, "This lands in the deploy settings.", "deploy", "dns", null);
  }
  if (question.startsWith("Email on the domain is still open.")) {
    return draft("email", question, "This lands in the deploy settings.", "deploy", "email", null);
  }
  if (question.startsWith("Analytics is still ")) {
    return draft("DP-3.8", question, "This lands in the site brief.", "brief", "analytics", "DP-3.8");
  }
  if (question.startsWith("The launch date is still ")) {
    return draft("DP-9.1", question, "This lands in the site brief.", "brief", "deadline", "DP-9.1");
  }
  if (question.startsWith("The site why is still ")) {
    return draft("DP-2.1", question, "This lands in the site brief.", "brief", "goal", "DP-2.1");
  }
  if (question.startsWith("The visitor is still ")) {
    return draft("DP-2.6", question, "This lands in the site brief.", "brief", "visitor", "DP-2.6");
  }
  if (question.startsWith("The one action is still ")) {
    return draft("DP-2.2", question, "This lands in the site brief.", "brief", "action", "DP-2.2");
  }
  if (question.startsWith("The vibe is still ")) {
    return draft("DP-5.3", question, "This lands in the voice file.", "voice", "vibe", "DP-5.3");
  }
  if (question.startsWith("Motion level is still ")) {
    return draft("DP-6.2", question, "This lands on the motion row.", "motion", "appetite", "DP-6.2");
  }
  const open = /^The answer ([A-Za-z0-9.-]+) is still /.exec(question);
  const id = open?.[1];
  if (id === undefined) return null;
  const questionRow = tree.find((item) => item.id === id);
  const mapped = targetFromWrites(questionRow?.writes ?? []);
  return draft(id, question, reasonFor(mapped.target), mapped.target, mapped.field, id);
}

function draft(
  id: string,
  ask: string,
  reason: string,
  target: BeforeJumpTarget,
  field: string,
  answerId: string | null,
): BeforeJumpCard {
  return { id, ask, why: reason, target, field, answerId, skippable: true };
}

function withWhy(card: BeforeJumpCard, phase: BeforeJumpPhase): BeforeJumpCard {
  const reason = card.why;
  return { ...card, why: `Before ${phaseLabel(phase)} starts. ${reason}` };
}

function jumpCard(phase: BeforeJumpPhase): BeforeJumpCard {
  return {
    id: "jump",
    ask: "Nothing open. Jumping.",
    why: `Before ${phaseLabel(phase)} starts. No gap is open. This phase can start.`,
    target: "jump",
    field: "",
    answerId: null,
    skippable: true,
  };
}

function reopenCard(phase: BeforeJumpPhase, answer: BeforeJumpAnswer, section: string): BeforeJumpCard {
  return {
    id: reopenId(section, answer.id),
    ask: `This answer contradicts the approved ${section} section. Reopen that approval?`,
    why: `Before ${phaseLabel(phase)} starts. The ${section} section stays as written until you reopen it.`,
    target: "jump",
    field: section,
    answerId: null,
    skippable: true,
  };
}

function reopenId(section: string, answerId: string): string {
  return `reopen:${section}:${answerId}`;
}

function reasonFor(target: BeforeJumpTarget): string {
  if (target === "brand") return "This lands in that brand section.";
  if (target === "voice") return "This lands in the voice file.";
  if (target === "motion") return "This lands on the motion row.";
  if (target === "stack") return "This lands in the stack record.";
  if (target === "deploy") return "This lands in the deploy settings.";
  if (target === "assumed") return "The rest stay marked assumed.";
  return "This lands in the site brief.";
}

function targetFromWrites(writes: readonly string[]): { target: BeforeJumpTarget; field: string } {
  for (const write of writes) {
    if (write.startsWith("VOICE.md")) return { target: "voice", field: anchor(write) || "item" };
    if (write.startsWith("MOTION.md")) return { target: "motion", field: anchor(write) || "appetite" };
    if (write.startsWith("BRAND.md")) {
      const name = anchor(write);
      const mapped = BRAND_ANCHOR[name];
      const field = mapped ?? (isSection(name) ? name : "purpose");
      return { target: "brand", field };
    }
    if (write.includes("STACK-DECISION")) return { target: "stack", field: "pick" };
    if (write.startsWith("DEPLOY")) return { target: "deploy", field: anchor(write) || "deployTarget" };
  }
  for (const write of writes) {
    if (write.startsWith("SITE-BRIEF.md")) return { target: "brief", field: anchor(write) || "goal" };
    if (write.endsWith("#hosting")) return { target: "deploy", field: "deployTarget" };
  }
  return { target: "brief", field: "notes" };
}

function overflowNote(question: string): string | null {
  const match = /^More items are unapproved\. (\d+) more (item is|items are) still open\./.exec(question);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const verb = match[2] === "item is" ? "was" : "were";
  return `${match[1]} more ${match[2]} still open and ${verb} not asked. Status: ASSUMED.`;
}

function takeUntilJump(answers: readonly BeforeJumpAnswer[]): BeforeJumpAnswer[] {
  const kept: BeforeJumpAnswer[] = [];
  for (const answer of answers) {
    if (answer.action === "jump" || answer.text.trim().toLowerCase() === "jump") break;
    kept.push(answer);
  }
  return kept;
}

function affirms(text: string): boolean {
  return /^\s*(yes|reopen)\b/i.test(text);
}

function phaseLabel(phase: BeforeJumpPhase): string {
  switch (phase) {
    case "babel-fish":
      return "Babel Fish";
    case "deep-thought":
      return "Deep Thought";
    case "improbability-drive":
      return "Improbability Drive";
    case "mostly-harmless":
      return "Mostly Harmless";
    case "so-long":
      return "So Long and Thanks for All the Fish";
  }
}

function assertPhase(phase: string): asserts phase is BeforeJumpPhase {
  if (!(PHASES as readonly string[]).includes(phase)) {
    throw new BeforeJumpError(`Unknown phase: ${phase}.`);
  }
}

async function hasLegalPage(projectDir: string): Promise<boolean> {
  const files = [
    path.join(projectDir, ".hitchhiker", "LEGAL.md"),
    path.join(projectDir, "legal.md"),
    path.join(projectDir, "privacy.md"),
    path.join(projectDir, "terms.md"),
  ];
  for (const file of files) {
    if (existsSync(file)) return true;
  }
  const dirs = ["pages", path.join("src", "pages"), path.join("src", "routes")];
  for (const rel of dirs) {
    const dir = path.join(projectDir, rel);
    if (!existsSync(dir)) continue;
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (/^(privacy|terms|legal)(?:\.|$)/i.test(name)) return true;
    }
  }
  return false;
}

function sectionExcerpts(projectDir: string): Record<string, string> {
  const file = path.join(projectDir, ".hitchhiker", "BRAND.md");
  if (!existsSync(file)) return {};
  let markdown = "";
  try {
    markdown = readBrand(file);
  } catch {
    return {};
  }
  const lines = markdown.split("\n");
  const excerpts: Record<string, string> = {};
  for (const section of BRAND_SECTIONS) {
    const heading = `## ${section.slice(0, 1).toUpperCase()}${section.slice(1)}`;
    const start = lines.findIndex((line) => line.trim() === heading);
    if (start < 0) continue;
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => line.startsWith("## "));
    const body = (end < 0 ? rest : rest.slice(0, end)).join(" ").replace(/\s+/g, " ").trim();
    if (body !== "") excerpts[section] = body.slice(0, 180);
  }
  return excerpts;
}

function readBrand(file: string): string {
  return readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function resolveTree(projectDir: string): string {
  const local = path.join(projectDir, "interview", "tree.yaml");
  if (existsSync(local)) return local;
  return path.resolve(import.meta.dirname, "..", "..", "..", "..", "interview", "tree.yaml");
}

function latest(answers: readonly AnswerRecord[], id: string): AnswerRecord | undefined {
  let found: AnswerRecord | undefined;
  for (const answer of answers) {
    if (answer.id === id) found = answer;
  }
  return found;
}

function isSettled(record: AnswerRecord): boolean {
  if (record.value.trim() === "") return false;
  if (record.status === "SOFT" || record.status === "SKIPPED") return false;
  if (ASSUMED_PREFIX.test(record.value)) return false;
  return record.status === "ANSWERED" || record.status === "SUGGESTED" || record.status === "IMPORTED";
}

function isSection(value: string): value is (typeof BRAND_SECTIONS)[number] {
  return (BRAND_SECTIONS as readonly string[]).includes(value);
}

function anchor(write: string): string {
  const hash = write.indexOf("#");
  if (hash === -1) return "";
  return write.slice(hash + 1);
}

function readVerdict(value: unknown): { contradicts: boolean; section: string } {
  if (typeof value !== "object" || value === null) return { contradicts: false, section: "" };
  const record = value as Record<string, unknown>;
  return {
    contradicts: record.contradicts === true,
    section: typeof record.section === "string" ? record.section : "",
  };
}
