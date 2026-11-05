/**
 * Rank section variants for a style world.
 * The first id is the one the page should build. Each reason is one line.
 */
import { isSectionKind, SECTIONS, type SectionKind } from "./catalog.ts";

/** Same union as the token StyleWorld. Local so a copied components folder stays closed. */
type StyleWorld = "editorial" | "3d-world" | "playful" | "brutalist";

export interface RankedVariant {
  id: string;
  reason: string;
}

const WORLDS = new Set<StyleWorld>(["editorial", "3d-world", "playful", "brutalist"]);

const PREFERRED: Record<SectionKind, Record<StyleWorld, readonly string[]>> = {
  hero: {
    editorial: ["statement", "split-editorial", "monument", "marquee", "cinematic", "object", "layered-depth"],
    "3d-world": ["object", "cinematic", "layered-depth", "monument", "marquee", "split-editorial", "statement"],
    playful: ["marquee", "cinematic", "statement", "object", "split-editorial", "monument", "layered-depth"],
    brutalist: ["monument", "statement", "marquee", "split-editorial", "cinematic", "object", "layered-depth"],
  },
  feature: {
    editorial: ["split", "stacked", "band", "icon-row"],
    "3d-world": ["band", "split", "stacked", "icon-row"],
    playful: ["icon-row", "band", "stacked", "split"],
    brutalist: ["stacked", "band", "split", "icon-row"],
  },
  gallery: {
    editorial: ["editorial-grid", "masonry", "filmstrip"],
    "3d-world": ["filmstrip", "masonry", "editorial-grid"],
    playful: ["filmstrip", "masonry", "editorial-grid"],
    brutalist: ["masonry", "editorial-grid", "filmstrip"],
  },
  quote: {
    editorial: ["pull", "centred", "attributed"],
    "3d-world": ["attributed", "centred", "pull"],
    playful: ["centred", "pull", "attributed"],
    brutalist: ["pull", "attributed", "centred"],
  },
  cta: {
    editorial: ["inline", "band", "split"],
    "3d-world": ["split", "band", "inline"],
    playful: ["band", "split", "inline"],
    brutalist: ["band", "inline", "split"],
  },
  steps: {
    editorial: ["numbered", "timeline", "stacked"],
    "3d-world": ["timeline", "numbered", "stacked"],
    playful: ["stacked", "numbered", "timeline"],
    brutalist: ["numbered", "stacked", "timeline"],
  },
  listing: {
    editorial: ["list", "grid", "feature-row"],
    "3d-world": ["feature-row", "grid", "list"],
    playful: ["grid", "feature-row", "list"],
    brutalist: ["list", "grid", "feature-row"],
  },
  faq: {
    editorial: ["stacked", "two-column", "accordion"],
    "3d-world": ["accordion", "two-column", "stacked"],
    playful: ["accordion", "stacked", "two-column"],
    brutalist: ["stacked", "accordion", "two-column"],
  },
  contact: {
    editorial: ["split", "stacked", "panel"],
    "3d-world": ["panel", "split", "stacked"],
    playful: ["stacked", "split", "panel"],
    brutalist: ["stacked", "panel", "split"],
  },
  footer: {
    editorial: ["columns", "stacked", "bar"],
    "3d-world": ["bar", "columns", "stacked"],
    playful: ["stacked", "columns", "bar"],
    brutalist: ["bar", "stacked", "columns"],
  },
  nav: {
    editorial: ["inline", "bar", "overlay"],
    "3d-world": ["overlay", "bar", "inline"],
    playful: ["bar", "overlay", "inline"],
    brutalist: ["bar", "inline", "overlay"],
  },
};

const REASONS: Record<string, string> = {
  statement: "Centred statement with a progressive reveal.",
  "split-editorial": "Two unequal columns for an editorial spread.",
  cinematic: "Full-viewport media.",
  object: "A product object, with a static image when WebGL is not approved.",
  marquee: "A horizontal marquee.",
  monument: "Extreme display type.",
  "layered-depth": "Media, veil, and copy stacked in one cell.",
  split: "Two columns with unequal widths.",
  stacked: "A single column, stacked in source order.",
  band: "A full-width band.",
  "icon-row": "A horizontal row of items.",
  masonry: "A masonry grid.",
  filmstrip: "A horizontal filmstrip.",
  "editorial-grid": "An uneven editorial grid.",
  pull: "A pull quote set in display type.",
  centred: "A centred quote.",
  attributed: "A quote with its attribution beside it.",
  inline: "An inline close.",
  numbered: "Numbered steps in source order.",
  timeline: "A timeline of steps.",
  grid: "A card grid.",
  list: "A single-column list.",
  "feature-row": "One featured row beside the list.",
  accordion: "Questions in an accordion.",
  "two-column": "Two columns of questions.",
  panel: "A contained panel.",
  columns: "Link columns.",
  bar: "A single bar.",
  overlay: "An overlay panel.",
};

/** Map a sitemap section id onto a primitive. Unknown ids use feature. */
export function sectionKindFor(sectionId: string): SectionKind {
  const id = sectionId.trim().toLowerCase();
  if (id.includes("hero")) return "hero";
  if (id.includes("nav") || id === "header" || id.includes("menu")) return "nav";
  if (id.includes("footer")) return "footer";
  if (id.includes("faq") || id.includes("question")) return "faq";
  if (id.includes("quote") || id.includes("testimonial")) return "quote";
  if (id.includes("step") || id.includes("process")) return "steps";
  if (id.includes("gallery") || id.includes("film")) return "gallery";
  if (id.includes("contact") || id.includes("inquir")) return "contact";
  if (id.includes("cta") || id.includes("sign-up") || id.includes("signup")) return "cta";
  if (
    id.includes("card") ||
    id.includes("listing") ||
    id.includes("grid") ||
    id.includes("post") ||
    id === "list"
  ) {
    return "listing";
  }
  return "feature";
}

export function rankVariants(
  world: StyleWorld,
  direction: string,
  sectionKind: string,
  brief: string,
): readonly RankedVariant[] {
  if (!WORLDS.has(world)) throw new Error(`Unknown style world ${world}.`);
  const kind = resolveKind(sectionKind);
  const known = SECTIONS.find((section) => section.kind === kind)?.variants.map((item) => item.id) ?? [];
  const preferred = PREFERRED[kind][world].filter((id) => known.includes(id));
  const rest = known.filter((id) => !preferred.includes(id));
  let order = [...preferred, ...rest];
  order = nudge(kind, world, order, `${direction}\n${brief}`);
  const line = direction.replace(/\s+/g, " ").trim();
  const clipped = line.length <= 80 ? line : `${line.slice(0, 77).trimEnd()}...`;
  return order.map((id) => ({
    id,
    reason: oneLine(id, world, clipped),
  }));
}

function resolveKind(sectionKind: string): SectionKind {
  const normalized = sectionKind.trim().toLowerCase();
  if (isSectionKind(normalized)) return normalized;
  return sectionKindFor(normalized);
}

function nudge(kind: SectionKind, world: StyleWorld, order: readonly string[], text: string): string[] {
  let next = [...order];
  if (kind === "hero" && world === "editorial" && /split|asymmetric|unequal/.test(text.toLowerCase())) {
    next = moveToFront(next, "split-editorial");
  }
  if (kind === "hero" && world === "3d-world") {
    const lower = text.toLowerCase();
    const product = /product|packshot|\bobject\b|\bsku\b/.test(lower);
    const film = /cinematic|full-bleed|full viewport|fullscreen/.test(lower);
    if (product) next = moveToFront(next, "object");
    else if (film) next = moveToFront(next, "cinematic");
  }
  return next;
}

function moveToFront(order: readonly string[], id: string): string[] {
  if (!order.includes(id)) return [...order];
  return [id, ...order.filter((item) => item !== id)];
}

function oneLine(id: string, world: StyleWorld, direction: string): string {
  const base = REASONS[id] ?? "A listed variant for this section.";
  const who = direction === "" ? "" : ` Direction: ${direction}.`;
  return `${base} Style world: ${world}.${who}`.replace(/\s+/g, " ").trim();
}
