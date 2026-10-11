/**
 * The ready-to-open sample. The path is the repo file, not a machine path inside the JSON.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

export const SAMPLE_LABEL = "Open the sample";

export function sampleProjectFile(): string {
  return path.resolve(fileURLToPath(new URL("../../../samples/towel-day.hhproject", import.meta.url)));
}
