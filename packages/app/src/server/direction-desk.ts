/**
 * Direction pick on the desk. The dealt set is `.hitchhiker/directions.json`.
 * A post records the direction the person chose and the ones they were shown.
 * No deal, no buttons, and no decision-log row.
 */

import { DecisionLogError, chooseDirection, readDirectionDeal, rejectedDirectionNames } from "@hitchhiker/engine";
import { escapeHtml } from "../card.ts";

export function postDirectionChoice(
  projectDir: string,
  raw: string,
): { status: number; body: { ok?: boolean; pickedId?: string | null; rejected?: string[]; error?: string } } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 400, body: { error: "The desk could not read that request." } };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { status: 400, body: { error: "A pick needs a direction and a one-line reason." } };
  }
  const record = parsed as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const reason = typeof record.reason === "string" ? record.reason : "";
  try {
    const deal = chooseDirection(projectDir, id, reason);
    return {
      status: 200,
      body: { ok: true, pickedId: deal.pickedId, rejected: rejectedDirectionNames(projectDir) },
    };
  } catch (error) {
    if (error instanceof DecisionLogError) return { status: 400, body: { error: error.message } };
    throw error;
  }
}

/** Empty when this project has no saved deal, so the desk HTML stays as it was. */
export function renderDirectionPicker(projectDir: string): string {
  if (projectDir.trim() === "") return "";
  let deal;
  try {
    deal = readDirectionDeal(projectDir);
  } catch {
    return `<section data-direction-desk>
            <h2 class="hh-title">Directions</h2>
            <p>.hitchhiker/directions.json is not a deal.</p>
          </section>`;
  }
  if (deal === null) return "";
  const choices = directionChoices(deal);
  if (deal.pickedId !== null) {
    const picked = deal.directions.find((direction) => direction.id === deal.pickedId);
    const name = picked === undefined ? deal.pickedId : picked.name;
    const line = picked !== undefined && picked.description !== "" ? ` ${escapeHtml(picked.description)}` : "";
    return `<section data-direction-desk>
            <h2 class="hh-title">Directions</h2>
            <p>Picked ${escapeHtml(name)}.${line} The directions that were shown and not picked stay in the decision log.</p>
            <button class="hh-btn hh-btn--secondary" type="button" data-change-direction>Change direction</button>
            <div data-direction-choices hidden>
              ${choices}
            </div>
          </section>`;
  }
  return `<section data-direction-desk>
            <h2 class="hh-title">Directions</h2>
            <p>Pick one. The others stay on the decision log.</p>
            ${choices}
          </section>`;
}

function directionChoices(deal: { directions: readonly { id: string; name: string; description: string }[] }): string {
  const buttons = deal.directions
    .map((direction) => {
      const about = direction.description === "" ? "" : `<span class="hh-small">${escapeHtml(direction.description)}</span>`;
      return `<p class="hh-small">${escapeHtml(direction.name)}. ${about}</p><button class="hh-btn hh-btn--secondary" type="button" data-pick-direction="${escapeHtml(direction.id)}">${escapeHtml(direction.name)}</button>`;
    })
    .join("");
  return `<label>One-line reason <input type="text" maxlength="240" autocomplete="off" data-direction-reason /></label>
            <div>${buttons}</div>
            <p data-direction-note></p>`;
}
