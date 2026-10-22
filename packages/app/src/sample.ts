/**
 * The ready-to-open sample. The path is the repo file, not a machine path inside the JSON.
 */

import { shippedRepoFile } from "@hitchhiker/engine";

export const SAMPLE_LABEL = "Open the sample";

export function sampleProjectFile(): string {
  return shippedRepoFile("samples/towel-day.hhproject");
}
