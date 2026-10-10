/**
 * Record an explicit yes beside the project. A missing file stays a missing yes.
 * Callers invoke this only after the person said yes.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { replaceViaTemp } from "../lock.ts";
import { autosaveProject } from "./autosave.ts";

export type YesFile = "brief-yes.json" | "elevate-yes.json" | "hostinger-yes.json";

export async function recordApprovalYes(
  projectDir: string,
  name: YesFile,
  at: string = new Date().toISOString(),
): Promise<void> {
  const dir = path.join(projectDir, ".hitchhiker");
  await mkdir(dir, { recursive: true });
  await replaceViaTemp(
    path.join(dir, name),
    `${JSON.stringify({ approved: true, at })}\n`,
  );
  await autosaveProject(projectDir);
}
