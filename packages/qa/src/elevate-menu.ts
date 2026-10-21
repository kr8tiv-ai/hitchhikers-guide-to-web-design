/**
 * Sourced Elevate menu (spec 243-02, E6).
 *
 * Candidates are read from the Awwwards anatomy notes, the motion
 * taxonomy, and the knowledge packs. A candidate that does not cite
 * one of those entries is not offered. The magnetic control is left
 * out. This file does not check font licenses.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lintSlop } from "./antislop.ts";

export type ElevateMenuPass = "type-and-spacing" | "motion" | "imagery" | "copy" | "standout";

export interface ElevateSourceRef {
  /** Entry id, such as anatomy-1, A3, or pack:typography#two-families. */
  id: string;
  /** Repo-relative path using forward slashes. */
  file: string;
  /** Title as it appears in that file. */
  title: string;
}

export interface ElevateMenuCandidate {
  file: string;
  change: string;
  pass: ElevateMenuPass;
  source: ElevateSourceRef;
}

const ANATOMY_FILE = "context/research/03-awwwards-anatomy.md";
const MOTION_FILE = "context/research/04-motion-taxonomy.md";
const PACKS_DIR = "packages/knowledge/packs";

const TARGET: Record<ElevateMenuPass, string> = {
  "type-and-spacing": "src/styles/type.css",
  motion: "src/scripts/motion.ts",
  imagery: "src/styles/imagery.css",
  copy: "src/copy/page.md",
  standout: "src/sections/hero.tsx",
};

const PACK_PASS: Record<string, ElevateMenuPass> = {
  typography: "type-and-spacing",
  color: "type-and-spacing",
  vanilla: "type-and-spacing",
  motion: "motion",
  "motion-lib": "motion",
  gsap: "motion",
  lenis: "motion",
  audio: "standout",
  "award-sites": "standout",
  "brand-frameworks": "standout",
  drei: "standout",
  r3f: "standout",
  three: "standout",
  glsl: "imagery",
};

const ANATOMY_PASS: Record<string, ElevateMenuPass> = {
  "1": "standout",
  "2": "motion",
  "3": "type-and-spacing",
  "4": "motion",
  "5": "motion",
  "6": "standout",
  "7": "type-and-spacing",
  "8": "standout",
  "9": "copy",
  "10": "copy",
};

interface Draft {
  id: string;
  file: string;
  title: string;
  excerpt: string;
  pass: ElevateMenuPass;
}

function repoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 8; hop += 1) {
    if (existsSync(path.join(dir, ANATOMY_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("The upgrade menu could not read its sources.");
}

function calmCopy(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`>#|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replaceAll("!", ".")
    .replaceAll("\u2014", "-")
    .replaceAll("\u2013", "-")
    .replaceAll("→", "-")
    .replace(/\s+/g, " ")
    .trim();
}

function isMagnetic(change: string): boolean {
  const folded = change.replace(/\u2019/g, "'").replace(/\s+/g, " ").toLowerCase();
  if (folded.includes("add a magnetic")) return true;
  return /\bmagnetic\b/.test(folded.replaceAll("non-magnetic", ""));
}

function banned(text: string): boolean {
  if (text.length === 0 || isMagnetic(text)) return true;
  return lintSlop(text, "site").length > 0;
}

function clip(value: string): string {
  if (value.length <= 220) return value;
  const cut = value.slice(0, 220);
  const space = cut.lastIndexOf(" ");
  return (space > 80 ? cut.slice(0, space) : cut).trim();
}

function offer(draft: Draft): ElevateMenuCandidate | null {
  const cited = draft.title.replace(/\s+/g, " ").trim();
  const title = calmCopy(cited).replace(/\.+$/, "");
  const extra = calmCopy(draft.excerpt);
  const sentence = extra.split(/(?<=\.)\s+/)[0]?.trim() ?? "";
  const combined =
    sentence.length > 0 && sentence.toLowerCase() !== title.toLowerCase() ? `${title}. ${sentence}` : title;
  let change = clip(combined);
  if (cited.length === 0 || title.length === 0) return null;
  if (banned(change)) {
    if (banned(title)) return null;
    change = title;
  }
  return {
    file: TARGET[draft.pass],
    change,
    pass: draft.pass,
    source: { id: draft.id, file: draft.file, title: cited },
  };
}

function sliceBetween(markdown: string, start: RegExp, end: RegExp): string {
  const lines = markdown.split(/\r?\n/);
  let from = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (start.test(lines[index] ?? "")) {
      from = index + 1;
      break;
    }
  }
  if (from < 0) return "";
  const chunk: string[] = [];
  for (let index = from; index < lines.length; index += 1) {
    if (end.test(lines[index] ?? "")) break;
    chunk.push(lines[index] ?? "");
  }
  return chunk.join("\n");
}

function anatomyDrafts(markdown: string): Draft[] {
  const section = sliceBetween(markdown, /^## 3\./, /^## 4\./);
  const drafts: Draft[] = [];
  for (const line of section.split(/\r?\n/)) {
    const match = /^(\d+)\.\s+\*\*([^*]+)\*\*(.*)$/.exec(line.trim());
    if (match === null) continue;
    const number = match[1] ?? "";
    const title = match[2] ?? "";
    const excerpt = match[3] ?? "";
    if (!/^\d+$/.test(number)) continue;
    drafts.push({
      id: `anatomy-${number}`,
      file: ANATOMY_FILE,
      title,
      excerpt,
      pass: ANATOMY_PASS[number] ?? "standout",
    });
  }
  return drafts;
}

function motionPass(id: string): ElevateMenuPass {
  if (id.startsWith("B")) return "type-and-spacing";
  if (id.startsWith("F")) return "standout";
  if (id.startsWith("H")) return "imagery";
  return "motion";
}

function motionDrafts(markdown: string): Draft[] {
  const drafts: Draft[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^\|\s*([A-H]\d+)\s*\|\s*\*\*([^*]+)\*\*\s*\|([^|]*)\|/.exec(line.trim());
    if (match === null) continue;
    const id = match[1] ?? "";
    const title = match[2] ?? "";
    const excerpt = match[3] ?? "";
    if (id === "D2" || isMagnetic(title)) continue;
    drafts.push({
      id,
      file: MOTION_FILE,
      title,
      excerpt,
      pass: motionPass(id),
    });
  }
  return drafts;
}

function bodyOf(markdown: string): string {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return markdown;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === "---") return lines.slice(index + 1).join("\n");
  }
  return markdown;
}

function descriptionOf(markdown: string): string {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return "";
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "---") return "";
    const match = /^description:\s*(.*)$/.exec(line.trim());
    if (match === null) continue;
    return (match[1] ?? "").replace(/^["']|["']$/g, "").trim();
  }
  return "";
}

function firstParagraph(body: string): string {
  const kept: string[] = [];
  let started = false;
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      if (started) break;
      continue;
    }
    if (trimmed.startsWith("Source:")) continue;
    if (trimmed.startsWith("#")) continue;
    started = true;
    kept.push(trimmed);
  }
  return kept.join(" ");
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function passFor(pack: string, title: string): ElevateMenuPass {
  const folded = title.toLowerCase();
  if (/motion|scroll|transition|animat/.test(folded)) return "motion";
  if (/type|size|font|color|contrast|palette/.test(folded)) return "type-and-spacing";
  if (/image|photo|grade/.test(folded)) return "imagery";
  if (/copy|voice|word|button|404|fact/.test(folded)) return "copy";
  return PACK_PASS[pack] ?? "copy";
}

function packDrafts(root: string): Draft[] {
  const dir = path.join(root, PACKS_DIR);
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const drafts: Draft[] = [];
  for (const name of names) {
    const relative = `${PACKS_DIR}/${name}/SKILL.md`;
    const full = path.join(root, relative);
    if (!existsSync(full)) continue;
    let markdown = "";
    try {
      markdown = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const body = bodyOf(markdown);
    const sections: Array<{ title: string; excerpt: string; heading: boolean }> = [];
    let current: { title: string; lines: string[] } | null = null;
    const flush = (): void => {
      if (current === null || current.title.length === 0) return;
      sections.push({ title: current.title, excerpt: firstParagraph(current.lines.join("\n")), heading: true });
    };
    for (const line of body.split(/\r?\n/)) {
      const heading = /^#{1,2}\s+(.+)$/.exec(line.trim());
      if (heading !== null) {
        flush();
        current = { title: (heading[1] ?? "").trim(), lines: [] };
        continue;
      }
      if (current !== null) current.lines.push(line);
    }
    flush();
    if (sections.length === 0) {
      const description = descriptionOf(markdown);
      if (description.length > 0) {
        sections.push({ title: description, excerpt: "", heading: false });
      }
    }
    for (const section of sections) {
      const id = section.heading ? `pack:${name}#${slug(section.title)}` : `pack:${name}`;
      if (id.endsWith("#") || id.length === 0) continue;
      drafts.push({
        id,
        file: relative,
        title: section.title,
        excerpt: section.excerpt,
        pass: passFor(name, section.title),
      });
    }
  }
  return drafts;
}

/**
 * Every candidate cites an entry in the anatomy notes, the motion
 * taxonomy, or a knowledge pack. Missing sources are an empty menu
 * only when the files themselves are missing.
 */
export function loadElevateMenu(root = repoRoot()): ElevateMenuCandidate[] {
  const anatomyPath = path.join(root, ANATOMY_FILE);
  const motionPath = path.join(root, MOTION_FILE);
  if (!existsSync(anatomyPath) || !existsSync(motionPath)) {
    throw new Error("The upgrade menu could not read its sources.");
  }
  const drafts = [
    ...anatomyDrafts(readFileSync(anatomyPath, "utf8")),
    ...motionDrafts(readFileSync(motionPath, "utf8")),
    ...packDrafts(root),
  ];
  const seen = new Set<string>();
  const menu: ElevateMenuCandidate[] = [];
  for (const draft of drafts) {
    if (seen.has(draft.id)) continue;
    const candidate = offer(draft);
    if (candidate === null) continue;
    seen.add(draft.id);
    menu.push(candidate);
  }
  menu.sort((left, right) => left.source.file.localeCompare(right.source.file) || left.source.id.localeCompare(right.source.id));
  return menu;
}
