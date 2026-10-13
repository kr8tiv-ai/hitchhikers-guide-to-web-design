/**
 * One picture of what this project has already decided.
 * Built from files on disk. Guide calls receive it and may not invent files.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadTree, type Question } from "../tree.ts";

export const SESSION_TOPICS = [
  "audience",
  "prior-site",
  "skill-level",
  "logo",
  "palette",
  "fonts",
  "photos",
  "brand-assets",
  "depth-time",
  "input-method",
  "blog",
  "bookings",
  "shop",
  "portfolio",
  "hosting",
  "accessibility",
] as const;

export type SessionTopic = (typeof SESSION_TOPICS)[number] | string;

export type UploadRole = "logo" | "brand-kit" | "palette" | "font" | "photo" | "mood" | "3d" | "other";

export interface SessionUpload {
  safeName: string;
  originalName: string;
  questionId: string;
  role: UploadRole;
}

export interface SessionAnswer {
  id: string;
  text: string;
  assumed: boolean;
}

export interface TopicDecision {
  topic: string;
  sourceId: string;
  value: string;
}

export interface SessionState {
  answers: SessionAnswer[];
  uploads: SessionUpload[];
  decided: TopicDecision[];
}

const ASSET_TOPICS = new Set(["logo", "palette", "fonts", "photos", "brand-assets", "mood", "3d"]);

const WRITE_TOPIC: Record<string, string> = {
  "PROJECT.md#audience": "audience",
  "PROJECT.md#prior-sites": "prior-site",
  "PROJECT.md#user-profile": "skill-level",
  "PROJECT.md#interview-depth": "depth-time",
  "PROJECT.md#input-mode": "input-method",
  "BRAND.md#logo": "logo",
  "ASSETS.md#logo": "logo",
  "BRAND.md#color": "palette",
  "BRAND.md#type": "fonts",
  "ASSETS.md#brand-assets": "brand-assets",
  "BRAND.md#imported": "brand-assets",
  "SITE-BRIEF.md#blog-cms": "blog",
  "SITE-BRIEF.md#keyword-posts": "blog",
  "SITE-BRIEF.md#blog-cadence": "blog",
  "SITE-BRIEF.md#accessibility": "accessibility",
  "ASSETS.md#3d": "3d",
};

const FILE_EXT = /\b[\w.-]+\.(?:png|jpe?g|gif|webp|svg|pdf|docx?|zip|mp4|mov|glb|gltf)\b/gi;
const JOB_WORD = /\b(?:quotes?|estimates?|invoices?)\b/i;
const HASHED_LEAF = /^hh-[0-9a-f]{8}-(.+)$/i;

/** The name a person used, even when the slot stored a hashed copy. */
export function assetDisplayName(safeName: string, originalName?: string): string {
  const baseSafe = path.basename(safeName.replace(/\\/g, "/"));
  const given = (originalName ?? "").trim();
  const leaf = given === "" ? baseSafe : path.basename(given.replace(/\\/g, "/"));
  const peeled = HASHED_LEAF.exec(leaf);
  if (peeled?.[1] !== undefined && peeled[1].includes(".")) return peeled[1];
  return leaf;
}

export function uploadNames(file: SessionUpload): Set<string> {
  const names = [file.safeName, file.originalName, assetDisplayName(file.safeName, file.originalName)];
  return new Set(
    names
      .map((name) => path.basename(name.replace(/\\/g, "/")).toLowerCase())
      .filter((name) => name !== ""),
  );
}

/** True when a choice treats some other image as the logo or the favicon. */
export function offersForeignImageAsLogo(label: string, state: SessionState): boolean {
  const logo = state.uploads.find((file) => file.role === "logo");
  if (logo === undefined) return false;
  if (!/\b(?:logo|favicon|wordmark)\b/i.test(label)) return false;
  const names = uploadNames(logo);
  const named = label.match(FILE_EXT) ?? [];
  for (const raw of named) {
    const leaf = path.basename(raw).toLowerCase();
    if (/\.(?:png|jpe?g|gif|webp|svg)$/i.test(leaf) && !names.has(leaf)) return true;
  }
  return false;
}

/** The one file this answer names, by original name, saved name, or hash suffix. */
export function assetNamedIn(text: string, state: SessionState): SessionUpload | null {
  const named = text.match(FILE_EXT) ?? [];
  const hits: SessionUpload[] = [];
  for (const raw of named) {
    const leaf = path.basename(raw).toLowerCase();
    const found = state.uploads.find((file) => uploadNames(file).has(leaf));
    if (found !== undefined && !hits.includes(found)) hits.push(found);
  }
  if (hits.length !== 1) return null;
  return hits[0] ?? null;
}

/**
 * A later logo question names the logo on file.
 * A model line that offers a different image, or that forgets the filename, is replaced.
 */
export function guardLogoText(
  text: string,
  state: SessionState,
  question: Question,
  all: readonly Question[],
): string {
  if (topicFor(question) !== "logo") return text;
  const logo = state.uploads.find((file) => file.role === "logo");
  if (logo === undefined) return text;
  const gate = gateQuestion(question, state, all);
  if (gate.action !== "confirm") return text;
  const display = assetDisplayName(logo.safeName, logo.originalName).toLowerCase();
  if (offersForeignImageAsLogo(text, state) || !text.toLowerCase().includes(display)) return gate.ask;
  return text;
}

export function topicFor(question: Question): string | undefined {
  if (question.topic !== undefined && question.topic !== "") return question.topic;
  for (const write of question.writes) {
    const topic = WRITE_TOPIC[write];
    if (topic !== undefined) return topic;
  }
  return undefined;
}

export function emptySession(): SessionState {
  return { answers: [], uploads: [], decided: [] };
}

/** The project's tree, or the packaged tree when the project has none. */
export function projectTree(projectDir: string): Question[] {
  const local = path.join(projectDir, "interview", "tree.yaml");
  const file = existsSync(local)
    ? local
    : path.resolve(import.meta.dirname, "..", "..", "..", "..", "interview", "tree.yaml");
  try {
    return loadTree(file);
  } catch {
    return [];
  }
}

export function loadSessionState(projectDir: string, questions: readonly Question[] = projectTree(projectDir)): SessionState {
  const answers = readAnswers(projectDir);
  const uploads = readUploads(projectDir);
  return {
    answers,
    uploads,
    decided: decideTopics(questions, answers, uploads),
  };
}

export function sessionBlock(state: SessionState): string {
  const lines = [
    "Session state.",
    "Only name files listed under uploads.",
    "Never name, offer, or assume a file that is not listed.",
    "If the topic is decided, do not ask it again.",
  ];
  if (state.answers.length === 0) lines.push("Answers: none.");
  else {
    lines.push("Answers:");
    for (const answer of state.answers) {
      const flag = answer.assumed ? " assumed" : "";
      lines.push(`- ${answer.id}${flag}: ${answer.text}`);
    }
  }
  if (state.uploads.length === 0) lines.push("Uploads: none.");
  else {
    lines.push("Uploads:");
    for (const file of state.uploads) {
      lines.push(`- ${file.safeName} (${file.originalName}) role ${file.role} from ${file.questionId}`);
    }
  }
  if (state.decided.length === 0) lines.push("Decided topics: none.");
  else {
    lines.push("Decided topics:");
    for (const item of state.decided) {
      lines.push(`- ${item.topic} from ${item.sourceId}: ${item.value}`);
    }
  }
  return lines.join("\n");
}

export const ADMIRED_SITES_ASK = "What do you love about a site you admire, and what makes you wince?";

const SITE_BUILDERS =
  /\b(?:wordpress|webflow|wix|squarespace|framer|shopify|cargo|ghost|weebly|carrd)\b/i;
const SITE_URL = /\b(?:https?:\/\/|www\.)\S+/i;
const NO_SITE_PATTERNS = [
  /no prior site/i,
  /first site/i,
  /no website/i,
  /never had/i,
  /(?:don't|do not) have a (?:site|website)/i,
];
const BANNED_SITE_PHRASES = [/\bthat site\b/i, /\byour current site\b/i, /\byour site\b/i];

/**
 * True when the prior-site answer says there is nothing to review.
 * A URL or a named builder means a site exists, and the taste question stays.
 */
export function noPriorSite(text: string): boolean {
  const value = text.trim();
  if (value === "") return false;
  if (SITE_BUILDERS.test(value) || SITE_URL.test(value)) return false;
  if (NO_SITE_PATTERNS.some((pattern) => pattern.test(value))) return true;
  return /^(?:no|nope|none)\b/i.test(value);
}

/** The no-site branch never keeps "that site", "your site", or "your current site". */
export function guardPriorSiteText(text: string, state: SessionState, questionId: string): string {
  if (questionId !== "DP-0.2a") return text;
  const prior = state.answers.find((answer) => answer.id === "DP-0.2");
  if (prior === undefined || !noPriorSite(prior.text)) return text;
  if (BANNED_SITE_PHRASES.some((pattern) => pattern.test(text))) return ADMIRED_SITES_ASK;
  return text;
}

export interface GateResult {
  action: "ask" | "confirm" | "skip";
  ask: string;
}

export function gateQuestion(
  question: Question,
  state: SessionState,
  all: readonly Question[] = [question],
): GateResult {
  if (question.surface === "default") return { action: "skip", ask: question.ask };
  if (!conditionHolds(question, state, all)) return { action: "skip", ask: question.ask };
  if (question.id === "DP-0.2a") {
    const prior = state.answers.find((answer) => answer.id === "DP-0.2");
    if (prior !== undefined && noPriorSite(prior.text)) return { action: "ask", ask: ADMIRED_SITES_ASK };
  }
  // The guided walk is the follow-up when no sites were named. It is not a second ask of the same topic.
  if (question.id === "DP-5.2") return { action: "ask", ask: question.ask };
  const topic = topicFor(question);
  if (topic === undefined) return { action: "ask", ask: question.ask };
  const decision = state.decided.find((item) => item.topic === topic);
  if (decision === undefined) return { action: "ask", ask: question.ask };
  // The question that recorded the decision stays in the list. The cursor skips a filled id.
  if (decision.sourceId === question.id) return { action: "ask", ask: question.ask };
  if (ASSET_TOPICS.has(topic)) {
    const value = topic === "logo" ? logoDecisionValue(state, decision.value) : decision.value;
    return { action: "confirm", ask: confirmAsk(topic, value) };
  }
  return { action: "skip", ask: question.ask };
}

export function confirmAsk(topic: string, value: string): string {
  const name = path.basename(value.replace(/\\/g, "/"));
  if (topic === "logo") return `Using the logo you gave earlier (${name}). Change?`;
  if (topic === "analytics" || /plausible/i.test(value)) return "We'll count visitors privately. Change?";
  return `Using ${name}. Change?`;
}

/** Questions still shown, with asset repeats rewritten as confirmations. */
export function questionsToShow(questions: readonly Question[], state: SessionState): Question[] {
  const shown: Question[] = [];
  const askedTopics = new Set<string>();
  for (const question of questions) {
    const gate = gateQuestion(question, state, questions);
    if (gate.action === "skip") continue;
    const topic = topicFor(question);
    if (topic !== undefined && gate.action === "ask" && askedTopics.has(topic)) continue;
    if (topic !== undefined && gate.action === "ask") askedTopics.add(topic);
    if (gate.ask !== question.ask) shown.push({ ...question, ask: gate.ask });
    else shown.push(question);
  }
  return shown;
}

export function duplicateTopics(questions: readonly Question[], state: SessionState): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const question of questions) {
    const gate = gateQuestion(question, state, questions);
    if (gate.action !== "ask") continue;
    const topic = topicFor(question);
    if (topic === undefined) continue;
    if (seen.has(topic)) dupes.push(topic);
    seen.add(topic);
  }
  return dupes;
}

export function filterGuideText(
  text: string,
  state: SessionState,
  aboutQuotes: boolean,
): string | null {
  if (!aboutQuotes && JOB_WORD.test(text)) return null;
  const allowed = new Set<string>();
  for (const file of state.uploads) {
    for (const name of uploadNames(file)) allowed.add(name);
  }
  const named = text.match(FILE_EXT) ?? [];
  for (const raw of named) {
    if (!allowed.has(path.basename(raw).toLowerCase())) return null;
  }
  return text;
}

const CHOICE_LETTERS = ["A", "B", "C", "D"] as const;

/**
 * Letter the remaining picks A, B, C, D in order.
 * Dropping one pick must not leave a hole. The desk rejects a set whose first id is not A.
 */
export function reletterChoices<T extends { id: string }>(
  items: readonly T[],
): Array<Omit<T, "id"> & { id: (typeof CHOICE_LETTERS)[number] }> {
  const out: Array<Omit<T, "id"> & { id: (typeof CHOICE_LETTERS)[number] }> = [];
  for (let index = 0; index < items.length && index < CHOICE_LETTERS.length; index += 1) {
    const item = items[index];
    const id = CHOICE_LETTERS[index];
    if (item === undefined || id === undefined) continue;
    out.push({ ...item, id });
  }
  return out;
}

/** A choice may not name a missing file, a job word, or a question whose topic is already decided. */
export function choiceAllowed(
  label: string,
  state: SessionState,
  questions: readonly Question[],
  aboutQuotes: boolean,
): boolean {
  if (filterGuideText(label, state, aboutQuotes) === null) return false;
  if (offersForeignImageAsLogo(label, state)) return false;
  const norm = normalizeChoiceLabel(label);
  for (const question of questions) {
    const topic = topicFor(question);
    if (topic === undefined) continue;
    if (!state.decided.some((item) => item.topic === topic)) continue;
    if (normalizeChoiceLabel(question.ask) === norm) return false;
  }
  return true;
}

export function projectMentionsQuotes(state: SessionState): boolean {
  return state.answers.some((answer) => JOB_WORD.test(answer.text));
}

export function prefetchStillValid(built: SessionState, current: SessionState): boolean {
  return JSON.stringify(signature(built)) === JSON.stringify(signature(current));
}

export function normalizeChoiceLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.?!,:;]+$/g, "");
}

function signature(state: SessionState): unknown {
  return {
    decided: state.decided.map((item) => [item.topic, item.sourceId, item.value]),
    uploads: state.uploads.map((file) => [file.safeName, file.role, file.questionId]),
  };
}

function conditionHolds(question: Question, state: SessionState, all: readonly Question[]): boolean {
  const text = (id: string): string =>
    state.answers.find((answer) => answer.id === id)?.text.toLowerCase() ?? "";
  if (question.id === "DP-0.2a") {
    const prior = state.answers.find((answer) => answer.id === "DP-0.2");
    if (prior !== undefined && /no prior site/.test(prior.text.toLowerCase())) return false;
  }
  if (question.id === "DP-5.2" && all.some((item) => item.id === "DP-5.1")) {
    const loved = text("DP-5.1").trim();
    if (loved === "") return false;
    if (!/^(none|no favorites?|no sites?)\b/.test(loved)) return false;
  }
  const appetite = appetiteOf(text("DP-6.2"));
  if (question.id === "DP-6.3" && appetite !== null && appetite <= 4) return false;
  if (question.id === "DP-6.6" && appetite !== null && appetite < 6) return false;
  if (question.id === "DP-6.4") {
    const imagery = text("DP-5.6");
    const wants3d = /3d|three/.test(imagery);
    if (appetite !== null && appetite < 8 && !wants3d) return false;
  }
  if (question.id === "DP-7.2") {
    const source = text("DP-6.4");
    if (!/tripo|meshy|generat/.test(source)) return false;
  }
  if (question.id === "DP-3.2" && /no selling|not selling|no products/.test(text("DP-2.3"))) return false;
  if (question.id === "DP-3.3" && /booking/.test(text("DP-2.3"))) return false;
  if (question.id === "DP-4.4" && /\blocal\b/.test(text("DP-2.3"))) return false;
  return true;
}

function appetiteOf(value: string): number | null {
  const match = /\b(\d{1,2})\b/.exec(value);
  if (match === null) return null;
  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1 || number > 10) return null;
  return number;
}

function decideTopics(
  questions: readonly Question[],
  answers: readonly SessionAnswer[],
  uploads: readonly SessionUpload[],
): TopicDecision[] {
  const decided: TopicDecision[] = [];
  const seen = new Set<string>();
  const add = (topic: string, sourceId: string, value: string): void => {
    if (seen.has(topic) || value.trim() === "") return;
    seen.add(topic);
    decided.push({ topic, sourceId, value: value.trim() });
  };
  for (const question of questions) {
    const topic = topicFor(question);
    if (topic === undefined) continue;
    const answer = answers.find((item) => item.id === question.id);
    if (answer !== undefined) add(topic, question.id, answer.text);
  }
  const logo = uploads.find((file) => file.role === "logo");
  if (logo !== undefined) {
    const source = logo.questionId === "" ? "logo-file" : logo.questionId;
    add("logo", source, assetDisplayName(logo.safeName, logo.originalName));
  }
  if (uploads.some((file) => file.questionId === "DP-0.4")) {
    add("brand-assets", "DP-0.4", uploads.find((file) => file.questionId === "DP-0.4")?.originalName ?? "brand files");
  }
  return decided;
}

function readAnswers(projectDir: string): SessionAnswer[] {
  const file = path.join(projectDir, ".hitchhiker", "interview.json");
  if (!existsSync(file)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.answers)) return [];
  const latest = new Map<string, SessionAnswer>();
  for (const item of parsed.answers) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.value !== "string") continue;
    const text = item.value.trim();
    if (text === "") continue;
    const status = typeof item.status === "string" ? item.status : "";
    latest.set(item.id, {
      id: item.id,
      text: text.replace(/^ASSUMED:\s*/i, ""),
      assumed: status === "SKIPPED" || status === "SUGGESTED" || /^ASSUMED:/i.test(item.value),
    });
  }
  return [...latest.values()];
}

function readUploads(projectDir: string): SessionUpload[] {
  const root = path.join(projectDir, ".hitchhiker", "uploads");
  const files: SessionUpload[] = [];
  if (existsSync(root)) {
    let folders: string[] = [];
    try {
      folders = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      folders = [];
    }
    for (const folder of folders) {
      const manifest = path.join(root, folder, "manifest.json");
      if (!existsSync(manifest)) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(manifest, "utf8"));
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) continue;
      for (const row of parsed) {
        if (!isRecord(row) || typeof row.storedName !== "string") continue;
        const original = typeof row.originalName === "string" ? row.originalName : row.storedName;
        files.push({
          safeName: `${folder}/${row.storedName}`,
          originalName: original,
          questionId: folder,
          role: "other",
        });
      }
    }
    let rootEntries: string[] = [];
    try {
      rootEntries = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
    } catch {
      rootEntries = [];
    }
    for (const name of rootEntries) {
      files.push({
        safeName: name,
        originalName: assetDisplayName(name),
        questionId: "",
        role: "other",
      });
    }
  }
  const intakePath = path.join(projectDir, ".hitchhiker", "brand", "logo-intake.json");
  if (existsSync(intakePath)) {
    try {
      const intake: unknown = JSON.parse(readFileSync(intakePath, "utf8"));
      if (isRecord(intake) && typeof intake.safeName === "string") {
        const safe = intake.safeName.replace(/\\/g, "/");
        const questionId = typeof intake.questionId === "string" ? intake.questionId : safe.split("/")[0] ?? "";
        const intakeOriginal = typeof intake.originalName === "string" ? intake.originalName : undefined;
        const known = files.find((file) => file.safeName === safe || file.safeName.endsWith(`/${path.basename(safe)}`));
        const display = assetDisplayName(safe, intakeOriginal ?? known?.originalName);
        if (known !== undefined) {
          known.role = "logo";
          known.originalName = display;
          if (known.questionId === "" && questionId !== "") known.questionId = questionId;
        } else {
          files.push({
            safeName: safe,
            originalName: display,
            questionId,
            role: "logo",
          });
        }
      }
    } catch {
      // A broken intake file does not invent a logo.
    }
  }
  for (const file of files) {
    if (file.role === "logo") continue;
    file.role = roleFromQuestion(file.questionId, file.originalName);
  }
  return files;
}

function logoDecisionValue(state: SessionState, fallback: string): string {
  const logo = state.uploads.find((file) => file.role === "logo");
  if (logo === undefined) return fallback;
  return assetDisplayName(logo.safeName, logo.originalName);
}

function roleFromQuestion(questionId: string, name: string): UploadRole {
  if (questionId === "DP-1.1" || questionId === "DP-0.4") {
    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(name)) return "brand-kit";
  }
  if (questionId === "DP-1.2") return "palette";
  if (questionId === "DP-1.4") return "mood";
  if (questionId === "DP-1.5") return "font";
  if (questionId === "DP-7.3" || questionId === "DP-3.6") return "photo";
  if (questionId === "DP-6.4") return "3d";
  return "other";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const JARGON = [
  { name: "ASSUMED", test: (text: string) => text.includes("ASSUMED") },
  { name: "DP-", test: (text: string) => text.includes("DP-") },
  { name: "id", test: (text: string) => /\bid\b/i.test(text) },
  { name: "rung", test: (text: string) => /\brung\b/i.test(text) },
  { name: "Express", test: (text: string) => /\bExpress\b/.test(text) },
] as const;

export function userFacingText(question: Question): string {
  const parts = [question.ask, question.why, question.suggest ?? "", question.skipDefault, question.tip ?? ""];
  for (const follow of question.followUps ?? []) parts.push(follow.ask);
  return parts.join("\n");
}

export function jargonHits(text: string): string[] {
  return JARGON.filter((item) => item.test(text)).map((item) => item.name);
}
