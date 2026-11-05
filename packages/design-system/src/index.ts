/**
 * Leaf token package. Recipe modules stay on the motion entry so an engine
 * import does not load gsap or lenis into the CLI bundle. The compose rule
 * and the style-world map are plain data.
 */
export const PACKAGE_NAME = "@hitchhiker/design-system";

export { renderTokensSection } from "./tokens/render.ts";
export { tokensFor } from "./tokens/tokens-for.ts";
export type { BrandFill, BrandSwatchFill, StyleWorld, TypeStep, WorldTokens } from "./tokens/types.ts";
export { MOTION_COMPOSE_RULE } from "./motion/compose-rule.ts";
export { recipesFor, signatureRecipeCandidates } from "./motion/world-map.ts";
export type { RecipeMapEntry, RecipeMapQuery, TaxonomyId, TaxonomyLetter } from "./motion/world-map.ts";
export type { RecipeName } from "./motion/types.ts";
