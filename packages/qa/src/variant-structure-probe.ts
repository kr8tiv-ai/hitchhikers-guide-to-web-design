/**
 * CDP probe for the hero-variant structure gate (245f).
 *
 * At 375 and 1440 it finds `[data-section="hero"]`, reads data-variant, and
 * asks judgeProjectStructure whether that variant matches variants.json and
 * the structure. Tests pass readDom or documents. A url opens Chromium.
 * Port 4175 is the desk and is refused before a browser starts.
 * This is not a runCdpAssertions check. That union stays the 245c set.
 */
import {
  STRUCTURE_WIDTHS,
  judgeProjectStructure,
  mergeStructureFacts,
  readStructureDocument,
  type BuiltPageSection,
  type StructureMeasure,
  type VariantStructureFacts,
  type VariantStructureJudgement,
} from "@hitchhiker/engine";

const DESK_PORT = "4175";
const NAV_TIMEOUT_MS = 20_000;

export interface StructureDomReading {
  section: string;
  variant: string | null;
  slots: readonly string[];
  mediaCover?: number;
  columnFractions?: readonly number[];
  centred?: boolean;
  progressive?: boolean;
  horizontal?: boolean;
  titleFontPx?: number;
  layers?: number;
  imageFallback?: boolean;
  webgl?: boolean;
}

export interface ProbeVariantStructureInput {
  projectDir: string;
  url?: string;
  /** Page slug matched against variants.json. Defaults to home. */
  page?: string;
  /** Built HTML per width. Used when readDom is omitted. */
  documents?: Readonly<Record<number, string>>;
  /** Test double. Called at 375 and 1440. Skips the browser. */
  readDom?: (request: { url: string; width: number }) => Promise<readonly StructureDomReading[]> | readonly StructureDomReading[];
  timeoutMs?: number;
}

interface WidthGroup {
  width: number;
  sections: VariantStructureFacts[];
}

interface CdpSessionLike {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  detach(): Promise<void>;
}

interface ProbePayload {
  heroCount: number;
  sections: StructureDomReading[];
}

/** Browser expression. Tests assert the hero selector without launching Chromium. */
export function structureProbeExpression(): string {
  return `(() => {
  const heroes = document.querySelectorAll('[data-section="hero"]');
  const nodes = document.querySelectorAll("[data-section]");
  const viewport = Math.max(1, window.innerWidth * window.innerHeight);
  const sections = [];
  for (const node of nodes) {
    const section = String(node.getAttribute("data-section") || "").trim().toLowerCase();
    if (section === "") continue;
    const variantRaw = node.getAttribute("data-variant");
    const variant = variantRaw === null || String(variantRaw).trim() === "" ? null : String(variantRaw).trim();
    const slots = [];
    for (const slot of node.querySelectorAll("[data-slot]")) {
      const name = String(slot.getAttribute("data-slot") || "").trim();
      if (name !== "") slots.push(name);
    }
    const media = node.querySelector('[data-slot="media"]');
    const row = {
      section: section,
      variant: variant,
      slots: slots,
      centred: centredOf(node),
      progressive: progressiveOf(node),
      horizontal: horizontalOf(node),
      imageFallback: imageOf(node),
      webgl: node.querySelector("canvas") !== null,
    };
    if (media) {
      const box = media.getBoundingClientRect();
      row.mediaCover = (Math.abs(box.width) * Math.abs(box.height)) / viewport;
    }
    const columns = columnsOf(node);
    if (columns) row.columnFractions = columns;
    const title = node.querySelector('[data-slot="title"]');
    if (title) {
      const size = Number.parseFloat(getComputedStyle(title).fontSize);
      if (Number.isFinite(size)) row.titleFontPx = size;
    }
    const layers = layersOf(node);
    if (layers !== null) row.layers = layers;
    sections.push(row);
  }
  return JSON.stringify({ heroCount: heroes.length, sections: sections });

  function centredOf(node) {
    const className = String(node.className || "");
    if (className.indexOf("hh-hero--statement") >= 0) return true;
    const style = getComputedStyle(node);
    const align = (style.textAlign + " " + style.placeItems + " " + style.justifyContent).toLowerCase();
    return align.indexOf("center") >= 0;
  }
  function progressiveOf(node) {
    const flag = String(node.getAttribute("data-progressive") || "").toLowerCase();
    if (flag === "false" || flag === "0" || flag === "no") return false;
    if (flag === "true" || flag === "1" || flag === "yes") return true;
    if (node.getAttribute("data-recipe") === "reveal") return true;
    return String(node.className || "").indexOf("hh-hero--statement") >= 0;
  }
  function horizontalOf(node) {
    if (String(node.className || "").indexOf("hh-hero--marquee") >= 0) return true;
    const style = getComputedStyle(node);
    if (style.whiteSpace === "nowrap") return true;
    const display = style.display;
    return (display === "flex" || display === "inline-flex") && style.flexWrap === "nowrap";
  }
  function imageOf(node) {
    if (node.getAttribute("data-object-fallback") === "image") return true;
    if (node.querySelector("[data-object-fallback='image']") !== null) return true;
    return node.querySelector("img") !== null;
  }
  function columnsOf(node) {
    const template = getComputedStyle(node).gridTemplateColumns;
    const width = node.getBoundingClientRect().width;
    if (!template || template === "none" || width <= 0) return null;
    const values = [];
    for (const part of String(template).trim().split(" ")) {
      if (part === "" || part.slice(-2) !== "px") continue;
      const value = Number(part.slice(0, -2));
      if (Number.isFinite(value) && value > 0) values.push(value);
    }
    if (values.length < 2) return null;
    return values.map((value) => value / width);
  }
  function layersOf(node) {
    const marked = node.querySelectorAll("[data-layer]").length;
    const veil = node.querySelectorAll(".hh-veil").length;
    const copy = node.querySelectorAll(".hh-copy").length;
    const media = node.querySelector('[data-slot="media"]') ? 1 : 0;
    const total = Math.max(marked, veil + copy + media);
    if (String(node.className || "").indexOf("hh-hero--layered-depth") >= 0) return Math.max(total, 3);
    return total > 0 ? total : null;
  }
})()`;
}

export async function probeVariantStructure(input: ProbeVariantStructureInput): Promise<VariantStructureJudgement> {
  const page = input.page === undefined || input.page.trim() === "" ? "home" : input.page.trim();
  if (input.readDom !== undefined) {
    const groups = await groupsFromDom(input.readDom, input.url ?? "");
    return judgeProjectStructure(input.projectDir, builtFromGroups(page, groups));
  }
  if (input.documents !== undefined) {
    return judgeProjectStructure(input.projectDir, builtFromGroups(page, groupsFromDocuments(input.documents)));
  }
  if (input.url === undefined) return probeFailure("No page was given to the structure probe.");
  refuseDeskPort(input.url);
  try {
    const groups = await groupsFromUrl(input.url, input.timeoutMs ?? NAV_TIMEOUT_MS);
    return judgeProjectStructure(input.projectDir, builtFromGroups(page, groups));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The structure probe failed.";
    return probeFailure(message.replace(/!/g, ".").replace(/\s+/g, " ").trim());
  }
}

async function groupsFromDom(
  readDom: NonNullable<ProbeVariantStructureInput["readDom"]>,
  url: string,
): Promise<WidthGroup[]> {
  const groups: WidthGroup[] = [];
  for (const width of STRUCTURE_WIDTHS) {
    const readings = await readDom({ url, width });
    groups.push({
      width,
      sections: readings.map((reading) => factsFromReading(reading, width)),
    });
  }
  return groups;
}

function groupsFromDocuments(documents: Readonly<Record<number, string>>): WidthGroup[] {
  return STRUCTURE_WIDTHS.map((width) => ({
    width,
    sections: readStructureDocument(documents[width] ?? "", [width]),
  }));
}

async function groupsFromUrl(url: string, timeoutMs: number): Promise<WidthGroup[]> {
  const opener = await import("./playwright-opener.ts");
  const groups: WidthGroup[] = [];
  await opener.withChromium(async (browser) => {
    for (const width of STRUCTURE_WIDTHS) {
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width, height: width < 768 ? 812 : 900 },
      });
      try {
        const page = await context.newPage();
        try {
          page.setDefaultNavigationTimeout(timeoutMs);
          page.setDefaultTimeout(timeoutMs);
          await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
          const session = (await page.context().newCDPSession(page)) as CdpSessionLike;
          try {
            groups.push({ width, sections: await readSession(session, width) });
          } finally {
            await session.detach();
          }
        } finally {
          await page.close();
        }
      } finally {
        await context.close();
      }
    }
  });
  return groups;
}

async function readSession(session: CdpSessionLike, width: number): Promise<VariantStructureFacts[]> {
  const evaluated = await session.send("Runtime.evaluate", {
    expression: structureProbeExpression(),
    returnByValue: true,
  });
  const payload = payloadFromEvaluate(evaluated);
  if (payload === null) throw new Error("The structure probe returned no page.");
  return payload.sections
    .filter((reading) => payload.heroCount > 0 || reading.section.trim().toLowerCase() !== "hero")
    .map((reading) => factsFromReading(reading, width));
}

function builtFromGroups(page: string, groups: readonly WidthGroup[]): BuiltPageSection[] {
  const merged = mergeStructureFacts(groups);
  const built: BuiltPageSection[] = merged.map((facts) => ({ facts, page }));
  if (!merged.some((facts) => facts.section === "hero")) {
    built.unshift({
      facts: { section: "hero", variant: null, slots: [], measures: [] },
      page,
      missing: true,
    });
  }
  return built;
}

function factsFromReading(reading: StructureDomReading, width: number): VariantStructureFacts {
  const measure: StructureMeasure = { width };
  if (typeof reading.mediaCover === "number") measure.mediaCover = reading.mediaCover;
  if (reading.columnFractions !== undefined) measure.columnFractions = [...reading.columnFractions];
  if (typeof reading.centred === "boolean") measure.centred = reading.centred;
  if (typeof reading.progressive === "boolean") measure.progressive = reading.progressive;
  if (typeof reading.horizontal === "boolean") measure.horizontal = reading.horizontal;
  if (typeof reading.titleFontPx === "number") measure.titleFontPx = reading.titleFontPx;
  if (typeof reading.layers === "number") measure.layers = reading.layers;
  if (typeof reading.imageFallback === "boolean") measure.imageFallback = reading.imageFallback;
  if (typeof reading.webgl === "boolean") measure.webgl = reading.webgl;
  const variant = reading.variant?.trim() ?? "";
  return {
    section: reading.section.trim().toLowerCase(),
    variant: variant === "" ? null : variant,
    slots: [...reading.slots],
    measures: [measure],
  };
}

function payloadFromEvaluate(evaluated: unknown): ProbePayload | null {
  const root = asRecord(evaluated);
  if (root === null || root.exceptionDetails !== undefined) return null;
  const result = asRecord(root.result);
  const raw = result?.value;
  const parsed = typeof raw === "string" ? parseJson(raw) : raw;
  return asPayload(parsed);
}

function asPayload(value: unknown): ProbePayload | null {
  const record = asRecord(value);
  if (record === null || typeof record.heroCount !== "number" || !Array.isArray(record.sections)) return null;
  const sections: StructureDomReading[] = [];
  for (const item of record.sections) {
    const reading = asReading(item);
    if (reading !== null) sections.push(reading);
  }
  return { heroCount: record.heroCount, sections };
}

function asReading(value: unknown): StructureDomReading | null {
  const row = asRecord(value);
  if (row === null || typeof row.section !== "string" || row.section.trim() === "") return null;
  const reading: StructureDomReading = {
    section: row.section,
    variant: typeof row.variant === "string" && row.variant.trim() !== "" ? row.variant : null,
    slots: stringList(row.slots),
  };
  assignNumber(reading, "mediaCover", row.mediaCover);
  const columns = numberList(row.columnFractions);
  if (columns !== undefined) reading.columnFractions = columns;
  assignBoolean(reading, "centred", row.centred);
  assignBoolean(reading, "progressive", row.progressive);
  assignBoolean(reading, "horizontal", row.horizontal);
  assignNumber(reading, "titleFontPx", row.titleFontPx);
  assignNumber(reading, "layers", row.layers);
  assignBoolean(reading, "imageFallback", row.imageFallback);
  assignBoolean(reading, "webgl", row.webgl);
  return reading;
}

function assignNumber(reading: StructureDomReading, key: "mediaCover" | "titleFontPx" | "layers", value: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) reading[key] = value;
}

function assignBoolean(
  reading: StructureDomReading,
  key: "centred" | "progressive" | "horizontal" | "imageFallback" | "webgl",
  value: unknown,
): void {
  if (typeof value === "boolean") reading[key] = value;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim() !== "") names.push(item);
  }
  return names;
}

function numberList(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const numbers: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isFinite(item)) return undefined;
    numbers.push(item);
  }
  return numbers;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function probeFailure(detail: string): VariantStructureJudgement {
  const breach = {
    section: "hero",
    fact: "probe",
    actual: "error",
    expected: "a measured page",
    detail,
  };
  return {
    ok: false,
    mode: "variant",
    signatureSections: [],
    breaches: [breach],
    reason: `Variant structure failed. hero probe: ${detail} Actual error. Expected a measured page.`,
    log: "",
  };
}

function refuseDeskPort(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`url is not a URL: ${baseUrl}`);
  }
  if (url.port === DESK_PORT) {
    throw new Error(`Refusing the desk port ${DESK_PORT}. Run the structure probe against the site preview, not the desk.`);
  }
}
