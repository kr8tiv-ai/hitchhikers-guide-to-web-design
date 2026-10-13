/**
 * A Guide message can arrive as one block: phase, recap, question, and button talk.
 * The card keeps those in separate fields. The heading is only the question.
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
