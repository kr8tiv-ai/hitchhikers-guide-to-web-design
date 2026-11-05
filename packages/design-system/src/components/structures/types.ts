import type { SlotName } from "../slots.ts";

/**
 * Required shape of a hero variant, for the structure gate.
 * `elementOrder` is the DOM order of `[data-slot]` nodes.
 * `layout` is the fact a built page has to satisfy at the named width.
 */
export interface LayoutFact {
  kind: string;
  detail: string;
  at?: number;
  minWidth?: number;
  minFraction?: number;
  columns?: number;
  slot?: "title" | "media";
  webgl?: "optional";
  fallback?: "image";
  layers?: number;
  progressive?: boolean;
}

export interface VariantStructure {
  variant: string;
  requiredSlots: readonly SlotName[];
  elementOrder: readonly SlotName[];
  layout: readonly LayoutFact[];
}
