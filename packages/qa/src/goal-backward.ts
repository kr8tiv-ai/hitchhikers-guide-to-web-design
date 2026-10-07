/**
 * Goal-backward check for one prompt's truths (Zaphod, v2 §11.3).
 *
 * The caller supplies the truth strings and the evidence links. Truths come
 * from a site prompt's `<must_haves>` truths list (`SitePrompt.body`) or from
 * a Guide prompt's truths list. This function does not parse those files and
 * does not read `SitePrompt`, which has no `mustHaves` field.
 *
 * Matching is exact. Whitespace, case, and punctuation are part of the truth.
 * `"hero visible"` does not match `"hero  visible"` or `" hero visible"`.
 * Callers pass the truth unchanged.
 *
 * A truth is FOUND only when some evidence row names that exact string and
 * its note is at least {@link MIN_NOTE_LENGTH} characters. Length is
 * `note.length`. The note is not trimmed. `ok` and an empty note are MISSING.
 * A truth with no evidence row is MISSING. Evidence for a string that is not
 * in `truths` is ignored and does not add a row.
 *
 * A passing suite is not evidence. A green test name that does not match a
 * truth is not FOUND. This function does not run tests and does not use the
 * network.
 *
 * An empty `truths` list throws. A prompt without must_haves is already
 * invalid. Duplicate truth strings throw.
 */

/** Notes shorter than this are not evidence. `ok` does not count. */
const MIN_NOTE_LENGTH = 10;

export interface TruthEvidence {
  truth: string;
  note: string;
}

export interface TruthCheck {
  truth: string;
  status: "FOUND" | "MISSING";
}

export function checkTruths(truths: string[], evidence: TruthEvidence[]): TruthCheck[] {
  if (truths.length === 0) {
    throw new Error("truths is empty. A prompt without must_haves is already invalid.");
  }

  const seen = new Set<string>();
  for (const truth of truths) {
    if (seen.has(truth)) {
      throw new Error(`Duplicate truth: ${JSON.stringify(truth)}`);
    }
    seen.add(truth);
  }

  const found = new Set<string>();
  for (const item of evidence) {
    if (item.note.length >= MIN_NOTE_LENGTH) {
      found.add(item.truth);
    }
  }

  return truths.map((truth) => ({
    truth,
    status: found.has(truth) ? "FOUND" : "MISSING",
  }));
}
