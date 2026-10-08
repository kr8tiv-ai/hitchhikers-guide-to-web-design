import { lstat, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const USAGE = "Usage: hh install --project <dir>";

const MARKDOWN = new Set([".md"]);
const JSON_EXT = new Set([".json"]);

export class InstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallError";
  }
}

interface CopyItem {
  from: string;
  to: string;
  resetDir: string | null;
}

/** Plugin package that `hh install` copies from, next to this CLI in the repo. */
export function pluginSourceDir(): string {
  return path.resolve(import.meta.dirname, "..", "..", "grok-plugin");
}

/**
 * Resolved destination under projectDir.
 * Throws when the resolved path leaves the project, including a `..` segment.
 */
export function installDestination(projectDir: string, ...parts: string[]): string {
  for (const part of parts) {
    if (part === ".." || part === "." || part.length === 0 || part.includes("\0")) {
      throw new InstallError("Refusing to copy outside the project.");
    }
  }
  const project = path.resolve(projectDir);
  const dest = path.resolve(project, ...parts);
  if (!isInside(project, dest)) {
    throw new InstallError("Refusing to copy outside the project.");
  }
  return dest;
}

function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  if (rel === "") return true;
  if (path.isAbsolute(rel)) return false;
  return !rel.split(path.sep).includes("..");
}

function hhName(name: string): string {
  if (name === "." || name === ".." || name.includes("/") || name.includes("\\") || name.includes("\0")) {
    throw new InstallError("Refusing to copy outside the project.");
  }
  return name.startsWith("hh-") ? name : `hh-${name}`;
}

function prefixRelative(rel: string): string[] {
  const parts = rel.split(path.sep).filter((part) => part.length > 0);
  const head = parts[0];
  if (head === undefined) throw new InstallError("Refusing to copy outside the project.");
  return [hhName(head), ...parts.slice(1)];
}

async function directoryReal(dir: string, label: string): Promise<string> {
  try {
    const real = await realpath(dir);
    const info = await stat(real);
    if (!info.isDirectory()) throw new InstallError(`${label} directory does not exist.`);
    return real;
  } catch (error: unknown) {
    if (error instanceof InstallError) throw error;
    throw new InstallError(`${label} directory does not exist.`);
  }
}

/**
 * The nearest existing ancestor is realpath'd. A link that leaves the project throws
 * before any write, so a swapped `.grok` directory cannot receive the copy.
 */
async function assertRealDestination(projectReal: string, target: string): Promise<void> {
  const resolved = path.resolve(target);
  if (!isInside(projectReal, resolved)) {
    throw new InstallError("Refusing to copy outside the project.");
  }
  let current = resolved;
  const missing: string[] = [];
  for (;;) {
    try {
      const real = await realpath(current);
      if (!isInside(projectReal, real)) {
        throw new InstallError("Refusing to copy outside the project.");
      }
      const finalPath = missing.length === 0 ? real : path.resolve(real, ...missing);
      if (!isInside(projectReal, finalPath)) {
        throw new InstallError("Refusing to copy outside the project.");
      }
      return;
    } catch (error: unknown) {
      if (error instanceof InstallError) throw error;
      const parent = path.dirname(current);
      if (parent === current) throw new InstallError("Refusing to copy outside the project.");
      const base = path.basename(current);
      missing.unshift(base);
      current = parent;
    }
  }
}

async function listAccepted(
  root: string,
  sourceReal: string,
  extensions: Set<string>,
): Promise<{ abs: string; rel: string }[]> {
  const found: { abs: string; rel: string }[] = [];
  const seen = new Set<string>();

  async function visit(dir: string): Promise<void> {
    let dirReal: string;
    try {
      dirReal = await realpath(dir);
    } catch {
      return;
    }
    if (!isInside(sourceReal, dirReal)) return;
    if (seen.has(dirReal)) return;
    seen.add(dirReal);

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "." || entry.name === "..") continue;
      const abs = path.join(dir, entry.name);
      let linked: string;
      try {
        linked = await realpath(abs);
      } catch {
        continue;
      }
      // A skill that resolves outside the source is not copied. The walk started at sourceDir.
      if (!isInside(sourceReal, linked)) continue;

      const info = await stat(abs);
      if (info.isDirectory()) {
        await visit(abs);
        continue;
      }
      if (!info.isFile()) continue;
      if (!extensions.has(path.extname(entry.name).toLowerCase())) continue;
      const rel = path.relative(root, abs);
      if (!isInside(root, abs)) continue;
      found.push({ abs, rel });
    }
  }

  await visit(root);
  return found;
}

function pushFiles(
  items: CopyItem[],
  projectReal: string,
  files: { abs: string; rel: string }[],
  destParts: (relParts: string[]) => { parts: string[]; resetDir: string | null },
): void {
  for (const file of files) {
    const relParts = file.rel.split(path.sep).filter((part) => part.length > 0);
    const mapped = destParts(relParts);
    const to = installDestination(projectReal, ...mapped.parts);
    const resetDir =
      mapped.resetDir === null ? null : installDestination(projectReal, ...mapped.resetDir.split(path.sep));
    items.push({ from: file.abs, to, resetDir });
  }
}

async function ownedSkillDir(dir: string, projectReal: string): Promise<boolean> {
  let info;
  try {
    info = await lstat(dir);
  } catch {
    return false;
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new InstallError("Refusing to copy outside the project.");
  }
  const real = await realpath(dir);
  if (!isInside(projectReal, real)) throw new InstallError("Refusing to copy outside the project.");
  if (!path.basename(real).startsWith("hh-")) throw new InstallError("Refusing to copy outside the project.");
  if (path.basename(path.dirname(real)) !== "skills") {
    throw new InstallError("Refusing to copy outside the project.");
  }
  if (path.basename(path.dirname(path.dirname(real))) !== ".grok") {
    throw new InstallError("Refusing to copy outside the project.");
  }
  return true;
}

/**
 * Copy Guide skills, agents, hooks, and rules into projectDir/.grok.
 * Skills land at .grok/skills/hh-<name>. Unrelated files in .grok/skills stay.
 * This is a file copy. It does not publish and it does not contact the network.
 */
export async function installSkills(input: {
  sourceDir: string;
  projectDir: string;
}): Promise<{ copied: number }> {
  const sourceReal = await directoryReal(input.sourceDir, "Source");
  const projectReal = await directoryReal(input.projectDir, "Project");
  const entries = await readdir(sourceReal, { withFileTypes: true });
  const hasSkillsDir = entries.some((entry) => entry.name === "skills" && entry.isDirectory());
  const items: CopyItem[] = [];

  for (const entry of entries) {
    if (entry.name === "." || entry.name === ".." || entry.name === "node_modules") continue;
    const abs = path.join(sourceReal, entry.name);
    let linked: string;
    try {
      linked = await realpath(abs);
    } catch {
      continue;
    }
    if (!isInside(sourceReal, linked)) continue;
    const info = await stat(abs);
    if (!info.isDirectory()) continue;

    if (entry.name === "skills") {
      const children = await readdir(abs, { withFileTypes: true });
      for (const child of children) {
        if (!child.isDirectory() && !child.isSymbolicLink()) continue;
        const skillAbs = path.join(abs, child.name);
        let skillReal: string;
        try {
          skillReal = await realpath(skillAbs);
        } catch {
          continue;
        }
        if (!isInside(sourceReal, skillReal)) continue;
        const skillStat = await stat(skillAbs);
        if (!skillStat.isDirectory()) continue;
        const folder = hhName(child.name);
        const files = await listAccepted(skillAbs, sourceReal, MARKDOWN);
        const resetDir = path.join(".grok", "skills", folder);
        pushFiles(items, projectReal, files, (relParts) => ({
          parts: [".grok", "skills", folder, ...relParts],
          resetDir,
        }));
      }
      continue;
    }

    if (entry.name === "agents" || entry.name === "rules" || entry.name === "hooks") {
      const extensions = entry.name === "hooks" ? JSON_EXT : MARKDOWN;
      const bucket = entry.name;
      const files = await listAccepted(abs, sourceReal, extensions);
      pushFiles(items, projectReal, files, (relParts) => ({
        parts: [".grok", bucket, ...prefixRelative(relParts.join(path.sep))],
        resetDir: null,
      }));
      continue;
    }

    if (!hasSkillsDir) {
      const folder = hhName(entry.name);
      const files = await listAccepted(abs, sourceReal, MARKDOWN);
      const resetDir = path.join(".grok", "skills", folder);
      pushFiles(items, projectReal, files, (relParts) => ({
        parts: [".grok", "skills", folder, ...relParts],
        resetDir,
      }));
    }
  }

  if (items.length === 0) return { copied: 0 };

  for (const item of items) {
    await assertRealDestination(projectReal, item.to);
    if (item.resetDir !== null) await assertRealDestination(projectReal, item.resetDir);
  }

  const resetDirs = new Set<string>();
  for (const item of items) {
    if (item.resetDir !== null) resetDirs.add(item.resetDir);
  }
  for (const dir of resetDirs) {
    if (await ownedSkillDir(dir, projectReal)) {
      await rm(dir, { recursive: true, force: true });
    }
  }

  for (const item of items) {
    await assertRealDestination(projectReal, item.to);
    await mkdir(path.dirname(item.to), { recursive: true });
    await assertRealDestination(projectReal, item.to);
    const bytes = await readFile(item.from);
    await writeFile(item.to, bytes);
  }

  return { copied: items.length };
}

/** `hh install --project <dir>`. Unknown flags are rejected. */
export function parseInstallArgs(argv: readonly string[]): { projectDir: string } {
  let project: string | undefined;
  let sawProject = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      if (sawProject) throw new InstallError(`Unexpected argument. ${USAGE}`);
      const value = argv[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("-")) {
        throw new InstallError(`Missing --project. ${USAGE}`);
      }
      project = value;
      sawProject = true;
      index += 1;
      continue;
    }
    throw new InstallError(`Unexpected argument. ${USAGE}`);
  }
  if (project === undefined) throw new InstallError(`Missing --project. ${USAGE}`);
  return { projectDir: project };
}

/** Run `hh install`. The source defaults to packages/grok-plugin. */
export async function runInstall(
  argv: readonly string[],
  opts: { cwd?: string; sourceDir?: string } = {},
): Promise<{ exitCode: number; stdout: string }> {
  let parsed: { projectDir: string };
  try {
    parsed = parseInstallArgs(argv);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Install failed.";
    return { exitCode: 2, stdout: `${message}\n` };
  }
  const cwd = opts.cwd ?? process.cwd();
  const projectDir = path.resolve(cwd, parsed.projectDir);
  const sourceDir = opts.sourceDir ?? pluginSourceDir();
  try {
    const result = await installSkills({ sourceDir, projectDir });
    const noun = result.copied === 1 ? "file" : "files";
    return { exitCode: 0, stdout: `Copied ${result.copied} ${noun}.\n` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Install failed.";
    return { exitCode: 1, stdout: `${message}\n` };
  }
}
