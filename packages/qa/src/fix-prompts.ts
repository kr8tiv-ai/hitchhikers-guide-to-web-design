/**
 * Fix prompts after a Zaphod FIX (prompt 126, verdict from 113).
 *
 * One to three prompts land in .hitchhiker/prompts/fix/. They run, then
 * the caller reviews again. Two rounds is the cap. The third review is
 * PASS_WITH_KNOWN_ISSUES or ESCALATE. A non-zero fix run escalates and
 * writes no further prompts. ESCALATE on the first review writes nothing.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReviewVerdict } from "./zaphod-vision.ts";

export interface FixLoopResult extends ReviewVerdict {
  filesWritten: string[];
  roundsRun: number;
}

function cleanInstruction(value: string): string {
  return value.replaceAll("!", ".").replaceAll("\u2014", "-").trim();
}

async function writeFixPrompts(
  projectDir: string,
  fixRound: 0 | 1,
  fixes: readonly string[],
): Promise<string[]> {
  const dir = path.join(projectDir, ".hitchhiker", "prompts", "fix");
  await mkdir(dir, { recursive: true });
  const instructions = fixes.slice(0, 3).map(cleanInstruction).filter((line) => line.length > 0);
  if (instructions.length === 0) {
    instructions.push("Address the review findings and keep the motion libraries already chosen.");
  }
  const files: string[] = [];
  const round = fixRound + 1;
  for (let index = 0; index < instructions.length; index += 1) {
    const instruction = instructions[index];
    if (instruction === undefined) continue;
    const id = `round-${round}-fix-${index + 1}`;
    const file = path.join(dir, `${id}.md`);
    const body = [
      "---",
      `id: ${id}`,
      "kind: build",
      "effort: high",
      "---",
      "",
      instruction,
      "Keep the motion libraries already chosen.",
      "",
    ].join("\n");
    await writeFile(file, body, "utf8");
    files.push(file);
  }
  return files;
}

export async function applyFixLoop(options: {
  projectDir: string;
  initial: ReviewVerdict;
  nextReview: (fixRound: 1 | 2) => Promise<ReviewVerdict>;
  runPrompt: (file: string) => Promise<number>;
}): Promise<FixLoopResult> {
  let current = options.initial;
  const filesWritten: string[] = [];
  let roundsRun = 0;
  while (current.verdict === "FIX" && current.fixRound < 2 && roundsRun < 2) {
    if (current.fixRound !== 0 && current.fixRound !== 1) break;
    roundsRun += 1;
    const written = await writeFixPrompts(options.projectDir, current.fixRound, current.fixes);
    filesWritten.push(...written);
    for (const file of written) {
      const code = await options.runPrompt(file);
      if (code !== 0) {
        return {
          ...current,
          verdict: "ESCALATE",
          reasons: [...current.reasons, `Fix prompt exited ${code}.`],
          filesWritten,
          roundsRun,
        };
      }
    }
    const next = current.fixRound + 1;
    if (next !== 1 && next !== 2) break;
    current = await options.nextReview(next);
  }
  return { ...current, filesWritten, roundsRun };
}
