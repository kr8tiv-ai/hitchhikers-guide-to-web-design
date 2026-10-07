/**
 * Guide Entry. This is not a question id. The interview stores answers.
 * renderBrief turns those answers into the one-page Site Brief.
 * missingRequired is the gate: a required field cannot ship as an empty string.
 * Skip still counts when the stored value is a non-empty assumed string.
 * Appetite (DP-6.2) is a weight ceiling. It does not remove a library.
 */

export interface AnswerRecord {
  id: string;
  status: "ANSWERED" | "SUGGESTED" | "SKIPPED" | "SOFT" | "IMPORTED";
  value: string;
}

/** Site why, one visitor, one action, vibe and anti-vibe, motion level, hosting. */
const REQUIRED_IDS = ["DP-2.1", "DP-2.6", "DP-2.2", "DP-5.3", "DP-6.2", "DP-9.2"] as const;

/**
 * Required minimum from v2 section 8.4, in that order.
 * Why the site exists, one visitor, one action, vibe and anti-vibe,
 * motion level, and hosting. DP-7.2 is not in this list.
 */
export function requiredIds(): readonly string[] {
  return REQUIRED_IDS;
}

const BRIEF_SECTIONS: ReadonlyArray<{ heading: string; id: string }> = [
  { heading: "Goal", id: "DP-2.1" },
  { heading: "Visitor", id: "DP-2.6" },
  { heading: "Action", id: "DP-2.2" },
  { heading: "Vibe", id: "DP-5.3" },
  { heading: "Motion", id: "DP-6.2" },
  { heading: "Hosting", id: "DP-9.2" },
];

const STATUSES = ["ANSWERED", "SUGGESTED", "SKIPPED", "SOFT", "IMPORTED"] as const;

type AnswerStatus = (typeof STATUSES)[number];

/**
 * Required ids whose latest value is blank, in the §8.4 order.
 * ANSWERED, SUGGESTED, IMPORTED, SKIPPED, and SOFT all count when trimmed
 * text is non-empty. An empty value never counts. A missing id counts.
 * The last record for an id wins. DP-7.2 is not required.
 */
export function missingRequired(answers: AnswerRecord[]): string[] {
  const latest = latestById(answers);
  const missing: string[] = [];
  for (const id of requiredIds()) {
    if (!isPresent(latest.get(id))) missing.push(id);
  }
  return missing;
}

/**
 * One-page Site Brief. Headings are Goal, Visitor, Action, Vibe, Motion,
 * and Hosting. A SOFT field is prefixed with `SOFT:`. The closing Coverage
 * line counts every record in the array. No book quote is added here.
 */
export function renderBrief(answers: AnswerRecord[]): string {
  const latest = latestById(answers);
  const lines: string[] = ["# Site Brief", ""];
  for (const section of BRIEF_SECTIONS) {
    lines.push(`## ${section.heading}`, "", fieldBody(latest.get(section.id)), "");
  }
  lines.push(coverageLine(answers));
  return lines.join("\n");
}

function latestById(answers: readonly AnswerRecord[]): Map<string, AnswerRecord> {
  const latest = new Map<string, AnswerRecord>();
  for (const answer of answers) {
    latest.set(answer.id, answer);
  }
  return latest;
}

function isPresent(record: AnswerRecord | undefined): boolean {
  if (record === undefined) return false;
  if (!isStatus(record.status)) return false;
  return record.value.trim() !== "";
}

function fieldBody(record: AnswerRecord | undefined): string {
  if (record === undefined) return "";
  const value = record.value.trim();
  if (value === "") return "";
  if (record.status === "SOFT") return `SOFT: ${value}`;
  return value;
}

function coverageLine(answers: readonly AnswerRecord[]): string {
  const counts: Record<AnswerStatus, number> = {
    ANSWERED: 0,
    SUGGESTED: 0,
    SKIPPED: 0,
    SOFT: 0,
    IMPORTED: 0,
  };
  for (const answer of answers) {
    if (isStatus(answer.status)) counts[answer.status] += 1;
  }
  return `Coverage: ${counts.ANSWERED} answered, ${counts.SUGGESTED} suggested, ${counts.SKIPPED} skipped, ${counts.SOFT} soft, ${counts.IMPORTED} imported.`;
}

function isStatus(value: string): value is AnswerStatus {
  return STATUSES.some((status) => status === value);
}
