/**
 * Render harness for the Astro primitives.
 * The package does not depend on Astro. This reads the component source,
 * fills the five slots, and inlines sections.css.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sectionByKind, variantRecipe } from "./catalog.ts";
import { SLOT_NAMES, type SlotName } from "./slots.ts";

export interface SectionSlots {
  eyebrow: string;
  title: string;
  body: string;
  media: string;
  actions: string;
}

export function componentDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

export function renderPrimitive(kind: string, variant: string, slots: SectionSlots): string {
  const spec = sectionByKind(kind);
  if (!spec.variants.some((item) => item.id === variant)) {
    throw new Error(`Unknown ${kind} variant ${variant}.`);
  }
  const dir = componentDir();
  const source = readFileSync(path.join(dir, spec.file), "utf8");
  const css = readFileSync(path.join(dir, "sections.css"), "utf8");
  const recipe = variantRecipe(kind, variant);
  let html = templateOf(source);
  html = html.replace(/class=\{`([^`]*)`\}/g, (_match, expr: string) => {
    return `class="${expr.replaceAll("${variant}", variant)}"`;
  });
  html = html.replaceAll("data-variant={variant}", `data-variant="${variant}"`);
  html = html.replaceAll("data-recipe={recipe}", `data-recipe="${recipe}"`);
  for (const name of SLOT_NAMES) {
    html = html.replaceAll(`<slot name="${name}" />`, slotHtml(slots, name));
  }
  if (html.includes("<slot") || html.includes("{variant}") || html.includes("{recipe}")) {
    throw new Error(`Section ${kind} left a slot or a variant expression unrendered.`);
  }
  return `${html}\n<style>\n${css}\n</style>`;
}

function slotHtml(slots: SectionSlots, name: SlotName): string {
  return slots[name];
}

function templateOf(source: string): string {
  const parts = source.split(/^---\s*$/m);
  const body = parts[2];
  if (body === undefined) throw new Error("Section primitive is missing its template.");
  return body.trim();
}
