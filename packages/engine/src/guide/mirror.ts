import type { think } from "../ai/think.ts";
import { MIRROR_SCHEMA, MIRROR_TASK, type Facts } from "./schemas.ts";
import { guideTextIssues, questionCount } from "./validators.ts";

/**
 * Every eight accepted answers, and at the end of a module.
 * Lines are statements. A question mark would break the one-question rule
 * once they are prefixed to the Guide message.
 */

export type MirrorCue = "cadence" | "module" | "both";

export function mirrorCue(
  accepted: number,
  answeredModule: string | null,
  nextModule: string | null,
): MirrorCue | null {
  const cadence = accepted > 0 && accepted % 8 === 0;
  const moduleEnd =
    nextModule === null || (answeredModule !== null && answeredModule !== nextModule);
  if (cadence && moduleEnd) return "both";
  if (cadence) return "cadence";
  if (moduleEnd && accepted > 0) return "module";
  return null;
}

export async function requestMirror(
  facts: Facts,
  cue: MirrorCue,
  deps: { think: typeof think; projectDir?: string; language?: string },
): Promise<[string, string, string] | null> {
  try {
    const result = await deps.think(
      {
        task: MIRROR_TASK,
        schema: MIRROR_SCHEMA,
        effort: "medium",
        input: [
          `Cue: ${cue}`,
          "Write exactly three lines of what you heard.",
          "No question mark. No exclamation mark. No invented proof.",
          "Facts:",
          renderFacts(facts),
        ].join("\n"),
      },
      deps.projectDir === undefined ? {} : { projectDir: deps.projectDir },
    );
    return cleanLines(result.value, facts, deps.language ?? "en");
  } catch {
    return null;
  }
}

function cleanLines(
  value: unknown,
  facts: Facts,
  language: string,
): [string, string, string] | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const lines = (value as { lines?: unknown }).lines;
  if (!Array.isArray(lines) || lines.length !== 3) return null;
  const clean: string[] = [];
  for (const line of lines) {
    if (typeof line !== "string") return null;
    if (questionCount(line) !== 0) return null;
    if (guideTextIssues(line, { language, facts }).length > 0) return null;
    clean.push(line);
  }
  const first = clean[0];
  const second = clean[1];
  const third = clean[2];
  if (first === undefined || second === undefined || third === undefined) return null;
  return [first, second, third];
}

function renderFacts(facts: Facts): string {
  const lines: string[] = [];
  for (const answer of facts.answers) lines.push(`${answer.id}: ${answer.value}`);
  if (facts.uploads.length > 0) lines.push(`Uploads: ${facts.uploads.join(", ")}`);
  if (facts.crawlNotes.length > 0) lines.push(`Crawl: ${facts.crawlNotes.join(", ")}`);
  if (facts.industry !== undefined) lines.push(`Industry: ${facts.industry}`);
  return lines.join("\n");
}
