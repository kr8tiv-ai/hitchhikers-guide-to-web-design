/**
 * Host named in a Site Brief Hosting field.
 *
 * The longest known name wins, so "Cloudflare Pages" beats "Cloudflare".
 * A sentence that says "free tier" sets the cost. Otherwise each host keeps
 * its usual cost. GitHub Pages is recognized and has no deploy --host flag.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export interface NamedHost {
  id: "cloudflare" | "netlify" | "vercel" | "github" | "hostinger";
  label: string;
  cost: string;
  /** Null when the host has no `hh so-long --host` flag. */
  flag: "cloudflare" | "netlify" | "vercel" | "hostinger" | null;
}

interface HostNeedle {
  needle: string;
  id: NamedHost["id"];
  label: string;
  flag: NamedHost["flag"];
  cost: string;
}

let hostStepReads = 0;

/** How many times a host was read from a brief. Ordinary answers do not do this. */
export function hostStepCount(): number {
  return hostStepReads;
}

const HOST_NEEDLES: readonly HostNeedle[] = [
  { needle: "cloudflare pages", id: "cloudflare", label: "Cloudflare Pages", flag: "cloudflare", cost: "free tier" },
  { needle: "github pages", id: "github", label: "GitHub Pages", flag: null, cost: "free tier" },
  { needle: "cloudflare", id: "cloudflare", label: "Cloudflare", flag: "cloudflare", cost: "free tier" },
  { needle: "netlify", id: "netlify", label: "Netlify", flag: "netlify", cost: "free tier" },
  { needle: "vercel", id: "vercel", label: "Vercel", flag: "vercel", cost: "free tier" },
  { needle: "hostinger", id: "hostinger", label: "Hostinger", flag: "hostinger", cost: "your host plan" },
];

/** The host named in hosting text, or null when none of the known hosts appear. */
export function namedHostFromBrief(hosting: string): NamedHost | null {
  hostStepReads += 1;
  const text = hosting.trim();
  if (text === "") return null;
  const lower = text.toLowerCase();
  for (const needle of HOST_NEEDLES) {
    const index = phraseAt(lower, needle.needle);
    if (index < 0) continue;
    const sentence = sentenceAround(lower, index, needle.needle.length);
    const cost = sentence.includes("free tier") ? "free tier" : needle.cost;
    return { id: needle.id, label: needle.label, cost, flag: needle.flag };
  }
  return null;
}

/**
 * Hosting field for a project. The pending draft wins. The approved
 * Site Brief is the fallback. An empty string means the field is absent.
 */
export function briefHostingText(projectDir: string): string {
  hostStepReads += 1;
  const pending = pendingHosting(projectDir);
  if (pending !== null && pending.trim() !== "") return pending.trim();
  return hostingFromMarkdown(readBriefMarkdown(projectDir));
}

function phraseAt(lower: string, phrase: string): number {
  let from = 0;
  while (from < lower.length) {
    const index = lower.indexOf(phrase, from);
    if (index < 0) return -1;
    const before = index === 0 ? "" : (lower[index - 1] ?? "");
    const after = lower[index + phrase.length] ?? "";
    if (!isHostChar(before) && !isHostChar(after)) return index;
    from = index + phrase.length;
  }
  return -1;
}

function isHostChar(char: string): boolean {
  if (char === "") return false;
  const code = char.codePointAt(0) ?? 0;
  return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

function sentenceAround(lower: string, index: number, length: number): string {
  let start = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = lower[cursor];
    if (char === "." || char === "?" || char === ";") {
      start = cursor + 1;
      break;
    }
  }
  let end = lower.length;
  for (let cursor = index + length; cursor < lower.length; cursor += 1) {
    const char = lower[cursor];
    if (char === "." || char === "?" || char === ";") {
      end = cursor;
      break;
    }
  }
  return lower.slice(start, end);
}

function pendingHosting(projectDir: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "brief-pending.json"), "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const draft = (parsed as { draft?: unknown }).draft;
    if (typeof draft !== "object" || draft === null || Array.isArray(draft)) return null;
    const hosting = (draft as { hosting?: unknown }).hosting;
    return typeof hosting === "string" ? hosting : null;
  } catch {
    return null;
  }
}

function readBriefMarkdown(projectDir: string): string {
  try {
    return readFileSync(path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md"), "utf8");
  } catch {
    return "";
  }
}

function hostingFromMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let capturing = false;
  const body: string[] = [];
  for (const line of lines) {
    if (/^##\s+Hosting\s*$/.test(line)) {
      capturing = true;
      continue;
    }
    if (capturing && /^##\s+/.test(line)) break;
    if (capturing) body.push(line);
  }
  return body.join("\n").trim();
}
