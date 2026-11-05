/**
 * Section primitives. A variant may name a 245d recipe
 * (reveal, marquee, parallax, split-line, horizontal, hover-lift).
 * The primitive does not import gsap. The page mounts the recipe.
 */
import { SLOT_NAMES, type SlotName } from "./slots.ts";

export { SLOT_NAMES, type SlotName };

export const RECIPE_IDS = ["reveal", "marquee", "parallax", "split-line", "horizontal", "hover-lift"] as const;

export type RecipeId = (typeof RECIPE_IDS)[number] | "";

export const SECTION_KINDS = [
  "hero",
  "feature",
  "gallery",
  "quote",
  "cta",
  "steps",
  "listing",
  "faq",
  "contact",
  "footer",
  "nav",
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

export interface VariantSpec {
  id: string;
  recipe: RecipeId;
}

export interface SectionSpec {
  kind: SectionKind;
  root: "section" | "header" | "footer";
  file: string;
  /** Used when the page omits the variant prop. Matches the editorial rank. */
  fallback: string;
  variants: readonly VariantSpec[];
}

export const SECTIONS: readonly SectionSpec[] = [
  {
    kind: "hero",
    root: "section",
    file: "Hero.astro",
    fallback: "statement",
    variants: [
      { id: "cinematic", recipe: "parallax" },
      { id: "split-editorial", recipe: "reveal" },
      { id: "statement", recipe: "reveal" },
      { id: "marquee", recipe: "marquee" },
      { id: "monument", recipe: "split-line" },
      { id: "object", recipe: "" },
      { id: "layered-depth", recipe: "parallax" },
    ],
  },
  {
    kind: "feature",
    root: "section",
    file: "Feature.astro",
    fallback: "split",
    variants: [
      { id: "split", recipe: "reveal" },
      { id: "stacked", recipe: "" },
      { id: "band", recipe: "hover-lift" },
      { id: "icon-row", recipe: "" },
    ],
  },
  {
    kind: "gallery",
    root: "section",
    file: "Gallery.astro",
    fallback: "editorial-grid",
    variants: [
      { id: "editorial-grid", recipe: "reveal" },
      { id: "masonry", recipe: "" },
      { id: "filmstrip", recipe: "horizontal" },
    ],
  },
  {
    kind: "quote",
    root: "section",
    file: "Quote.astro",
    fallback: "pull",
    variants: [
      { id: "pull", recipe: "split-line" },
      { id: "centred", recipe: "" },
      { id: "attributed", recipe: "" },
    ],
  },
  {
    kind: "cta",
    root: "section",
    file: "CTA.astro",
    fallback: "inline",
    variants: [
      { id: "inline", recipe: "" },
      { id: "band", recipe: "reveal" },
      { id: "split", recipe: "hover-lift" },
    ],
  },
  {
    kind: "steps",
    root: "section",
    file: "Steps.astro",
    fallback: "numbered",
    variants: [
      { id: "numbered", recipe: "reveal" },
      { id: "timeline", recipe: "" },
      { id: "stacked", recipe: "" },
    ],
  },
  {
    kind: "listing",
    root: "section",
    file: "Listing.astro",
    fallback: "list",
    variants: [
      { id: "list", recipe: "" },
      { id: "grid", recipe: "" },
      { id: "feature-row", recipe: "hover-lift" },
    ],
  },
  {
    kind: "faq",
    root: "section",
    file: "FAQ.astro",
    fallback: "stacked",
    variants: [
      { id: "stacked", recipe: "reveal" },
      { id: "two-column", recipe: "" },
      { id: "accordion", recipe: "" },
    ],
  },
  {
    kind: "contact",
    root: "section",
    file: "Contact.astro",
    fallback: "split",
    variants: [
      { id: "split", recipe: "" },
      { id: "stacked", recipe: "reveal" },
      { id: "panel", recipe: "" },
    ],
  },
  {
    kind: "footer",
    root: "footer",
    file: "Footer.astro",
    fallback: "columns",
    variants: [
      { id: "columns", recipe: "" },
      { id: "stacked", recipe: "" },
      { id: "bar", recipe: "" },
    ],
  },
  {
    kind: "nav",
    root: "header",
    file: "Nav.astro",
    fallback: "inline",
    variants: [
      { id: "inline", recipe: "" },
      { id: "bar", recipe: "" },
      { id: "overlay", recipe: "" },
    ],
  },
];

export const HERO_VARIANT_IDS = [
  "cinematic",
  "split-editorial",
  "statement",
  "marquee",
  "monument",
  "object",
] as const;

export function isSectionKind(value: string): value is SectionKind {
  return (SECTION_KINDS as readonly string[]).includes(value);
}

export function sectionByKind(kind: string): SectionSpec {
  const found = SECTIONS.find((section) => section.kind === kind);
  if (found === undefined) throw new Error(`Unknown section ${kind}.`);
  return found;
}

export function variantRecipe(kind: string, variant: string): string {
  const found = sectionByKind(kind).variants.find((item) => item.id === variant);
  if (found === undefined) throw new Error(`Unknown ${kind} variant ${variant}.`);
  return found.recipe;
}
