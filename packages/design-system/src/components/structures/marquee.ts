import { SLOT_NAMES } from "../slots.ts";
import type { VariantStructure } from "./types.ts";

export const structure: VariantStructure = {
  variant: "marquee",
  requiredSlots: ["title"],
  elementOrder: SLOT_NAMES,
  layout: [
    {
      kind: "horizontal",
      detail: "Horizontal marquee.",
    },
  ],
};
