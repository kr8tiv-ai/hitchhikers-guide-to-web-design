/**
 * A Guide message can arrive as one block: phase, recap, question, and button talk.
 * The card keeps those in separate fields. The heading is only the question.
 * This file is served to the browser. It does not import the engine package.
 */

export interface QuestionParts {
  lead: string;
  question: string;
  help: string;
}

const BUTTON =
  /suggest for me|skipping is allowed|^answer\b|^skip\b|^three ways forward\b|answer in your own words/i;
const LEAD =
  /^(?:don't panic\b|this phase\b|that is the name of this phase\b|now back to your site\b|you said\b|so the question is\b)/i;
const QUESTION_CAP = 200;
/** A one-line acknowledgment stays with the question. A longer recap stays in help. */
const PREFACE_CAP = 120;

/** A question id belongs in the eyebrow, never in the heading. */
export function stripQuestionIds(text: string): string {
  return text.replace(/\bDP-\d+(?:\.\d+)?[a-z]?(?:-[a-z0-9]+)?\b\.?\s*/gi, " ").replace(/\s+/g, " ").trim();
}

const IMPERATIVE =
  /^(?:name|tell|describe|pick|choose|list|say|write|add|drop|keep|show|give|send|paste|let's|change|walk|set|mark|share|note|point)\b/i;

/** Split legacy combined copy. Button instructions are dropped, not shown as help. */
export function splitQuestionText(text: string): QuestionParts {
  const sentences = splitSentences(stripQuestionIds(text)).filter((sentence) => !BUTTON.test(sentence));
  const lead: string[] = [];
  const body: string[] = [];
  let takingLead = true;
  for (const sentence of sentences) {
    if (takingLead && LEAD.test(sentence)) lead.push(sentence);
    else {
      takingLead = false;
      body.push(sentence);
    }
  }
  let askAt = body.findIndex((sentence) => sentence.endsWith("?"));
  if (askAt < 0) askAt = body.findIndex((sentence) => IMPERATIVE.test(sentence));
  if (askAt < 0) {
    const packed = pack(body);
    return promoteQuestion({ lead: join(lead), question: packed.question, help: packed.help });
  }
  // Logo confirmations and short acks name the file or the note in the heading.
  // The Paradise Found recaps are longer than PREFACE_CAP, so they stay below.
  const preface = join(body.slice(0, askAt));
  const withQuestion = join(body.slice(0, askAt + 1));
  const prefaceFits =
    askAt > 0 && preface.length > 0 && preface.length <= PREFACE_CAP && withQuestion.length <= QUESTION_CAP;
  const start = prefaceFits ? 0 : askAt;
  const packed = pack(body.slice(start));
  return {
    lead: join(lead),
    question: packed.question,
    help: join([...body.slice(0, start), ...splitSentences(packed.help)]),
  };
}

function pack(sentences: readonly string[]): { question: string; help: string } {
  const question: string[] = [];
  const help: string[] = [];
  let closed = false;
  for (const sentence of sentences) {
    if (closed) {
      help.push(sentence);
      continue;
    }
    const candidate = join([...question, sentence]);
    if (candidate.length <= QUESTION_CAP) {
      question.push(sentence);
      continue;
    }
    if (question.length === 0) {
      const fitted = fit(sentence);
      if (fitted.head !== "") question.push(fitted.head);
      if (fitted.rest !== "") help.push(fitted.rest);
    } else {
      help.push(sentence);
    }
    closed = true;
  }
  return { question: join(question), help: join(help) };
}

/**
 * A heading with no question is a recap that pushed the ask downward.
 * The last question sentence becomes the heading. The recap sits below it.
 */
function promoteQuestion(parts: QuestionParts): QuestionParts {
  if (parts.question.includes("?")) return parts;
  const fromHelp = takeLastQuestion(parts.help);
  if (fromHelp !== null) {
    return {
      lead: parts.lead,
      question: fromHelp.sentence,
      help: join([parts.question, fromHelp.rest]),
    };
  }
  const fromLead = takeLastQuestion(parts.lead);
  if (fromLead !== null) {
    return {
      lead: fromLead.rest,
      question: fromLead.sentence,
      help: join([parts.question, parts.help]),
    };
  }
  return parts;
}

function takeLastQuestion(text: string): { sentence: string; rest: string } | null {
  const sentences = splitSentences(text);
  let index = -1;
  for (let cursor = 0; cursor < sentences.length; cursor += 1) {
    if ((sentences[cursor] ?? "").endsWith("?")) index = cursor;
  }
  if (index < 0) return null;
  const sentence = sentences[index] ?? "";
  const rest = join(sentences.filter((_, cursor) => cursor !== index));
  return { sentence, rest };
}

function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat === "") return [];
  return flat
    .split(/(?<=[.?!])\s+(?=[A-Z(“"'(])/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function join(parts: readonly string[]): string {
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function fit(sentence: string): { head: string; rest: string } {
  if (sentence.length <= QUESTION_CAP) return { head: sentence, rest: "" };
  const cut = sentence.lastIndexOf(" ", QUESTION_CAP);
  const at = cut >= 80 ? cut : QUESTION_CAP;
  return { head: sentence.slice(0, at).trim(), rest: sentence.slice(at).trim() };
}

const MIN_QUESTION_WORDS = 4;
const IMPERATIVE_WORD_CAP = 16;

/** Keep this list identical to GUIDANCE_MARKERS in the engine. */
export const GUIDANCE_MARKERS = [
  "not a forced value",
  "recommended word",
  "do not promise",
  "stop at the cap",
  "the model should",
  "show the model",
  "do not invent",
  "not in this question",
  "on every line",
  "prices live on the cost meter",
  "does not lecture",
] as const;

export function guidanceMarkerHits(text: string): string[] {
  const lower = text.toLowerCase();
  return GUIDANCE_MARKERS.filter((marker) => lower.includes(marker));
}

function normCopy(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Drops a helper line that repeats guidance, or that carries a guidance marker. */
export function dropInternalCopy(text: string, guidance: readonly string[]): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat === "") return "";
  const guides = guidance.map((line) => line.trim()).filter((line) => line !== "");
  const wholes = new Set(guides.map(normCopy));
  const guideSentences = new Set(guides.flatMap((line) => splitSentences(line).map(normCopy)));
  if (wholes.has(normCopy(flat))) return "";
  const kept = splitSentences(flat).filter((sentence) => {
    const key = normCopy(sentence);
    if (key === "") return false;
    if (wholes.has(key) || guideSentences.has(key)) return false;
    return guidanceMarkerHits(sentence).length === 0;
  });
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function startsSentence(text: string): boolean {
  return /^[A-Z0-9\u201C"'(]/.test(text.trim());
}

/** A one-line ask such as "Name the person who publishes a price change." */
function isShortImperative(text: string): boolean {
  const trimmed = text.trim();
  if (!IMPERATIVE.test(trimmed)) return false;
  const words = wordCount(trimmed);
  if (words < MIN_QUESTION_WORDS || words > IMPERATIVE_WORD_CAP) return false;
  return (trimmed.match(/[.?!]/g) ?? []).length <= 1;
}

/**
 * A heading candidate must be a full sentence.
 * "Change?" is a fragment. A recap with no question mark is not an ask.
 */
export function isFullQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "" || !startsSentence(trimmed)) return false;
  if (/\s:\s/.test(trimmed)) return false;
  if (guidanceMarkerHits(trimmed).length > 0) return false;
  const sentences = splitSentences(trimmed);
  const askAt = sentences.findIndex((sentence) => sentence.endsWith("?"));
  if (askAt < 0) return isShortImperative(trimmed);
  if (askAt > 0) return false;
  return wordCount(sentences[0] ?? "") >= MIN_QUESTION_WORDS;
}

/** A short recap glued in front of a real question moves to the lead. */
function peelGluedLead(parts: QuestionParts): QuestionParts {
  const sentences = splitSentences(parts.question);
  const askAt = sentences.findIndex((sentence) => sentence.endsWith("?"));
  if (askAt <= 0) return parts;
  const ask = sentences[askAt] ?? "";
  if (wordCount(ask) < MIN_QUESTION_WORDS) return parts;
  return {
    lead: join([parts.lead, join(sentences.slice(0, askAt))]),
    question: join(sentences.slice(askAt)),
    help: parts.help,
  };
}

function stripRepeated(text: string, question: string): string {
  const banned = new Set(splitSentences(question).map((sentence) => sentence.trim()));
  const whole = question.trim();
  const kept = splitSentences(text).filter((sentence) => {
    const trimmed = sentence.trim();
    if (trimmed === "") return false;
    if (whole !== "" && trimmed === whole) return false;
    return !banned.has(trimmed);
  });
  let joined = join(kept);
  if (whole !== "" && joined.includes(whole)) {
    joined = joined.replace(whole, " ").replace(/\s+/g, " ").trim();
  }
  return joined.replace(/\s+:\s*$/g, "").replace(/^\s*:\s*/g, "").trim();
}

/**
 * Gate confirmations name a file the user already gave.
 * "Using the logo you gave earlier (name). Change?" stays the heading.
 * A recap that merely ends in "Change?" does not.
 */
function isAssetConfirmation(text: string): boolean {
  const trimmed = text.trim();
  if (/^Using the logo you gave earlier \([^)]+\)\. Change\?$/.test(trimmed)) return true;
  const named = /^Using (.+)\. Change\?$/.exec(trimmed);
  if (named === null) return false;
  const name = named[1] ?? "";
  if (name === "" || name.length > PREFACE_CAP) return false;
  if (/[!?]/.test(name) || /\.\s/.test(name)) return false;
  return wordCount(name) <= 8;
}

/**
 * Heading is only a full question. A fragment or a recap falls back to the tree ask.
 * A lead and a question are never joined with a colon.
 */
export function settleQuestionText(text: string, baseAsk: string): QuestionParts {
  const flat = text.replace(/\s+/g, " ").trim();
  const base = baseAsk.replace(/\s+/g, " ").trim();
  const unjoined = flat.replace(/([.?!])\s*:\s+/g, "$1 ");
  if (base !== "" && unjoined === base) return { lead: "", question: base, help: "" };
  const peeled = peelGluedLead(splitQuestionText(unjoined));
  if (!isFullQuestion(peeled.question)) {
    if (isAssetConfirmation(peeled.question)) {
      return {
        lead: stripRepeated(peeled.lead, peeled.question),
        question: peeled.question.trim(),
        help: stripRepeated(peeled.help, peeled.question),
      };
    }
    const question = base !== "" ? base : peeled.question;
    const blob = join([peeled.lead, peeled.question, peeled.help]);
    return { lead: stripRepeated(blob, question), question, help: "" };
  }
  return {
    lead: stripRepeated(peeled.lead, peeled.question),
    question: peeled.question.trim(),
    help: stripRepeated(peeled.help, peeled.question),
  };
}
