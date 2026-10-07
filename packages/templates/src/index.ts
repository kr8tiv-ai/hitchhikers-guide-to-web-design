import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_NAME = "@hitchhiker/templates";

export { renderSocial } from "./social.ts";
export type { SocialFrame, SocialInput } from "./social.ts";
export { MotionContractError, renderMotionModule, renderWebglModule } from "./motion-contract.ts";
export type { MotionAssignment, MotionLib, MotionPlan, ScrollOwner } from "./motion-contract.ts";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export type TemplateId = "astro-default" | "next-app" | "vite-react-world";
export type TemplateStack = "astro" | "next" | "vite-react";

interface TemplateRecord {
  id: TemplateId;
  stack: TemplateStack;
  dirName: string;
}

interface RecipeRecord {
  id: string;
  stacks: readonly TemplateId[];
  env: readonly string[];
  licence: string;
}

const TEMPLATES: readonly TemplateRecord[] = [
  { id: "astro-default", stack: "astro", dirName: "astro-default" },
  { id: "next-app", stack: "next", dirName: "next-app" },
  { id: "vite-react-world", stack: "vite-react", dirName: "vite-react-world" },
];

const ALL_STACKS: readonly TemplateId[] = ["astro-default", "next-app", "vite-react-world"];

const RECIPES: readonly RecipeRecord[] = [
  {
    id: "contact",
    stacks: ALL_STACKS,
    env: ["WEB3FORMS_ACCESS_KEY", "FORMSPREE_FORM_ID", "HOST_FORM_ACTION"],
    licence: "MIT",
  },
  {
    id: "resend",
    stacks: ALL_STACKS,
    env: ["RESEND_API_KEY", "RESEND_FROM"],
    licence: "MIT",
  },
  {
    id: "newsletter",
    stacks: ALL_STACKS,
    env: [
      "KIT_API_KEY",
      "KIT_FORM_ID",
      "MAILCHIMP_API_KEY",
      "MAILCHIMP_AUDIENCE_ID",
      "MAILCHIMP_SERVER_PREFIX",
      "MAILERLITE_API_KEY",
      "MAILERLITE_GROUP_ID",
      "BEEHIIV_API_KEY",
      "BEEHIIV_PUBLICATION_ID",
      "BREVO_API_KEY",
      "BREVO_LIST_ID",
      "KLAVIYO_API_KEY",
      "KLAVIYO_LIST_ID",
      "HOSTINGER_REACH_API_TOKEN",
    ],
    licence: "MIT",
  },
  {
    id: "stripe",
    stacks: ALL_STACKS,
    env: ["STRIPE_PAYMENT_LINK_URL"],
    licence: "MIT",
  },
  {
    id: "shopify",
    stacks: ALL_STACKS,
    env: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_STOREFRONT_ACCESS_TOKEN", "SHOPIFY_PRODUCT_ID"],
    licence: "MIT",
  },
  {
    id: "booking",
    stacks: ALL_STACKS,
    env: ["CAL_LINK", "CALENDLY_URL"],
    licence: "MIT",
  },
  {
    id: "blog",
    stacks: ALL_STACKS,
    env: ["KEYSTATIC_GITHUB_CLIENT_ID", "KEYSTATIC_GITHUB_CLIENT_SECRET", "KEYSTATIC_SECRET"],
    licence: "MIT",
  },
  {
    id: "portfolio",
    stacks: ALL_STACKS,
    env: [],
    licence: "MIT",
  },
  {
    id: "video",
    stacks: ALL_STACKS,
    env: [],
    licence: "MIT",
  },
  {
    id: "analytics",
    stacks: ALL_STACKS,
    env: ["PLAUSIBLE_DOMAIN", "UMAMI_WEBSITE_ID", "UMAMI_SCRIPT_SRC", "GA4_MEASUREMENT_ID"],
    licence: "MIT",
  },
];

const SKIP_DIRS = new Set(["node_modules", "dist", "out", ".next", ".astro"]);

export function listTemplates(): Array<{ id: TemplateId; dir: string; stack: TemplateStack }> {
  return TEMPLATES.map((item) => ({
    id: item.id,
    dir: path.join(packageRoot, item.dirName),
    stack: item.stack,
  }));
}

export function listRecipes(): Array<{ id: string; stacks: TemplateId[]; env: string[]; licence: string }> {
  return RECIPES.map((item) => ({
    id: item.id,
    stacks: [...item.stacks],
    env: [...item.env],
    licence: item.licence,
  }));
}

async function copyTree(from: string, to: string): Promise<string[]> {
  const written: string[] = [];
  await mkdir(to, { recursive: true });
  const entries = await readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      written.push(...(await copyTree(source, target)));
      continue;
    }
    if (!entry.isFile()) continue;
    await cp(source, target);
    written.push(target);
  }
  return written;
}

export async function scaffold(id: TemplateId, outDir: string, opts: { recipes: string[] }): Promise<string[]> {
  const template = listTemplates().find((item) => item.id === id);
  if (template === undefined) throw new Error(`Unknown template ${id}`);
  const known = new Set(RECIPES.map((item) => item.id));
  const unknown = opts.recipes.filter((item) => !known.has(item));
  if (unknown.length > 0) throw new Error(`Unknown recipes: ${unknown.join(", ")}`);
  const written = await copyTree(template.dir, outDir);
  for (const recipeId of opts.recipes) {
    const recipeDir = path.join(packageRoot, "recipes", recipeId);
    written.push(...(await copyTree(recipeDir, path.join(outDir, "recipes", recipeId))));
  }
  return written.sort();
}
