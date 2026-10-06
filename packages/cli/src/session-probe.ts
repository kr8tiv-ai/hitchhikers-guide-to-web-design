/**
 * Classify `grok --help` text. This function does not spawn a process.
 *
 * A paragraph counts only when it spells the flag `--session-id` or `-s`.
 * The letters `session` inside `sessionStorage` are not that flag and are not evidence.
 * UUID: a case-insensitive `uuid` in the same paragraph as the flag.
 * Alias: the word `name` within 48 characters of `session` in such a paragraph,
 * and no uuid signal anywhere in the help. Both signals, or neither, return `unknown`.
 * `effortFlag` is true only when the text contains `--effort`.
 */
export function classifyHelp(helpText: string): {
  sessionIdMode: "unknown" | "uuid" | "alias";
  effortFlag: boolean;
} {
  let sawUuid = false;
  let sawAlias = false;
  for (const paragraph of paragraphsOf(helpText)) {
    if (!hasSessionFlag(paragraph)) continue;
    const readable = stripStorage(paragraph);
    if (/\buuid\b/i.test(readable)) sawUuid = true;
    if (nameNextToSession(readable)) sawAlias = true;
  }
  let sessionIdMode: "unknown" | "uuid" | "alias" = "unknown";
  if (sawUuid && !sawAlias) sessionIdMode = "uuid";
  else if (sawAlias && !sawUuid) sessionIdMode = "alias";
  return { sessionIdMode, effortFlag: helpText.includes("--effort") };
}

function paragraphsOf(helpText: string): string[] {
  return helpText.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split(/\n\s*\n/);
}

function stripStorage(text: string): string {
  return text.replace(/sessionStorage/gi, " ");
}

/** `--session-id`, or a standalone `-s`, not the `-s` inside a longer token. */
function hasSessionFlag(paragraph: string): boolean {
  if (/--session-id\b/i.test(paragraph)) return true;
  return /(?:^|[\s|,`(])-s(?=$|[\s|,=<])/m.test(paragraph);
}

function nameNextToSession(paragraph: string): boolean {
  const window = 48;
  for (const found of paragraph.matchAll(/session/gi)) {
    const index = found.index;
    if (index === undefined) continue;
    const from = Math.max(0, index - window);
    const to = Math.min(paragraph.length, index + "session".length + window);
    if (/\bname\b/i.test(paragraph.slice(from, to))) return true;
  }
  return false;
}
