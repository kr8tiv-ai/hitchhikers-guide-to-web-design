import type { BrandFill } from "./types.ts";

const RESERVED = new Set(["paper", "ink", "accent", "muted", "primary", "button", "onbutton"]);

/** Same key as colourTokenKey in design-outputs. Duplicates stay, matching the sentence. */
function colourTokenKey(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (key === "" || RESERVED.has(key)) return "";
  return key;
}

export function colorLineFor(brand: BrandFill): string {
  const parts = [
    `paper ${brand.paper} Source: ${brand.sources.paper}`,
    `ink ${brand.ink} Source: ${brand.sources.ink}`,
    `accent ${brand.accent} Source: ${brand.sources.accent}`,
    `muted ${brand.muted} Source: ${brand.sources.muted}`,
  ];
  for (const swatch of brand.swatches ?? []) {
    const key = colourTokenKey(swatch.name);
    if (key === "") continue;
    parts.push(`${key} ${swatch.hex} Source: ${swatch.source}`);
  }
  return parts.join(", ");
}
