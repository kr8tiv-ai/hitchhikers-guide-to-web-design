/**
 * Plain-language brief for any coding agent.
 * No vendor names, no exclamation marks, no em dashes.
 */

import type { ProjectDraft } from "./schema.ts";
import { scrubText } from "./scrub.ts";

function line(label: string, value: string | null | undefined): string {
  const text = value === undefined || value === null || value.trim().length === 0 ? "Not stated yet." : value.trim();
  return `- ${label}: ${text}`;
}

function answerValue(draft: ProjectDraft, id: string): string | null {
  for (const answer of draft.interview.answers) {
    if (answer.id === id && answer.value.trim().length > 0) return answer.value.trim();
  }
  return null;
}

function gate(name: string, approved: boolean, at: string | null): string {
  if (!approved) return `- ${name}: not approved. Leave it unapproved.`;
  return `- ${name}: approved${at ? ` at ${at}` : ""}.`;
}

export function progressLabel(draft: ProjectDraft): string {
  const { index, total } = draft.interview;
  if (index !== null && total !== null && total > 0) return `question ${index} of ${total}`;
  if (draft.queue.items.length > 0) {
    const current = draft.queue.items.find((item) => item.status === "queued" || item.status === "running");
    const at = current === undefined
      ? draft.queue.items.filter((item) => item.status === "passed" || item.status === "escalated").length
      : draft.queue.items.indexOf(current) + 1;
    return `prompt ${at} of ${draft.queue.items.length}`;
  }
  return "not started";
}

export function renderResumeMd(draft: ProjectDraft, filePath: string): string {
  const who = answerValue(draft, "DP-0.1");
  const goal = answerValue(draft, "DP-2.1");
  const next = draft.state?.nextAction || draft.queue.currentPrompt || draft.interview.currentQuestionId;
  const assumptions = draft.interview.answers.filter((answer) => answer.assumption);
  const assumptionLines =
    assumptions.length === 0
      ? "- None recorded."
      : assumptions.map((answer) => `- ${answer.id} (${answer.status}): ${answer.value}`).join("\n");
  const done =
    draft.interview.answers.length === 0 && draft.queue.lastDone.length === 0
      ? "- Nothing is stored yet."
      : [
          `- Interview answers stored: ${draft.interview.answers.length}.`,
          `- Progress: ${progressLabel(draft)}.`,
          draft.queue.lastDone.length > 0 ? `- Last finished build prompt: ${draft.queue.lastDone}.` : "- No build prompt is finished.",
        ].join("\n");
  const blockers =
    draft.queue.blockers.length === 0
      ? "- None."
      : draft.queue.blockers.map((item) => `- ${item}`).join("\n");
  const body = [
    `# ${draft.projectName}`,
    "",
    "This note is for a person or any coding agent picking up the project. Read it before changing files.",
    "",
    "## What this project is",
    "",
    line("Name", draft.projectName),
    line("Who it is for", who),
    line("Why it exists", goal),
    line("Project id", draft.projectId),
    "",
    "## What is done",
    "",
    done,
    "",
    "## Assumptions",
    "",
    "These were not confirmed by the owner. Keep them marked as assumptions.",
    "",
    assumptionLines,
    "",
    "## Approvals",
    "",
    "An unapproved item stays unapproved. Do not mark a gate yourself.",
    "",
    gate("Brief", draft.brief.approval.approved, draft.brief.approval.at),
    gate("Brand", draft.brand.approval.approved, draft.brand.approval.at),
    gate("PRD", draft.prd.approval.approved, draft.prd.approval.at),
    gate("Prompt package", draft.promptPackage.approval.approved, draft.promptPackage.approval.at),
    gate("Second pass", draft.elevate.approved, draft.elevate.at),
    gate("Hostinger", draft.hostinger.approved, draft.hostinger.at),
    "",
    "## What is next",
    "",
    line("Next step", next),
    line("Current question", draft.interview.currentQuestionId),
    line("Current build prompt", draft.queue.currentPrompt),
    "",
    "Blockers:",
    "",
    blockers,
    "",
    "## How to run it",
    "",
    "From the repo that contains this app:",
    "",
    "```",
    "pnpm install",
    `pnpm exec hh app --project "${draft.sourceDir}"`,
    `pnpm exec hh resume "${filePath}"`,
    "```",
    "",
    "## Rules",
    "",
    "- Do not skip an approval gate. Brief, brand, PRD, prompt package, the second pass, and a Hostinger yes each stay as they were.",
    "- Do not put secrets, API keys, tokens, passwords, cookies, or .env contents in files, logs, or commits.",
    "- Do not push unless the owner asked. Do not deploy unless the owner said yes.",
    "- Windows paths may contain spaces. Quote them.",
    "- The anti-slop rules still apply: no purple-to-blue gradients, no magnetic buttons, no placeholder copy, and no exclamation marks in the product UI.",
    "",
    "## Where the full state lives",
    "",
    `- Portable file: ${filePath}`,
    `- Project folder: ${draft.sourceDir}`,
    `- State inside the project: ${draft.sourceDir}/.hitchhiker/`,
    "",
    "The portable file is enough to resume. After resume, the same state is in the project folder.",
    "",
  ].join("\n");
  return scrubText(body);
}
