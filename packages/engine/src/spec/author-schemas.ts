/**
 * Schema for one authored site-prompt body.
 * The body is the markdown after the shared RULES block.
 * think() checks this shape. validatePackage checks the prose.
 */

import type { JsonSchema } from "../ai/schema-validate.ts";

export const AUTHOR_TASK = "author-site-prompt";

export const AUTHOR_MODEL = "grok-4.7";

export const AUTHOR_EFFORT = "xhigh" as const;

/** Same ceiling as CONTEXT.md. Pack excerpts are trimmed first. */
export const AUTHOR_TOKEN_BUDGET = 30_000;

export const AUTHOR_BODY_SCHEMA: JsonSchema = {
  type: "object",
  required: ["body"],
  properties: {
    body: { type: "string" },
  },
};

export interface AuthoredBody {
  body: string;
}

export const AUTHOR_INSTRUCTIONS = [
  "Write the body of one site prompt for Grok 4.7.",
  "Return JSON with one string field, body.",
  "The body is the markdown after the RULES block. Do not paste the RULES block.",
  "Include these tags, each once: objective, read_first, task, must_haves, verify, report_back, commit.",
  "Use exactly one task tag.",
  "read_first must cite @.hitchhiker/CONTEXT.md#anchor for an anchor that this request shows.",
  "If a line says MISSING ANCHOR, keep that anchor in read_first. Do not drop it.",
  "must_haves needs truths, artifacts, key_links, and prohibitions, each with at least one item.",
  "Name the files from the skeleton. One job. Concrete values.",
  "Never write \"as before\", \"see above\", or \"same as previous\".",
  "No exclamation marks. No em dashes.",
  "When the skeleton sets library, name that library and include this sentence exactly: Do not also bind this element with another library.",
  "Ground the steps in the golden template. Replace its slots with the skeleton's page, section, files, and library.",
].join("\n");
