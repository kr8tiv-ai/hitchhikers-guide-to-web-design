/**
 * Shared reading of a grok failure. Billing is a pause, not a retry.
 * A 429 stays a rate limit. Ordinary exits stay ordinary.
 */

export const BILLING_TOP_UP =
  "Your Grok Build usage balance is used up. Top up your balance, then press Retry.";

export type GrokFailureKind = "billing" | "rate-limit" | "ordinary";

export class GrokBillingError extends Error {
  readonly kind = "billing" as const;

  constructor() {
    super(BILLING_TOP_UP);
    this.name = "GrokBillingError";
  }
}

const BILLING_PATTERNS = [
  /payment required/i,
  /usage balance exhausted/i,
  /insufficient\s+(?:balance|credits)/i,
  /out of credits/i,
  /\(status\s+402\b/i,
  /\b402\s+payment required\b/i,
  /(?:\bhttp(?:_status|_code)?\b|\bstatus\b|\bcode\b)[^\d]{0,24}\b402\b/i,
];

const RATE_LIMIT = /usage limit|rate limit|too many requests|\b429\b|quota exceeded/i;

export function classifyGrokFailure(parts: {
  stdout?: string;
  stderr?: string;
  stream?: string;
  code?: number | null;
}): { kind: GrokFailureKind } {
  const blob = `${parts.stream ?? ""}\n${parts.stderr ?? ""}\n${parts.stdout ?? ""}`;
  if (BILLING_PATTERNS.some((pattern) => pattern.test(blob))) return { kind: "billing" };
  if (RATE_LIMIT.test(blob)) return { kind: "rate-limit" };
  return { kind: "ordinary" };
}

export function isBillingFailure(error: unknown): boolean {
  if (error instanceof GrokBillingError) return true;
  if (typeof error === "object" && error !== null && "kind" in error) {
    if ((error as { kind?: unknown }).kind === "billing") return true;
  }
  if (error instanceof Error) return classifyGrokFailure({ stderr: error.message }).kind === "billing";
  return false;
}

const JSON_PROPERTY = /"[A-Za-z0-9_$-]+"\s*:\s*(?:\{|\[|"|-?\d|true|false|null\b)/;

/** A line that is only a JSON fragment. Human sentences stay. */
export function isRawJsonLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return false;
  if (/^[{}\[\],\s]+$/.test(trimmed)) return true;
  if (trimmed.startsWith('{"') || trimmed.startsWith("[{")) return true;
  if (/^"[^"]*"\s*:/.test(trimmed)) return true;
  if (JSON_PROPERTY.test(trimmed)) return true;
  const outside = trimmed.replace(/"(?:\\.|[^"\\])*"/g, "").replace(/\b(?:true|false|null)\b/g, "");
  return /[{}]/.test(trimmed) && !/[A-Za-z]/.test(outside);
}

/**
 * A reason the desk can show. JSON lines are dropped. Braces are removed.
 * An empty result uses the fallback, which is also stripped of braces.
 */
export function sanitizeFailureReason(text: string, fallback: string): string {
  const kept: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (isRawJsonLine(line)) continue;
    const words = line.replace(/[{}]/g, " ").replace(/\s+/g, " ").trim();
    if (words === "") continue;
    kept.push(words);
  }
  const sentence = kept.join(" ").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
  if (sentence !== "") return sentence;
  return fallback.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}
