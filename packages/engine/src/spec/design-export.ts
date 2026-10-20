/**
 * Tailwind v4 @theme and DTCG export from a linted DESIGN.md.
 * The token tree is the one design-md-lint parses. There is no second list.
 * Implemented here. The desk does not depend on @google/design.md and does not call npx.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { designTokenTree, lintDesignMd, type DesignTokenNode } from "./design-md-lint.ts";

export const DESIGN_THEME_CSS = ".hitchhiker/design/tailwind-theme.css";
export const DESIGN_TOKENS_JSON = ".hitchhiker/design/tokens.json";

const DTCG_SCHEMA = "https://www.designtokens.org/schemas/2025.10/format.json";
const TOKEN_NAME = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;
const REF = /^\{([A-Za-z][\w-]*(?:\.[A-Za-z][\w-]*)+)\}$/;

const CSS_CATEGORIES = [
  ["colors", "--color-"],
  ["fontFamily", "--font-"],
  ["fontSize", "--text-"],
  ["lineHeight", "--leading-"],
  ["letterSpacing", "--tracking-"],
  ["fontWeight", "--font-weight-"],
  ["borderRadius", "--radius-"],
  ["spacing", "--spacing-"],
] as const;

type CssCategory = (typeof CSS_CATEGORIES)[number][0];

export interface DesignExport {
  css: string;
  dtcg: string;
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

interface ThemeData {
  colors?: Record<string, string>;
  fontFamily?: Record<string, string>;
  fontSize?: Record<string, string>;
  lineHeight?: Record<string, string>;
  letterSpacing?: Record<string, string>;
  fontWeight?: Record<string, string>;
  borderRadius?: Record<string, string>;
  spacing?: Record<string, string>;
}

/** Null when idea 8's lint fails. Neither artifact is produced. */
export function exportDesignMd(markdown: string): DesignExport | null {
  if (!lintDesignMd(markdown).ok) return null;
  const root = designTokenTree(markdown);
  const theme = themeFromTree(root);
  return {
    css: serializeTheme(theme),
    dtcg: `${JSON.stringify(dtcgFromTree(root), null, 2)}\n`,
  };
}

export function writeDesignExports(
  projectDir: string,
  markdown: string,
): { css: string; dtcg: string } | null {
  const exported = exportDesignMd(markdown);
  if (exported === null) return null;
  const css = path.join(projectDir, DESIGN_THEME_CSS);
  const dtcg = path.join(projectDir, DESIGN_TOKENS_JSON);
  mkdirSync(path.dirname(css), { recursive: true });
  writeFileSync(css, exported.css, "utf8");
  writeFileSync(dtcg, exported.dtcg, "utf8");
  return { css, dtcg };
}

function themeFromTree(root: { [key: string]: DesignTokenNode }): ThemeData {
  const theme: ThemeData = {};
  const colors = stringMap(root, root.colors, colorCss);
  if (colors !== null) theme.colors = colors;
  const rounded = stringMap(root, root.rounded, dimensionCss);
  if (rounded !== null) theme.borderRadius = rounded;
  const spacing = stringMap(root, root.spacing, dimensionCss);
  if (spacing !== null) theme.spacing = spacing;

  const fontFamily: Record<string, string> = {};
  const fontSize: Record<string, string> = {};
  const lineHeight: Record<string, string> = {};
  const letterSpacing: Record<string, string> = {};
  const fontWeight: Record<string, string> = {};
  const typography = asMap(root.typography);
  if (typography !== null) {
    for (const [name, node] of Object.entries(typography)) {
      if (!TOKEN_NAME.test(name)) continue;
      const role = asMap(node);
      if (role === null) continue;
      const family = roleString(root, role.fontFamily);
      const size = roleString(root, role.fontSize);
      const leading = roleString(root, role.lineHeight);
      const tracking = roleString(root, role.letterSpacing);
      const weight = roleString(root, role.fontWeight);
      if (family !== null) fontFamily[name] = cssString(family);
      if (size !== null) fontSize[name] = size;
      if (leading !== null) lineHeight[name] = leading;
      if (tracking !== null) letterSpacing[name] = tracking;
      if (weight !== null) fontWeight[name] = weight;
    }
  }
  if (Object.keys(fontFamily).length > 0) theme.fontFamily = fontFamily;
  if (Object.keys(fontSize).length > 0) theme.fontSize = fontSize;
  if (Object.keys(lineHeight).length > 0) theme.lineHeight = lineHeight;
  if (Object.keys(letterSpacing).length > 0) theme.letterSpacing = letterSpacing;
  if (Object.keys(fontWeight).length > 0) theme.fontWeight = fontWeight;
  return theme;
}

function serializeTheme(theme: ThemeData): string {
  const lines: string[] = [];
  for (const [category, prefix] of CSS_CATEGORIES) {
    const entries = theme[category as CssCategory];
    if (entries === undefined) continue;
    for (const [name, value] of Object.entries(entries)) {
      lines.push(`  ${prefix}${name}: ${value};`);
    }
  }
  if (lines.length === 0) return "@theme {\n}\n";
  return `@theme {\n${lines.join("\n")}\n}\n`;
}

function dtcgFromTree(root: { [key: string]: DesignTokenNode }): { [key: string]: Json } {
  const file: { [key: string]: Json } = { $schema: DTCG_SCHEMA };
  if (typeof root.name === "string" && root.name.trim() !== "") file.$description = root.name;
  const color = colorGroup(root);
  if (color !== null) file.color = color;
  const spacing = dimensionGroup(root, root.spacing);
  if (spacing !== null) file.spacing = spacing;
  const rounded = dimensionGroup(root, root.rounded);
  if (rounded !== null) file.rounded = rounded;
  const typography = typographyGroup(root);
  if (typography !== null) file.typography = typography;
  return file;
}

function colorGroup(root: { [key: string]: DesignTokenNode }): { [key: string]: Json } | null {
  const colors = asMap(root.colors);
  if (colors === null) return null;
  const group: { [key: string]: Json } = { $type: "color" };
  let count = 0;
  for (const [name, node] of Object.entries(colors)) {
    if (!TOKEN_NAME.test(name) || typeof node !== "string") continue;
    const parsed = parseHex(resolve(root, node));
    if (parsed === null) continue;
    group[name] = {
      $value: {
        colorSpace: "srgb",
        components: [round3(parsed.r / 255), round3(parsed.g / 255), round3(parsed.b / 255)],
        hex: parsed.hex,
      },
    };
    count += 1;
  }
  return count === 0 ? null : group;
}

function dimensionGroup(
  root: { [key: string]: DesignTokenNode },
  node: DesignTokenNode | undefined,
): { [key: string]: Json } | null {
  const map = asMap(node);
  if (map === null) return null;
  const group: { [key: string]: Json } = { $type: "dimension" };
  let count = 0;
  for (const [name, value] of Object.entries(map)) {
    if (!TOKEN_NAME.test(name) || typeof value !== "string") continue;
    const parsed = parseDimension(resolve(root, value));
    if (parsed === null) continue;
    group[name] = { $value: { value: parsed.value, unit: parsed.unit } };
    count += 1;
  }
  return count === 0 ? null : group;
}

function typographyGroup(root: { [key: string]: DesignTokenNode }): { [key: string]: Json } | null {
  const map = asMap(root.typography);
  if (map === null) return null;
  const group: { [key: string]: Json } = {};
  for (const [name, node] of Object.entries(map)) {
    if (!TOKEN_NAME.test(name)) continue;
    const role = asMap(node);
    if (role === null) continue;
    const value: { [key: string]: Json } = {};
    const family = roleString(root, role.fontFamily);
    const size = roleString(root, role.fontSize);
    const leading = roleString(root, role.lineHeight);
    const tracking = roleString(root, role.letterSpacing);
    const weight = roleString(root, role.fontWeight);
    if (family !== null) value.fontFamily = family;
    if (size !== null) value.fontSize = dimensionOrString(size);
    if (leading !== null) value.lineHeight = unitlessOrDimension(leading);
    if (tracking !== null) value.letterSpacing = dimensionOrString(tracking);
    if (weight !== null) {
      const numeric = Number(weight);
      value.fontWeight = Number.isFinite(numeric) && weight.trim() !== "" ? numeric : weight;
    }
    if (Object.keys(value).length === 0) continue;
    group[name] = { $type: "typography", $value: value };
  }
  return Object.keys(group).length === 0 ? null : group;
}

function stringMap(
  root: { [key: string]: DesignTokenNode },
  node: DesignTokenNode | undefined,
  format: (value: string) => string | null,
): Record<string, string> | null {
  const map = asMap(node);
  if (map === null) return null;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(map)) {
    if (!TOKEN_NAME.test(name) || typeof value !== "string") continue;
    const formatted = format(resolve(root, value));
    if (formatted !== null) out[name] = formatted;
  }
  return Object.keys(out).length === 0 ? null : out;
}

function colorCss(value: string): string | null {
  return parseHex(value)?.hex ?? null;
}

function dimensionCss(value: string): string | null {
  const parsed = parseDimension(value);
  if (parsed === null) return null;
  return `${trimNum(parsed.value)}${parsed.unit}`;
}

function roleString(root: { [key: string]: DesignTokenNode }, node: DesignTokenNode | undefined): string | null {
  if (typeof node !== "string") return null;
  const resolved = resolve(root, node).trim();
  return resolved === "" ? null : resolved;
}

function dimensionOrString(value: string): Json {
  const parsed = parseDimension(value);
  if (parsed === null) return value;
  return { value: parsed.value, unit: parsed.unit };
}

function unitlessOrDimension(value: string): Json {
  if (/^-?\d+(?:\.\d+)?$/.test(value.trim())) return Number(value);
  return dimensionOrString(value);
}

function asMap(node: DesignTokenNode | undefined): { [key: string]: DesignTokenNode } | null {
  if (node === undefined || typeof node === "string") return null;
  return node;
}

function resolve(root: { [key: string]: DesignTokenNode }, value: string): string {
  const seen = new Set<string>();
  let current = value.trim();
  for (let hop = 0; hop < 8; hop += 1) {
    const match = REF.exec(current);
    const ref = match?.[1];
    if (ref === undefined || seen.has(ref)) return current;
    seen.add(ref);
    let cursor: DesignTokenNode = root;
    for (const part of ref.split(".")) {
      if (typeof cursor === "string") return current;
      const next: DesignTokenNode | undefined = cursor[part];
      if (next === undefined) return current;
      cursor = next;
    }
    if (typeof cursor !== "string") return current;
    current = cursor.trim();
  }
  return current;
}

function parseHex(input: string): { r: number; g: number; b: number; hex: string } | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  const body = match?.[1];
  if (body === undefined) return null;
  const hex = body.length === 3 ? body.split("").map((part) => part + part).join("") : body;
  const value = Number.parseInt(hex, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
    hex: `#${hex.toLowerCase()}`,
  };
}

function parseDimension(input: string): { value: number; unit: string } | null {
  const match = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)$/.exec(input.trim());
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return { value, unit: match[2] };
}

function cssString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/[\n\r\f]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `)}"`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function trimNum(value: number): string {
  return String(value);
}
