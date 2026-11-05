/**
 * Which recipes a style world may use at a motion appetite.
 * Letters cite context/research/04-motion-taxonomy.md (A scroll, B type,
 * C navigation, D pointer, F realtime 3D). StyleWorld matches the engine
 * art-direction enum and the token sets in this package.
 */
import type { StyleWorld } from "../tokens/types.ts";
import type { RecipeName } from "./types.ts";

export type TaxonomyLetter = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

/** A taxonomy letter, or a studio kind the appetite table names. */
export type TaxonomyId = TaxonomyLetter | "type-led" | "scroll-story";

export interface RecipeMapEntry {
  recipe: RecipeName;
  taxonomy: TaxonomyLetter;
  /** Taxonomy id, for example A8 or C4. */
  cite: string;
  subtle: boolean;
}

export interface RecipeMapQuery {
  world: StyleWorld;
  appetite: number;
  taxonomy?: readonly TaxonomyId[];
}

const LETTERS = new Set<TaxonomyLetter>(["A", "B", "C", "D", "E", "F", "G", "H"]);

function level(appetite: number): number {
  if (!Number.isFinite(appetite)) return 1;
  return Math.min(10, Math.max(1, Math.round(appetite)));
}

function entry(recipe: RecipeName, taxonomy: TaxonomyLetter, cite: string, subtle = false): RecipeMapEntry {
  return { recipe, taxonomy, cite, subtle };
}

function defaultsFor(world: StyleWorld): readonly TaxonomyId[] {
  if (world === "3d-world") return ["A", "F"];
  if (world === "brutalist") return ["B", "type-led"];
  if (world === "playful") return ["A", "D"];
  return ["A", "scroll-story"];
}

function tagSet(query: RecipeMapQuery): Set<string> {
  const tags = new Set<string>(query.taxonomy ?? defaultsFor(query.world));
  if (query.world === "editorial") tags.add("scroll-story");
  if (query.world === "brutalist") tags.add("type-led");
  if (query.world === "3d-world") tags.add("F");
  if (tags.has("B")) tags.add("type-led");
  return tags;
}

function push(into: RecipeMapEntry[], next: RecipeMapEntry): void {
  if (into.some((item) => item.recipe === next.recipe)) return;
  into.push(next);
}

/**
 * Allow-list for a world, an appetite from 1 to 10, and optional taxonomy ids.
 * Appetite 1-3 stays on reveals, capped parallax, and micro-interactions.
 * Appetite 9-10 in a 3D world adds the scroll camera and the preloader handoff.
 */
export function recipesFor(query: RecipeMapQuery): readonly RecipeMapEntry[] {
  const appetite = level(query.appetite);
  if (appetite <= 3) {
    return [
      entry("batchReveal", "A", "A2"),
      entry("parallaxLayers", "A", "A5", true),
      entry("microInteractions", "D", "D1", true),
    ];
  }

  const tags = tagSet(query);
  const recipes: RecipeMapEntry[] = [];
  push(recipes, entry("batchReveal", "A", "A2"));
  push(recipes, entry("parallaxLayers", "A", "A5", true));

  const scrollStory = query.world === "editorial" || tags.has("scroll-story") || tags.has("A");
  if (scrollStory) {
    push(recipes, entry("pinnedTimeline", "A", "A3"));
    if (appetite >= 5) push(recipes, entry("snapToLabels", "A", "A3"));
    if (appetite >= 6) push(recipes, entry("horizontalTrack", "A", "A4"));
    if (appetite >= 6) push(recipes, entry("frameSequence", "A", "A7"));
  }

  if (tags.has("type-led") || tags.has("B")) {
    push(recipes, entry("kineticType", "B", "B1"));
    push(recipes, entry("pageTransition", "C", "C1"));
  }

  if (appetite >= 4 && !tags.has("type-led")) {
    push(recipes, entry("pageTransition", "C", "C1"));
  }
  if (appetite >= 7) push(recipes, entry("pageTransition", "C", "C2"));

  if (appetite >= 5) push(recipes, entry("microInteractions", "D", "D1"));

  if (query.world === "3d-world" && appetite >= 9) {
    push(recipes, entry("scrollCamera", "A", "A8"));
    push(recipes, entry("preloaderHandoff", "C", "C4"));
  }

  return recipes;
}

function preferred(world: StyleWorld, appetite: number): readonly RecipeName[] {
  if (appetite <= 3) return ["batchReveal", "parallaxLayers", "microInteractions"];
  if (world === "3d-world" && appetite >= 9) return ["scrollCamera", "preloaderHandoff"];
  if (world === "editorial") return ["pinnedTimeline", "horizontalTrack", "snapToLabels"];
  if (world === "brutalist") return ["kineticType", "pageTransition"];
  return ["batchReveal", "parallaxLayers", "microInteractions", "pinnedTimeline"];
}

/** Lead recipes for a signature moment. 245v picks from this list. */
export function signatureRecipeCandidates(world: StyleWorld, appetite: number): readonly RecipeName[] {
  const allowed = new Set(recipesFor({ world, appetite }).map((item) => item.recipe));
  const picked = preferred(world, level(appetite)).filter((name) => allowed.has(name));
  if (picked.length > 0) return picked;
  return [...allowed];
}

export function isTaxonomyLetter(value: string): value is TaxonomyLetter {
  return LETTERS.has(value as TaxonomyLetter);
}
