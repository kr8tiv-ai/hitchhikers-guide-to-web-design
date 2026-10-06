/**
 * JSON Schema subset used by think(). No third-party validator.
 * Keywords: type, properties, required, enum, items, minItems, maxItems,
 * maxLength, pattern. Unknown keywords are ignored.
 */

export type JsonType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

export interface JsonSchema {
  type?: JsonType;
  properties?: Readonly<Record<string, JsonSchema>>;
  required?: readonly string[];
  enum?: readonly unknown[];
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  maxLength?: number;
  pattern?: string;
}

const TYPES = new Set<JsonType>([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

const PATTERN_MAX = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function typeOf(value: unknown): JsonType | "unknown" {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    case "number":
      return Number.isInteger(value) ? "integer" : "number";
    default:
      return "unknown";
  }
}

function matchesType(value: unknown, type: JsonType): boolean {
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isRecord(value);
  if (type === "null") return value === null;
  return typeof value === type;
}

function walk(value: unknown, schema: JsonSchema, at: string, errors: string[]): void {
  const declared = schema.type;
  if (declared !== undefined) {
    if (!TYPES.has(declared)) {
      errors.push(`${at}: schema type is not supported`);
      return;
    }
    if (!matchesType(value, declared)) {
      errors.push(`${at}: expected ${declared}, received ${typeOf(value)}`);
      return;
    }
  }

  if (schema.enum !== undefined) {
    const wanted = schema.enum;
    const match = wanted.some((candidate) => canonical(candidate) === canonical(value));
    if (!match) errors.push(`${at}: value is not in the enum`);
  }

  if (typeof value === "string" && schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push(`${at}: length ${value.length} is over maxLength ${schema.maxLength}`);
  }

  if (typeof value === "string" && schema.pattern !== undefined) {
    if (schema.pattern.length > PATTERN_MAX) {
      errors.push(`${at}: pattern is too long`);
    } else {
      try {
        const expression = new RegExp(schema.pattern);
        if (!expression.test(value)) errors.push(`${at}: value does not match pattern`);
      } catch {
        errors.push(`${at}: pattern is invalid`);
      }
    }
  }

  if (isRecord(value)) {
    const required = schema.required;
    if (required !== undefined) {
      for (const key of required) {
        if (!Object.hasOwn(value, key)) errors.push(`${at}.${key}: required`);
      }
    }
    const properties = schema.properties;
    if (properties !== undefined) {
      for (const key of Object.keys(properties)) {
        if (!Object.hasOwn(value, key)) continue;
        const child = properties[key];
        if (child === undefined) continue;
        walk(value[key], child, `${at}.${key}`, errors);
      }
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${at}: item count ${value.length} is under minItems ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${at}: item count ${value.length} is over maxItems ${schema.maxItems}`);
    }
    const items = schema.items;
    if (items !== undefined) {
      for (let index = 0; index < value.length; index += 1) {
        walk(value[index], items, `${at}[${index}]`, errors);
      }
    }
  }
}

/** Returns a list of validation errors. An empty list means the value matches. */
export function validateJson(value: unknown, schema: JsonSchema): string[] {
  const errors: string[] = [];
  walk(value, schema, "$", errors);
  return errors;
}
