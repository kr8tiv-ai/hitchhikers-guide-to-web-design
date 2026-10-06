/**
 * Strip API keys, bearer tokens, and email addresses before a log line or
 * error is written. The replacement is a fixed marker so callers can assert
 * the original secret is gone.
 */
export function redact(text: string): string {
  return text
    .replace(/\b[Bb]earer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]")
    .replace(/\bxai-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(
      /\b(?:api[_-]?key|apikey|access[_-]?token|secret)\b\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{8,}/gi,
      "[REDACTED]",
    )
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED]");
}
