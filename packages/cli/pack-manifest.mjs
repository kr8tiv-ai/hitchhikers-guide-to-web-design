/**
 * npm pack in this environment does not copy publishConfig onto the tarball.
 * prepack applies that overlay after the build. postpack writes the git file back.
 * The backup lives in the temp directory so it is not packed.
 */
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const manifestPath = path.join(cliRoot, "package.json");
const backupPath = path.join(tmpdir(), "hitchhikers-guide-pack-backup.json");

/**
 * `files` is an allowlist. These roots stay in git and must not be entries.
 * `docs/assets/ui-*` is the screenshot folders, not the rest of docs.
 */
export function filesEntryExcluded(entry) {
  if (typeof entry !== "string") return "empty";
  const value = entry.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (value.length === 0 || value === "." || value === "*" || value === "**") return value || ".";
  for (const root of ["vendor", "context", "hh-build-plan"]) {
    if (value === root || value.startsWith(`${root}/`)) return `${root}/`;
  }
  if (value === "docs" || value === "docs/assets" || value.startsWith("docs/assets/ui-")) {
    return "docs/assets/ui-*";
  }
  return null;
}

export function assertFilesAllowlist(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("files must list the directories that ship");
  }
  for (const entry of files) {
    const excluded = filesEntryExcluded(entry);
    if (excluded !== null) {
      throw new Error(`files allowlist must not include ${excluded}`);
    }
  }
}

export async function applyPackManifest() {
  if (existsSync(backupPath)) return;
  const text = await readFile(manifestPath, "utf8");
  const raw = JSON.parse(text);
  const publish = raw.publishConfig;
  if (typeof publish !== "object" || publish === null) {
    throw new Error("publishConfig is missing");
  }
  for (const key of ["bin", "files", "main", "exports", "dependencies"]) {
    if (publish[key] === undefined) throw new Error(`publishConfig.${key} is missing`);
  }
  assertFilesAllowlist(publish.files);
  const packed = {
    ...raw,
    bin: publish.bin,
    files: publish.files,
    main: publish.main,
    exports: publish.exports,
    dependencies: publish.dependencies,
  };
  delete packed.devDependencies;
  await writeFile(backupPath, text);
  await writeFile(manifestPath, `${JSON.stringify(packed, null, 2)}\n`);
}

export async function restorePackManifest() {
  if (!existsSync(backupPath)) return;
  const text = await readFile(backupPath, "utf8");
  await writeFile(manifestPath, text);
  await rm(backupPath, { force: true });
}
