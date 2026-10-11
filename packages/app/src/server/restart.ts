/**
 * Restart returns the interview to the first question.
 * The project file is written first, in the same format `hh save` already uses.
 * interview.json stays version 1. STATE.md keeps its existing fields.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import {
  loadConfig,
  loadState,
  loadTree,
  questionsForDepth,
  replaceViaTemp,
  saveProjectFile,
  saveState,
  seedExpressAssumptions,
  withStateLock,
} from "@hitchhiker/engine";

function treeFile(projectDir: string): string {
  const local = path.join(projectDir, "interview", "tree.yaml");
  if (existsSync(local)) return local;
  return path.resolve(import.meta.dirname, "..", "..", "..", "..", "interview", "tree.yaml");
}

export async function restartInterview(projectDir: string): Promise<void> {
  await saveProjectFile(projectDir);
  const depth = loadConfig(projectDir).interviewDepth;
  const questions = questionsForDepth(loadTree(treeFile(projectDir)), depth);
  const first = questions[0];
  if (first === undefined) {
    throw new Error("The interview has no first question.");
  }
  const file = path.join(projectDir, ".hitchhiker", "interview.json");
  const body = `${JSON.stringify({ version: 1, answers: [], cursor: 0, pushedIds: [] }, null, 2)}\n`;
  await withStateLock(projectDir, async () => {
    await replaceViaTemp(file, body);
  });
  const state = loadState(projectDir);
  if (state !== null) {
    await saveState(projectDir, {
      ...state,
      promptId: `interview:${first.id}`,
      nextAction: `Answer ${first.id}.`,
      updatedAt: new Date().toISOString(),
    });
  }
  if (depth === "express") await seedExpressAssumptions(projectDir);
}
