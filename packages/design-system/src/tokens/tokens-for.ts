import { colorLineFor } from "./color-line.ts";
import type { BrandFill, StyleWorld, WorldTokens } from "./types.ts";
import { worldSetFor } from "./worlds.ts";

export function tokensFor(world: StyleWorld, brand: BrandFill): WorldTokens {
  const set = worldSetFor(world);
  const surface = brand.surface ?? brand.paper;
  return {
    world,
    type: { steps: set.steps },
    spacing: set.spacing.map((value, index) => ({ name: `space-${index + 1}`, value })),
    radii: set.radii,
    motion: { durations: set.durations, easings: set.easings },
    color: {
      paper: brand.paper,
      ink: brand.ink,
      accent: brand.accent,
      muted: brand.muted,
      surface,
    },
    font: { display: brand.display, body: brand.body },
    colorLine: colorLineFor(brand),
  };
}
