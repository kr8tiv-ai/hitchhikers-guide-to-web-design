/**
 * Desk note when the design library failed during planning.
 * The plan still exists. This flag says the prompts have no library art direction.
 * The desk serves this file to the browser, so it cannot import the engine.
 */
import { escapeHtml } from "./card.ts";

/** Same sentence as NO_ART_DIRECTION_NOTE. Kept here so the browser module stays free of the engine. */
const NO_ART_DIRECTION_NOTE =
  "No art direction: the design library failed to load (see library-error.txt).";

export function artDirectionNoteHtml(artDirection: "none" | "" | undefined): string {
  if (artDirection !== "none") return "";
  return `<p data-art-direction="none" role="status">${escapeHtml(NO_ART_DIRECTION_NOTE)}</p>`;
}
