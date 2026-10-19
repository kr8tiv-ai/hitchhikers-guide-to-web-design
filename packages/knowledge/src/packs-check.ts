/**
 * Weekly pack check. Injected fetch. A major bump marks the pack stale.
 * A minor or patch writes a review note and leaves the pin in place.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PACK_FIELDS = ["name", "version", "license", "docs", "llms", "checked", "description", "when-to-use", "paths"] as const;

export interface PackCheckResult {
  name: string;
  from: string;
  to: string;
  bump: "same" | "patch" | "minor" | "major" | "skip";
  wrote: string;
}

export function classifyBump(current: string, latest: string): "same" | "patch" | "minor" | "major" {
  const left = parts(current);
  const right = parts(latest);
  if (left.join(".") === right.join(".")) return "same";
  if (right[0] !== left[0]) return "major";
  if (right[1] !== left[1]) return "minor";
  return "patch";
}

export function missingPackFields(markdown: string): string[] {
  const block = frontmatterBlock(markdown);
  const fields = frontmatter(markdown);
  return PACK_FIELDS.filter((field) => {
    if (field === "paths") return !/^paths:/m.test(block);
    const value = fields.get(field);
    return value === undefined || value.trim() === "";
  });
}

export function packIsStale(markdown: string): boolean {
  return /^stale:\s*true\s*$/m.test(frontmatterBlock(markdown));
}

export async function checkPacks(
  packsDir: string,
  names: readonly string[],
  fetchImpl: typeof fetch,
): Promise<PackCheckResult[]> {
  const results: PackCheckResult[] = [];
  for (const folder of names) {
    const skill = path.join(packsDir, folder, "SKILL.md");
    const markdown = readFileSync(skill, "utf8");
    const fields = frontmatter(markdown);
    const version = fields.get("version") ?? "";
    const npmName = fields.get("npm") ?? fields.get("name") ?? "";
    if (version === "" || version === "built-in" || !/^\d+\.\d+\.\d+/.test(version)) {
      results.push({ name: folder, from: version, to: version, bump: "skip", wrote: "" });
      continue;
    }
    const response = await fetchImpl(`https://registry.npmjs.org/${npmName}/latest`);
    if (!response.ok) throw new Error(`Registry status ${response.status} for ${npmName}.`);
    const body = (await response.json()) as { version?: string; description?: string; changelog?: unknown };
    const latest = body.version ?? version;
    const bump = classifyBump(version, latest);
    if (bump === "same") {
      results.push({ name: folder, from: version, to: latest, bump, wrote: "" });
      continue;
    }
    if (bump === "major") {
      const next = upsertFrontmatter(markdown, "stale", "true");
      writeFileSync(skill, next, "utf8");
      results.push({ name: folder, from: version, to: latest, bump, wrote: skill });
      continue;
    }
    const headings = changelogHeadings(body);
    const note = [`# Review ${npmName}`, "", `Pinned ${version}. Registry latest is ${latest} (${bump}).`, "", ...headings, ""].join("\n");
    const review = path.join(packsDir, folder, "REVIEW.md");
    writeFileSync(review, note, "utf8");
    results.push({ name: folder, from: version, to: latest, bump, wrote: review });
  }
  return results;
}

function parts(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (match === null) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function changelogHeadings(body: { description?: string; changelog?: unknown }): string[] {
  if (Array.isArray(body.changelog)) {
    return body.changelog.filter((item): item is string => typeof item === "string").map((item) => `## ${item}`);
  }
  if (typeof body.description === "string" && body.description.trim() !== "") return [`## ${body.description.trim()}`];
  return ["## Changelog headings were not in the registry response."];
}

function frontmatterBlock(markdown: string): string {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return "";
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (close === -1) return "";
  return lines.slice(1, close).join("\n");
}

function frontmatter(markdown: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of frontmatterBlock(markdown).split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (match?.[1] !== undefined) fields.set(match[1], (match[2] ?? "").trim());
  }
  return fields;
}

function upsertFrontmatter(markdown: string, key: string, value: string): string {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (lines[0]?.trim() !== "---" || close === -1) return markdown;
  const next = [...lines];
  const pattern = new RegExp(`^${key}:`);
  let replaced = false;
  for (let index = 1; index < close; index += 1) {
    if (pattern.test(next[index]?.trim() ?? "")) {
      next[index] = `${key}: ${value}`;
      replaced = true;
    }
  }
  if (!replaced) next.splice(close, 0, `${key}: ${value}`);
  return `${next.join("\n")}\n`.replace(/\n{3,}/g, "\n\n");
}
