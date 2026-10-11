/**
 * First five minutes. A plate on the desk, not a modal wall.
 * Skip and finish write tourSeen through the settings save.
 */

import { escapeHtml } from "./card.ts";

export interface TourStep {
  id: string;
  title: string;
  body: string;
  target: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "desk",
    title: "The desk",
    body: "This cream page is the interview. One question sits in the card. The rust rule on the left is the Don't Panic mark. Answer, Suggest for me, or Skip. Nothing else is required to begin.",
    target: "question",
  },
  {
    id: "sample",
    title: "The sample",
    body: "Open the sample loads a towel shop through the same project file the desk uses for every save. It has a short brief and one answer. It has no secrets and no path from another machine.",
    target: "sample",
  },
  {
    id: "brief",
    title: "The brief",
    body: "Your answers become a Site Brief. Read it before brand work starts. If a line is wrong, say so. The Guide would rather be corrected than clever.",
    target: "transcript",
  },
  {
    id: "suggest",
    title: "Suggest for me",
    body: "Every question has Suggest for me. It writes a marked assumption from what it already knows. You can edit it, replace it, or keep it. A suggestion is never silent.",
    target: "question",
  },
  {
    id: "approval",
    title: "The approval step",
    body: "Approvals live on the Approvals page. A brief, a brand kit, and every build prompt wait there for a yes. The queue does not start without that yes.",
    target: "approve",
  },
  {
    id: "saves",
    title: "Where saves live",
    body: "Save project writes one pretty JSON file named after the project, with the extension hhproject. The usual place is your Desktop. If that folder is missing, the file goes in your home folder and the desk says where. The project bar names the file.",
    target: "project",
  },
];

export function renderTour(token: string): string {
  const steps = TOUR_STEPS.map((step, index) => {
    const hidden = index === 0 ? "" : " hidden";
    return `<li data-tour-step="${escapeHtml(step.id)}" data-tour-target="${escapeHtml(step.target)}"${hidden}>
      <h2 class="hh-title" id="hh-tour-title-${escapeHtml(step.id)}">${escapeHtml(step.title)}</h2>
      <p>${escapeHtml(step.body)}</p>
    </li>`;
  }).join("");
  return `<aside class="hh-tour" data-tour data-step="0" tabindex="0" aria-labelledby="hh-tour-heading">
    <p class="hh-kicker" id="hh-tour-heading">First five minutes</p>
    <ol class="hh-tour__steps">${steps}</ol>
    <p class="hh-small" data-tour-count>1 of ${TOUR_STEPS.length}</p>
    <div class="hh-qcard__actions">
      <button class="hh-btn hh-btn--ghost" type="button" data-tour-back data-tip="Goes back one step in the first five minutes.">Back</button>
      <button class="hh-btn hh-btn--secondary" type="button" data-tour-next data-tip="Goes to the next step in the first five minutes.">Next</button>
      <button class="hh-btn hh-btn--ghost" type="submit" form="hh-tour-skip" data-tip="Closes the tour and remembers that you saw it.">Skip tour</button>
    </div>
    <form id="hh-tour-skip" method="post" action="/api/tour">
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <input type="hidden" name="tour" value="seen" />
    </form>
    <form id="hh-tour-done" method="post" action="/api/tour" hidden>
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <input type="hidden" name="tour" value="seen" />
    </form>
  </aside>`;
}

export function renderReplayControl(token: string): string {
  return `<form method="post" action="/api/tour">
    <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
    <input type="hidden" name="tour" value="replay" />
    <button class="hh-btn hh-btn--ghost" type="submit" data-tip="Shows the first five minutes again.">Replay tour</button>
  </form>`;
}
