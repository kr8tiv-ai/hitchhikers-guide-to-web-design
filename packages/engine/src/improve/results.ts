/** TSV log. One row per experiment, including the baseline. */

export const RESULTS_COLUMNS = [
  "n",
  "started",
  "commit",
  "score",
  "best",
  "status",
  "seconds",
  "note",
] as const;

export const RESULT_STATUSES = ["keep", "discard", "crash", "violation", "failed"] as const;

/** Supervisor log adds these after the 173 columns. */
export const SUPERVISE_EXTRA_COLUMNS = ["pushed", "hooks_ok"] as const;

export const SUPERVISE_RESULTS_COLUMNS = [...RESULTS_COLUMNS, ...SUPERVISE_EXTRA_COLUMNS] as const;

export type YesNo = "yes" | "no";

export interface SuperviseResultRow extends ResultRow {
  pushed: YesNo;
  hooksOk: YesNo;
}

export type ResultStatus = (typeof RESULT_STATUSES)[number];

export interface ResultRow {
  n: number;
  started: string;
  commit: string;
  score: number;
  best: number;
  status: ResultStatus;
  seconds: number;
  note: string;
}

export function formatResultsHeader(): string {
  return RESULTS_COLUMNS.join("\t");
}

export function cleanNote(note: string): string {
  return note
    .replace(/[\t\r\n\u2028\u2029]/g, " ")
    .replace(/!/g, ".")
    .replace(/\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function cellNumber(value: number, label: string): string {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return String(Math.trunc(value));
}

export function formatResultsRow(row: ResultRow): string {
  if (!Number.isSafeInteger(row.n) || row.n < 0) throw new Error("n must be a non-negative integer.");
  if (!RESULT_STATUSES.includes(row.status)) throw new Error("status is not a results status.");
  if (row.started.includes("\t") || row.started.includes("\n") || row.commit.includes("\t")) {
    throw new Error("results cells must be single line.");
  }
  const cells = [
    String(row.n),
    row.started,
    row.commit,
    cellNumber(row.score, "score"),
    cellNumber(row.best, "best"),
    row.status,
    cellNumber(Math.max(0, row.seconds), "seconds"),
    cleanNote(row.note),
  ];
  return cells.join("\t");
}

export function nextResultIndex(existing: string): number {
  const normalized = existing.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (normalized.length === 0) return 0;
  return Math.max(0, normalized.split("\n").length - 1);
}

function yesNo(value: string, label: string): YesNo {
  if (value === "yes" || value === "no") return value;
  throw new Error(`${label} must be yes or no.`);
}

export function formatSuperviseHeader(): string {
  return SUPERVISE_RESULTS_COLUMNS.join("\t");
}

export function formatSuperviseRow(row: SuperviseResultRow): string {
  const pushed = yesNo(row.pushed, "pushed");
  const hooksOk = yesNo(row.hooksOk, "hooks_ok");
  return `${formatResultsRow(row)}\t${pushed}\t${hooksOk}`;
}

/** Append one supervisor row. The 173 header is not accepted. */
export function appendSuperviseResults(existing: string, row: SuperviseResultRow): string {
  const header = formatSuperviseHeader();
  const line = formatSuperviseRow(row);
  const normalized = existing.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.trim().length === 0) return `${header}\n${line}\n`;
  const body = normalized.endsWith("\n") ? normalized : `${normalized}\n`;
  if (!body.startsWith(`${header}\n`)) throw new Error("results.tsv header does not match.");
  return `${body}${line}\n`;
}

/** Append one row. The header is written once and then checked. */
export function appendResults(existing: string, row: ResultRow): string {
  const header = formatResultsHeader();
  const line = formatResultsRow(row);
  const normalized = existing.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.trim().length === 0) return `${header}\n${line}\n`;
  const body = normalized.endsWith("\n") ? normalized : `${normalized}\n`;
  if (!body.startsWith(`${header}\n`)) throw new Error("results.tsv header does not match.");
  return `${body}${line}\n`;
}
