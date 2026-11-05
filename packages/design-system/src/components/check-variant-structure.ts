/**
 * Compare a built section's report facts with a variant structure.
 * The CDP probe and the per-prompt close both call this. It does not
 * open a browser and it does not read variants.json.
 */
import { SLOT_NAMES, type SlotName } from "./slots.ts";
import type { LayoutFact, VariantStructure } from "./structures/types.ts";

/** Layout measures at one viewport width. Omitted fields were not collected. */
export interface StructureMeasure {
  width: number;
  /** Media box area divided by the viewport area. 1 covers the viewport. */
  mediaCover?: number;
  /** Column widths as fractions of the section. Two equal columns are 0.5, 0.5. */
  columnFractions?: readonly number[];
  centred?: boolean;
  progressive?: boolean;
  horizontal?: boolean;
  titleFontPx?: number;
  layers?: number;
  imageFallback?: boolean;
  webgl?: boolean;
}

/**
 * Facts collected for one section. `measures` holds 375 and 1440 when the
 * probe saw the section at both widths.
 */
export interface VariantStructureFacts {
  section: string;
  /** Null when the root has no data-variant. */
  variant: string | null;
  /** `[data-slot]` values in DOM order. */
  slots: readonly string[];
  measures: readonly StructureMeasure[];
}

export interface StructureBreach {
  section: string;
  /** Layout fact kind, or `slots`, `order`, `data-variant`, or `hero`. */
  fact: string;
  actual: string;
  expected: string;
  detail: string;
}

export interface StructureCheck {
  ok: boolean;
  breaches: readonly StructureBreach[];
}

/** Columns this close count as equal. The split variant is 1.35fr / 0.65fr. */
const EQUAL_SPAN = 0.04;

/** Monument type is at least 18vw, the same floor as the monument rule. */
const EXTREME_TYPE_WIDTH = 0.18;

export function checkVariantStructure(facts: VariantStructureFacts, structure: VariantStructure): StructureCheck {
  const breaches: StructureBreach[] = [];
  const section = facts.section.trim() === "" ? structure.variant : facts.section.trim();
  checkSlots(section, facts.slots, structure, breaches);
  checkOrder(section, facts.slots, structure, breaches);
  for (const fact of structure.layout) checkLayout(section, facts.measures, fact, breaches);
  return { ok: breaches.length === 0, breaches };
}

function checkSlots(
  section: string,
  slots: readonly string[],
  structure: VariantStructure,
  breaches: StructureBreach[],
): void {
  const missing = structure.requiredSlots.filter((slot) => !slots.includes(slot));
  if (missing.length === 0) return;
  breaches.push({
    section,
    fact: "slots",
    actual: slots.join(", "),
    expected: structure.requiredSlots.join(", "),
    detail: `Missing ${missing.join(", ")}.`,
  });
}

function checkOrder(
  section: string,
  slots: readonly string[],
  structure: VariantStructure,
  breaches: StructureBreach[],
): void {
  const order = structure.elementOrder;
  if (order.length === 0) return;
  const catalog =
    order.length === SLOT_NAMES.length && SLOT_NAMES.every((name) => order.includes(name));
  if (catalog) {
    const unknown = slots.filter((slot) => !isSlot(slot));
    if (unknown.length > 0) {
      breaches.push({
        section,
        fact: "order",
        actual: slots.join(", "),
        expected: order.join(", "),
        detail: `Unknown slot ${unknown.join(", ")}.`,
      });
    }
  }
  const known = new Set<string>(order);
  const present = slots.filter((slot) => known.has(slot));
  let last = -1;
  for (const slot of present) {
    const index = order.indexOf(slot as SlotName);
    if (index <= last) {
      breaches.push({
        section,
        fact: "order",
        actual: slots.join(", "),
        expected: order.join(", "),
        detail: `${slot} is out of order.`,
      });
      return;
    }
    last = index;
  }
}

function checkLayout(
  section: string,
  measures: readonly StructureMeasure[],
  fact: LayoutFact,
  breaches: StructureBreach[],
): void {
  const applicable = measures.filter((measure) => widthApplies(fact, measure.width));
  if (applicable.length === 0) {
    if (fact.at !== undefined) {
      breaches.push({
        section,
        fact: fact.kind,
        actual: "missing",
        expected: `measured at ${fact.at}`,
        detail: fact.detail === "" ? `${fact.kind} was not measured at ${fact.at}.` : fact.detail,
      });
    }
    return;
  }
  for (const measure of applicable) {
    const breach = layoutBreach(section, measure, fact);
    if (breach === null) continue;
    breaches.push(breach);
    return;
  }
}

function widthApplies(fact: LayoutFact, width: number): boolean {
  if (fact.at !== undefined && width !== fact.at) return false;
  if (fact.minWidth !== undefined && width < fact.minWidth) return false;
  return true;
}

function layoutBreach(section: string, measure: StructureMeasure, fact: LayoutFact): StructureBreach | null {
  switch (fact.kind) {
    case "media-cover":
      return coverBreach(section, measure, fact);
    case "unequal-columns":
      return columnBreach(section, measure, fact);
    case "centred-reveal":
      return centredBreach(section, measure, fact);
    case "horizontal":
      return flagBreach(section, measure, fact, measure.horizontal === true, "horizontal");
    case "extreme-type":
      return typeBreach(section, measure, fact);
    case "object":
      return objectBreach(section, measure, fact);
    case "layered-depth":
      return layerBreach(section, measure, fact);
    default:
      return {
        section,
        fact: fact.kind,
        actual: "unchecked",
        expected: fact.detail,
        detail: fact.detail === "" ? `${fact.kind} has no checker.` : fact.detail,
      };
  }
}

function coverBreach(section: string, measure: StructureMeasure, fact: LayoutFact): StructureBreach | null {
  const min = fact.minFraction ?? 0;
  if (measure.mediaCover !== undefined && measure.mediaCover + 1e-9 >= min) return null;
  return {
    section,
    fact: "media-cover",
    actual: measure.mediaCover === undefined ? "missing" : num(measure.mediaCover),
    expected: `>= ${num(min)}`,
    detail: fact.detail === "" ? `Media cover at ${measure.width} is below ${num(min)}.` : fact.detail,
  };
}

function columnBreach(section: string, measure: StructureMeasure, fact: LayoutFact): StructureBreach | null {
  const columns = fact.columns ?? 2;
  const fractions = measure.columnFractions ?? [];
  const actual = fractions.length === 0 ? "missing" : fractions.map((value) => num(value)).join(", ");
  if (fractions.length !== columns || equalColumns(fractions)) {
    return {
      section,
      fact: "unequal-columns",
      actual,
      expected: `${columns} unequal columns`,
      detail: fact.detail === "" ? `Columns at ${measure.width} are not unequal.` : fact.detail,
    };
  }
  return null;
}

function centredBreach(section: string, measure: StructureMeasure, fact: LayoutFact): StructureBreach | null {
  const progressive = fact.progressive !== true || measure.progressive === true;
  if (measure.centred === true && progressive) return null;
  const actual = measure.centred === true ? "centred" : "not centred";
  const reveal = fact.progressive === true && measure.progressive !== true ? ", reveal missing" : "";
  return {
    section,
    fact: "centred-reveal",
    actual: `${actual}${reveal}`,
    expected: fact.progressive === true ? "centred progressive reveal" : "centred",
    detail: fact.detail === "" ? `The statement at ${measure.width} is not a centred reveal.` : fact.detail,
  };
}

function flagBreach(
  section: string,
  measure: StructureMeasure,
  fact: LayoutFact,
  holds: boolean,
  expected: string,
): StructureBreach | null {
  if (holds) return null;
  return {
    section,
    fact: fact.kind,
    actual: "missing",
    expected,
    detail: fact.detail === "" ? `${fact.kind} does not hold at ${measure.width}.` : fact.detail,
  };
}

function typeBreach(section: string, measure: StructureMeasure, fact: LayoutFact): StructureBreach | null {
  const floor = measure.width * EXTREME_TYPE_WIDTH;
  if (measure.titleFontPx !== undefined && measure.titleFontPx + 0.5 >= floor) return null;
  return {
    section,
    fact: "extreme-type",
    actual: measure.titleFontPx === undefined ? "missing" : num(measure.titleFontPx),
    expected: `>= ${num(floor)}`,
    detail: fact.detail === "" ? `The title at ${measure.width} is not extreme display type.` : fact.detail,
  };
}

function objectBreach(section: string, measure: StructureMeasure, fact: LayoutFact): StructureBreach | null {
  if (measure.webgl === true || measure.imageFallback === true) return null;
  return {
    section,
    fact: "object",
    actual: "no image fallback",
    expected: fact.fallback === "image" ? "static image fallback" : "object media",
    detail: fact.detail === "" ? "The object hero has no static image fallback." : fact.detail,
  };
}

function layerBreach(section: string, measure: StructureMeasure, fact: LayoutFact): StructureBreach | null {
  const layers = fact.layers ?? 1;
  if (measure.layers !== undefined && measure.layers >= layers) return null;
  return {
    section,
    fact: "layered-depth",
    actual: measure.layers === undefined ? "missing" : String(measure.layers),
    expected: `>= ${layers}`,
    detail: fact.detail === "" ? `Expected ${layers} layers at ${measure.width}.` : fact.detail,
  };
}

function equalColumns(fractions: readonly number[]): boolean {
  if (fractions.length < 2) return true;
  const max = Math.max(...fractions);
  const min = Math.min(...fractions);
  return max - min <= EQUAL_SPAN;
}

function isSlot(value: string): value is SlotName {
  return (SLOT_NAMES as readonly string[]).includes(value);
}

function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
