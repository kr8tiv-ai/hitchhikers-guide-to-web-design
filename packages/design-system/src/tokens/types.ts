/** Style worlds from art direction. Duplicated so this package stays a leaf. */
export type StyleWorld = "editorial" | "3d-world" | "playful" | "brutalist";

export interface BrandSwatchFill {
  name: string;
  hex: string;
  source: string;
}

/** Colour roles are slots. tokensFor fills them from the brand palette. */
export interface BrandFill {
  paper: string;
  ink: string;
  accent: string;
  muted: string;
  surface?: string;
  display: string;
  body: string;
  sources: { paper: string; ink: string; accent: string; muted: string };
  swatches?: readonly BrandSwatchFill[];
}

export interface TypeStep {
  name: string;
  clamp: string;
}

export interface WorldTokens {
  world: StyleWorld;
  type: { steps: readonly TypeStep[] };
  spacing: readonly { name: string; value: string }[];
  radii: readonly { name: string; value: string }[];
  motion: {
    durations: { reveal: string; hover: string; stagger: string };
    easings: { reveal: string; hover: string; track: string };
  };
  color: { paper: string; ink: string; accent: string; muted: string; surface: string };
  font: { display: string; body: string };
  /** Joined colour sentence, without the "Color tokens:" prefix or the trailing period. */
  colorLine: string;
}
