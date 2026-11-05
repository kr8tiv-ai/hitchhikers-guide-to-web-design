import { SLOT_NAMES } from "../slots.ts";
import type { VariantStructure } from "./types.ts";

export const structure: VariantStructure = {
  variant: "statement",
  requiredSlots: ["title", "body"],
  elementOrder: SLOT_NAMES,
  layout: [
    {
      kind: "centred-reveal",
      progressive: true,
      detail: "Centred statement with a progressive reveal.",
    },
  ],
};
