import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const mainFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "main.ts");

const SHEBANG = "#!/usr/bin/env -S node --experimental-strip-types";

test("the hh shebang enables type stripping", () => {
  const first = readFileSync(mainFile, "utf8").split(/\r?\n/, 1)[0] ?? "";
  assert.equal(first, SHEBANG);
  assert.match(first, /--experimental-strip-types/);
});

test("the cli entry graph has no non-erasable typescript", () => {
  assert.deepEqual(nonErasableSyntax("enum Color { Red }\n"), ["enum"]);
  assert.deepEqual(nonErasableSyntax("export const enum Color { Red }\n"), ["const enum"]);
  assert.deepEqual(nonErasableSyntax("namespace Foo { export const n = 1 }\n"), ["namespace"]);
  assert.deepEqual(nonErasableSyntax("module Foo { export const n = 1 }\n"), ["namespace"]);
  assert.deepEqual(nonErasableSyntax("class A { constructor(private x: string) {} }\n"), [
    "constructor parameter property",
  ]);
  assert.deepEqual(nonErasableSyntax("class A { constructor(private readonly x: string) {} }\n"), [
    "constructor parameter property",
  ]);
  assert.deepEqual(nonErasableSyntax("class A { constructor(message: string) {} }\n"), []);
  assert.deepEqual(nonErasableSyntax("declare enum Color { Red }\n"), []);
  assert.deepEqual(nonErasableSyntax("declare namespace Foo { const n: number }\n"), []);
  assert.deepEqual(nonErasableSyntax("const s = \"enum Color { Red }\";\n// namespace Foo {}\n"), []);

  const files = entryGraph(mainFile);
  const bases = new Set(files.map((file) => path.basename(file)));
  assert.equal(bases.has("main.ts"), true);
  assert.equal(bases.has("install.ts"), true);
  assert.equal(bases.has("doctor.ts"), true);
  assert.equal(bases.has("cassette-guard.ts"), true);
  for (const file of files) {
    const found = nonErasableSyntax(readFileSync(file, "utf8"));
    assert.deepEqual(found, [], `${path.basename(file)}: ${found.join(", ")}`);
  }
});

function entryGraph(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    const commentsOnly = maskSource(readFileSync(current, "utf8"), false);
    for (const spec of relativeSpecifiers(commentsOnly)) {
      queue.push(resolveRelative(current, spec));
    }
  }
  return [...seen].sort();
}

function relativeSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /\bfrom\s*["'](\.[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+)["']/g,
    /\bimport\s*["'](\.[^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const spec = match[1];
      if (spec !== undefined) specs.push(spec);
    }
  }
  return specs;
}

function resolveRelative(fromFile: string, spec: string): string {
  const raw = path.resolve(path.dirname(fromFile), spec);
  const candidates = [raw];
  if (raw.endsWith(".js")) candidates.push(`${raw.slice(0, -3)}.ts`);
  if (path.extname(raw) === "") {
    candidates.push(`${raw}.ts`, path.join(raw, "index.ts"));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Unresolved relative import ${spec} from ${fromFile}`);
}

/**
 * Node's type stripper deletes types only. Enums, namespaces, and constructor
 * parameter properties still emit runtime code, so they crash the hh bin.
 * Strings and comments are masked first so the words themselves do not count.
 */
function nonErasableSyntax(source: string): string[] {
  const code = maskSource(source, true);
  return [
    ...keywordHits(code, "enum"),
    ...keywordHits(code, "namespace"),
    ...moduleNamespaceHits(code),
    ...parameterProperties(code),
  ];
}

function keywordHits(code: string, kind: "enum" | "namespace"): string[] {
  const pattern =
    kind === "enum"
      ? /\b(?:export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+[A-Za-z_$][\w$]*/g
      : /\b(?:export\s+)?(?:declare\s+)?namespace\s+[A-Za-z_$][\w$]*/g;
  const found: string[] = [];
  for (const match of code.matchAll(pattern)) {
    const text = match[0];
    if (/\bdeclare\b/.test(text)) continue;
    if (kind === "enum" && /\bconst\s+enum\b/.test(text)) found.push("const enum");
    else found.push(kind);
  }
  return found;
}

function moduleNamespaceHits(code: string): string[] {
  const pattern = /(?:^|[;{}])\s*(?:export\s+)?(?:declare\s+)?module\s+[A-Za-z_$][\w$]*\s*\{/gm;
  const found: string[] = [];
  for (const match of code.matchAll(pattern)) {
    const text = match[0];
    if (/\bdeclare\b/.test(text)) continue;
    found.push("namespace");
  }
  return found;
}

function parameterProperties(code: string): string[] {
  const found: string[] = [];
  for (const match of code.matchAll(/\bconstructor\b/g)) {
    let index = match.index + "constructor".length;
    index = skipSpace(code, index);
    if (code[index] === "<") {
      const after = endOfPair(code, index, "<", ">");
      if (after === null) continue;
      index = skipSpace(code, after);
    }
    if (code[index] !== "(") continue;
    const params = insidePair(code, index, "(", ")");
    if (params === null) continue;
    for (const param of splitTopLevel(params, ",")) {
      if (isParameterProperty(param)) {
        found.push("constructor parameter property");
        break;
      }
    }
  }
  return found;
}

function isParameterProperty(param: string): boolean {
  let rest = stripDecorators(param.trim());
  let sawValueModifier = false;
  for (;;) {
    const next = /^(public|private|protected|readonly|override)\b\s*/.exec(rest);
    if (next === null) break;
    const word = next[1];
    if (word === "public" || word === "private" || word === "protected" || word === "readonly") {
      sawValueModifier = true;
    }
    rest = rest.slice(next[0].length);
  }
  return sawValueModifier;
}

function stripDecorators(param: string): string {
  let rest = param.trim();
  while (rest.startsWith("@")) {
    let index = 1;
    while (index < rest.length && /[A-Za-z0-9_$.]/.test(rest[index] ?? "")) index += 1;
    index = skipSpace(rest, index);
    if (rest[index] === "(") {
      const after = endOfPair(rest, index, "(", ")");
      index = after ?? rest.length;
    }
    rest = rest.slice(index).trim();
  }
  return rest;
}

function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let parens = 0;
  let braces = 0;
  let brackets = 0;
  let angles = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parens += 1;
    else if (char === ")") parens -= 1;
    else if (char === "{") braces += 1;
    else if (char === "}") braces -= 1;
    else if (char === "[") brackets += 1;
    else if (char === "]") brackets -= 1;
    else if (char === "<") angles += 1;
    else if (char === ">") angles -= 1;
    else if (char === separator && parens === 0 && braces === 0 && brackets === 0 && angles === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

function insidePair(source: string, openIndex: number, open: string, close: string): string | null {
  const end = endOfPair(source, openIndex, open, close);
  if (end === null) return null;
  return source.slice(openIndex + open.length, end - close.length);
}

function endOfPair(source: string, openIndex: number, open: string, close: string): number | null {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return index + close.length;
    }
  }
  return null;
}

function skipSpace(source: string, index: number): number {
  let cursor = index;
  while (cursor < source.length && /\s/.test(source[cursor] ?? "")) cursor += 1;
  return cursor;
}

function maskSource(source: string, blankStrings: boolean): string {
  const chars = Array.from(source);
  walkCode(chars, 0, chars.length, blankStrings, false);
  return chars.join("");
}

function walkCode(chars: string[], start: number, end: number, blankStrings: boolean, stopAtBrace: boolean): number {
  let index = start;
  let braces = 0;
  while (index < end) {
    const char = chars[index] ?? "";
    const next = chars[index + 1] ?? "";
    if (char === "/" && next === "/") {
      blank(chars, index, 2);
      index += 2;
      while (index < end && chars[index] !== "\n") {
        blank(chars, index, 1);
        index += 1;
      }
      continue;
    }
    if (char === "/" && next === "*") {
      blank(chars, index, 2);
      index += 2;
      while (index < end && !((chars[index] ?? "") === "*" && (chars[index + 1] ?? "") === "/")) {
        if (chars[index] !== "\n") blank(chars, index, 1);
        index += 1;
      }
      if (index < end) {
        blank(chars, index, 2);
        index += 2;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      index = walkQuoted(chars, index, end, char, blankStrings);
      continue;
    }
    if (char === "`") {
      index = walkTemplate(chars, index, end, blankStrings);
      continue;
    }
    if (char === "{") {
      braces += 1;
      index += 1;
      continue;
    }
    if (char === "}") {
      if (braces === 0 && stopAtBrace) return index;
      if (braces > 0) braces -= 1;
      index += 1;
      continue;
    }
    index += 1;
  }
  return index;
}

function walkQuoted(chars: string[], start: number, end: number, quote: string, blankStrings: boolean): number {
  let index = start + 1;
  while (index < end) {
    const char = chars[index] ?? "";
    if (char === "\\") {
      if (blankStrings) blank(chars, index, 2);
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    if (blankStrings && char !== "\n") blank(chars, index, 1);
    index += 1;
  }
  return index;
}

function walkTemplate(chars: string[], start: number, end: number, blankStrings: boolean): number {
  let index = start + 1;
  while (index < end) {
    const char = chars[index] ?? "";
    if (char === "\\") {
      if (blankStrings) blank(chars, index, 2);
      index += 2;
      continue;
    }
    if (char === "`") return index + 1;
    if (char === "$" && (chars[index + 1] ?? "") === "{") {
      if (blankStrings) blank(chars, index, 2);
      index += 2;
      index = walkCode(chars, index, end, blankStrings, true);
      if (index < end && chars[index] === "}") index += 1;
      continue;
    }
    if (blankStrings && char !== "\n") blank(chars, index, 1);
    index += 1;
  }
  return index;
}

function blank(chars: string[], index: number, count: number): void {
  for (let cursor = index; cursor < index + count && cursor < chars.length; cursor += 1) {
    chars[cursor] = " ";
  }
}
