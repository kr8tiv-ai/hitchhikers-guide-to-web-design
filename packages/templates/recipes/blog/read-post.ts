import { validatePost, type PostEntry } from "./dry-run.ts";

export interface ParsedPost extends PostEntry {
  body: string;
}

export function readPost(markdown: string): ParsedPost {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(markdown);
  if (match === null) throw new Error("Post is missing front matter.");
  const block = match[1] ?? "";
  const body = (match[2] ?? "").trim();
  const fields = new Map<string, string>();
  for (const line of block.split(/\r?\n/)) {
    const cut = line.indexOf(":");
    if (cut === -1) continue;
    fields.set(line.slice(0, cut).trim(), line.slice(cut + 1).trim());
  }
  const entry: PostEntry = {
    title: fields.get("title") ?? "",
    description: fields.get("description") ?? "",
    date: fields.get("date") ?? "",
  };
  if (!validatePost(entry)) throw new Error("Post front matter is incomplete.");
  return { ...entry, body };
}
