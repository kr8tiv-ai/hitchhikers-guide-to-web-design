import { createHash } from "node:crypto";
import { normalizeRepoPath } from "./protected.ts";

/** Stable sha256 of evaluation inputs. Order does not matter. */
export function hashFiles(files: readonly { path: string; body: string }[]): string {
  const hash = createHash("sha256");
  const sorted = [...files].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  for (const file of sorted) {
    hash.update(normalizeRepoPath(file.path));
    hash.update("\0");
    hash.update(file.body);
    hash.update("\0");
  }
  return hash.digest("hex");
}
