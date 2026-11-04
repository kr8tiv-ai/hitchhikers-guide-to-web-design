/**
 * Lint DESIGN.md against the Google design.md section order and token rules.
 * Required sections, in order: Overview, Brand idea, Colors, Typography,
 * Layout, Elevation, Shapes, Components, Do's and Don'ts, Image direction.
 * `{token.ref}` must resolve. A duplicate key is an error.
 * This is our own check. It does not install @google/design.md.
 */

export const DESIGN_SECTION_ORDER = [
  "Overview",
  "Brand idea",
  "Colors",
  "Typography",
  "Layout",
  "Elevation",
  "Shapes",
  "Components",
  "Do's and Don'ts",
  "Image direction",
] as const;

/**
 * Alias headings count as the canonical section. The style guide emits each
 * section once. Readers that still say "Color" or "Type scale" resolve here.
 */
const ALIASES: readonly (readonly string[])[] = [
  ["overview", "brand & style"],
  ["brand idea"],
  ["colors", "color"],
  ["typography", "type scale"],
  ["layout", "layout & spacing"],
  ["elevation & depth", "elevation"],
  ["shapes"],
  ["components"],
  ["do's and don'ts", "dos and don'ts"],
  ["image direction"],
];

export interface DesignLintError {
  rule:
    | "duplicate-key"
    | "broken-ref"
    | "section-order"
    | "typography"
    | "duplicate-section"
    | "brand-idea"
    | "image-direction"
    | "signature";
  message: string;
}

export interface DesignLintReport {
  ok: boolean;
  errors: DesignLintError[];
}

export type DesignTokenNode = string | { [key: string]: DesignTokenNode };

type YamlNode = DesignTokenNode;

const REF_PATTERN = /\{([A-Za-z][\w-]*(?:\.[A-Za-z][\w-]*)+)\}/g;

export function lintDesignMd(markdown: string): DesignLintReport {
  const errors: DesignLintError[] = [];
  const split = splitFrontMatter(markdown);
  const parsed = parseYamlMap(split.yaml);
  for (const path of parsed.duplicates) {
    errors.push({ rule: "duplicate-key", message: `Duplicate key ${path}.` });
  }
  for (const ref of tokenRefs(`${split.yaml}\n${split.body}`)) {
    if (!resolves(parsed.root, ref)) {
      errors.push({ rule: "broken-ref", message: `Token reference {${ref}} does not resolve.` });
    }
  }
  const headings = sectionHeadings(split.body);
  const sequence: number[] = [];
  const seen = new Set<number>();
  for (const heading of headings) {
    const index = canonIndex(heading);
    if (index < 0) continue;
    if (seen.has(index)) {
      errors.push({ rule: "duplicate-section", message: `Duplicate section ${heading}.` });
      continue;
    }
    seen.add(index);
    sequence.push(index);
  }
  const expected = ALIASES.map((_, index) => index);
  if (sequence.length !== expected.length || sequence.some((index, place) => index !== expected[place])) {
    errors.push({
      rule: "section-order",
      message: `Sections must appear in this order: ${DESIGN_SECTION_ORDER.join(", ")}.`,
    });
  }
  const typography = sectionBody(split.body, canonIndex("Typography"));
  if (typography === null || !/Families:/.test(typography) || !/Ratio:/.test(typography)) {
    errors.push({
      rule: "typography",
      message: "Typography must name the families and the type scale ratio.",
    });
  } else if (uniqueNames(familyNames(typography)).length > 2) {
    errors.push({
      rule: "typography",
      message: "Typography names more than one display family and one body family.",
    });
  }
  if (proseEmpty(sectionBody(split.body, canonIndex("Brand idea")))) {
    errors.push({ rule: "brand-idea", message: "Brand idea must name one central idea." });
  }
  if (proseEmpty(sectionBody(split.body, canonIndex("Image direction")))) {
    errors.push({ rule: "image-direction", message: "Image direction must say what the pictures may show." });
  }
  const effects = signatureEffects(split.body);
  if (effects.length > 1) {
    errors.push({ rule: "signature", message: "Signature techniques must list one signature effect." });
  }
  return { ok: errors.length === 0, errors };
}

function proseEmpty(body: string | null): boolean {
  return body === null || body.trim() === "";
}

function familyNames(typography: string): string[] {
  const names: string[] = [];
  for (const match of typography.matchAll(/Families:\s*([^\n]+)/g)) {
    let line = match[1] ?? "";
    line = line.replace(/\s*Source:.*$/i, "").replace(/\.\s*$/, "");
    for (const part of line.split(/,|\band\b/i)) {
      const name = part.trim().replace(/\.$/, "");
      if (name !== "") names.push(name);
    }
  }
  return names;
}

function uniqueNames(names: readonly string[]): string[] {
  const unique: string[] = [];
  for (const name of names) {
    if (!unique.includes(name)) unique.push(name);
  }
  return unique;
}

function signatureEffects(body: string): string[] {
  const section = looseSection(body, "Signature techniques");
  if (section === null) return [];
  const effects: string[] = [];
  for (const line of section.split("\n")) {
    const text = line.trim();
    if (text === "") continue;
    if (/^any appropriate library may carry a technique/i.test(text)) continue;
    effects.push(text);
  }
  return effects;
}

function looseSection(body: string, heading: string): string | null {
  const lines = body.split("\n");
  const target = heading.toLowerCase();
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^##\s+(.+?)\s*$/.exec(lines[index] ?? "");
    if (match?.[1]?.toLowerCase() === target) {
      start = index + 1;
      break;
    }
  }
  if (start < 0) return null;
  const rest: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index] ?? "")) break;
    rest.push(lines[index] ?? "");
  }
  return rest.join("\n");
}

/** The YAML token tree lintDesignMd already parsed. Export reads this tree. */
export function designTokenTree(markdown: string): { [key: string]: DesignTokenNode } {
  return parseYamlMap(splitFrontMatter(markdown).yaml).root;
}

/** The body of a section, following an alias heading to the one that was written. */
export function designSectionBody(markdown: string, heading: string): string | null {
  const index = canonIndex(heading);
  if (index < 0) return null;
  const body = sectionBody(splitFrontMatter(markdown).body, index);
  if (body === null) return null;
  return body.trim();
}

function splitFrontMatter(markdown: string): { yaml: string; body: string } {
  if (!markdown.startsWith("---\n")) return { yaml: "", body: markdown };
  const end = markdown.indexOf("\n---\n", 4);
  if (end < 0) return { yaml: "", body: markdown };
  return { yaml: markdown.slice(4, end), body: markdown.slice(end + 5) };
}

function parseYamlMap(yaml: string): { root: { [key: string]: YamlNode }; duplicates: string[] } {
  const root: { [key: string]: YamlNode } = {};
  const duplicates: string[] = [];
  const stack: { indent: number; map: { [key: string]: YamlNode }; path: string }[] = [
    { indent: -1, map: root, path: "" },
  ];
  for (const line of yaml.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
    const match = /^([^:#][^:]*):\s*(.*)$/.exec(line.trim());
    if (match === null) continue;
    const key = (match[1] ?? "").trim();
    const raw = (match[2] ?? "").trim();
    while (stack.length > 1) {
      const top = stack[stack.length - 1];
      if (top === undefined || indent > top.indent) break;
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent === undefined || key === "") continue;
    const tokenPath = parent.path === "" ? key : `${parent.path}.${key}`;
    if (Object.prototype.hasOwnProperty.call(parent.map, key)) duplicates.push(tokenPath);
    if (raw === "" || raw === "|" || raw === ">") {
      const child: { [key: string]: YamlNode } = {};
      parent.map[key] = child;
      stack.push({ indent, map: child, path: tokenPath });
    } else {
      parent.map[key] = unquote(raw);
    }
  }
  return { root, duplicates };
}

function unquote(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
  }
  return value;
}

function tokenRefs(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(REF_PATTERN)) {
    const ref = match[1];
    if (ref !== undefined && !found.includes(ref)) found.push(ref);
  }
  return found;
}

function resolves(root: { [key: string]: YamlNode }, ref: string): boolean {
  let current: YamlNode = root;
  for (const part of ref.split(".")) {
    if (typeof current === "string") return false;
    const next: YamlNode | undefined = current[part];
    if (next === undefined) return false;
    current = next;
  }
  return true;
}

function sectionHeadings(body: string): string[] {
  const headings: string[] = [];
  for (const line of body.split("\n")) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match?.[1] !== undefined) headings.push(match[1].trim());
  }
  return headings;
}

function canonIndex(heading: string): number {
  const name = heading.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
  return ALIASES.findIndex((names) => names.includes(name));
}

function sectionBody(body: string, canon: number): string | null {
  const lines = body.split("\n");
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^##\s+(.+?)\s*$/.exec(lines[index] ?? "");
    if (match?.[1] !== undefined && canonIndex(match[1]) === canon) {
      start = index + 1;
      break;
    }
  }
  if (start < 0) return null;
  const rest: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index] ?? "")) break;
    rest.push(lines[index] ?? "");
  }
  return rest.join("\n");
}
