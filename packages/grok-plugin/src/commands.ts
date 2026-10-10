/**
 * Guide commands that the hh CLI actually implements.
 * The regex follows equality checks and switch cases in packages/cli/src/main.ts,
 * including `parsed.cmd` and `case "app":`.
 * Skills with no row here are not CLI subcommands yet.
 */

export interface HhCommand {
  name: string;
  skillDir: string;
  cli: string[];
  sideEffect: boolean;
}

export const COMMANDS: readonly HhCommand[] = [
  { name: "install", skillDir: "", cli: ["install"], sideEffect: false },
  { name: "app", skillDir: "hh-dashboard", cli: ["app"], sideEffect: false },
  { name: "assets", skillDir: "hh-assets", cli: ["assets"], sideEffect: true },
  { name: "tools", skillDir: "", cli: ["tools"], sideEffect: false },
  { name: "mostly-harmless", skillDir: "hh-mostly-harmless", cli: ["mostly-harmless"], sideEffect: false },
  { name: "elevate", skillDir: "hh-elevate", cli: ["elevate"], sideEffect: false },
  { name: "progress", skillDir: "hh-progress", cli: ["progress"], sideEffect: false },
  { name: "pause", skillDir: "hh-pause", cli: ["pause"], sideEffect: false },
  { name: "resume", skillDir: "hh-resume", cli: ["resume"], sideEffect: false },
  { name: "doctor", skillDir: "hh-doctor", cli: ["doctor"], sideEffect: false },
];

/** Slash-command skills from v2 section 18, in that order. */
export const SKILL_NAMES: readonly string[] = [
  "hh-new",
  "hh-dont-panic",
  "hh-import",
  "hh-babel-fish",
  "hh-logo",
  "hh-assets",
  "hh-deep-thought",
  "hh-drive",
  "hh-review",
  "hh-fix",
  "hh-mostly-harmless",
  "hh-elevate",
  "hh-so-long",
  "hh-progress",
  "hh-pause",
  "hh-resume",
  "hh-undo",
  "hh-budget",
  "hh-settings",
  "hh-doctor",
  "hh-dashboard",
  "hh-help",
];

/** The model must not invoke these. The user types the slash command. */
export const SIDE_EFFECT_SKILLS: readonly string[] = [
  "hh-drive",
  "hh-so-long",
  "hh-assets",
  "hh-undo",
];

const CLI_SUBCOMMAND = /(?:(?:command|cmd|argv\[0\]) (?:===|!==)|case) "([a-z][a-z0-9-]*)"/g;

const ALLOWED_KEYS = new Set([
  "name",
  "description",
  "when-to-use",
  "when_to_use",
  "paths",
  "allowed-tools",
  "argument-hint",
  "user-invocable",
  "disable-model-invocation",
  "metadata",
  "model",
  "effort",
  "license",
  "compatibility",
]);

const BLOCK_SCALAR = new Set([">", "|", ">-", "|-", ">+", "|+"]);

const UNIMPLEMENTED = "This command is not implemented in the hh CLI yet. Use /hh-help.";

const USER_TYPED = "Run this only when the user typed the slash command.";

const REQUIRED_PHRASES = [
  "Never push.",
  "Never deploy.",
  "Never spend without the user's yes.",
] as const;

const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])$/;

export function cliSubcommandsFromSource(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(CLI_SUBCOMMAND)) {
    const name = match[1];
    if (name !== undefined) found.add(name);
  }
  return [...found].sort();
}

function push(errors: string[], message: string): void {
  if (!errors.includes(message)) errors.push(message);
}

/**
 * Check one SKILL.md. Keys are the documented skill frontmatter fields.
 * Extra keys are rejected. Only literal boolean true counts as user-invocable.
 */
export function validateSkill(md: string): string[] {
  const errors: string[] = [];
  const text = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (text.includes("!")) push(errors, "exclamation mark");
  if (text.includes("\u2014")) push(errors, "em dash");
  if (!text.startsWith("---\n")) {
    push(errors, "missing frontmatter");
    return errors;
  }
  const close = text.indexOf("\n---\n", 3);
  if (close === -1) {
    push(errors, "frontmatter is not closed");
    return errors;
  }
  const fields = new Map<string, string | boolean>();
  for (const line of text.slice(4, close).split("\n")) {
    if (line.trim() === "") continue;
    if (/^\s/.test(line)) {
      push(errors, "frontmatter must be scalar");
      continue;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) {
      push(errors, "frontmatter must be scalar");
      continue;
    }
    const key = line.slice(0, colon).trim();
    const rawValue = line.slice(colon + 1).trim();
    if (!ALLOWED_KEYS.has(key)) {
      push(errors, `unknown frontmatter key: ${key}`);
      continue;
    }
    if (fields.has(key)) {
      push(errors, `duplicate frontmatter key: ${key}`);
      continue;
    }
    if (BLOCK_SCALAR.has(rawValue)) {
      push(errors, "frontmatter must be scalar");
      continue;
    }
    let value: string | boolean = rawValue;
    if (rawValue === "true") value = true;
    else if (rawValue === "false") value = false;
    else if (
      (rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.length >= 2) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'") && rawValue.length >= 2)
    ) {
      value = rawValue.slice(1, -1);
    }
    fields.set(key, value);
  }

  const nameValue = fields.get("name");
  const name = typeof nameValue === "string" ? nameValue : "";
  if (name.length < 2 || name.length > 64 || !NAME_RE.test(name)) {
    push(errors, "name is invalid");
  }
  const description = fields.get("description");
  if (typeof description !== "string" || description.length === 0 || description.includes("\n")) {
    push(errors, "description must be one plain line");
  }

  if (!SKILL_NAMES.includes(name)) return errors;

  if (fields.get("user-invocable") !== true) {
    push(errors, "user-invocable must be true");
  }
  const body = text.slice(close + 5);
  const sideEffect = SIDE_EFFECT_SKILLS.includes(name);
  const disabled = fields.get("disable-model-invocation");
  if (sideEffect) {
    if (disabled !== true) push(errors, "disable-model-invocation must be true");
    if (!body.includes(USER_TYPED)) push(errors, `missing phrase: ${USER_TYPED}`);
  } else if (disabled === true) {
    push(errors, "disable-model-invocation must stay unset");
  }
  for (const phrase of REQUIRED_PHRASES) {
    if (!body.includes(phrase)) push(errors, `missing phrase: ${phrase}`);
  }

  const command = COMMANDS.find((item) => item.skillDir === name);
  if (command !== undefined) {
    const form = `hh ${command.cli[0] ?? ""}`;
    if (!body.includes(form)) push(errors, `missing cli form: ${form}`);
    if (body.includes("not implemented")) push(errors, "must not say not implemented");
  } else if (name === "hh-help") {
    if (!body.includes("not implemented")) push(errors, "missing phrase: not implemented");
    for (const item of COMMANDS) {
      const form = `hh ${item.cli[0] ?? ""}`;
      if (!body.includes(form)) push(errors, `missing cli form: ${form}`);
    }
  } else if (!body.includes(UNIMPLEMENTED)) {
    push(errors, `missing phrase: ${UNIMPLEMENTED}`);
  }
  return errors;
}
