/**
 * Front matter for improve/program.md. The human writes this file.
 * The runner does not let an experiment edit it.
 */

export const DEFAULT_TARGETS = [
  "packages/app/src/design",
  "packages/app/src/server/card.ts",
] as const;

export const DEFAULT_MINUTES = 10;
export const DEFAULT_TURNS = 40;
export const DEFAULT_MODEL = "grok-4.7";
export const DEFAULT_EFFORT = "xhigh";
export const DEFAULT_TAG = "guide";

export interface ImproveProgram {
  tag: string;
  objective: string;
  targets: readonly string[];
  minutes: number;
  turns: number;
  model: string;
  effort: string;
  body: string;
}

function unquote(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function isUnsafe(input: string): boolean {
  const slash = input.replace(/\\/g, "/");
  if (slash.startsWith("/") || /^[A-Za-z]:/.test(slash)) return true;
  return slash.split("/").some((part) => part === "..");
}

function parseFront(front: string): Map<string, string | string[]> {
  const map = new Map<string, string | string[]>();
  const lines = front.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    index += 1;
    if (line.trim().length === 0 || line.trim().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) throw new Error("program.md front matter has a bad line.");
    const key = line.slice(0, colon).trim();
    const rest = line.slice(colon + 1).trim();
    if (rest.length > 0) {
      map.set(key, unquote(rest));
      continue;
    }
    const items: string[] = [];
    while (index < lines.length) {
      const next = lines[index] ?? "";
      const trimmed = next.trim();
      if (trimmed.length === 0) {
        index += 1;
        continue;
      }
      if (!trimmed.startsWith("- ")) break;
      items.push(unquote(trimmed.slice(2).trim()));
      index += 1;
    }
    map.set(key, items);
  }
  return map;
}

function textValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) throw new Error("program.md field must be a single line.");
  return value;
}

function token(value: string | string[] | undefined, fallback: string, label: string): string {
  const raw = textValue(value);
  if (raw === undefined || raw.length === 0) return fallback;
  if (!/^[A-Za-z0-9._-]+$/.test(raw)) throw new Error(`${label} must be a single token.`);
  return raw;
}

function positive(value: string | string[] | undefined, fallback: number, label: string): number {
  const raw = textValue(value);
  if (raw === undefined) return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new Error(`${label} must be a positive integer.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function targetsFrom(value: string | string[] | undefined): string[] {
  if (value === undefined) return [...DEFAULT_TARGETS];
  const items = Array.isArray(value) ? value : [value];
  if (items.length === 0) throw new Error("program.md targets is empty.");
  for (const item of items) {
    if (item.length === 0 || isUnsafe(item)) {
      throw new Error("program.md target is not a relative path.");
    }
  }
  return items.map((item) => item.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, ""));
}

function tagFrom(value: string | string[] | undefined): string {
  const raw = textValue(value) ?? DEFAULT_TAG;
  const clean = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return clean.length > 0 ? clean : DEFAULT_TAG;
}

export interface AgentBrief {
  id: string;
  home: "repo" | "temporary";
  findings: string;
  instructions: string;
}

function briefField(body: string, key: string): string | undefined {
  const prefix = `- ${key}:`;
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length).trim();
  }
  return undefined;
}

/**
 * Briefs under `## Test agents`. Each `###` slug has home and a findings path.
 * A program with no such section has an empty list.
 */
export function parseAgentBriefs(markdown: string): AgentBrief[] {
  const text = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const marker = "## Test agents";
  const at = text.indexOf(marker);
  if (at < 0) return [];
  let section = text.slice(at + marker.length);
  const next = section.search(/\n## [^#\n]/);
  if (next >= 0) section = section.slice(0, next);
  const chunks = section.split(/\n### /);
  const briefs: AgentBrief[] = [];
  const seen = new Set<string>();
  for (let index = 1; index < chunks.length; index += 1) {
    const chunk = chunks[index] ?? "";
    const nl = chunk.indexOf("\n");
    const id = (nl < 0 ? chunk : chunk.slice(0, nl)).trim();
    const body = nl < 0 ? "" : chunk.slice(nl + 1);
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(id)) throw new Error("Test agent id is not a slug.");
    if (seen.has(id)) throw new Error("Test agent id is repeated.");
    seen.add(id);
    const home = briefField(body, "home");
    const findings = briefField(body, "findings");
    if (home !== "repo" && home !== "temporary") {
      throw new Error("Test agent home must be repo or temporary.");
    }
    if (findings === undefined || findings.length === 0 || isUnsafe(findings)) {
      throw new Error("Test agent findings path is not relative.");
    }
    const normalized = findings.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (!normalized.startsWith("improve/findings/")) {
      throw new Error("Test agent findings path must be under improve/findings/.");
    }
    const instructions = body
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("- home:") && !trimmed.startsWith("- findings:");
      })
      .join("\n")
      .trim();
    briefs.push({ id, home, findings: normalized, instructions });
  }
  return briefs;
}

/** Parse program.md. Missing targets fall back to the desk copy and card. */
export function parseProgram(markdown: string): ImproveProgram {
  const text = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.startsWith("---\n")) throw new Error("program.md is missing front matter.");
  const close = text.indexOf("\n---\n", 3);
  if (close < 0) throw new Error("program.md front matter does not close.");
  const front = parseFront(text.slice(4, close));
  const objective = textValue(front.get("objective"));
  if (objective === undefined || objective.trim().length === 0) {
    throw new Error("program.md objective is empty.");
  }
  return {
    tag: tagFrom(front.get("tag")),
    objective: objective.trim(),
    targets: targetsFrom(front.get("targets")),
    minutes: positive(front.get("minutes"), DEFAULT_MINUTES, "minutes"),
    turns: positive(front.get("turns"), DEFAULT_TURNS, "turns"),
    model: token(front.get("model"), DEFAULT_MODEL, "model"),
    effort: token(front.get("effort"), DEFAULT_EFFORT, "effort"),
    body: text.slice(close + 5),
  };
}
