import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { rename, rm } from "node:fs/promises";

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk: Buffer | string) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      resolve();
    });
  });
  return hash.digest("hex");
}

/**
 * Rename `partial` onto `dest` when the SHA-256 matches.
 * A mismatch deletes the partial file and the destination, then throws
 * the expected and actual digests.
 */
export async function commitHashedFile(
  partial: string,
  dest: string,
  expected: string,
): Promise<void> {
  const actual = await sha256File(partial);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    await rm(partial, { force: true });
    await rm(dest, { force: true });
    throw new Error(`SHA-256 mismatch. Expected ${expected}. Actual ${actual}.`);
  }
  await rename(partial, dest);
}
