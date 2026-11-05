import { SLOT_NAMES } from "../slots.ts";
import type { VariantStructure } from "./types.ts";

export const structure: VariantStructure = {
  variant: "monument",
  requiredSlots: ["title"],
  elementOrder: SLOT_NAMES,
  layout: [
    {
      kind: "extreme-type",
      slot: "title",
      detail: "The title is extreme display type.",
    },
  ],
};
