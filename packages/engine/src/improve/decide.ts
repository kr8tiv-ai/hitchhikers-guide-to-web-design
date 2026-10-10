/** Keep only a strict improvement. A tie is a discard. */
export function decide(score: number, best: number): "keep" | "discard" {
  if (!Number.isFinite(score) || !Number.isFinite(best)) {
    throw new Error("score and best must be finite.");
  }
  return score > best ? "keep" : "discard";
}
