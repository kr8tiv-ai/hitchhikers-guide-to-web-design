/**
 * Leaf token package. Recipes stay out of this entry so an engine import
 * does not load gsap or lenis into the CLI bundle.
 */
export const PACKAGE_NAME = "@hitchhiker/design-system";

export { renderTokensSection } from "./tokens/render.ts";
export { tokensFor } from "./tokens/tokens-for.ts";
export type { BrandFill, BrandSwatchFill, StyleWorld, TypeStep, WorldTokens } from "./tokens/types.ts";
