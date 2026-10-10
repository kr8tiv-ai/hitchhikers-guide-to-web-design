/**
 * Driver restart point from a portable project file.
 * Agrees with resumeFrom(0, last_done) in packages/qa/src/driver-plan.mjs.
 */

import { loadProjectFile, nextPromptId } from "@hitchhiker/engine";

export async function restartPointFromProjectFile(filePath: string): Promise<number> {
  const loaded = await loadProjectFile(filePath);
  if (loaded.file === null) {
    throw new Error(loaded.message ?? "The project file could not be read.");
  }
  return nextPromptId(loaded.file.queue.lastDone);
}

export { nextPromptId };
