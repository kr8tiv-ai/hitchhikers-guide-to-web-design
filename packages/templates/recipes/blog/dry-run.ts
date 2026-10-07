/**
 * Content collection for posts, plus an optional Keystatic editor.
 * Local Keystatic storage needs no account. GitHub storage needs an OAuth app.
 * @keystatic/core 0.6.9 is MIT and is not installed until the editor is chosen.
 */

import { meta } from "./meta.ts";

export { meta };

export interface PostEntry {
  title: string;
  description: string;
  date: string;
}

export interface BlogPlan {
  collection: "blog";
  schema: ["title", "description", "date"];
  editor: "none" | "keystatic-local" | "keystatic-github";
  missing: string[];
  ok: boolean;
}

export const postSchema = {
  title: "string",
  description: "string",
  date: "string",
} as const;

export function validatePost(entry: PostEntry): boolean {
  if (entry.title.trim().length === 0 || entry.description.trim().length === 0) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(entry.date);
}

export function keystaticConfig(mode: "local" | "github"): {
  storage: { kind: "local" } | { kind: "github" };
  collections: { posts: { label: string; path: string; schema: typeof postSchema } };
} {
  return {
    storage: mode === "local" ? { kind: "local" } : { kind: "github" },
    collections: {
      posts: {
        label: "Posts",
        path: "src/content/blog/*",
        schema: postSchema,
      },
    },
  };
}

export function dryRunBlog(env: Record<string, string | undefined>, entry: PostEntry): BlogPlan {
  const githubNames = meta.env;
  const present = githubNames.filter((name) => {
    const value = env[name];
    return value !== undefined && value.trim().length > 0;
  });
  const editor = present.length === 0 ? "keystatic-local" : present.length === githubNames.length ? "keystatic-github" : "none";
  const missing = editor === "none" ? githubNames.filter((name) => !present.includes(name)) : [];
  return {
    collection: "blog",
    schema: ["title", "description", "date"],
    editor,
    missing,
    ok: validatePost(entry) && editor !== "none",
  };
}
