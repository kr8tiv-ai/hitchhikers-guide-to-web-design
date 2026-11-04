/**
 * CDP assertion layer (245c, BUG-139).
 *
 * Pure checks. The runner collects facts; this module does not open a
 * browser. Tokens come from designTokenTree, the same tree
 * writeDesignExports writes out. DESIGN.md type sizes are clamp()
 * expressions, so a step is that clamp at the viewport width, plus or
 * minus 1px. Heading, title, and caption sizes live in the Typography
 * bullets: the YAML tree only stores the display and body roles.
 *
 * Serious and critical axe hits are blockers. Moderate and minor are
 * fixes. evaluateA11y also blocks moderate; that stricter floor stays on
 * the a11y gate. Section padding off the spacing scale is a fix, the
 * same FIX the spacing gate already uses. A colour outside the colour
 * roles is a blocker, as is a wrong font.
 */

import { designSectionBody, designTokenTree, type DesignTokenNode, type OpticalConfig } from "@hitchhiker/engine";
import type { A11yImpact } from "./a11y-gate.ts";
import { PRIMARY_TARGET_MIN } from "./mobile-checks.ts";
import { evaluateOptical, type OpticalFacts } from "./optical-checks.ts";
import { SPACING_SNAP_PX } from "./spacing-gate.ts";

/** One computed font size may sit this far from a type step. */
export const TYPE_SIZE_TOLERANCE_PX = 1;

/** A probe must change the DOM or visibility inside this window. */
export const INTERACTION_LIMIT_MS = 1_500;

/** Model summaries stay under about 2 KB. */
export const SUMMARY_MAX_BYTES = 2_048;

/** Document overflow ignores a single device pixel, as the mobile checks do. */
const OVERFLOW_SLOP_PX = 1;

export type CdpScope = "hero" | "page";

export type CdpCheck = "base" | "optical";

export type InteractionProbe = "nav-toggle" | "accordion" | "tab" | "form" | "hover" | "scroll-reveal";

export type StyleRole = "h1" | "h2" | "body" | "section";

export interface SectionSpec {
  id: string;
  /** When set, these probes replace the ones inferred from the id. */
  probes?: readonly InteractionProbe[];
}

export interface Finding {
  kind: string;
  selector: string;
  actual: string;
  expected: string;
  detail: string;
}

export interface CdpAssertion {
  kind: string;
  selector: string;
  expected: string;
  /** Empty when the check belongs to the whole page. */
  sectionId: string;
}

export interface CdpAssertionReport {
  url: string;
  width: number;
  blockers: Finding[];
  fixes: Finding[];
  passed: boolean;
  summaryForModel: string;
}

export interface StyleSample {
  selector: string;
  role: StyleRole;
  fontFamily: string;
  fontSizePx: number;
  color: string;
  backgroundColor: string;
  paddingPx?: readonly number[];
}

export interface RectSample {
  selector: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextBoxSample {
  selector: string;
  scrollWidth: number;
  clientWidth: number;
  overflowX: string;
}

export interface TapSample {
  selector: string;
  width: number;
  height: number;
}

export interface CollectedBoxes {
  scrollWidth: number;
  clientWidth: number;
  interactives: readonly RectSample[];
  texts: readonly TextBoxSample[];
  taps: readonly TapSample[];
}

export interface InteractionSample {
  probe: InteractionProbe;
  selector: string;
  /** True when a DOM mutation or a visibility change was observed. */
  changed: boolean;
  withinMs: number;
}

export interface AxeSample {
  id: string;
  impact: A11yImpact;
  selector: string;
}

export interface CollectedFacts {
  url: string;
  width: number;
  styles: readonly StyleSample[];
  boxes: CollectedBoxes;
  interactions: readonly InteractionSample[];
  axe: readonly AxeSample[];
  /** Present when the optical pass collected ink, rhythm, state, and motion facts. */
  optical?: OpticalFacts;
}

export interface DesignChecks {
  displayFamily: string;
  bodyFamily: string;
  spacingPx: readonly number[];
  colours: readonly { name: string; hex: string }[];
  typeStepsPx: (width: number) => number[];
}

const PROBE_RULES: readonly { probe: InteractionProbe; pattern: RegExp }[] = [
  { probe: "nav-toggle", pattern: /(^|-)(nav|menu|header|navigation|toggle)($|-)/i },
  { probe: "accordion", pattern: /accordion|faq|disclosure/i },
  { probe: "tab", pattern: /(^|-)tabs?($|-)/i },
  { probe: "form", pattern: /form|sign-up|signup|newsletter|inquiry|contact/i },
  { probe: "hover", pattern: /card/i },
  { probe: "scroll-reveal", pattern: /reveal|(^|-)(story|essay)($|-)/i },
];

const HERO_SECTION = /(^|-)(hero|nav|menu|header|navigation)($|-)/i;
const HERO_ID = /(^|-)hero($|-)/i;

const PROBE_ORDER: readonly InteractionProbe[] = [
  "nav-toggle",
  "accordion",
  "tab",
  "form",
  "hover",
  "scroll-reveal",
];

export function sectionSelectors(id: string): string[] {
  const selectors: string[] = [];
  if (/^[A-Za-z_][\w-]*$/.test(id)) {
    selectors.push(`#${id}`, `section.${id}`, `.${id}`);
  }
  const safe = id.replace(/"/g, "");
  selectors.push(`[data-section="${safe}"]`, `[data-section-id="${safe}"]`);
  return selectors;
}

export function probesForSection(section: SectionSpec): InteractionProbe[] {
  if (section.probes !== undefined) return [...section.probes];
  const found: InteractionProbe[] = [];
  for (const rule of PROBE_RULES) {
    if (rule.pattern.test(section.id) && !found.includes(rule.probe)) found.push(rule.probe);
  }
  return found;
}

/** Hero scope keeps the hero and the key controls. Page scope keeps every section. */
export function sectionsInScope(sections: readonly SectionSpec[], scope: CdpScope): SectionSpec[] {
  if (scope === "page") return sections.map((section) => copySection(section));
  const filtered = sections.filter(
    (section) => HERO_SECTION.test(section.id) || probesForSection(section).includes("nav-toggle"),
  );
  const copy = filtered.map((section) => copySection(section));
  if (!copy.some((section) => HERO_ID.test(section.id))) return [{ id: "hero" }, ...copy];
  return copy;
}

export function sectionSpecsForPage(input: { route: string; sitemap?: string; wireframe?: string }): SectionSpec[] {
  const route = normalizeRoute(input.route);
  const sitemap = input.sitemap === undefined ? [] : parseSitemap(input.sitemap);
  const wireframe = input.wireframe === undefined ? [] : parseWireframe(input.wireframe);
  const page = sitemap.find((item) => item.route === route);
  const title = page?.title ?? "";
  const framed = wireframe.find((item) => sameName(item.title, title) || slug(item.title) === routeSlug(route));
  const ids: string[] = [];
  const add = (id: string): void => {
    const next = id.trim();
    if (next !== "" && !ids.includes(next)) ids.push(next);
  };
  for (const id of page?.sections ?? []) add(id);
  for (const id of framed?.sections ?? []) add(id);
  return ids.map((id) => ({ id }));
}

export function designChecksFrom(markdown: string): DesignChecks {
  const tree = designTokenTree(markdown);
  const typography = asMap(tree.typography);
  const prose = designSectionBody(markdown, "Typography") ?? "";
  const families = familyNames(prose);
  const displayNode = asMap(typography?.display);
  const bodyNode = asMap(typography?.body);
  let displayFamily = roleString(tree, displayNode?.fontFamily);
  let bodyFamily = roleString(tree, bodyNode?.fontFamily);
  if (displayFamily === "" && families[0] !== undefined) displayFamily = families[0];
  if (bodyFamily === "" && families[1] !== undefined) bodyFamily = families[1];
  if (bodyFamily === "" && families[0] !== undefined) bodyFamily = families[0];

  const sizeSources: string[] = [];
  const addSize = (value: string): void => {
    const resolved = resolveRef(tree, value).trim();
    if (resolved !== "" && !sizeSources.includes(resolved)) sizeSources.push(resolved);
  };
  if (typography !== null) {
    for (const node of Object.values(typography)) {
      const role = asMap(node);
      if (role !== null && typeof role.fontSize === "string") addSize(role.fontSize);
    }
  }
  for (const line of prose.split("\n")) {
    const bullet = /^-\s+[A-Za-z][\w-]*:\s*([^,\n]+)/.exec(line.trim());
    if (bullet?.[1] !== undefined) addSize(bullet[1]);
  }
  for (const match of prose.matchAll(/Body floor:\s*(\d+(?:\.\d+)?px)/gi)) {
    if (match[1] !== undefined) addSize(match[1]);
  }
  for (const match of prose.matchAll(/Preferred body:\s*(\d+(?:\.\d+)?px)/gi)) {
    if (match[1] !== undefined) addSize(match[1]);
  }

  const spacingValues: number[] = [];
  const spacing = asMap(tree.spacing);
  if (spacing !== null) {
    for (const node of Object.values(spacing)) {
      if (typeof node !== "string") continue;
      const px = lengthAt(resolveRef(tree, node), 0);
      if (px !== null) spacingValues.push(px);
    }
  }
  const spacingPx = spacingValues.length === 0 ? [] : uniqueSorted([0, ...spacingValues]);

  const colours: { name: string; hex: string }[] = [];
  const colors = asMap(tree.colors);
  if (colors !== null) {
    for (const [name, node] of Object.entries(colors)) {
      if (typeof node !== "string") continue;
      const hex = toHex(resolveRef(tree, node));
      if (hex !== null) colours.push({ name, hex });
    }
  }

  return {
    displayFamily,
    bodyFamily,
    spacingPx,
    colours,
    typeStepsPx: (width: number): number[] => {
      const steps: number[] = [];
      for (const source of sizeSources) {
        const px = lengthAt(source, width);
        if (px === null) continue;
        const rounded = round2(px);
        if (!steps.some((step) => Math.abs(step - rounded) < 0.01)) steps.push(rounded);
      }
      steps.sort((left, right) => left - right);
      return steps;
    },
  };
}

export function assertionsFromDesign(input: {
  designMd: string;
  sections: readonly SectionSpec[];
  scope: CdpScope;
  width: number;
}): CdpAssertion[] {
  const checks = designChecksFrom(input.designMd);
  const sections = sectionsInScope(input.sections, input.scope);
  const steps = checks.typeStepsPx(input.width);
  const assertions: CdpAssertion[] = [];
  const seenProbes = new Set<InteractionProbe>();
  for (const section of sections) {
    const root = sectionRoot(section.id);
    if (checks.displayFamily !== "") {
      assertions.push(assertion("style.font-family", `${root} h1`, checks.displayFamily, section.id));
      assertions.push(assertion("style.font-family", `${root} h2`, checks.displayFamily, section.id));
    }
    if (checks.bodyFamily !== "") {
      assertions.push(assertion("style.font-family", `${root} p`, checks.bodyFamily, section.id));
    }
    if (steps.length > 0) {
      const expected = stepList(steps);
      assertions.push(assertion("style.font-size", `${root} h1`, expected, section.id));
      assertions.push(assertion("style.font-size", `${root} h2`, expected, section.id));
      assertions.push(assertion("style.font-size", `${root} p`, expected, section.id));
    }
    if (checks.colours.length > 0) {
      assertions.push(assertion("style.color", root, colourList(checks.colours), section.id));
    }
    if (checks.spacingPx.length > 0) {
      assertions.push(assertion("style.spacing", root, spacingList(checks.spacingPx), section.id));
    }
    if (input.width === 375) {
      assertions.push(assertion("box.tap-target", `${root} a, ${root} button`, "44x44", section.id));
    }
    for (const probe of probesForSection(section)) {
      if (seenProbes.has(probe)) continue;
      seenProbes.add(probe);
      assertions.push(
        assertion(
          `interaction.${probe}`,
          root,
          `a DOM mutation or a visibility change within ${INTERACTION_LIMIT_MS}ms`,
          section.id,
        ),
      );
    }
  }
  assertions.push(assertion("box.overflow", "document", "scrollWidth <= clientWidth", ""));
  assertions.push(assertion("box.collision", "a, button", "separated", ""));
  assertions.push(assertion("box.clipped", "h1, h2, p", "text visible in its container", ""));
  assertions.push(assertion("axe", "page", "no serious or critical violation", ""));
  return assertions;
}

export function evaluateCollectedFacts(input: {
  designMd: string;
  sections?: readonly SectionSpec[];
  scope?: CdpScope;
  facts: CollectedFacts;
  checks?: readonly CdpCheck[];
  optical?: OpticalConfig;
}): CdpAssertionReport {
  const scope = input.scope ?? "page";
  const sections = sectionsInScope(input.sections ?? [], scope);
  const checks = input.checks ?? ["base", "optical"];
  const blockers: Finding[] = [];
  const fixes: Finding[] = [];
  if (checks.includes("base")) {
    const design = designChecksFrom(input.designMd);
    judgeStyles(input.facts, design, blockers, fixes);
    judgeBoxes(input.facts, blockers);
    judgeInteractions(input.facts.interactions, sections, blockers);
    judgeAxe(input.facts.axe, blockers, fixes);
  }
  if (checks.includes("optical") && input.optical?.enabled !== false) {
    const judged = evaluateOptical(input.facts.optical, {
      width: input.facts.width,
      designMd: input.designMd,
      ...(input.optical === undefined
        ? {}
        : {
            baselineUnit: input.optical.baselineUnit,
            centringTolerance: input.optical.centringTolerance,
          }),
    });
    blockers.push(...judged.blockers);
    fixes.push(...judged.fixes);
  }
  return {
    url: input.facts.url,
    width: input.facts.width,
    blockers,
    fixes,
    passed: blockers.length === 0,
    summaryForModel: summaryForModel(blockers, fixes),
  };
}

/**
 * BLOCKERS, then FIXES, then OPTICAL. Severity lines keep selector, actual,
 * and expected. OPTICAL lines are the finding instructions. The text stays
 * under SUMMARY_MAX_BYTES.
 */
export function summaryForModel(blockers: readonly Finding[], fixes: readonly Finding[]): string {
  const optical = [...blockers, ...fixes].filter((item) => item.kind.startsWith("optical."));
  const lines = [
    "BLOCKERS",
    ...(blockers.length === 0 ? ["None"] : blockers.map(formatFinding)),
    "FIXES",
    ...(fixes.length === 0 ? ["None"] : fixes.map(formatFinding)),
    "OPTICAL",
    ...(optical.length === 0 ? ["None"] : optical.map(opticalLine)),
  ];
  const full = lines.join("\n");
  if (byteLength(full) <= SUMMARY_MAX_BYTES) return full;
  const trailer = (omitted: number): string => `\nOmitted ${omitted} lines.`;
  for (let count = lines.length - 1; count >= 1; count -= 1) {
    const omitted = lines.length - count;
    const text = `${lines.slice(0, count).join("\n")}${trailer(omitted)}`;
    if (byteLength(text) <= SUMMARY_MAX_BYTES) return text;
  }
  const only = `Omitted ${lines.length} lines.`;
  return byteLength(only) <= SUMMARY_MAX_BYTES ? only : only.slice(0, SUMMARY_MAX_BYTES);
}

function judgeStyles(
  facts: CollectedFacts,
  checks: DesignChecks,
  blockers: Finding[],
  fixes: Finding[],
): void {
  const steps = checks.typeStepsPx(facts.width);
  for (const sample of facts.styles) {
    if (sample.role === "h1" || sample.role === "h2") {
      judgeFamily(sample, checks.displayFamily, blockers);
      judgeSize(sample, steps, blockers);
    } else if (sample.role === "body") {
      judgeFamily(sample, checks.bodyFamily, blockers);
      judgeSize(sample, steps, blockers);
    }
    judgeColour(sample, checks.colours, blockers);
    if (sample.role === "section") judgeSpacing(sample, checks.spacingPx, fixes);
  }
}

function judgeFamily(sample: StyleSample, expected: string, blockers: Finding[]): void {
  if (expected === "" || familyMatches(sample.fontFamily, expected)) return;
  const actual = familyList(sample.fontFamily)[0] ?? sample.fontFamily.trim();
  blockers.push(
    finding(
      "style.font-family",
      sample.selector,
      actual,
      expected,
      `${sample.role} font-family is ${actual}. The token is ${expected}.`,
    ),
  );
}

function judgeSize(sample: StyleSample, steps: readonly number[], blockers: Finding[]): void {
  if (steps.length === 0 || !Number.isFinite(sample.fontSizePx)) return;
  if (steps.some((step) => Math.abs(sample.fontSizePx - step) <= TYPE_SIZE_TOLERANCE_PX)) return;
  blockers.push(
    finding(
      "style.font-size",
      sample.selector,
      pxLabel(sample.fontSizePx),
      stepList(steps),
      `${sample.role} is ${pxLabel(sample.fontSizePx)}, more than ${TYPE_SIZE_TOLERANCE_PX}px from every type step.`,
    ),
  );
}

function judgeColour(
  sample: StyleSample,
  colours: readonly { name: string; hex: string }[],
  blockers: Finding[],
): void {
  if (colours.length === 0) return;
  const roles = new Set(colours.map((colour) => colour.hex));
  const expected = colourList(colours);
  const text = toHex(sample.color);
  if (text !== null && !roles.has(text)) {
    blockers.push(
      finding("style.color", sample.selector, text, expected, `Text colour ${text} is not a colour role.`),
    );
  }
  const background = toHex(sample.backgroundColor);
  if (background !== null && !roles.has(background)) {
    blockers.push(
      finding(
        "style.color",
        sample.selector,
        `background ${background}`,
        expected,
        `Background ${background} is not a colour role.`,
      ),
    );
  }
}

function judgeSpacing(sample: StyleSample, scale: readonly number[], fixes: Finding[]): void {
  if (scale.length === 0 || sample.paddingPx === undefined || sample.paddingPx.length === 0) return;
  const off = sample.paddingPx.filter(
    (value) => Number.isFinite(value) && !scale.some((step) => Math.abs(value - step) <= SPACING_SNAP_PX),
  );
  if (off.length === 0) return;
  fixes.push(
    finding(
      "style.spacing",
      sample.selector,
      off.map((value) => pxLabel(value)).join(", "),
      spacingList(scale),
      `Section padding is off the spacing scale by more than ${SPACING_SNAP_PX}px.`,
    ),
  );
}

function judgeBoxes(facts: CollectedFacts, blockers: Finding[]): void {
  const boxes = facts.boxes;
  if (
    Number.isFinite(boxes.scrollWidth) &&
    Number.isFinite(boxes.clientWidth) &&
    boxes.scrollWidth > boxes.clientWidth + OVERFLOW_SLOP_PX
  ) {
    blockers.push(
      finding(
        "box.overflow",
        "document",
        `scrollWidth ${trimNum(boxes.scrollWidth)}`,
        `clientWidth ${trimNum(boxes.clientWidth)}`,
        "The document scrolls sideways.",
      ),
    );
  }
  const interactives = boxes.interactives.filter((box) => box.width > 0 && box.height > 0);
  for (let left = 0; left < interactives.length; left += 1) {
    for (let right = left + 1; right < interactives.length; right += 1) {
      const a = interactives[left];
      const b = interactives[right];
      if (a === undefined || b === undefined || !overlaps(a, b)) continue;
      blockers.push(
        finding(
          "box.collision",
          `${a.selector}, ${b.selector}`,
          "overlap",
          "separated",
          `${a.selector} overlaps ${b.selector}.`,
        ),
      );
    }
  }
  for (const text of boxes.texts) {
    if (!Number.isFinite(text.scrollWidth) || !Number.isFinite(text.clientWidth)) continue;
    if (text.scrollWidth <= text.clientWidth + OVERFLOW_SLOP_PX) continue;
    if (!clips(text.overflowX)) continue;
    blockers.push(
      finding(
        "box.clipped",
        text.selector,
        `scrollWidth ${trimNum(text.scrollWidth)} > clientWidth ${trimNum(text.clientWidth)}`,
        "text visible in its container",
        "The text is wider than its container and the overflow is hidden.",
      ),
    );
  }
  if (facts.width !== 375) return;
  for (const tap of boxes.taps) {
    if (!Number.isFinite(tap.width) || !Number.isFinite(tap.height)) continue;
    if (tap.width >= PRIMARY_TARGET_MIN && tap.height >= PRIMARY_TARGET_MIN) continue;
    blockers.push(
      finding(
        "box.tap-target",
        tap.selector,
        `${trimNum(tap.width)}x${trimNum(tap.height)}`,
        `${PRIMARY_TARGET_MIN}x${PRIMARY_TARGET_MIN}`,
        `The target is under ${PRIMARY_TARGET_MIN}px at 375.`,
      ),
    );
  }
}

function judgeInteractions(
  samples: readonly InteractionSample[],
  sections: readonly SectionSpec[],
  blockers: Finding[],
): void {
  const seen = new Set<InteractionProbe>();
  for (const sample of samples) {
    seen.add(sample.probe);
    if (sample.changed && sample.withinMs <= INTERACTION_LIMIT_MS) continue;
    const actual = sample.changed ? `changed after ${trimNum(sample.withinMs)}ms` : "no change";
    blockers.push(
      finding(
        `interaction.${sample.probe}`,
        sample.selector,
        actual,
        `a DOM mutation or a visibility change within ${INTERACTION_LIMIT_MS}ms`,
        `${sample.probe} on ${sample.selector} did not change within ${INTERACTION_LIMIT_MS}ms.`,
      ),
    );
  }
  const expected: InteractionProbe[] = [];
  for (const section of sections) {
    for (const probe of probesForSection(section)) {
      if (!expected.includes(probe)) expected.push(probe);
    }
  }
  for (const probe of PROBE_ORDER) {
    if (!expected.includes(probe) || seen.has(probe)) continue;
    const section = sections.find((item) => probesForSection(item).includes(probe));
    blockers.push(
      finding(
        `interaction.${probe}`,
        section === undefined ? probe : sectionRoot(section.id),
        "no change",
        `a DOM mutation or a visibility change within ${INTERACTION_LIMIT_MS}ms`,
        `${probe} was not observed.`,
      ),
    );
  }
}

function judgeAxe(samples: readonly AxeSample[], blockers: Finding[], fixes: Finding[]): void {
  for (const sample of samples) {
    const row = finding(
      "axe",
      sample.selector === "" ? "page" : sample.selector,
      `${sample.impact} ${sample.id}`,
      sample.impact === "serious" || sample.impact === "critical" ? "no serious or critical violation" : "note",
      `Axe ${sample.impact} ${sample.id}.`,
    );
    if (sample.impact === "serious" || sample.impact === "critical") blockers.push(row);
    else fixes.push(row);
  }
}

function assertion(kind: string, selector: string, expected: string, sectionId: string): CdpAssertion {
  return { kind, selector, expected, sectionId };
}

function finding(kind: string, selector: string, actual: string, expected: string, detail: string): Finding {
  return {
    kind,
    selector: oneLine(selector),
    actual: oneLine(actual),
    expected: oneLine(expected),
    detail: oneLine(detail),
  };
}

function formatFinding(item: Finding): string {
  const label = item.kind.includes(".") ? item.kind.slice(item.kind.indexOf(".") + 1) : item.kind;
  return `${item.selector} ${label}: actual ${item.actual}, expected ${item.expected}`;
}

function opticalLine(item: Finding): string {
  const instruction = item.detail.trim();
  return instruction !== "" ? instruction : formatFinding(item);
}

function copySection(section: SectionSpec): SectionSpec {
  if (section.probes === undefined) return { id: section.id };
  return { id: section.id, probes: [...section.probes] };
}

function sectionRoot(id: string): string {
  if (/^[A-Za-z_][\w-]*$/.test(id)) return `#${id}`;
  return `[data-section="${id.replace(/"/g, "")}"]`;
}

function familyMatches(computed: string, expected: string): boolean {
  const want = expected.trim().toLowerCase();
  if (want === "") return true;
  return familyList(computed).some((name) => name.toLowerCase() === want);
}

function familyList(value: string): string[] {
  const names: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const char of value) {
    if (quote !== null) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === ",") {
      const name = current.trim();
      if (name !== "") names.push(name);
      current = "";
      continue;
    }
    current += char;
  }
  const last = current.trim();
  if (last !== "") names.push(last);
  return names;
}

function familyNames(typography: string): string[] {
  const match = /Families:\s*([^\n]+)/.exec(typography);
  if (match?.[1] === undefined) return [];
  let line = match[1].replace(/\s*Source:.*$/i, "").replace(/\.\s*$/, "");
  const names: string[] = [];
  for (const part of line.split(/,|\band\b/i)) {
    const name = part.trim().replace(/\.$/, "");
    if (name !== "" && !names.includes(name)) names.push(name);
  }
  return names;
}

function overlaps(a: RectSample, b: RectSample): boolean {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0;
}

function clips(overflowX: string): boolean {
  return /\b(hidden|clip)\b/.test(overflowX);
}

function stepList(steps: readonly number[]): string {
  return orList(steps.map((step) => pxLabel(step)));
}

function spacingList(scale: readonly number[]): string {
  return orList(scale.map((step) => trimNum(step)));
}

function colourList(colours: readonly { name: string; hex: string }[]): string {
  return `one of ${colours.map((colour) => colour.hex).join(", ")}`;
}

function orList(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0] ?? "";
  const head = parts.slice(0, -1).join(", ");
  const tail = parts[parts.length - 1] ?? "";
  return `${head}, or ${tail}`;
}

function pxLabel(value: number): string {
  return `${trimNum(value)}px`;
}

function trimNum(value: number): string {
  const rounded = round2(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function uniqueSorted(values: readonly number[]): number[] {
  const found: number[] = [];
  for (const value of values) {
    if (!found.some((item) => Math.abs(item - value) < 0.01)) found.push(round2(value));
  }
  found.sort((left, right) => left - right);
  return found;
}

function lengthAt(value: string, width: number): number | null {
  const trimmed = value.trim();
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(trimmed);
  if (px?.[1] !== undefined) return Number(px[1]);
  const rem = /^(-?\d+(?:\.\d+)?)rem$/.exec(trimmed);
  if (rem?.[1] !== undefined) return Number(rem[1]) * 16;
  const args = splitClamp(trimmed);
  if (args === null) return null;
  const min = lengthAt(args[0], width);
  const preferred = preferredAt(args[1], width);
  const max = lengthAt(args[2], width);
  if (min === null || preferred === null || max === null) return null;
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.min(high, Math.max(low, preferred));
}

function preferredAt(value: string, width: number): number | null {
  const parts = value.split("+").map((part) => part.trim()).filter((part) => part !== "");
  if (parts.length === 0) return null;
  let sum = 0;
  for (const part of parts) {
    const vw = /^(-?\d+(?:\.\d+)?)vw$/.exec(part);
    if (vw?.[1] !== undefined) {
      sum += (Number(vw[1]) * width) / 100;
      continue;
    }
    const one = lengthAt(part, width);
    if (one === null) return null;
    sum += one;
  }
  return sum;
}

function splitClamp(value: string): [string, string, string] | null {
  const open = /^clamp\((.*)\)$/.exec(value.trim());
  if (open?.[1] === undefined) return null;
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of open[1]) {
    if (char === "(") depth += 1;
    if (char === ")" && depth > 0) depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  if (parts.length !== 3) return null;
  const min = parts[0];
  const preferred = parts[1];
  const max = parts[2];
  if (min === undefined || preferred === undefined || max === undefined) return null;
  return [min, preferred, max];
}

export function toHex(value: string): string | null {
  const trimmed = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (hex?.[1] !== undefined) {
    const raw = hex[1].toLowerCase();
    if (raw.length === 3) {
      return `#${raw[0] ?? ""}${raw[0] ?? ""}${raw[1] ?? ""}${raw[1] ?? ""}${raw[2] ?? ""}${raw[2] ?? ""}`;
    }
    return `#${raw}`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(trimmed);
  if (rgb?.[1] === undefined || rgb[2] === undefined || rgb[3] === undefined) return null;
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
  if (!Number.isFinite(alpha) || alpha === 0) return null;
  return `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`;
}

function channel(value: string): string {
  const number = Math.max(0, Math.min(255, Math.round(Number(value))));
  return number.toString(16).padStart(2, "0");
}

function asMap(node: DesignTokenNode | undefined): { [key: string]: DesignTokenNode } | null {
  if (node === undefined || typeof node === "string") return null;
  return node;
}

function roleString(root: { [key: string]: DesignTokenNode }, node: DesignTokenNode | undefined): string {
  if (typeof node !== "string") return "";
  return resolveRef(root, node).trim();
}

function resolveRef(root: { [key: string]: DesignTokenNode }, value: string, depth = 0): string {
  if (depth > 8) return value.trim();
  const match = /^\{([A-Za-z][\w-]*(?:\.[A-Za-z][\w-]*)+)\}$/.exec(value.trim());
  if (match?.[1] === undefined) return value.trim();
  let current: DesignTokenNode = root;
  for (const part of match[1].split(".")) {
    if (typeof current === "string") return value.trim();
    const next: DesignTokenNode | undefined = current[part];
    if (next === undefined) return value.trim();
    current = next;
  }
  if (typeof current !== "string") return value.trim();
  return resolveRef(root, current, depth + 1);
}

function parseSitemap(markdown: string): { title: string; route: string; sections: string[] }[] {
  const pages: { title: string; route: string; sections: string[] }[] = [];
  let current: { title: string; route: string; sections: string[] } | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^##\s+/.test(trimmed)) {
      current = null;
      continue;
    }
    const page = /^- (.+?) at (\S+)\s*$/.exec(trimmed);
    if (page?.[1] !== undefined && page[2] !== undefined && line.trimStart().startsWith("- ")) {
      current = { title: page[1].trim(), route: normalizeRoute(page[2]), sections: [] };
      pages.push(current);
      continue;
    }
    const section = /^\s+-\s+(.+?)\s*$/.exec(line);
    if (section?.[1] !== undefined && current !== null && /^\s/.test(line)) current.sections.push(section[1].trim());
  }
  return pages;
}

function parseWireframe(markdown: string): { title: string; sections: string[] }[] {
  const pages: { title: string; sections: string[] }[] = [];
  let current: { title: string; sections: string[] } | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line.trim());
    if (heading?.[1] !== undefined) {
      current = { title: heading[1].trim(), sections: [] };
      pages.push(current);
      continue;
    }
    const box = /^\|\s+(.+?)\s+\|$/.exec(line.trim());
    if (box?.[1] !== undefined && current !== null) current.sections.push(box[1].trim());
  }
  return pages;
}

function normalizeRoute(route: string): string {
  let value = route.trim();
  if (value === "") return "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

function routeSlug(route: string): string {
  const normalized = normalizeRoute(route);
  if (normalized === "/") return "home";
  return slug(normalized.slice(1));
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sameName(left: string, right: string): boolean {
  return right !== "" && left.trim().toLowerCase() === right.trim().toLowerCase();
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
