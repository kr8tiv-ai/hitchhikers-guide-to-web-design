/**
 * The owner locks DESIGN.md by approving the style guide.
 * Engine rewrites remove the lock. They do not write a new one.
 * The lock also writes VISUAL-CONSTITUTION.md. Removing the lock removes
 * that file. A session does not get a writer for it.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sha256File } from "./reference-shots.ts";
import { VISUAL_CONSTITUTION_REL, writeVisualConstitution } from "./visual-constitution.ts";

export const DESIGN_LOCK_REL = ".hitchhiker/design-lock.json";

export function designLockMatches(projectDir: string): boolean {
  const designPath = path.join(projectDir, "DESIGN.md");
  const lockPath = path.join(projectDir, DESIGN_LOCK_REL);
  if (!existsSync(designPath) || !existsSync(lockPath)) return false;
  try {
    const raw: unknown = JSON.parse(readFileSync(lockPath, "utf8"));
    if (typeof raw !== "object" || raw === null) return false;
    const sha = (raw as { sha256?: unknown }).sha256;
    if (typeof sha !== "string" || sha.trim() === "") return false;
    return sha === sha256File(designPath);
  } catch {
    return false;
  }
}

export function removeDesignLock(projectDir: string): void {
  const file = path.join(projectDir, DESIGN_LOCK_REL);
  if (existsSync(file)) rmSync(file);
  const constitution = path.join(projectDir, VISUAL_CONSTITUTION_REL);
  if (existsSync(constitution)) rmSync(constitution);
}

/** Written by an owner approval. A picked direction id is required. */
export function writeDesignLock(projectDir: string, pickedId: string, at = new Date().toISOString()): void {
  const designPath = path.join(projectDir, "DESIGN.md");
  if (!existsSync(designPath)) throw new Error("DESIGN.md is missing.");
  const id = pickedId.trim();
  if (id === "") throw new Error("A design lock needs the picked direction.");
  const file = path.join(projectDir, DESIGN_LOCK_REL);
  mkdirSync(path.dirname(file), { recursive: true });
  const body = { sha256: sha256File(designPath), pickedId: id, at };
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  writeVisualConstitution(projectDir);
}
