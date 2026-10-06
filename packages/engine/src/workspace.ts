import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface WorkspacePackage {
  name: string;
  dir: string;
}

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}

/**
 * npm names for the twelve packages in CONTEXT-PACKAGE.v2.md section 19.
 * packages/cli is published as hitchhikers-guide. Every other package is @hitchhiker/<folder>.
 */
export const EXPECTED_PACKAGES: readonly string[] = [
  "@hitchhiker/engine",
  "@hitchhiker/orchestrator",
  "@hitchhiker/grok-plugin",
  "@hitchhiker/app",
  "hitchhikers-guide",
  "@hitchhiker/voice",
  "@hitchhiker/crawler",
  "@hitchhiker/assets",
  "@hitchhiker/qa",
  "@hitchhiker/deploy",
  "@hitchhiker/knowledge",
  "@hitchhiker/templates",
];

const WORKSPACE_GLOB = "packages/*";
const CLI_DIR = path.normalize("packages/cli");
const CLI_NAME = "hitchhikers-guide";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read the packages: list. Enough to confirm the packages/* glob. Not a YAML parser. */
function readWorkspaceGlobs(root: string): string[] {
  const yamlPath = path.join(root, "pnpm-workspace.yaml");
  let text: string;
  try {
    text = readFileSync(yamlPath, "utf8");
  } catch {
    throw new WorkspaceError(`Cannot read ${yamlPath}`);
  }

  const globs: string[] = [];
  let inPackages = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    if (!rawLine.startsWith(" ") && !rawLine.startsWith("\t") && !trimmed.startsWith("-")) {
      inPackages = /^packages\s*:/.test(trimmed);
      continue;
    }
    if (!inPackages) {
      continue;
    }
    const match = /^-\s+["']?(.+?)["']?\s*$/.exec(trimmed);
    const glob = match?.[1];
    if (glob !== undefined && glob.length > 0) {
      globs.push(glob);
    }
  }

  if (!globs.includes(WORKSPACE_GLOB)) {
    throw new WorkspaceError(
      `pnpm-workspace.yaml must list the ${WORKSPACE_GLOB} glob`,
    );
  }
  return globs;
}

function readPackageJson(pkgPath: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(pkgPath, "utf8");
  } catch {
    throw new WorkspaceError(`Cannot read ${pkgPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new WorkspaceError(`Invalid JSON in ${pkgPath}`);
  }
  if (!isRecord(parsed)) {
    throw new WorkspaceError(`Package manifest is not an object: ${pkgPath}`);
  }
  return parsed;
}

/**
 * Read pnpm-workspace.yaml and each package.json under packages.
 * Throw if a name is not @hitchhiker-scoped (packages/cli is `hitchhikers-guide`),
 * if private is not true (packages/cli is the one exception),
 * or if the on-disk set differs from EXPECTED_PACKAGES.
 * A directory under packages with no package.json is ignored.
 */
export function listWorkspacePackages(root: string): WorkspacePackage[] {
  readWorkspaceGlobs(root);

  const packagesDir = path.join(root, "packages");
  let entries: string[];
  try {
    entries = readdirSync(packagesDir);
  } catch {
    throw new WorkspaceError(`Cannot read ${packagesDir}`);
  }

  const found: WorkspacePackage[] = [];
  for (const entry of entries) {
    const dirAbs = path.join(packagesDir, entry);
    let isDirectory = false;
    try {
      isDirectory = statSync(dirAbs).isDirectory();
    } catch {
      continue;
    }
    if (!isDirectory) {
      continue;
    }

    const pkgPath = path.join(dirAbs, "package.json");
    let manifest: Record<string, unknown>;
    try {
      manifest = readPackageJson(pkgPath);
    } catch (error) {
      if (error instanceof WorkspaceError && error.message.startsWith("Cannot read ")) {
        continue;
      }
      throw error;
    }

    const rel = path.normalize(path.join("packages", entry));
    const isCli = rel === CLI_DIR;
    const name = manifest.name;
    if (typeof name !== "string" || name.length === 0) {
      throw new WorkspaceError(`Package at ${rel} is missing a name`);
    }

    if (isCli) {
      if (name !== CLI_NAME) {
        throw new WorkspaceError(
          `packages/cli must be named ${CLI_NAME}, found ${name}`,
        );
      }
      if (manifest.private !== false) {
        throw new WorkspaceError("packages/cli must set private to false");
      }
    } else {
      if (!name.startsWith("@hitchhiker/")) {
        throw new WorkspaceError(`Package name ${name} is not @hitchhiker/*`);
      }
      if (manifest.private !== true) {
        throw new WorkspaceError(`Package ${name} must set private to true`);
      }
    }

    found.push({ name, dir: rel });
  }

  const foundNames = found.map((pkg) => pkg.name);
  const expected = new Set(EXPECTED_PACKAGES);
  const actual = new Set(foundNames);
  const sameSize = foundNames.length === EXPECTED_PACKAGES.length && actual.size === expected.size;
  const sameMembers = [...expected].every((name) => actual.has(name));
  if (!sameSize || !sameMembers) {
    const sortedFound = [...foundNames].sort().join(", ");
    throw new WorkspaceError(
      `On-disk package set differs from EXPECTED_PACKAGES. Found: ${sortedFound}`,
    );
  }

  found.sort((a, b) => a.dir.localeCompare(b.dir));
  return found;
}
