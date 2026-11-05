import { HERO_VARIANT_IDS } from "./catalog.ts";
import { structure as cinematic } from "./structures/cinematic.ts";
import { structure as layeredDepth } from "./structures/layered-depth.ts";
import { structure as marquee } from "./structures/marquee.ts";
import { structure as monument } from "./structures/monument.ts";
import { structure as objectStructure } from "./structures/object.ts";
import { structure as splitEditorial } from "./structures/split-editorial.ts";
import { structure as statement } from "./structures/statement.ts";
import type { VariantStructure } from "./structures/types.ts";

export const HERO_VARIANTS = HERO_VARIANT_IDS;

const ALL: Readonly<Record<string, VariantStructure>> = {
  cinematic,
  "split-editorial": splitEditorial,
  statement,
  marquee,
  monument,
  object: objectStructure,
  "layered-depth": layeredDepth,
};

export function structureFor(variant: string): VariantStructure {
  const found = ALL[variant];
  if (found === undefined) throw new Error(`Unknown hero variant ${variant}.`);
  return found;
}

export function heroStructures(): readonly VariantStructure[] {
  return Object.values(ALL);
}
