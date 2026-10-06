import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type SpineTemplateName =
  | "project"
  | "requirements"
  | "roadmap"
  | "state"
  | "config"
  | "context"
  | "phase-prompt"
  | "summary"
  | "verification-report"
  | "spec";

const SPINE_TEMPLATE_NAMES: readonly SpineTemplateName[] = [
  "project",
  "requirements",
  "roadmap",
  "state",
  "config",
  "context",
  "phase-prompt",
  "summary",
  "verification-report",
  "spec",
];

const FILE_BY_NAME: Record<SpineTemplateName, string> = {
  project: "project.md",
  requirements: "requirements.md",
  roadmap: "roadmap.md",
  state: "state.md",
  config: "config.json",
  context: "context.md",
  "phase-prompt": "phase-prompt.md",
  summary: "summary.md",
  "verification-report": "verification-report.md",
  spec: "spec.md",
};

export class TemplateError extends Error {
  readonly tokens: readonly string[];

  constructor(tokens: readonly string[]) {
    const listed = tokens.map((token) => `{{${token}}}`).join(", ");
    super(`Unknown template token: ${listed}`);
    this.name = "TemplateError";
    this.tokens = tokens;
  }
}

function templateDirFromModule(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "templates",
    "gsd",
  );
}

function unknownTokens(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)) {
    const token = match[1];
    if (token !== undefined && !seen.has(token)) {
      seen.add(token);
      found.push(token);
    }
  }
  return found;
}

/**
 * Reads a spine template next to this module and replaces `{{token}}`.
 * A token with no variable, or one left after substitution, throws TemplateError.
 */
export function renderTemplate(
  name: SpineTemplateName,
  vars: Record<string, string>,
): string {
  const filePath = path.join(templateDirFromModule(), FILE_BY_NAME[name]);
  const raw = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const missing = unknownTokens(raw).filter(
    (token) => !Object.prototype.hasOwnProperty.call(vars, token),
  );
  if (missing.length > 0) {
    throw new TemplateError(missing);
  }
  const replaced = raw.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_full, token: string) => {
    const value = vars[token];
    return value ?? "";
  });
  const leftover = unknownTokens(replaced);
  if (leftover.length > 0) {
    throw new TemplateError(leftover);
  }
  return replaced;
}

function resolveSpineDir(root: string): string {
  const candidates = [
    path.join(root, "templates", "gsd"),
    path.join(root, "packages", "engine", "templates", "gsd"),
    root,
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, FILE_BY_NAME.project))) {
      return candidate;
    }
  }
  throw new Error(`Spine templates not found under ${root}`);
}

export function listSpineTemplates(root: string): SpineTemplateName[] {
  const dir = resolveSpineDir(root);
  return SPINE_TEMPLATE_NAMES.filter((name) =>
    existsSync(path.join(dir, FILE_BY_NAME[name])),
  );
}
