/**
 * Classify `grok --help` text. This function does not spawn a process.
 *
 * A paragraph counts only when it spells the flag `--session-id` or `-s`.
 * The letters `session` inside `sessionStorage` are not that flag and are not evidence.
 * UUID: a case-insensitive `uuid` in the same paragraph as the flag.
 * Alias: the word `name` within 48 characters of `session` in such a paragraph,
 * and no uuid signal anywhere in the help. Both signals, or neither, return `unknown`.
 * `effortFlag` is true only when the text contains `--effort`.
 * `authStatusFlag` is a bare auth status flag the help documents, or null.
 * `login`, `logout`, and `--oauth` are never that flag. A missing flag is not a guess.
 */
export function classifyHelp(helpText: string): {
  sessionIdMode: "unknown" | "uuid" | "alias";
  effortFlag: boolean;
  authStatusFlag: string | null;
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
  return {
    sessionIdMode,
    effortFlag: helpText.includes("--effort"),
    authStatusFlag: findAuthStatusFlag(helpText),
  };
}

/**
 * Read a status-flag stdout and stderr. Signed-out is tested first so
 * "not signed in" is not read as signed-in. Anything else is unknown.
 */
export function classifyAuthStatus(text: string): "signed-in" | "signed-out" | "unknown" {
  const readable = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (signedOut(readable)) return "signed-out";
  if (signedIn(readable)) return "signed-in";
  return "unknown";
}

/**
 * The first bare auth status flag in help. `--auth-status` qualifies by name.
 * Any other `*-status` flag qualifies only when that paragraph states a signed
 * or logged state. Two status flags in one paragraph are ambiguous and are skipped.
 */
function findAuthStatusFlag(helpText: string): string | null {
  for (const paragraph of paragraphsOf(helpText)) {
    const hits = uniqueFlags(
      bareLongFlags(paragraph).filter((flag) => isAuthStatusFlag(flag, paragraph)),
    );
    const hit = hits[0];
    if (hit === undefined || hits.length !== 1) continue;
    return hit;
  }
  return null;
}

function uniqueFlags(flags: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const flag of flags) {
    const key = flag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(flag);
  }
  return unique;
}

function bareLongFlags(paragraph: string): string[] {
  const flags: string[] = [];
  for (const match of paragraph.matchAll(/--[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g)) {
    const flag = match[0];
    const index = match.index;
    if (index === undefined) continue;
    const before = index === 0 ? "" : paragraph.charAt(index - 1);
    if (before !== "" && !/[\s|,`(]/.test(before)) continue;
    const after = paragraph.slice(index + flag.length);
    if (!isBareFlagEnd(after)) continue;
    flags.push(flag);
  }
  return flags;
}

function isBareFlagEnd(after: string): boolean {
  if (after.length === 0) return true;
  const first = after.charAt(0);
  if (!/[\s|,`)\]]/.test(first)) return false;
  const rest = after.trimStart();
  return !rest.startsWith("<") && !rest.startsWith("[") && !rest.startsWith("=");
}

function isAuthStatusFlag(flag: string, paragraph: string): boolean {
  const name = flag.toLowerCase();
  if (name === "--oauth" || name === "--login" || name === "--logout") return false;
  if (/^--auth(?:-[a-z0-9]+)*-status$/.test(name)) return true;
  if (name !== "--status" && !name.endsWith("-status")) return false;
  return mentionsSignedState(paragraph);
}

function mentionsSignedState(paragraph: string): boolean {
  return (
    /\bsigned[- ](?:in|out)\b/i.test(paragraph) ||
    /\blogged[- ](?:in|out)\b/i.test(paragraph) ||
    /\bauthenticated\b/i.test(paragraph) ||
    /\bunauthenticated\b/i.test(paragraph)
  );
}

function signedOut(text: string): boolean {
  return (
    /\bnot signed[- ]in\b/i.test(text) ||
    /\bsigned[- ]out\b/i.test(text) ||
    /\bnot logged[- ]in\b/i.test(text) ||
    /\blogged[- ]out\b/i.test(text) ||
    /\bnot authenticated\b/i.test(text) ||
    /\bunauthenticated\b/i.test(text)
  );
}

function signedIn(text: string): boolean {
  return (
    /\bsigned[- ]in\b/i.test(text) ||
    /\blogged[- ]in\b/i.test(text) ||
    /\bauthenticated\b/i.test(text)
  );
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
