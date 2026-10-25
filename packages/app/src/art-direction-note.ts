/**
 * Desk note when the design library failed during planning.
 * The plan still exists. This flag says the prompts have no library art direction.
 */
import { NO_ART_DIRECTION_NOTE } from "@hitchhiker/engine";
import { escapeHtml } from "./card.ts";

export function artDirectionNoteHtml(artDirection: "none" | "" | undefined): string {
  if (artDirection !== "none") return "";
  return `<p data-art-direction="none" role="status">${escapeHtml(NO_ART_DIRECTION_NOTE)}</p>`;
}
