/**
 * Turn an approved Site Brief into the pages and features the plan must build.
 * A thin brief with no page list stays a single Home page, matching the
 * earlier one-page package. A listed page is never dropped to fit a count.
 */

import {
  featureRequirementId,
  generateSkeleton,
  pageRequirementId,
  type SitePromptSkeleton,
  type SiteSkeletonInput,
  type SiteStack,
} from "./site-prompts.ts";

export interface PlannedPage {
  id: string;
  title: string;
  route: string;
  sections: string[];
  contentSources: string[];
}

export interface PlanRequirement {
  id: string;
  label: string;
}

export interface BriefPlan {
  pages: PlannedPage[];
  features: string[];
  requirements: PlanRequirement[];
}

const FEATURES: ReadonlyArray<{ name: string; when: (text: string) => boolean }> = [
  {
    name: "filters, sort, and URL state",
    when: (text) => /filter/i.test(text) && /\bsort\b/i.test(text) && /\burl\b/i.test(text),
  },
  { name: "map", when: (text) => /\bmap\b/i.test(text) },
  { name: "favorites", when: (text) => /favorite/i.test(text) },
  {
    name: "EN-ES toggle",
    when: (text) => /en\/es/i.test(text) || (/english/i.test(text) && /spanish/i.test(text)),
  },
  { name: "caretaker sign-up form", when: (text) => /caretaker sign-up/i.test(text) },
  {
    name: "farm inquiry prefilled with farm id",
    when: (text) => /inquir/i.test(text) && /prefilled|farm id/i.test(text),
  },
  { name: "newsletter", when: (text) => /newsletter/i.test(text) },
  { name: "WhatsApp link", when: (text) => /whatsapp/i.test(text) },
  { name: "gallery", when: (text) => /\bgallery\b/i.test(text) },
  {
    name: "llms.txt and FAQ JSON-LD",
    when: (text) => /llms\.txt/i.test(text) && /faq/i.test(text),
  },
  { name: "contact form", when: (text) => /contact form/i.test(text) },
  { name: "general contact form", when: (text) => /contact form/i.test(text) },
  { name: "footer newsletter signup", when: (text) => /newsletter/i.test(text) },
  { name: "blog and monthly guide", when: (text) => wantsBlog(text) },
  { name: "footer legal disclaimer", when: (text) => /disclaimer/i.test(text) },
  {
    name: "FAQ structured data",
    when: (text) => /faq/i.test(text) && /structured data|json-ld/i.test(text),
  },
  { name: "llms.txt", when: (text) => /llms\.txt/i.test(text) && !/faq/i.test(text) },
];

const HOME_PAGE: PlannedPage = {
  id: "home",
  title: "Home",
  route: "/",
  sections: ["hero"],
  contentSources: ["src/data/routes.ts", "src/data/copy.ts"],
};

function sectionBody(markdown: string, heading: string): string {
  const match = new RegExp(`^##\\s+${heading}\\s*$`, "im").exec(markdown);
  if (match === null) return "";
  const rest = markdown.slice(match.index + match[0].length);
  const next = /^##\s+/m.exec(rest);
  return (next === null ? rest : rest.slice(0, next.index)).trim();
}

function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    else if (ch === ")" && depth > 0) depth -= 1;
    if (ch === sep && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function cutSentence(chunk: string): string {
  const match = /\.\s+[A-Z]/.exec(chunk);
  if (match === null || match.index === undefined) return chunk.trim();
  return chunk.slice(0, match.index).trim();
}

function splitTitleNote(chunk: string): { title: string; note: string } {
  let depth = 0;
  let start = -1;
  for (let index = 0; index < chunk.length; index += 1) {
    const ch = chunk[index];
    if (ch === "(") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (ch === ")" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        return {
          title: chunk.slice(0, start).trim(),
          note: chunk.slice(start + 1, index).trim(),
        };
      }
    }
  }
  return { title: chunk.trim(), note: "" };
}

function looksLikeTitle(text: string): boolean {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0 || words.length > 6) return false;
  if (text.length > 48) return false;
  if (/[.!?]/.test(text)) return false;
  return true;
}

function canonicalTitle(raw: string): string | null {
  const stripped = raw
    .replace(/^Pages:\s*/i, "")
    .replace(/^(and|or)\s+/i, "")
    .trim()
    .replace(/\.+$/, "");
  const lower = stripped.toLowerCase();
  if (lower === "a small blog" || lower === "small blog" || lower === "blog") return "Blog";
  if (lower === "privacy" || lower === "privacy policy") return "Privacy";
  if (lower === "terms" || lower === "terms of use") return "Terms";
  if (lower === "home" || lower === "index") return "Home";
  if (lower === "footer" || lower.startsWith("footer:") || lower.startsWith("no ")) return null;
  if (!looksLikeTitle(stripped)) return null;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sourcesFor(note: string): string[] {
  const sources = ["src/data/routes.ts", "src/data/copy.ts"];
  const noteText = note.replace(/\s+/g, " ").trim().slice(0, 240);
  if (
    noteText.length > 0 &&
    !noteText.includes("!") &&
    !noteText.includes("\u2014") &&
    !noteText.includes("..") &&
    !noteText.includes("\\")
  ) {
    sources.push(noteText);
  }
  return sources;
}

function parsePages(body: string): PlannedPage[] {
  const text = body.trim();
  if (text === "") return [];
  const semi = splitTopLevel(text, ";");
  let chunks = semi;
  if (semi.length < 2) {
    const commas = splitTopLevel(text, ",");
    const titles = commas.map((chunk) => canonicalTitle(splitTitleNote(cutSentence(chunk)).title));
    if (commas.length > 1 && titles.every((title) => title !== null)) chunks = commas;
  }
  const pages: PlannedPage[] = [];
  for (const chunk of chunks) {
    const { title: rawTitle, note } = splitTitleNote(cutSentence(chunk));
    const title = canonicalTitle(rawTitle);
    if (title === null) continue;
    const id = title === "Home" ? "home" : slug(title);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) continue;
    if (pages.some((page) => page.id === id)) continue;
    const route = title === "Home" ? "/" : `/${id}`;
    pages.push({
      id,
      title,
      route,
      sections: [],
      contentSources: sourcesFor(note),
    });
    if (/detail page/i.test(note) && !pages.some((page) => page.id === "farm-detail")) {
      const detailRoute = route === "/" ? "/[id]" : `${route}/[id]`;
      pages.push({
        id: "farm-detail",
        title: "Farm detail",
        route: detailRoute,
        sections: [],
        contentSources: sourcesFor(note),
      });
    }
  }
  return pages.map((page, index) => ({
    ...page,
    sections: index === 0 ? ["hero"] : [`${page.id}-main`],
  }));
}

function explicitFeatures(body: string): string[] {
  const text = body.trim();
  if (text === "") return [];
  const sentences = text.split(/(?<=\.)\s+/);
  if (text.length > 280 || sentences.length > 2) return [];
  const sep = text.includes(";") ? ";" : ",";
  const parts = splitTopLevel(text.replace(/\.$/, ""), sep);
  const names: string[] = [];
  for (const part of parts) {
    const name = part.replace(/\s+/g, " ").trim().replace(/[.]+$/, "").replace(/\//g, "-");
    if (name.length === 0 || name.length > 80) continue;
    if (/^(no|none|not)\b/i.test(name)) continue;
    if (name.includes("!") || name.includes("\\") || name.includes("..")) continue;
    names.push(name);
  }
  return names;
}

function featureNames(blob: string, featuresBody: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (name: string): void => {
    const id = slug(name);
    if (id === "" || seen.has(id)) return;
    seen.add(id);
    names.push(name);
  };
  for (const feature of FEATURES) {
    if (feature.when(blob)) add(feature.name);
  }
  for (const name of explicitFeatures(featuresBody)) add(name);
  return names;
}

export interface BriefAnswer {
  id: string;
  value: string;
  status?: string;
}

const SKIPPED_ANSWER = new Set(["SKIPPED", "NOT_APPLICABLE", "UNANSWERED"]);

function wantsBlog(text: string): boolean {
  if (/\bno blog\b/i.test(text)) return false;
  return /\bblog\b/i.test(text);
}

function pushPage(pages: PlannedPage[], title: string): void {
  const id = title === "Home" ? "home" : slug(title);
  if (id === "" || pages.some((page) => page.id === id)) return;
  pages.push({
    id,
    title,
    route: title === "Home" ? "/" : `/${id}`,
    sections: [],
    contentSources: ["src/data/routes.ts", "src/data/copy.ts"],
  });
}

function pagesFromCorpus(markdown: string, corpus: string): { pages: PlannedPage[]; parsed: boolean } {
  const lines = [...corpus.matchAll(/Pages:\s*[^\n]+/gi)].map((match) => match[0] ?? "");
  const sources = lines.length > 0 ? lines : [sectionBody(markdown, "Pages")];
  const found: PlannedPage[] = [];
  for (const source of sources) {
    if (source.trim() === "") continue;
    for (const page of parsePages(source)) {
      if (found.some((item) => item.id === page.id)) continue;
      found.push(page);
    }
  }
  const parsed = found.length > 0;
  if (/\bprivacy and terms\b/i.test(corpus)) {
    pushPage(found, "Privacy");
    pushPage(found, "Terms");
  }
  if (wantsBlog(corpus)) pushPage(found, "Blog");
  const pages = found.length === 0 ? [HOME_PAGE] : found;
  return {
    parsed: parsed || found.length > 0,
    pages: pages.map((page, index) => ({
      ...page,
      sections: page.sections.length > 0 ? page.sections : index === 0 ? ["hero"] : [`${page.id}-main`],
    })),
  };
}

function answerCorpus(answers: readonly BriefAnswer[]): string {
  const parts: string[] = [];
  for (const answer of answers) {
    if (SKIPPED_ANSWER.has(answer.status ?? "")) continue;
    const value = answer.value.trim();
    if (value === "") continue;
    parts.push(value);
  }
  return parts.join("\n");
}

export function planFromBrief(briefMarkdown: string, answers: readonly BriefAnswer[] = []): BriefPlan {
  const featuresBody = sectionBody(briefMarkdown, "Features");
  const corpus = [briefMarkdown, answerCorpus(answers)].filter((part) => part.trim() !== "").join("\n");
  const collected = pagesFromCorpus(briefMarkdown, corpus);
  const pages = collected.pages;
  let features = featureNames(corpus, featuresBody);
  if (features.length === 0 && !collected.parsed) features = ["contact form"];
  const requirements: PlanRequirement[] = [
    ...pages.map((page) => ({
      id: pageRequirementId(page.id),
      label: `${page.title} at ${page.route}`,
    })),
    ...features.map((feature) => ({
      id: featureRequirementId(feature),
      label: feature,
    })),
  ];
  return { pages, features, requirements };
}

export function generateBriefPlan(
  briefMarkdown: string,
  stack: SiteStack = "astro",
  answers: readonly BriefAnswer[] = [],
): { prompts: SitePromptSkeleton[]; warnings: string[]; planned: BriefPlan } {
  const planned = planFromBrief(briefMarkdown, answers);
  const input: SiteSkeletonInput = {
    pages: planned.pages,
    effects: [],
    features: planned.features,
    integrations: [],
    seoItems: [],
    stack,
    protectedPaths: [],
  };
  const generated = generateSkeleton(input);
  return { ...generated, planned };
}
