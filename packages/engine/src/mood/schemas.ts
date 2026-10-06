import type { JsonSchema } from "../ai/schema-validate.ts";

/**
 * Mood directions for Babel Fish palettes (049) and the section plan (088).
 * Palette values are hex. Type classes are categories, never a font's proper name.
 */

export const MOOD_TASK = "mood";
export const MOOD_IMAGE_CAP = 12;
export const DEEP_WHY_CAP = 5;
export const MOOD_DIRECTION_COUNT = 3;
export const PALETTE_LENGTH = 5;
export const MOOD_IMAGE_BYTE_LIMIT = 10 * 1024 * 1024;

export const TYPE_CLASSES = [
  "humanist sans",
  "high-contrast serif",
  "grotesk",
  "slab",
  "geometric sans",
  "neo-grotesk",
  "old-style serif",
  "monospace",
  "script",
  "display",
] as const;

export type TypeClass = (typeof TYPE_CLASSES)[number];

const CLASS_SET = new Set<string>(TYPE_CLASSES);

/** Known product names. The class replaces the name. The name is only a guess note. */
const FONT_NAMES: Readonly<Record<string, TypeClass>> = {
  helvetica: "grotesk",
  "helvetica neue": "grotesk",
  arial: "grotesk",
  univers: "grotesk",
  "akzidenz-grotesk": "grotesk",
  inter: "humanist sans",
  "gill sans": "humanist sans",
  frutiger: "humanist sans",
  verdana: "humanist sans",
  optima: "humanist sans",
  futura: "geometric sans",
  "futura pt": "geometric sans",
  "century gothic": "geometric sans",
  montserrat: "geometric sans",
  poppins: "geometric sans",
  avenir: "geometric sans",
  "avenir next": "geometric sans",
  times: "old-style serif",
  "times new roman": "old-style serif",
  garamond: "old-style serif",
  "eb garamond": "old-style serif",
  caslon: "old-style serif",
  palatino: "old-style serif",
  bodoni: "high-contrast serif",
  didot: "high-contrast serif",
  "playfair display": "high-contrast serif",
  playfair: "high-contrast serif",
  rockwell: "slab",
  clarendon: "slab",
  "roboto slab": "slab",
  courier: "monospace",
  "courier new": "monospace",
  "ibm plex mono": "monospace",
  "space mono": "monospace",
  "comic sans ms": "display",
  "comic sans": "display",
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const MOOD_SCHEMA: JsonSchema = {
  type: "object",
  required: ["perImage", "directions"],
  properties: {
    perImage: {
      type: "array",
      maxItems: MOOD_IMAGE_CAP,
      items: {
        type: "object",
        required: ["file", "whatItSays", "palette", "typeClass"],
        properties: {
          file: { type: "string", maxLength: 240 },
          whatItSays: { type: "string", maxLength: 500 },
          palette: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string", pattern: "^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$" },
          },
          typeClass: { type: "string", maxLength: 80 },
          why: { type: "string", maxLength: 400 },
        },
      },
    },
    directions: {
      type: "array",
      minItems: MOOD_DIRECTION_COUNT,
      maxItems: MOOD_DIRECTION_COUNT,
      items: {
        type: "object",
        required: ["name", "palette", "typeClasses", "mood", "references"],
        properties: {
          name: { type: "string", maxLength: 80 },
          palette: {
            type: "array",
            minItems: PALETTE_LENGTH,
            maxItems: PALETTE_LENGTH,
            items: { type: "string", pattern: "^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$" },
          },
          typeClasses: {
            type: "object",
            required: ["display", "text"],
            properties: {
              display: { type: "string", maxLength: 80 },
              text: { type: "string", maxLength: 80 },
            },
          },
          mood: { type: "string", maxLength: 240 },
          references: {
            type: "array",
            maxItems: 8,
            items: { type: "string", maxLength: 160 },
          },
        },
      },
    },
  },
};

export interface MoodPerImage {
  file: string;
  whatItSays: string;
  palette: string[];
  typeClass: string;
  why?: string;
  note?: string;
}

export interface MoodDirection {
  name: string;
  palette: string[];
  typeClasses: { display: string; text: string };
  mood: string;
  references: string[];
  notes?: string[];
}

export class MoodValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(errors.join("; "));
    this.name = "MoodValidationError";
    this.errors = errors;
  }
}

export class MoodInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoodInputError";
  }
}

export interface ClassifiedType {
  typeClass: string;
  note?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function guessNote(typeClass: string, original: string): string {
  return `Guessed ${typeClass} from the font name ${original}. The exact font is not a fact.`;
}

/**
 * Keep a class. A product name becomes a class plus a note.
 * The returned typeClass is never the font's proper name.
 */
export function classifyType(raw: string): ClassifiedType {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  const lower = trimmed.toLowerCase();
  if (CLASS_SET.has(lower)) return { typeClass: lower };
  const mapped = FONT_NAMES[lower];
  if (mapped !== undefined) {
    return { typeClass: mapped, note: guessNote(mapped, trimmed) };
  }
  if (lower.includes("slab")) return { typeClass: "slab", note: guessNote("slab", trimmed) };
  if (lower.includes("mono")) {
    return { typeClass: "monospace", note: guessNote("monospace", trimmed) };
  }
  if (lower.includes("script") || lower.includes("handwritten")) {
    return { typeClass: "script", note: guessNote("script", trimmed) };
  }
  if (lower.includes("grotesk") || lower.includes("gothic")) {
    const typeClass = lower.includes("neo") ? "neo-grotesk" : "grotesk";
    return { typeClass, note: guessNote(typeClass, trimmed) };
  }
  if (lower.includes("geometric")) {
    return { typeClass: "geometric sans", note: guessNote("geometric sans", trimmed) };
  }
  if (lower.includes("humanist")) {
    return { typeClass: "humanist sans", note: guessNote("humanist sans", trimmed) };
  }
  if (lower.includes("serif")) {
    const typeClass =
      lower.includes("high") || lower.includes("contrast") || lower.includes("didone")
        ? "high-contrast serif"
        : "old-style serif";
    return { typeClass, note: guessNote(typeClass, trimmed) };
  }
  if (lower.includes("sans")) {
    return { typeClass: "humanist sans", note: guessNote("humanist sans", trimmed) };
  }
  return { typeClass: "grotesk", note: guessNote("grotesk", trimmed) };
}

/** `#abc` and `#aabbcc` become lowercase `#rrggbb`. Anything else is undefined. */
export function normalizeHex(value: string): string | undefined {
  const trimmed = value.trim();
  const match = HEX.exec(trimmed);
  if (match === null) return undefined;
  const body = trimmed.slice(1).toLowerCase();
  const full = body.length === 3 ? body.split("").map((part) => part + part).join("") : body;
  return `#${full}`;
}

export function paletteKey(colors: readonly string[]): string {
  return colors.join(",");
}

function pushError(errors: string[], message: string): void {
  errors.push(message);
}

function readText(value: unknown, label: string, errors: string[]): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    pushError(errors, `${label} must be a non-empty string.`);
    return "";
  }
  return value.trim().replace(/\s+/g, " ");
}

function readPalette(value: unknown, label: string, exact: number | undefined, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    pushError(errors, `${label} must be an array of hex colors.`);
    return [];
  }
  if (exact !== undefined && value.length !== exact) {
    pushError(errors, `${label} must contain ${exact} hex colors.`);
  }
  if (exact === undefined && value.length === 0) {
    pushError(errors, `${label} needs at least one hex color.`);
  }
  const colors: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry !== "string") {
      pushError(errors, `${label}[${index}] is not a hex color.`);
      continue;
    }
    const hex = normalizeHex(entry);
    if (hex === undefined) {
      pushError(errors, `${label}[${index}] is not a hex color: ${entry.trim() || entry}`);
      continue;
    }
    colors.push(hex);
  }
  return colors;
}

function readReferences(value: unknown, label: string, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    pushError(errors, `${label} must be an array of strings.`);
    return [];
  }
  const references: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry !== "string" || entry.trim().length === 0) {
      pushError(errors, `${label}[${index}] must be a non-empty string.`);
      continue;
    }
    references.push(entry.trim());
  }
  return references;
}

export interface ParsedMood {
  perImage: MoodPerImage[];
  directions: MoodDirection[];
}

/**
 * Hex-check palettes, reject repeated direction palettes, and turn font names into classes.
 * Depth rules for `why` are applied by analyzeMood after this read.
 */
export function readMoodModel(value: unknown, files: readonly string[]): ParsedMood {
  const errors: string[] = [];
  if (!isRecord(value)) {
    throw new MoodValidationError(["Mood result must be an object."]);
  }
  if (!Array.isArray(value.perImage)) {
    pushError(errors, "perImage must be an array.");
  }
  if (!Array.isArray(value.directions)) {
    pushError(errors, "directions must be an array.");
  }
  if (errors.length > 0) throw new MoodValidationError(errors);

  const rawImages = value.perImage as unknown[];
  const rawDirections = value.directions as unknown[];
  if (rawImages.length !== files.length) {
    pushError(errors, `perImage must contain ${files.length} entries, one per image.`);
  }
  if (rawDirections.length !== MOOD_DIRECTION_COUNT) {
    pushError(errors, `directions must contain exactly ${MOOD_DIRECTION_COUNT} entries.`);
  }

  const perImage: MoodPerImage[] = [];
  const count = Math.min(rawImages.length, files.length);
  for (let index = 0; index < count; index += 1) {
    const raw = rawImages[index];
    const file = files[index] ?? "";
    const label = `perImage[${index}]`;
    if (!isRecord(raw)) {
      pushError(errors, `${label} must be an object.`);
      continue;
    }
    const whatItSays = readText(raw.whatItSays, `${label}.whatItSays`, errors);
    const palette = readPalette(raw.palette, `${label}.palette`, undefined, errors);
    const classified = classifyType(typeof raw.typeClass === "string" ? raw.typeClass : "");
    if (typeof raw.typeClass !== "string" || raw.typeClass.trim().length === 0) {
      pushError(errors, `${label}.typeClass must be a non-empty string.`);
    }
    const note = classified.note;
    const image: MoodPerImage = {
      file,
      whatItSays,
      palette,
      typeClass: classified.typeClass,
    };
    if (typeof raw.why === "string" && raw.why.trim().length > 0) {
      image.why = raw.why.trim();
    }
    if (note !== undefined) image.note = note;
    perImage.push(image);
  }

  const directions: MoodDirection[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < rawDirections.length && index < MOOD_DIRECTION_COUNT; index += 1) {
    const raw = rawDirections[index];
    const label = `directions[${index}]`;
    if (!isRecord(raw)) {
      pushError(errors, `${label} must be an object.`);
      continue;
    }
    const name = readText(raw.name, `${label}.name`, errors);
    const palette = readPalette(raw.palette, `${label}.palette`, PALETTE_LENGTH, errors);
    const mood = readText(raw.mood, `${label}.mood`, errors);
    const references = readReferences(raw.references, `${label}.references`, errors);
    const types = raw.typeClasses;
    let display = "";
    let text = "";
    const notes: string[] = [];
    if (!isRecord(types)) {
      pushError(errors, `${label}.typeClasses must be an object.`);
    } else {
      if (typeof types.display !== "string" || types.display.trim().length === 0) {
        pushError(errors, `${label}.typeClasses.display must be a non-empty string.`);
      } else {
        const classified = classifyType(types.display);
        display = classified.typeClass;
        if (classified.note !== undefined) notes.push(classified.note);
      }
      if (typeof types.text !== "string" || types.text.trim().length === 0) {
        pushError(errors, `${label}.typeClasses.text must be a non-empty string.`);
      } else {
        const classified = classifyType(types.text);
        text = classified.typeClass;
        if (classified.note !== undefined) notes.push(classified.note);
      }
    }
    if (palette.length === PALETTE_LENGTH) {
      const key = paletteKey(palette);
      if (seen.has(key)) {
        pushError(errors, `${label}.palette repeats an earlier direction palette.`);
      }
      seen.add(key);
    }
    const direction: MoodDirection = {
      name,
      palette,
      typeClasses: { display, text },
      mood,
      references,
    };
    if (notes.length > 0) direction.notes = notes;
    directions.push(direction);
  }

  if (errors.length > 0) throw new MoodValidationError(errors);
  return { perImage, directions };
}
