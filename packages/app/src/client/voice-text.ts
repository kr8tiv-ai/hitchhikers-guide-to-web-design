/**
 * Pure draft math for the voice button. No DOM.
 * A stop must keep typed words and must not repeat a phrase.
 * One recognizer's transcript is rebuilt from the whole results list.
 */

export interface TranscriptPiece {
  transcript: string;
  isFinal: boolean;
}

export interface MergedTranscript {
  /** Final segments, in order, after a strict extension replaces the previous one. */
  finals: string;
  /** The single interim tail after the last final. */
  interim: string;
  /** Finals plus that tail, with neither repeated. */
  heard: string;
}

export interface SettleVoiceInput {
  /** Text captured when listening started. */
  base: string;
  /** Live textarea, including anything typed while listening. */
  typed: string;
  /** Final transcripts joined so far. */
  final: string;
  /** Latest interim for the current utterance. */
  interim: string;
}

export interface SettleVoiceResult {
  draft: string;
  heard: boolean;
}

/** Trim the ends and join with one space. Internal whitespace stays. */
export function joinWords(left: string, right: string): string {
  const a = left.trim();
  const b = right.trim();
  if (a === "") return b;
  if (b === "") return a;
  return `${a} ${b}`;
}

function blank(value: string): boolean {
  return value.trim() === "";
}

/** True when `outer` already contains `inner` as the whole string or a prefix. */
function covers(outer: string, inner: string): boolean {
  const host = outer.trim();
  const guest = inner.trim();
  if (guest === "") return true;
  return host === guest || host.startsWith(guest);
}

/**
 * One utterance: a final that repeats or extends the interim replaces it.
 * A final that is only a shorter prefix of the interim keeps the longer text.
 */
function combineHeard(finalText: string, interimText: string): string {
  const final = finalText.trim();
  const interim = interimText.trim();
  if (final === "") return interim;
  if (interim === "") return final;
  if (final === interim || final.startsWith(interim) || interim.startsWith(final) || final.endsWith(interim)) {
    return final.length >= interim.length ? final : interim;
  }
  return joinWords(final, interim);
}

/**
 * Commit a voice session.
 * Nothing heard returns the live textarea unchanged.
 * Heard words are joined once and the result is never shorter than that textarea.
 */
export function settleVoice(input: SettleVoiceInput): SettleVoiceResult {
  const heardText = combineHeard(input.final, input.interim);
  if (heardText === "" || blank(heardText)) return { draft: input.typed, heard: false };
  const composed = joinWords(input.base, heardText);
  if (covers(input.typed, composed)) return { draft: input.typed, heard: true };
  if (covers(composed, input.typed)) return { draft: composed, heard: true };
  if (input.typed.includes(heardText)) return { draft: input.typed, heard: true };
  return { draft: joinWords(input.typed, heardText), heard: true };
}

/** A longer final of the same utterance replaces the previous one. "no" + "no" does not. */
function extendsUtterance(previous: string, next: string): boolean {
  const prev = previous.trim();
  const incoming = next.trim();
  if (prev === "" || incoming.length <= prev.length) return false;
  if (!incoming.startsWith(prev)) return false;
  const boundary = incoming.charAt(prev.length);
  return boundary === " " || boundary === "\n" || boundary === "\t";
}

function collapseUtterances(parts: readonly string[]): string[] {
  const kept: string[] = [];
  for (const part of parts) {
    const text = part.trim();
    if (text === "") continue;
    const prev = kept[kept.length - 1];
    if (prev !== undefined && extendsUtterance(prev, text)) {
      kept[kept.length - 1] = text;
      continue;
    }
    kept.push(text);
  }
  return kept;
}

function packTranscript(finals: string, interim: string): MergedTranscript {
  const finalText = finals.trim();
  const interimText = interim.trim();
  const heard = combineHeard(finalText, interimText);
  if (interimText === "" || heard === finalText) return { finals: heard, interim: "", heard };
  if (finalText === "") return { finals: "", interim: heard, heard };
  if (heard === joinWords(finalText, interimText)) {
    return { finals: finalText, interim: interimText, heard };
  }
  if (extendsUtterance(finalText, heard) || heard.startsWith(`${finalText} `)) {
    return { finals: finalText, interim: heard.slice(finalText.length).trim(), heard };
  }
  return { finals: finalText, interim: interimText, heard };
}

function alreadyHeard(host: string, phrase: string): boolean {
  const text = phrase.trim();
  if (text === "") return true;
  return host === text || host.endsWith(` ${text}`);
}

function foldSealed(root: string, finals: string, interim: string): MergedTranscript {
  if (root === "") return packTranscript(finals, interim);
  const heard = combineHeard(finals, interim);
  if (heard === "" || alreadyHeard(root, heard)) return packTranscript(root, "");
  if (finals === root || finals.startsWith(`${root} `)) return packTranscript(finals, interim);
  if (extendsUtterance(root, heard) || heard.startsWith(`${root} `)) {
    if (finals === "" || alreadyHeard(root, finals)) {
      return packTranscript(root, heard.slice(root.length).trim());
    }
    if (finals.startsWith(`${root} `)) return packTranscript(finals, interim);
  }
  return packTranscript(joinWords(root, finals), interim);
}

/**
 * Rebuild one recognizer's transcript from the whole results list.
 * `resultIndex` is ignored: Chrome resends earlier results.
 * `sealed` is text from earlier recognizers in this dictation. A replay of
 * that text adds nothing. A new tail is joined once.
 */
export function mergeTranscript(results: readonly TranscriptPiece[], sealed = ""): MergedTranscript {
  const finalParts: string[] = [];
  const interimParts: string[] = [];
  for (const result of results) {
    const text = result.transcript.trim();
    if (text === "") continue;
    if (result.isFinal) {
      finalParts.push(text);
      interimParts.length = 0;
    } else interimParts.push(text);
  }
  const finals = collapseUtterances(finalParts).reduce((left, right) => joinWords(left, right), "");
  const interim = collapseUtterances(interimParts).reduce((left, right) => joinWords(left, right), "");
  return foldSealed(sealed.trim(), finals, interim);
}
