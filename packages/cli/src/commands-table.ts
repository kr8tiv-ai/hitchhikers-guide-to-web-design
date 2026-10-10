/**
 * Unknown `hh` subcommands print this table on stderr and exit 2.
 * Implemented names are the dispatch switch in main.ts.
 * Skill-only names are read from packages/grok-plugin: a user-invocable
 * skill whose body says it is not implemented in the CLI.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Dispatch order. `dispatchImplemented` in main.ts switches on every name. */
export const IMPLEMENTED_COMMANDS = [
  "install",
  "app",
  "assets",
  "tools",
  "mostly-harmless",
  "elevate",
  "progress",
  "pause",
  "resume",
  "save",
  "doctor",
  "improve",
] as const;

export type ImplementedCommand = (typeof IMPLEMENTED_COMMANDS)[number];

const IMPLEMENTED = new Set<string>(IMPLEMENTED_COMMANDS);

const UNIMPLEMENTED_MARK = "not implemented";

export function isImplementedCommand(command: string): command is ImplementedCommand {
  return IMPLEMENTED.has(command);
}

function defaultSkillsDir(): string {
  return path.resolve(import.meta.dirname, "..", "..", "grok-plugin", "skills");
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function readSlashSkill(file: string): { name: string; skillOnly: boolean } | null {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---\n")) return null;
  const close = normalized.indexOf("\n---\n", 3);
  if (close < 0) return null;
  let name = "";
  let userInvocable = false;
  for (const line of normalized.slice(4, close).split("\n")) {
    if (line.startsWith("name:")) name = unquote(line.slice("name:".length).trim());
    else if (line.startsWith("user-invocable:")) {
      userInvocable = line.slice("user-invocable:".length).trim() === "true";
    }
  }
  if (!userInvocable || name.length === 0) return null;
  const body = normalized.slice(close + 5);
  return { name, skillOnly: body.includes(UNIMPLEMENTED_MARK) };
}

/** Order follows `SKILL_NAMES` in the plugin. Names missing there sort last. */
function readSkillNameOrder(commandsFile: string): readonly string[] {
  let text: string;
  try {
    text = readFileSync(commandsFile, "utf8");
  } catch {
    return [];
  }
  const marker = "export const SKILL_NAMES";
  const start = text.indexOf(marker);
  if (start < 0) return [];
  // Skip the `string[]` in the type. The array literal is the `[` after `=`.
  const equals = text.indexOf("=", start);
  if (equals < 0) return [];
  const open = text.indexOf("[", equals);
  const close = open < 0 ? -1 : text.indexOf("]", open + 1);
  if (open < 0 || close < 0) return [];
  const names: string[] = [];
  for (const match of text.slice(open + 1, close).matchAll(/"([^"]+)"/g)) {
    const name = match[1];
    if (name !== undefined && name.length > 0) names.push(name);
  }
  return names;
}

function compareNames(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Slash commands that have no `hh` subcommand. Derived from the plugin skills. */
export function skillOnlySlashCommands(skillsDir = defaultSkillsDir()): string[] {
  let entries;
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skill = readSlashSkill(path.join(skillsDir, entry.name, "SKILL.md"));
    if (skill?.skillOnly) names.push(skill.name);
  }
  const rank = new Map(
    readSkillNameOrder(path.resolve(skillsDir, "..", "src", "commands.ts")).map((name, index) => [
      name,
      index,
    ]),
  );
  names.sort((left, right) => {
    const leftRank = rank.get(left);
    const rightRank = rank.get(right);
    if (leftRank === undefined && rightRank === undefined) return compareNames(left, right);
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    return leftRank - rightRank;
  });
  return names;
}

function oneLine(value: string): string {
  const clean = value.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, " ").trim();
  return clean.length > 0 ? clean : "unknown";
}

/** Text table for an unknown subcommand. Ends with a newline. No doctor report. */
export function renderCommandTable(unknownCommand: string, skillsDir?: string): string {
  const skills = skillsDir === undefined ? skillOnlySlashCommands() : skillOnlySlashCommands(skillsDir);
  const commandLines = IMPLEMENTED_COMMANDS.flatMap((name) =>
    name === "improve" ? [`  hh ${name}`, "  hh improve supervise"] : [`  hh ${name}`],
  );
  const lines = [
    `Unknown command: ${oneLine(unknownCommand)}`,
    "",
    "Implemented commands",
    ...commandLines,
    "",
    "Skill-only slash commands",
  ];
  if (skills.length === 0) lines.push("  none found");
  else for (const name of skills) lines.push(`  /${name}`);
  return `${lines.join("\n")}\n`;
}
