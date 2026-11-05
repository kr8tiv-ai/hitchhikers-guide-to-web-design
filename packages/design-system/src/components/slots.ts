/** Named slots on every section primitive. Order is the DOM order. */
export const SLOT_NAMES = ["media", "eyebrow", "title", "body", "actions"] as const;

export type SlotName = (typeof SLOT_NAMES)[number];
