/**
 * DESIGN.md is the source for font families and colour hex values.
 * tokens.json, the theme CSS, src/styles, and BRAND.md picked families
 * are compared to that file. Each mismatch names the file and the token.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { designTokenTree, type DesignTokenNode } from "./design-md-lint.ts";
import { DESIGN_THEME_CSS, DESIGN_TOKENS_JSON } from "./design-export.ts";

export function designDriftFindings(projectDir: string): string[] {
  const designPath = path.join(projectDir, "DESIGN.md");
  if (!existsSync(designPath)) return [];
  let markdown = "";
  try {
    markdown = readFileSync(designPath, "utf8");
  } catch {
    return [];
  }
  const expected = expectedTokens(designTokenTree(markdown));
  if (expected.families.length === 0 && expected.colors.length === 0) return [];
  const findings: string[] = [];
  compareTokens(projectDir, expected, findings);
  compareCssFile(projectDir, DESIGN_THEME_CSS, expected, findings, true);
  compareStylesDir(projectDir, expected, findings);
  compareBrand(projectDir, expected, findings);
  return findings;
}

interface ExpectedTokens {
  families: { token: string; value: string }[];
  colors: { token: string; value: string }[];
}

function expectedTokens(root: { [key: string]: DesignTokenNode }): ExpectedTokens {
  const families: { token: string; value: string }[] = [];
  const colors: { token: string; value: string }[] = [];
  const typography = asMap(root.typography);
  if (typography !== null) {
    for (const role of ["display", "body"]) {
      const node = asMap(typography[role]);
      const family = node === null ? "" : scalar(node.fontFamily);
      if (family !== "") families.push({ token: `typography.${role}.fontFamily`, value: family });
    }
  }
  const colour = asMap(root.colors);
  if (colour !== null) {
    for (const [name, node] of Object.entries(colour)) {
      const hex = normalizeHex(scalar(node));
      if (hex === "") continue;
      colors.push({ token: `color.${name}`, value: hex });
    }
  }
  return { families, colors };
}

function compareTokens(projectDir: string, expected: ExpectedTokens, findings: string[]): void {
  const rel = DESIGN_TOKENS_JSON;
  const file = path.join(projectDir, rel);
  if (!existsSync(file)) {
    for (const token of [...expected.families, ...expected.colors]) {
      findings.push(mismatch(rel, token.token, token.value, "nothing"));
    }
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    for (const token of [...expected.families, ...expected.colors]) {
      findings.push(mismatch(rel, token.token, token.value, "nothing"));
    }
    return;
  }
  for (const token of expected.families) {
    const found = tokenAt(parsed, token.token);
    if (found !== token.value) findings.push(mismatch(rel, token.token, token.value, found === "" ? "nothing" : found));
  }
  for (const token of expected.colors) {
    const found = normalizeHex(tokenAt(parsed, token.token));
    if (found !== token.value) findings.push(mismatch(rel, token.token, token.value, found === "" ? "nothing" : found));
  }
}

function compareCssFile(
  projectDir: string,
  rel: string,
  expected: ExpectedTokens,
  findings: string[],
  required: boolean,
): void {
  const file = path.join(projectDir, rel);
  if (!existsSync(file)) {
    if (!required) return;
    for (const token of [...expected.families, ...expected.colors]) {
      findings.push(mismatch(rel, cssToken(token.token), token.value, "nothing"));
    }
    return;
  }
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const vars = cssVars(text);
  for (const token of expected.families) {
    const name = cssToken(token.token);
    if (!required && !vars.has(name)) continue;
    const found = unquote(vars.get(name) ?? "");
    if (found !== token.value) findings.push(mismatch(rel, name, token.value, found === "" ? "nothing" : found));
  }
  for (const token of expected.colors) {
    const name = cssToken(token.token);
    if (!required && !vars.has(name)) continue;
    const found = normalizeHex(vars.get(name) ?? "");
    if (found !== token.value) findings.push(mismatch(rel, name, token.value, found === "" ? "nothing" : found));
  }
}

function compareStylesDir(projectDir: string, expected: ExpectedTokens, findings: string[]): void {
  const dir = path.join(projectDir, "src", "styles");
  if (!existsSync(dir)) return;
  for (const rel of cssFiles(dir, path.join("src", "styles"))) {
    compareCssFile(projectDir, rel, expected, findings, false);
  }
}

function compareBrand(projectDir: string, expected: ExpectedTokens, findings: string[]): void {
  const rel = path.join(".hitchhiker", "brand", "BRAND.md");
  const file = path.join(projectDir, rel);
  if (!existsSync(file)) return;
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const match = /^Picked families:\s*(.+)$/m.exec(text);
  const foundNames = match === null ? [] : familyNames(match[1] ?? "");
  const expectedNames = [...new Set(expected.families.map((token) => token.value))];
  if (expectedNames.length === 0) return;
  const same =
    foundNames.length === expectedNames.length && expectedNames.every((name) => foundNames.includes(name));
  if (same) return;
  const found = foundNames.length === 0 ? "nothing" : foundNames.join(" and ");
  findings.push(mismatch(rel.split(path.sep).join("/"), "picked families", expectedNames.join(" and "), found));
}

function cssFiles(dir: string, rel: string): string[] {
  const found: string[] = [];
  let entries: { name: string; isDirectory: () => boolean }[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const next = path.join(dir, entry.name);
    const nextRel = `${rel}/${entry.name}`.split(path.sep).join("/");
    if (entry.isDirectory()) found.push(...cssFiles(next, nextRel));
    else if (entry.name.toLowerCase().endsWith(".css")) found.push(nextRel);
  }
  return found;
}

function cssVars(text: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const match of text.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) continue;
    vars.set(name, value.trim());
  }
  return vars;
}

function cssToken(token: string): string {
  if (token === "typography.display.fontFamily") return "font-display";
  if (token === "typography.body.fontFamily") return "font-body";
  if (token.startsWith("color.")) return `color-${token.slice("color.".length)}`;
  return token;
}

function tokenAt(root: unknown, token: string): string {
  if (token.startsWith("color.")) {
    const node = asRecord(dig(root, token.split(".")));
    const value = node === null ? null : asRecord(node.$value);
    return value !== null && typeof value.hex === "string" ? value.hex.trim() : "";
  }
  const parts = token.split(".");
  const field = parts.pop() ?? "";
  const node = asRecord(dig(root, parts));
  if (node === null) return "";
  if (typeof node[field] === "string") return node[field].trim();
  const value = asRecord(node.$value);
  if (value !== null && typeof value[field] === "string") return value[field].trim();
  return "";
}

function dig(root: unknown, parts: readonly string[]): unknown {
  let current = root;
  for (const part of parts) {
    const record = asRecord(current);
    if (record === null || record[part] === undefined) return undefined;
    current = record[part];
  }
  return current;
}

function familyNames(line: string): string[] {
  const cleaned = line.replace(/\s*Source:.*$/i, "").replace(/\.\s*$/, "");
  const names: string[] = [];
  for (const part of cleaned.split(/,|\band\b/i)) {
    const name = part.trim().replace(/\.$/, "");
    if (name !== "" && !names.includes(name)) names.push(name);
  }
  return names;
}

function mismatch(file: string, token: string, expected: string, found: string): string {
  return `${file} ${token} expected ${expected}, found ${found}.`;
}

function normalizeHex(value: string): string {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  const body = match?.[1];
  if (body === undefined) return "";
  const hex = body.length === 3 ? body.split("").map((part) => part + part).join("") : body;
  return `#${hex.toLowerCase()}`;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function scalar(node: DesignTokenNode | undefined): string {
  return typeof node === "string" ? node.trim() : "";
}

function asMap(node: DesignTokenNode | undefined): { [key: string]: DesignTokenNode } | null {
  if (typeof node !== "object" || node === null) return null;
  return node;
}

function asRecord(value: unknown): { [key: string]: unknown } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as { [key: string]: unknown };
}
