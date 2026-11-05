import { SLOT_NAMES } from "../slots.ts";
import type { VariantStructure } from "./types.ts";

/** Optional seventh hero. The six required variants do not depend on it. */
export const structure: VariantStructure = {
  variant: "layered-depth",
  requiredSlots: ["media", "title"],
  elementOrder: SLOT_NAMES,
  layout: [
    {
      kind: "layered-depth",
      layers: 3,
      detail: "Media, veil, and copy occupy one cell.",
    },
  ],
};
