/**
 * Knowledge pack frontmatter and claim checks.
 * A four-digit year from 1900 through 2099 counts as a statistic.
 * The check looks at one line, then the next non-empty line.
 */

export interface PackMeta {
  description: string;
  whenToUse: string;
  paths: string[];
}

const YEAR = /\b(?:19|20)\d{2}\b/;

export function parsePack(markdown: string): PackMeta {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    throw new Error("Knowledge pack frontmatter must start with ---.");
  }

  let close = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) {
    throw new Error("Frontmatter is missing a closing ---.");
  }

  const fields = readFrontmatter(lines.slice(1, close));
  const description = scalarField(fields, "description");
  if (description === undefined || description === "") {
    throw new Error("Knowledge pack is missing description.");
  }
  const whenToUse = scalarField(fields, "when-to-use");
  if (whenToUse === undefined || whenToUse === "") {
    throw new Error("Knowledge pack is missing when-to-use.");
  }
  const paths = fields.get("paths");
  if (paths === undefined) {
    throw new Error("Knowledge pack is missing paths.");
  }
  if (paths.kind !== "list") {
    throw new Error("paths must be a list of strings.");
  }

  return { description, whenToUse, paths: paths.value };
}

export function lintPackClaims(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const warnings: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trimStart().startsWith("Source:")) continue;
    if (!isStatistic(line)) continue;
    const next = nextNonEmpty(lines, i + 1);
    if (next !== undefined && next.trimStart().startsWith("Source:")) continue;
    warnings.push(`Line ${i + 1} needs a source: ${line.trim()}`);
  }
  return warnings;
}

type Field =
  | { kind: "scalar"; value: string }
  | { kind: "list"; value: string[] };

function readFrontmatter(lines: readonly string[]): Map<string, Field> {
  const fields = new Map<string, Field>();
  let list: string[] | undefined;

  for (const line of lines) {
    if (line.trim() === "") continue;

    const item = /^[ \t]+-[ \t]+(.*)$/.exec(line);
    if (item) {
      if (list === undefined) {
        throw new Error(`List item is outside a list: ${line.trim()}`);
      }
      const value = unquote(item[1] ?? "");
      if (value === "") {
        throw new Error("paths must be a list of strings.");
      }
      list.push(value);
      continue;
    }

    const pair = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line.trim());
    if (!pair) {
      throw new Error(`Cannot read frontmatter line: ${line.trim()}`);
    }
    const key = pair[1] ?? "";
    const raw = pair[2] ?? "";
    if (key === "effort") {
      throw new Error("Set effort on the prompt, not the skill.");
    }

    list = undefined;
    if (raw === "") {
      const items: string[] = [];
      list = items;
      fields.set(key, { kind: "list", value: items });
      continue;
    }
    if (raw.startsWith("[") && raw.endsWith("]")) {
      fields.set(key, { kind: "list", value: splitFlow(raw.slice(1, -1)) });
      continue;
    }
    fields.set(key, { kind: "scalar", value: unquote(raw) });
  }

  return fields;
}

function scalarField(fields: Map<string, Field>, key: string): string | undefined {
  const field = fields.get(key);
  if (field === undefined) return undefined;
  if (field.kind !== "scalar") {
    throw new Error(`Knowledge pack is missing ${key}.`);
  }
  return field.value;
}

function splitFlow(inner: string): string[] {
  const trimmed = inner.trim();
  if (trimmed === "") return [];
  return trimmed.split(",").map((part) => unquote(part));
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (
    (quote === '"' || quote === "'") &&
    trimmed.length >= 2 &&
    trimmed.endsWith(quote)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isStatistic(line: string): boolean {
  return line.includes("%") || YEAR.test(line);
}

function nextNonEmpty(lines: readonly string[], start: number): string | undefined {
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (line !== undefined && line.trim() !== "") return line;
  }
  return undefined;
}
