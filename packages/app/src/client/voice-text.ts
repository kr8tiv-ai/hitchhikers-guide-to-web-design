/**
 * Pure draft math for the voice button. No DOM.
 * A stop must keep typed words and must not repeat a phrase.
 */

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
