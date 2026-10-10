/**
 * Short text the owner can paste to any coding agent.
 * It names the file, the next step, and the rules. No vendor wording.
 */

import type { ProjectDraft } from "./schema.ts";
import { scrubText } from "./scrub.ts";

export function renderResumePrompt(draft: ProjectDraft, filePath: string): string {
  const next = draft.state?.nextAction || draft.queue.currentPrompt || draft.interview.currentQuestionId || "Read the project file and wait.";
  const text = [
    "Read the project file first. It is pretty-printed JSON. The resumeMd field is the plain-language brief. Read that field before you change anything.",
    "",
    `Project file: ${filePath}`,
    `Project: ${draft.projectName}`,
    `Next: ${next}`,
    "",
    "Rules: do not skip an approval gate, do not add secrets, do not push unless the owner asked, and quote Windows paths that contain spaces.",
    "",
    "Then do the next step named above. This file is enough for any coding agent.",
    "",
  ].join("\n");
  return scrubText(text);
}
