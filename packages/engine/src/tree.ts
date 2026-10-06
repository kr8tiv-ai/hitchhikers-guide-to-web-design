import { readFileSync } from "node:fs";

/**
 * Interview tree loader for interview/tree.yaml.
 * The subset is mappings, block lists, flow lists, and one-line quoted strings.
 * A duplicate id, an empty skip default, a missing writes list, or an unknown
 * depth token throws. The loader does not skip a broken question.
 * Express, Standard, and Deep are filters over this one file.
 */

export type DepthName = "express" | "standard" | "deep";
export type InputName = "upload" | "text" | "voice" | "choice";
export type LevelName = "explain" | "terse";

export interface Question {
  id: string;
  module: string;
  depth: Array<DepthName>;
  ask: string;
  why: string;
  input: Array<InputName>;
  skipDefault: string;
  suggest?: string;
  pushbackIf?: string[];
  followUps?: Array<{ id: string; ask: string }>;
  levels?: { beginner: LevelName; pro: LevelName };
  requiredFor?: string[];
  writes: string[];
}

export class TreeError extends Error {
  readonly field: string;
  readonly id?: string;

  constructor(field: string, message: string, id?: string) {
    super(message);
    this.name = "TreeError";
    this.field = field;
    if (id !== undefined && id !== "") {
      this.id = id;
    }
  }
}

interface YamlMap {
  [key: string]: Yaml;
}
type Yaml = string | Yaml[] | YamlMap;

type Token =
  | { kind: "key"; line: number; indent: number; key: string; inline: Yaml }
  | { kind: "key-open"; line: number; indent: number; key: string }
  | { kind: "scalar"; line: number; indent: number; value: Yaml }
  | { kind: "item-key"; line: number; indent: number; key: string; inline: Yaml }
  | { kind: "item-open"; line: number; indent: number; key: string }
  | { kind: "item-empty"; line: number; indent: number };

const DEPTHS: readonly DepthName[] = ["express", "standard", "deep"];
const INPUTS: readonly InputName[] = ["upload", "text", "voice", "choice"];
const LEVELS: readonly LevelName[] = ["explain", "terse"];
const QUESTION_KEYS = new Set([
  "id",
  "module",
  "depth",
  "ask",
  "why",
  "input",
  "skip_default",
  "suggest",
  "pushback_if",
  "follow_ups",
  "levels",
  "required_for",
  "writes",
]);

const KEY_RE = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/;

export function loadTree(file: string): Question[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unreadable";
    throw new TreeError("file", `cannot read tree: ${detail}`);
  }
  return questionsFromYaml(text);
}

/** Keeps file order. A mode is a filter, not a second tree. */
export function questionsForDepth(all: Question[], depth: DepthName): Question[] {
  return all.filter((question) => question.depth.includes(depth));
}

function questionsFromYaml(text: string): Question[] {
  const root = parseDocument(text);
  if (!Object.hasOwn(root, "questions")) {
    throw new TreeError("questions", "missing questions");
  }
  const value = root["questions"];
  if (!Array.isArray(value)) {
    throw new TreeError("questions", "questions must be a list");
  }
  const questions: Question[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (item === undefined) {
      throw new TreeError("questions", `question ${index + 1} is missing`);
    }
    const question = toQuestion(item, index);
    if (seen.has(question.id)) {
      throw new TreeError("id", `duplicate id ${question.id}`, question.id);
    }
    seen.add(question.id);
    questions.push(question);
  }
  return questions;
}

function toQuestion(value: Yaml, index: number): Question {
  if (!isMap(value)) {
    throw new TreeError("questions", `question ${index + 1} must be a mapping`);
  }
  const id = requireString(value, "id", "");
  for (const key of Object.keys(value)) {
    if (!QUESTION_KEYS.has(key)) {
      throw new TreeError(key, owned(id, `unknown field ${key}`), id);
    }
  }
  const question: Question = {
    id,
    module: requireString(value, "module", id),
    depth: requireNames(value, "depth", id, DEPTHS, "depth"),
    ask: requireString(value, "ask", id),
    why: requireString(value, "why", id),
    input: requireNames(value, "input", id, INPUTS, "input"),
    skipDefault: requireString(value, "skip_default", id),
    writes: requireStringList(value, "writes", id),
  };
  const suggest = optionalString(value, "suggest", id);
  if (suggest !== undefined) question.suggest = suggest;
  const pushbackIf = optionalStringList(value, "pushback_if", id);
  if (pushbackIf !== undefined) question.pushbackIf = pushbackIf;
  const followUps = optionalFollowUps(value, id);
  if (followUps !== undefined) question.followUps = followUps;
  const levels = optionalLevels(value, id);
  if (levels !== undefined) question.levels = levels;
  const requiredFor = optionalStringList(value, "required_for", id);
  if (requiredFor !== undefined) question.requiredFor = requiredFor;
  return question;
}

function requireNames<T extends string>(
  map: YamlMap,
  key: string,
  id: string,
  allowed: readonly T[],
  label: string,
): T[] {
  const items = requireStringList(map, key, id);
  const out: T[] = [];
  for (const item of items) {
    if (!includes(allowed, item)) {
      throw new TreeError(key, owned(id, `unknown ${label} token ${item}`), id);
    }
    if (out.includes(item)) {
      throw new TreeError(key, owned(id, `duplicate ${label} token ${item}`), id);
    }
    out.push(item);
  }
  return out;
}

function includes<T extends string>(allowed: readonly T[], value: string): value is T {
  return allowed.some((item) => item === value);
}

function requireString(map: YamlMap, key: string, id: string): string {
  if (!Object.hasOwn(map, key)) {
    throw new TreeError(key, owned(id, `missing ${key}`), id);
  }
  const value = map[key];
  if (typeof value !== "string" || value.trim() === "") {
    const detail =
      key === "skip_default" ? "skip_default is empty" : `${key} must be a non-empty string`;
    throw new TreeError(key, owned(id, detail), id);
  }
  return value.trim();
}

function requireStringList(map: YamlMap, key: string, id: string): string[] {
  if (!Object.hasOwn(map, key)) {
    throw new TreeError(key, owned(id, `missing ${key}`), id);
  }
  return readStringList(map[key], key, id);
}

function optionalString(map: YamlMap, key: string, id: string): string | undefined {
  if (!Object.hasOwn(map, key)) return undefined;
  return requireString(map, key, id);
}

function optionalStringList(map: YamlMap, key: string, id: string): string[] | undefined {
  if (!Object.hasOwn(map, key)) return undefined;
  const items = readStringList(map[key], key, id);
  return items.length > 0 ? items : undefined;
}

function readStringList(value: Yaml | undefined, key: string, id: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    const detail = Array.isArray(value) ? `${key} is empty` : `${key} must be a list`;
    throw new TreeError(key, owned(id, detail), id);
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") {
      throw new TreeError(key, owned(id, `${key} entries must be non-empty strings`), id);
    }
    out.push(item.trim());
  }
  return out;
}

function optionalFollowUps(
  map: YamlMap,
  id: string,
): Array<{ id: string; ask: string }> | undefined {
  if (!Object.hasOwn(map, "follow_ups")) return undefined;
  const value = map["follow_ups"];
  if (!Array.isArray(value)) {
    throw new TreeError("follow_ups", owned(id, "follow_ups must be a list"), id);
  }
  if (value.length === 0) return undefined;
  const out: Array<{ id: string; ask: string }> = [];
  for (const item of value) {
    if (!isMap(item)) {
      throw new TreeError("follow_ups", owned(id, "follow_ups items must be mappings"), id);
    }
    for (const key of Object.keys(item)) {
      if (key !== "id" && key !== "ask") {
        throw new TreeError("follow_ups", owned(id, `unknown follow_ups field ${key}`), id);
      }
    }
    out.push({
      id: requireString(item, "id", id),
      ask: requireString(item, "ask", id),
    });
  }
  return out;
}

function optionalLevels(
  map: YamlMap,
  id: string,
): { beginner: LevelName; pro: LevelName } | undefined {
  if (!Object.hasOwn(map, "levels")) return undefined;
  const value = map["levels"];
  if (!isMap(value)) {
    throw new TreeError("levels", owned(id, "levels must be a mapping"), id);
  }
  for (const key of Object.keys(value)) {
    if (key !== "beginner" && key !== "pro") {
      throw new TreeError("levels", owned(id, `unknown levels field ${key}`), id);
    }
  }
  return {
    beginner: requireLevel(value, "beginner", id),
    pro: requireLevel(value, "pro", id),
  };
}

function requireLevel(map: YamlMap, key: string, id: string): LevelName {
  const value = requireString(map, key, id);
  if (!includes(LEVELS, value)) {
    throw new TreeError("levels", owned(id, `unknown level ${value}`), id);
  }
  return value;
}

function owned(id: string, message: string): string {
  return id === "" ? message : `${id}: ${message}`;
}

function isMap(value: Yaml | undefined): value is YamlMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function yamlMap(): YamlMap {
  return Object.create(null) as YamlMap;
}

function parseDocument(text: string): YamlMap {
  const tokens = lex(text);
  const first = tokens[0];
  if (first === undefined) return yamlMap();
  if (first.kind !== "key" && first.kind !== "key-open") {
    throw new TreeError("yaml", `line ${first.line}: document must be a mapping`);
  }
  const parsed = parseMap(tokens, 0, first.indent);
  if (parsed.index !== tokens.length) {
    const leftover = tokens[parsed.index];
    const line = leftover === undefined ? parsed.index : leftover.line;
    throw new TreeError("yaml", `line ${line}: unexpected content`);
  }
  return parsed.value;
}

function parseMap(
  tokens: Token[],
  index: number,
  indent: number,
): { value: YamlMap; index: number } {
  const map = yamlMap();
  let cursor = index;
  while (cursor < tokens.length) {
    const token = tokens[cursor];
    if (token === undefined || token.indent < indent) break;
    if (token.indent !== indent || (token.kind !== "key" && token.kind !== "key-open")) {
      throw new TreeError("yaml", `line ${token.line}: expected a key at indent ${indent}`);
    }
    if (Object.hasOwn(map, token.key)) {
      throw new TreeError("yaml", `line ${token.line}: duplicate key ${token.key}`);
    }
    if (token.kind === "key") {
      map[token.key] = token.inline;
      cursor += 1;
      continue;
    }
    cursor += 1;
    const nested = parseBlock(tokens, cursor, indent);
    map[token.key] = nested.value;
    cursor = nested.index;
  }
  return { value: map, index: cursor };
}

function parseList(
  tokens: Token[],
  index: number,
  indent: number,
): { value: Yaml[]; index: number } {
  const list: Yaml[] = [];
  let cursor = index;
  while (cursor < tokens.length) {
    const token = tokens[cursor];
    if (token === undefined || token.indent < indent) break;
    if (token.indent !== indent) {
      throw new TreeError("yaml", `line ${token.line}: unexpected indent`);
    }
    if (token.kind === "scalar") {
      list.push(token.value);
      cursor += 1;
      continue;
    }
    if (token.kind === "item-empty") {
      cursor += 1;
      const nested = parseBlock(tokens, cursor, indent);
      list.push(nested.value);
      cursor = nested.index;
      continue;
    }
    if (token.kind === "item-key" || token.kind === "item-open") {
      const item = yamlMap();
      if (token.kind === "item-key") {
        item[token.key] = token.inline;
        cursor += 1;
      } else {
        cursor += 1;
        const nested = parseBlock(tokens, cursor, indent);
        item[token.key] = nested.value;
        cursor = nested.index;
      }
      const next = tokens[cursor];
      if (
        next !== undefined &&
        next.indent > indent &&
        (next.kind === "key" || next.kind === "key-open")
      ) {
        const rest = parseMap(tokens, cursor, next.indent);
        for (const key of Object.keys(rest.value)) {
          if (Object.hasOwn(item, key)) {
            throw new TreeError("yaml", `line ${next.line}: duplicate key ${key}`);
          }
          const nested = rest.value[key];
          if (nested === undefined) {
            throw new TreeError("yaml", `line ${next.line}: empty value for ${key}`);
          }
          item[key] = nested;
        }
        cursor = rest.index;
      }
      list.push(item);
      continue;
    }
    throw new TreeError("yaml", `line ${token.line}: expected a list item`);
  }
  return { value: list, index: cursor };
}

function parseBlock(
  tokens: Token[],
  index: number,
  parentIndent: number,
): { value: Yaml; index: number } {
  const next = tokens[index];
  if (next === undefined || next.indent <= parentIndent) {
    return { value: "", index };
  }
  if (
    next.kind === "scalar" ||
    next.kind === "item-key" ||
    next.kind === "item-open" ||
    next.kind === "item-empty"
  ) {
    return parseList(tokens, index, next.indent);
  }
  return parseMap(tokens, index, next.indent);
}

function lex(text: string): Token[] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const tokens: Token[] = [];
  const lines = normalized.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const stripped = stripComment(lines[index] ?? "");
    if (stripped.trim() === "") continue;
    const indent = leadingSpaces(stripped, lineNo);
    tokens.push(tokenFromBody(stripped.slice(indent), indent, lineNo));
  }
  return tokens;
}

function tokenFromBody(body: string, indent: number, lineNo: number): Token {
  if (body === "-" || body === "- ") {
    return { kind: "item-empty", line: lineNo, indent };
  }
  if (body.startsWith("- ")) {
    const rest = body.slice(2).trim();
    if (rest === "") return { kind: "item-empty", line: lineNo, indent };
    const keyed = matchKey(rest, lineNo);
    if (keyed === null) {
      return { kind: "scalar", line: lineNo, indent, value: parseScalar(rest, lineNo) };
    }
    if (keyed.inline === undefined) {
      return { kind: "item-open", line: lineNo, indent, key: keyed.key };
    }
    return { kind: "item-key", line: lineNo, indent, key: keyed.key, inline: keyed.inline };
  }
  const keyed = matchKey(body, lineNo);
  if (keyed === null) {
    throw new TreeError("yaml", `line ${lineNo}: expected a key or list item`);
  }
  if (keyed.inline === undefined) {
    return { kind: "key-open", line: lineNo, indent, key: keyed.key };
  }
  return { kind: "key", line: lineNo, indent, key: keyed.key, inline: keyed.inline };
}

function matchKey(
  body: string,
  lineNo: number,
): { key: string; inline: Yaml | undefined } | null {
  const match = KEY_RE.exec(body);
  if (match === null) return null;
  const key = match[1];
  if (key === undefined) return null;
  const raw = (match[2] ?? "").trim();
  if (raw === "") return { key, inline: undefined };
  if (raw === '""' || raw === "''") return { key, inline: "" };
  return { key, inline: parseScalar(raw, lineNo) };
}

function leadingSpaces(line: string, lineNo: number): number {
  let count = 0;
  while (count < line.length) {
    const ch = line[count];
    if (ch === " ") {
      count += 1;
      continue;
    }
    if (ch === "\t") {
      throw new TreeError("yaml", `line ${lineNo}: tabs are not allowed`);
    }
    break;
  }
  return count;
}

function stripComment(input: string): string {
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < input.length; index += 1) {
    const ch = input[index];
    if (ch === undefined) break;
    if (quote === "'") {
      if (ch === "'" && input[index + 1] === "'") {
        index += 1;
        continue;
      }
      if (ch === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\") {
        index += 1;
        continue;
      }
      if (ch === '"') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    const previous = index === 0 ? "" : input[index - 1];
    if (ch === "#" && (index === 0 || previous === " " || previous === "\t")) {
      return input.slice(0, index).trimEnd();
    }
  }
  return input.trimEnd();
}

function parseScalar(raw: string, lineNo: number): Yaml {
  if (
    raw === ">" ||
    raw === "|" ||
    raw.startsWith(">-") ||
    raw.startsWith("|-") ||
    raw.startsWith(">+") ||
    raw.startsWith("|+")
  ) {
    throw new TreeError("yaml", `line ${lineNo}: multiline scalars are not supported`);
  }
  if (raw.startsWith("{")) {
    throw new TreeError("yaml", `line ${lineNo}: flow mappings are not supported`);
  }
  if (raw.startsWith("[")) return parseFlow(raw, lineNo);
  if (raw.startsWith("'") || raw.startsWith('"')) return parseQuoted(raw, lineNo);
  return raw;
}

function parseFlow(text: string, lineNo: number): string[] {
  if (!text.endsWith("]")) {
    throw new TreeError("yaml", `line ${lineNo}: unclosed flow list`);
  }
  const parts = splitCommas(text.slice(1, -1), lineNo);
  if (parts.length === 1 && parts[0] === "") return [];
  const out: string[] = [];
  for (const part of parts) {
    if (part === undefined || part === "") {
      throw new TreeError("yaml", `line ${lineNo}: empty flow item`);
    }
    const value = parseScalar(part, lineNo);
    if (typeof value !== "string") {
      throw new TreeError("yaml", `line ${lineNo}: nested flow is not supported`);
    }
    out.push(value);
  }
  return out;
}

function splitCommas(inner: string, lineNo: number): string[] {
  const parts: string[] = [];
  let buf = "";
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < inner.length; index += 1) {
    const ch = inner[index];
    if (ch === undefined) break;
    if (quote === "'") {
      buf += ch;
      if (ch === "'" && inner[index + 1] === "'") {
        buf += "'";
        index += 1;
        continue;
      }
      if (ch === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      buf += ch;
      if (ch === "\\") {
        const next = inner[index + 1];
        if (next === undefined) {
          throw new TreeError("yaml", `line ${lineNo}: bad escape`);
        }
        buf += next;
        index += 1;
        continue;
      }
      if (ch === '"') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === ",") {
      parts.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (quote !== null) {
    throw new TreeError("yaml", `line ${lineNo}: unclosed string`);
  }
  parts.push(buf.trim());
  return parts;
}

function parseQuoted(text: string, lineNo: number): string {
  const quote = text[0];
  if (quote !== "'" && quote !== '"') {
    throw new TreeError("yaml", `line ${lineNo}: expected a quoted string`);
  }
  let out = "";
  let index = 1;
  if (quote === "'") {
    while (index < text.length) {
      const ch = text[index];
      if (ch === undefined) break;
      if (ch === "'") {
        if (text[index + 1] === "'") {
          out += "'";
          index += 2;
          continue;
        }
        return finishQuoted(text, index + 1, out, lineNo);
      }
      out += ch;
      index += 1;
    }
    throw new TreeError("yaml", `line ${lineNo}: unclosed string`);
  }
  while (index < text.length) {
    const ch = text[index];
    if (ch === undefined) break;
    if (ch === "\\") {
      const next = text[index + 1];
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else if (next === '"' || next === "\\" || next === "'") out += next;
      else throw new TreeError("yaml", `line ${lineNo}: bad escape`);
      index += 2;
      continue;
    }
    if (ch === '"') return finishQuoted(text, index + 1, out, lineNo);
    out += ch;
    index += 1;
  }
  throw new TreeError("yaml", `line ${lineNo}: unclosed string`);
}

function finishQuoted(text: string, index: number, out: string, lineNo: number): string {
  if (text.slice(index).trim() !== "") {
    throw new TreeError("yaml", `line ${lineNo}: unexpected text after string`);
  }
  return out;
}
