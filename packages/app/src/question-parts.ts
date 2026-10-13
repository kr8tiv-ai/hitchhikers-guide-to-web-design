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

/** A question id belongs in the eyebrow, never in the heading. */
export function stripQuestionIds(text: string): string {
  return text.replace(/\bDP-\d+(?:\.\d+)?[a-z]?(?:-[a-z0-9]+)?\b\.?\s*/gi, " ").replace(/\s+/g, " ").trim();
}

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
  const question: string[] = [];
  const help: string[] = [];
  let closed = false;
  for (const sentence of body) {
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
  return { lead: join(lead), question: join(question), help: join(help) };
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
