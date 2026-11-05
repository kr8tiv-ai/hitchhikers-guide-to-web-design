import { SLOT_NAMES } from "../slots.ts";
import type { VariantStructure } from "./types.ts";

export const structure: VariantStructure = {
  variant: "cinematic",
  requiredSlots: ["media", "title"],
  elementOrder: SLOT_NAMES,
  layout: [
    {
      kind: "media-cover",
      at: 1440,
      minFraction: 0.9,
      slot: "media",
      detail: "Media covers at least 90% of the viewport at 1440.",
    },
  ],
};
