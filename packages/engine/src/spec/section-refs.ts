/**
 * Ingredients-first references (BUG-055 idea 5).
 * `@section:name` and `@template:path` point at a studied section fixture.
 * The build uses that fixture's landmarks. A prompt with no reference still
 * builds. This is the authoring side. It does not render a site by itself.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { packagedPath } from "../packaged-dir.ts";
import { expandSkillIncludes, loadSkillPacks, type SkillPack } from "./skills.ts";

export interface MarkupBuild {
  html: string;
  unknown: readonly string[];
  referenced: readonly string[];
}

export interface IngredientExpansion {
  text: string;
  html: string;
  unknown: readonly string[];
  inlinedSkills: readonly string[];
}

const PAGE_SHELL = '<main data-landmark="page"></main>';

export function sectionFixtureRoot(): string {
  return path.join(packagedPath(["knowledge"], "packs"), "design-library", "sections");
}

export function landmarkSequence(html: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(/data-landmark\s*=\s*["']([^"']+)["']/gi)) {
    const name = (match[1] ?? "").trim();
    if (name !== "") found.push(name);
  }
  return found;
}

export function buildMarkupFromReferences(source: string, root = sectionFixtureRoot()): MarkupBuild {
  const unknown: string[] = [];
  const referenced: string[] = [];
  const parts: string[] = [];
  for (const match of source.matchAll(/@(section|template):([^\s]+)/g)) {
    const kind = match[1];
    const value = (match[2] ?? "").trim();
    if (kind === "section") {
      const file = sectionFile(root, value);
      if (file === null) {
        unknown.push(value);
        continue;
      }
      referenced.push(`@section:${value}`);
      parts.push(readFileSync(file, "utf8").trim());
      continue;
    }
    const file = templateFile(value);
    if (file === null) {
      unknown.push(value);
      continue;
    }
    referenced.push(`@template:${value}`);
    parts.push(readFileSync(file, "utf8").trim());
  }
  if (parts.length === 0) return { html: PAGE_SHELL, unknown, referenced };
  return { html: parts.join("\n"), unknown, referenced };
}

export function expandIngredientIncludes(source: string, packs: readonly SkillPack[] = loadSkillPacks()): IngredientExpansion {
  const skills = expandSkillIncludes(source, packs);
  const built = buildMarkupFromReferences(source);
  const text = built.referenced.length === 0 ? skills.text : `${skills.text}\n\n${built.html}`;
  return {
    text,
    html: built.html,
    unknown: [...skills.unknown, ...built.unknown],
    inlinedSkills: skills.inlined,
  };
}

function sectionFile(root: string, name: string): string | null {
  if (!/^[a-z0-9-]+$/.test(name)) return null;
  const file = path.join(root, `${name}.html`);
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (!existsSync(file)) return null;
  return file;
}

function templateFile(spec: string): string | null {
  const cleaned = spec.trim().replaceAll("\\", "/");
  if (cleaned === "" || cleaned.includes("..") || cleaned.startsWith("/") || cleaned.includes(":")) return null;
  const root = path.resolve(sectionFixtureRoot(), "..", "..", "..", "..");
  const absolute = path.resolve(root, cleaned);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (!existsSync(absolute)) return null;
  return absolute;
}
