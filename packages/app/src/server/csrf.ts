import { randomBytes, timingSafeEqual } from "node:crypto";

/** One token per process start. Callers embed it in HTML and require it on POST. */
export function issueToken(): string {
  return randomBytes(32).toString("hex");
}

/** Constant-time compare. A different length is a mismatch and does not throw. */
export function tokensMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}
