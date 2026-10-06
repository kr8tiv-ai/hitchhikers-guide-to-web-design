import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { replaceViaTemp, withStateLock } from "./lock.ts";

export interface GuideState {
  phase: string;
  slice: string;
  promptId: string;
  lastGoodCommit: string;
  blockers: string[];
  nextAction: string;
  updatedAt: string;
}

const TEXT_FIELDS = [
  ["Phase", "phase"],
  ["Slice", "slice"],
  ["Prompt id", "promptId"],
  ["Last good commit", "lastGoodCommit"],
  ["Next action", "nextAction"],
  ["Updated at", "updatedAt"],
] as const;

type TextKey = (typeof TEXT_FIELDS)[number][1];

function section(heading: string, body: string): string {
  return `## ${heading}\n\n${body}\n\n`;
}

function renderState(state: GuideState): string {
  const blockers = state.blockers.map((item) => `- ${item}`).join("\n");
  return (
    "# Guide state\n\n" +
    section("Phase", state.phase) +
    section("Slice", state.slice) +
    section("Prompt id", state.promptId) +
    section("Last good commit", state.lastGoodCommit) +
    section("Blockers", blockers) +
    section("Next action", state.nextAction) +
    section("Updated at", state.updatedAt)
  );
}

function unwrap(raw: string): string {
  let start = 0;
  let end = raw.length;
  for (let count = 0; count < 2 && raw.charAt(start) === "\n"; count += 1) {
    start += 1;
  }
  for (
    let count = 0;
    count < 2 && end > start && raw.charAt(end - 1) === "\n";
    count += 1
  ) {
    end -= 1;
  }
  return raw.slice(start, end);
}

function parseBlockers(body: string): string[] {
  if (body.length === 0) return [];
  const items: string[] = [];
  for (const line of body.split("\n")) {
    if (line.length === 0) continue;
    if (!line.startsWith("- ")) {
      throw new Error("STATE.md blocker is not a bullet.");
    }
    items.push(line.slice(2));
  }
  return items;
}

function parseState(markdown: string): GuideState {
  const text = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const matches = [...text.matchAll(/^## (.+)$/gm)];
  const bodies = new Map<string, string>();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match === undefined || match.index === undefined) continue;
    const title = match[1]?.trim();
    if (title === undefined || title.length === 0) continue;
    const start = match.index + match[0].length;
    const next = matches[index + 1];
    const end = next?.index ?? text.length;
    bodies.set(title, unwrap(text.slice(start, end)));
  }

  const textValues = {} as Record<TextKey, string>;
  for (const [heading, key] of TEXT_FIELDS) {
    const body = bodies.get(heading);
    if (body === undefined) {
      throw new Error(`STATE.md is missing heading: ${heading}`);
    }
    textValues[key] = body;
  }
  const blockerBody = bodies.get("Blockers");
  if (blockerBody === undefined) {
    throw new Error("STATE.md is missing heading: Blockers");
  }

  return {
    phase: textValues.phase,
    slice: textValues.slice,
    promptId: textValues.promptId,
    lastGoodCommit: textValues.lastGoodCommit,
    blockers: parseBlockers(blockerBody),
    nextAction: textValues.nextAction,
    updatedAt: textValues.updatedAt,
  };
}

function statePath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "STATE.md");
}

/** Read `.hitchhiker/STATE.md`. A missing file returns null. */
export function loadState(projectDir: string): GuideState | null {
  const filePath = statePath(projectDir);
  if (!existsSync(filePath)) return null;
  return parseState(readFileSync(filePath, "utf8"));
}

/**
 * Write `.hitchhiker/STATE.md` under `state.lock`.
 * The markdown is a short heading document, renamed over the target from a temp file.
 */
export async function saveState(
  projectDir: string,
  state: GuideState,
): Promise<void> {
  await withStateLock(projectDir, async () => {
    await replaceViaTemp(statePath(projectDir), renderState(state));
  });
}
