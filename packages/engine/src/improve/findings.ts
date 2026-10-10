/** Open and fixed rows from a findings file or from docs/bug-scan.md. */

export interface Finding {
  id: string;
  status: "open" | "fixed" | "other";
}

function cellsOf(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function isSeparator(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function isHeader(cells: readonly string[]): boolean {
  const lower = cells.map((cell) => cell.toLowerCase());
  return lower.includes("id") && (lower.includes("status") || lower.includes("area") || lower.includes("reason"));
}

function statusOf(cell: string, notFixed: boolean, hasStatus: boolean): Finding["status"] {
  if (hasStatus) {
    const value = cell.toLowerCase();
    if (value === "open") return "open";
    if (value === "fixed") return "fixed";
    return "other";
  }
  return notFixed ? "open" : "other";
}

function parseMarkdown(lines: readonly string[]): Finding[] {
  const found: Finding[] = [];
  let notFixed = false;
  let statusIndex = -1;
  let idIndex = -1;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,6}\s+/.test(line)) {
      notFixed = /^#{1,6}\s+not fixed\b/i.test(line);
      statusIndex = -1;
      idIndex = -1;
      continue;
    }
    if (/^not fixed:?$/i.test(line)) {
      notFixed = true;
      statusIndex = -1;
      idIndex = -1;
      continue;
    }
    if (!line.startsWith("|")) {
      statusIndex = -1;
      idIndex = -1;
      continue;
    }
    const cells = cellsOf(line);
    if (isSeparator(cells)) continue;
    if (isHeader(cells)) {
      const lower = cells.map((cell) => cell.toLowerCase());
      idIndex = lower.indexOf("id");
      statusIndex = lower.indexOf("status");
      continue;
    }
    if (idIndex < 0 && !notFixed) continue;
    const id = (cells[idIndex >= 0 ? idIndex : 0] ?? "").trim();
    if (id.length === 0 || id.toLowerCase() === "id") continue;
    const statusCell = statusIndex >= 0 ? (cells[statusIndex] ?? "") : "";
    found.push({ id, status: statusOf(statusCell, notFixed, statusIndex >= 0) });
  }
  return found;
}

function parseTsv(lines: readonly string[]): Finding[] {
  const found: Finding[] = [];
  let header: string[] | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line.trim().length === 0) continue;
    const cells = line.split("\t").map((cell) => cell.trim());
    if (header === null) {
      header = cells.map((cell) => cell.toLowerCase());
      continue;
    }
    const idIndex = header.indexOf("id");
    const statusIndex = header.indexOf("status");
    if (statusIndex < 0) continue;
    const id = (idIndex >= 0 ? cells[idIndex] : cells[0])?.trim() ?? "";
    if (id.length === 0) continue;
    const statusCell = cells[statusIndex] ?? "";
    found.push({ id, status: statusOf(statusCell, false, true) });
  }
  return found;
}

/** TSV when the first row has a status column. Otherwise markdown tables. */
export function parseFindings(text: string): Finding[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const first = lines.find((line) => line.trim().length > 0) ?? "";
  const columns = first.split("\t").map((cell) => cell.trim().toLowerCase());
  if (first.includes("\t") && columns.includes("status")) return parseTsv(lines);
  return parseMarkdown(lines);
}

/** Unique ids that any source still marks open. */
export function countOpenFindings(texts: readonly string[]): number {
  const open = new Set<string>();
  for (const text of texts) {
    for (const finding of parseFindings(text)) {
      if (finding.status === "open") open.add(finding.id);
    }
  }
  return open.size;
}
