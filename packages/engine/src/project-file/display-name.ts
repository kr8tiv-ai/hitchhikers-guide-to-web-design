/**
 * The name the person typed. The folder name is only the fallback.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export function projectNameFile(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "project.json");
}

export function readProjectDisplayName(projectDir: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(projectNameFile(projectDir), "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const name = (parsed as { name?: unknown }).name;
    if (typeof name !== "string") return null;
    const trimmed = name.trim();
    return trimmed === "" ? null : trimmed;
  } catch {
    return null;
  }
}
