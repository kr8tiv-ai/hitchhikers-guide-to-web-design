import { SLOT_NAMES } from "../slots.ts";
import type { VariantStructure } from "./types.ts";

export const structure: VariantStructure = {
  variant: "split-editorial",
  requiredSlots: ["media", "title", "body"],
  elementOrder: SLOT_NAMES,
  layout: [
    {
      kind: "unequal-columns",
      minWidth: 1024,
      columns: 2,
      detail: "Two columns with unequal widths at 1024 and wider.",
    },
  ],
};
