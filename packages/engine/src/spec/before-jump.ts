/**
 * Before we jump. One list for the start of Babel Fish, Deep Thought,
 * Improbability Drive, Mostly Harmless, and So Long.
 *
 * Pure. No disk. The locked signature has no adapter argument, so this
 * module does not call the 011 client. Same constraint as renderPrd.
 * Question text is fixed here and checked by tests.
 *
 * Gaps come from the answer list, brand approvals, and the legal-page flag.
 * Hosting `no idea`, each unapproved BRAND_SECTIONS entry, a missing legal
 * page, a calm voice beside motion 9 or 10, So Long checks (domain, DNS,
 * email, analytics, launch date), and every SOFT, SKIPPED, or Express
 * `ASSUMED:` row. ANSWERED, SUGGESTED, and IMPORTED rows are not asked again.
 * DP-8.2 is never asked: that question requests proof, including testimonials.
 *
 * Length is 3 to 8. The prompt also says to return zero and never pad.
 * CONTEXT-PACKAGE asks for 3 to 8, and the steps say to pick that floor.
 * Under three real gaps, the named launch question and two announcement
 * fillers make up the difference. They do not invent a claim. At three or
 * more real gaps, nothing is added. Over eight, the last line says more
 * items are unapproved.
 */

import { BRAND_SECTIONS } from "../brand/approve.ts";
import { BANNED_PHRASES, BANNED_WORDS } from "../brand/voice.ts";
import type { AnswerRecord } from "../required.ts";

const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 8;

const HOSTING_ID = "DP-9.2";
const VIBE_ID = "DP-5.3";
const MOTION_PERSONALITY_ID = "DP-5.4e";
const MOTION_ID = "DP-6.2";
const ANALYTICS_ID = "DP-3.8";
const LAUNCH_DATE_ID = "DP-9.1";
const LEGAL_COPY_ID = "DP-8.4";
const PROOF_ID = "DP-8.2";

const CALM_IDS = [VIBE_ID, MOTION_PERSONALITY_ID] as const;

const REQUIRED_GAPS: readonly { id: string; ask: (state: string) => string }[] = [
  { id: "DP-2.1", ask: (state) => `The site why is still ${state}. What should the site do?` },
  { id: "DP-2.6", ask: (state) => `The visitor is still ${state}. Who is the one person this site is for?` },
  { id: "DP-2.2", ask: (state) => `The one action is still ${state}. What should that visitor do?` },
  {
    id: VIBE_ID,
    ask: (state) =>
      `The vibe is still ${state}. Which three words should it feel like, and which three should it refuse?`,
  },
  {
    id: MOTION_ID,
    ask: (state) => `Motion level is still ${state}. What whole number from 1 to 10 should it be?`,
  },
];

/** Used only when real gaps are below the floor. They do not request proof. */
const FILLERS = [
  "What should the launch announcement avoid claiming?",
  "Which page should the launch announcement link to first?",
  "Who should read the launch announcement before it is sent?",
] as const;

const NO_IDEA_RE = /\bno idea\b/i;
const CALM_RE = /\bcalm\b/i;
const MOTION_RE = /\b(10|[1-9])\b/;
const HOSTNAME_RE = /\b[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.[a-z]{2,24}\b/i;
const DOMAIN_PHRASE_RE = /\bdomain\s+owned\b|\bown(?:s|ed)?\s+the\s+domain\b|\bregistrar\s+is\b/i;
const DNS_PHRASE_RE = /\bdns\s+records?\b|\bnameservers?\b|\bdns\s+is\b/i;
const EMAIL_PHRASE_RE = /\bemail\s+is\s+on\s+the\s+domain\b|\bemail\s+on\s+(?:the\s+)?domain\b|\bmailbox(?:es)?\s+on\s+(?:the\s+)?domain\b/i;
const TESTIMONIAL_RE = /\btestimonials?\b/i;
const ASSUMED_PREFIX_RE = /^\s*ASSUMED:\s*/i;

type Openness = "open" | "soft" | "skipped" | "express";

interface Draft {
  key: string;
  question: string;
  covers: readonly string[];
}

export function beforeWeJump(input: {
  answers: AnswerRecord[];
  approvals: Record<string, boolean>;
  hasLegalPage: boolean;
}): { questions: string[] } {
  const latest = latestById(input.answers);
  const drafts: Draft[] = [];
  const covered = new Set<string>();

  push(drafts, covered, hostingDraft(latest));
  for (const section of BRAND_SECTIONS) {
    if (input.approvals[section] === true) continue;
    push(drafts, covered, {
      key: `brand:${section}`,
      covers: [],
      question: `Brand section ${section} is unapproved. What should change in ${section} before launch?`,
    });
  }
  if (input.hasLegalPage !== true) {
    push(drafts, covered, {
      key: "legal",
      covers: [LEGAL_COPY_ID],
      question:
        "There is no legal page yet. Which legal pages should ship before launch: privacy, terms, or both?",
    });
  }
  push(drafts, covered, contradictionDraft(latest));
  push(drafts, covered, domainDraft(latest));
  push(drafts, covered, dnsDraft(latest));
  push(drafts, covered, emailDraft(latest));
  push(drafts, covered, analyticsDraft(latest));
  push(drafts, covered, launchDateDraft(latest));
  for (const gap of REQUIRED_GAPS) {
    const record = latest.get(gap.id);
    if (isSettled(record) || covered.has(gap.id)) continue;
    push(drafts, covered, {
      key: `required:${gap.id}`,
      covers: [gap.id],
      question: gap.ask(stateClause(openness(record))),
    });
  }
  for (const record of openRecords(latest, covered)) {
    push(drafts, covered, {
      key: `open:${record.id}`,
      covers: [record.id],
      question: openAnswerQuestion(record),
    });
  }

  return { questions: bound(drafts.map((draft) => draft.question)) };
}

function hostingDraft(latest: ReadonlyMap<string, AnswerRecord>): Draft | null {
  const record = latest.get(HOSTING_ID);
  const value = record?.value ?? "";
  if (NO_IDEA_RE.test(value)) {
    const express = record !== undefined && isExpressDefault(record) ? " Express stored that default." : "";
    return {
      key: "hosting",
      covers: [HOSTING_ID],
      question: `The host is still no idea.${express} Where should the site be hosted?`,
    };
  }
  if (isSettled(record)) return null;
  return {
    key: "hosting",
    covers: [HOSTING_ID],
    question: `The host is still ${stateClause(openness(record))}. Where should the site be hosted?`,
  };
}

function contradictionDraft(latest: ReadonlyMap<string, AnswerRecord>): Draft | null {
  if (!voiceSaysCalm(latest)) return null;
  const level = motionLevel(latest);
  if (level !== 9 && level !== 10) return null;
  return {
    key: "contradiction:calm-motion",
    covers: [VIBE_ID, MOTION_ID, MOTION_PERSONALITY_ID],
    question: `The voice says calm, but motion is ${level}. Want a calm ${level} (slow camera, no flashes), or should it drop to 7?`,
  };
}

function domainDraft(latest: ReadonlyMap<string, AnswerRecord>): Draft | null {
  const hosting = latest.get(HOSTING_ID)?.value ?? "";
  if (HOSTNAME_RE.test(hosting) || DOMAIN_PHRASE_RE.test(hosting) || DOMAIN_PHRASE_RE.test(settledBlob(latest))) {
    return null;
  }
  return {
    key: "domain",
    covers: [],
    question: "The domain is still open. Which name should the site use, and who is the registrar?",
  };
}

function dnsDraft(latest: ReadonlyMap<string, AnswerRecord>): Draft | null {
  const hosting = latest.get(HOSTING_ID)?.value ?? "";
  if (DNS_PHRASE_RE.test(hosting) || DNS_PHRASE_RE.test(settledBlob(latest))) return null;
  return {
    key: "dns",
    covers: [],
    question: "DNS is still open. Who can change the records before launch?",
  };
}

function emailDraft(latest: ReadonlyMap<string, AnswerRecord>): Draft | null {
  const hosting = latest.get(HOSTING_ID)?.value ?? "";
  if (EMAIL_PHRASE_RE.test(hosting) || EMAIL_PHRASE_RE.test(settledBlob(latest))) return null;
  return {
    key: "email",
    covers: [],
    question: "Email on the domain is still open. Which address should the site use?",
  };
}

function analyticsDraft(latest: ReadonlyMap<string, AnswerRecord>): Draft | null {
  const record = latest.get(ANALYTICS_ID);
  if (isSettled(record)) return null;
  return {
    key: "analytics",
    covers: [ANALYTICS_ID],
    question: `Analytics is still ${stateClause(openness(record))}. Which should launch use: Plausible, Umami, or GA4 with consent?`,
  };
}

function launchDateDraft(latest: ReadonlyMap<string, AnswerRecord>): Draft | null {
  const record = latest.get(LAUNCH_DATE_ID);
  if (isSettled(record)) return null;
  return {
    key: "launch-date",
    covers: [LAUNCH_DATE_ID],
    question: `The launch date is still ${stateClause(openness(record))}. What date should the site go live?`,
  };
}

function openAnswerQuestion(record: AnswerRecord): string {
  return `The answer ${record.id} is still ${stateClause(openness(record))}${quoted(record.value)}. What should it be before launch?`;
}

function push(drafts: Draft[], covered: Set<string>, draft: Draft | null): void {
  if (draft === null) return;
  const question = usable(draft.question);
  if (question === null) return;
  drafts.push({ ...draft, question });
  for (const id of draft.covers) covered.add(id);
}

function bound(questions: readonly string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const question of questions) {
    if (seen.has(question)) continue;
    seen.add(question);
    unique.push(question);
  }
  if (unique.length > MAX_QUESTIONS) {
    const hidden = unique.length - (MAX_QUESTIONS - 1);
    const head = unique.slice(0, MAX_QUESTIONS - 1);
    const noun = hidden === 1 ? "item is" : "items are";
    head.push(
      `More items are unapproved. ${hidden} more ${noun} still open. Should those wait for the next pass?`,
    );
    return head;
  }
  if (unique.length >= MIN_QUESTIONS) return unique;
  const padded = [...unique];
  for (const filler of FILLERS) {
    if (padded.length >= MIN_QUESTIONS) break;
    if (!padded.includes(filler)) padded.push(filler);
  }
  return padded;
}

function latestById(answers: readonly AnswerRecord[]): Map<string, AnswerRecord> {
  const latest = new Map<string, AnswerRecord>();
  for (const answer of answers) latest.set(answer.id, answer);
  return latest;
}

function isStatus(value: string): value is AnswerRecord["status"] {
  return (
    value === "ANSWERED" ||
    value === "SUGGESTED" ||
    value === "SKIPPED" ||
    value === "SOFT" ||
    value === "IMPORTED"
  );
}

function isSettled(record: AnswerRecord | undefined): boolean {
  if (record === undefined) return false;
  if (!isStatus(record.status)) return false;
  if (record.value.trim() === "") return false;
  if (record.status === "SOFT" || record.status === "SKIPPED") return false;
  if (ASSUMED_PREFIX_RE.test(record.value)) return false;
  return record.status === "ANSWERED" || record.status === "SUGGESTED" || record.status === "IMPORTED";
}

function isExpressDefault(record: AnswerRecord): boolean {
  return record.status === "SKIPPED" && ASSUMED_PREFIX_RE.test(record.value);
}

function openness(record: AnswerRecord | undefined): Openness {
  if (record === undefined || record.value.trim() === "") return "open";
  if (isExpressDefault(record)) return "express";
  if (record.status === "SOFT") return "soft";
  if (record.status === "SKIPPED") return "skipped";
  return "open";
}

function stateClause(kind: Openness): string {
  if (kind === "express") return "an Express default";
  if (kind === "soft") return "soft";
  if (kind === "skipped") return "skipped";
  return "open";
}

function voiceSaysCalm(latest: ReadonlyMap<string, AnswerRecord>): boolean {
  for (const id of CALM_IDS) {
    const value = latest.get(id)?.value ?? "";
    if (CALM_RE.test(value)) return true;
  }
  return false;
}

function motionLevel(latest: ReadonlyMap<string, AnswerRecord>): number | null {
  const value = latest.get(MOTION_ID)?.value ?? "";
  const match = MOTION_RE.exec(value);
  const digits = match?.[1];
  if (digits === undefined) return null;
  return Number(digits);
}

function settledBlob(latest: ReadonlyMap<string, AnswerRecord>): string {
  const parts: string[] = [];
  for (const record of latest.values()) {
    if (isSettled(record)) parts.push(record.value);
  }
  return parts.join("\n");
}

function openRecords(latest: ReadonlyMap<string, AnswerRecord>, covered: ReadonlySet<string>): AnswerRecord[] {
  const pending: AnswerRecord[] = [];
  for (const record of latest.values()) {
    if (covered.has(record.id) || record.id === PROOF_ID) continue;
    if (TESTIMONIAL_RE.test(record.value)) continue;
    if (record.status !== "SOFT" && record.status !== "SKIPPED") continue;
    if (record.value.trim() === "") continue;
    pending.push(record);
  }
  pending.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return pending;
}

function quoted(value: string): string {
  const text = excerpt(value);
  if (text === "") return "";
  return ` ("${text}")`;
}

function excerpt(value: string): string {
  const flat = clean(value).replace(ASSUMED_PREFIX_RE, "").replace(/["']/g, "").trim();
  if (flat === "" || TESTIMONIAL_RE.test(flat) || isBanned(flat)) return "";
  if (flat.length <= 80) return flat;
  return `${flat.slice(0, 77).trimEnd()}...`;
}

function usable(question: string): string | null {
  const text = clean(question);
  if (text === "" || !text.endsWith("?")) return null;
  if (TESTIMONIAL_RE.test(text) || isBanned(text)) return null;
  return text;
}

function clean(value: string): string {
  return value.replace(/[!！]/g, "").replace(/ {2,}/g, " ").trim();
}

function isBanned(text: string): boolean {
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  for (const word of BANNED_WORDS) {
    const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
    if (pattern.test(text)) return true;
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
