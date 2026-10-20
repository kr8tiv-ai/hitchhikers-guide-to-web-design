/**
 * Re-implement without regression (BUG-058 idea 33).
 * Every Elevate and redesign prompt starts with the preserve sentence
 * and the lock list from idea 11. A run that omits the sentence does
 * not call the model. Idea 11 still enforces the lock in code.
 */

export const PRESERVE_FUNCTIONALITY =
  "Preserve all existing functionality unless the instruction says otherwise.";

const SECTION_TARGETS = ["type and spacing", "motion", "imagery", "copy", "standout feature"] as const;

export function lockListLine(lock: readonly string[]): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const raw of lock) {
    const name = raw.trim();
    if (name === "" || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  if (names.length === 0) return "Lock list: none.";
  return `Lock list: ${names.join(", ")}.`;
}

/** The prompt fixture. The sentence is first, then the lock list, then the instruction. */
export function withPreservePrompt(instruction: string, lock: readonly string[]): string {
  const body = instruction.replace(/^\uFEFF/, "").trim();
  return `${PRESERVE_FUNCTIONALITY}\n${lockListLine(lock)}\n\n${body}\n`;
}

export function preserveSentencePresent(prompt: string): boolean {
  return prompt.replace(/^\uFEFF/, "").startsWith(PRESERVE_FUNCTIONALITY);
}

/**
 * Call the model only when the prompt starts with the preserve sentence.
 * A missing sentence returns without calling.
 */
export async function callModelIfPreserved<T>(
  prompt: string,
  call: () => Promise<T>,
): Promise<{ called: false; value: null } | { called: true; value: T }> {
  if (!preserveSentencePresent(prompt)) return { called: false, value: null };
  const value = await call();
  return { called: true, value };
}

/** Elevate pick prompt. The target section is editable. The other sections are locked. */
export function elevatePickPrompt(section: string, instruction: string): string {
  const target = section.trim();
  const lock = SECTION_TARGETS.filter((name) => name !== target);
  return withPreservePrompt(instruction, lock);
}

/** Redesign prompt. `lock` is the idea 11 section list for this step. */
export function redesignPrompt(step: string, instruction: string, lock: readonly string[]): string {
  return withPreservePrompt(`Step: ${step.trim()}.\n${instruction.trim()}`, lock);
}

export async function runRedesignPrompt(
  step: string,
  instruction: string,
  lock: readonly string[],
  call: (prompt: string) => Promise<void>,
): Promise<{ called: boolean; prompt: string }> {
  const prompt = redesignPrompt(step, instruction, lock);
  const outcome = await callModelIfPreserved(prompt, () => call(prompt));
  return { called: outcome.called, prompt };
}
