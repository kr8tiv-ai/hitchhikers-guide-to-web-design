/**
 * Phrases that must not appear in a generated site prompt or a golden template.
 * A match is a blanket ban: it tells Grok not to use a library, not to place
 * an image, or not to add more than a fixed count of upgrades.
 */

export const LIBRARY_BAN_PATTERNS: readonly RegExp[] = [
  /no effect library/i,
  /import no effect library/i,
  /leave a TODO if none was supplied/i,
  /do not invent a photo/i,
  /at most eight/i,
  /already owns/i,
  /leave a TODO for the later motion prompt/i,
  /import only the libraries/i,
  /import only \{\{library\}\}/i,
  /only the libraries/i,
  /no libraries/i,
];

export function libraryBanHits(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of LIBRARY_BAN_PATTERNS) {
    if (pattern.test(text)) hits.push(pattern.source);
  }
  return hits;
}

/**
 * One do-not line for VISUAL-CONSTITUTION.md.
 * It names the prompt bans without using a phrase LIBRARY_BAN_PATTERNS matches,
 * so the constitution can sit at the top of a build prompt.
 */
export const PROMPT_BAN_CONSTITUTION_LINE =
  "Do not ban a library, cap upgrades, or invent a photo the owner did not give.";
