import { SLOT_NAMES } from "../slots.ts";
import type { VariantStructure } from "./types.ts";

export const structure: VariantStructure = {
  variant: "object",
  requiredSlots: ["media", "title"],
  elementOrder: SLOT_NAMES,
  layout: [
    {
      kind: "object",
      slot: "media",
      webgl: "optional",
      fallback: "image",
      detail: "Product or 3D object. Static image when WebGL is not approved.",
    },
  ],
};
