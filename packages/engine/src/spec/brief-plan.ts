/**
 * Turn an approved Site Brief into the pages and features the plan must build.
 * A thin brief with no page list stays a single Home page, matching the
 * earlier one-page package. A listed page is never dropped to fit a count.
 */

import { directionAcceptance, sectionAcceptance, translateBrief, type ArtDirection } from "./art-direction.ts";
import { assertPhoneBudgetBefore3d } from "./phone-budget.ts";
import { DESIGN_FILE_LINES } from "./design-outputs.ts";
import { PlanCritiqueError, critiquePlan, draftPlan } from "./plan-critique.ts";
import { planSkillLines, siteTypeForWorld } from "./skills.ts";
import { planMotion } from "./motion.ts";
import { sectionForMotion, visualMotionRequests } from "./visual-motion.ts";
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
  { name: "footer newsletter signup", when: (text) => /newsletter/i.test(text) },
  { name: "WhatsApp link", when: (text) => /whatsapp/i.test(text) },
  { name: "gallery", when: (text) => /\bgallery\b/i.test(text) },
  { name: "general contact form", when: (text) => /general contact form/i.test(text) },
  { name: "contact form", when: (text) => /contact form/i.test(text) && !/general contact form/i.test(text) },
  { name: "blog and monthly guide", when: (text) => wantsBlog(text) },
  { name: "footer legal disclaimer", when: (text) => /disclaimer/i.test(text) },
  {
    name: "FAQ structured data",
    when: (text) => /faq/i.test(text) && /structured data|json-ld/i.test(text),
  },
  { name: "llms.txt", when: (text) => /llms\.txt/i.test(text) },
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

/**
 * Optional `## Sections` lines override the default one-section pages.
 * `Home: hero, story, farms` names those ids. A missing heading leaves
 * the defaults (`hero` on the first page, `${id}-main` on the rest).
 */
function applyNamedSections(markdown: string, pages: PlannedPage[]): PlannedPage[] {
  const body = sectionBody(markdown, "Sections");
  if (body.trim() === "") return pages;
  const assigned = new Map<string, string[]>();
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/^[-*]\s*/, "").trim();
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const rawPage = line.slice(0, colon).trim();
    const page = pages.find((item) => {
      if (item.id === slug(rawPage)) return true;
      if (item.title.toLowerCase() === rawPage.toLowerCase()) return true;
      const title = canonicalTitle(rawPage);
      return title !== null && item.title.toLowerCase() === title.toLowerCase();
    });
    if (page === undefined) continue;
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const part of line.slice(colon + 1).split(",")) {
      const id = slug(part);
      if (id === "" || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    if (ids.length === 0) continue;
    assigned.set(page.id, ids);
  }
  if (assigned.size === 0) return pages;
  return pages.map((page) => {
    const next = assigned.get(page.id);
    return next === undefined ? page : { ...page, sections: next };
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
  const withDefaults = pages.map((page, index) => ({
    ...page,
    sections: page.sections.length > 0 ? page.sections : index === 0 ? ["hero"] : [`${page.id}-main`],
  }));
  return {
    parsed: parsed || found.length > 0,
    pages: applyNamedSections(markdown, withDefaults),
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

function effectsFromArt(
  pages: readonly PlannedPage[],
  art: ArtDirection,
  stack: SiteStack,
): SiteSkeletonInput["effects"] {
  const visualPages = pages.map((page) => ({ id: page.id, sections: page.sections }));
  const requests = visualMotionRequests(visualPages, art);
  const planned = planMotion({ requests, appetite: art.motion.score, stack });
  const pageOf = new Map(requests.map((request) => [request.id, request.page]));
  const effects: SiteSkeletonInput["effects"] = [];
  const seen = new Set<string>();
  for (const row of planned.assignments) {
    const hashed = row.id.indexOf("#");
    const pageId = pageOf.get(row.id) ?? (hashed > 0 ? row.id.slice(0, hashed) : "");
    const page = pages.find((item) => item.id === pageId);
    if (page === undefined) continue;
    const id = row.id.replaceAll("#", "-");
    if (seen.has(id)) continue;
    seen.add(id);
    effects.push({
      id,
      library: row.library,
      sectionId: sectionForMotion(page.sections, row.element),
      page: pageId,
    });
  }
  return effects;
}

export function generateBriefPlan(
  briefMarkdown: string,
  stack: SiteStack = "astro",
  answers: readonly BriefAnswer[] = [],
): { prompts: SitePromptSkeleton[]; warnings: string[]; planned: BriefPlan } {
  const corpus = [briefMarkdown, answerCorpus(answers)].filter((part) => part.trim() !== "").join("\n");
  const critique = critiquePlan(draftPlan(corpus));
  if (!critique.pass) throw new PlanCritiqueError(critique.failure);
  const planned = planFromBrief(briefMarkdown, answers);
  const art = translateBrief(
    briefMarkdown,
    answers,
    planned.pages.flatMap((page) => page.sections),
  );
  const effects = effectsFromArt(planned.pages, art, stack);
  assertPhoneBudgetBefore3d(
    briefMarkdown,
    effects.some((effect) => effect.library === "three" || effect.library === "ogl" || effect.library === "theatre"),
  );
  const input: SiteSkeletonInput = {
    pages: planned.pages,
    effects,
    features: planned.features,
    integrations: [],
    seoItems: [],
    stack,
    protectedPaths: [],
  };
  const generated = generateSkeleton(input);
  const bySection = new Map(art.sections.map((section) => [section.sectionId, section]));
  for (const prompt of generated.prompts) {
    const requirement = prompt.requirements[0] ?? "";
    if (requirement === "REQ-ART-DIRECTION") {
      prompt.acceptance = directionAcceptance(art);
      continue;
    }
    if (!requirement.startsWith("REQ-ART-")) continue;
    const sectionId = requirement.slice("REQ-ART-".length);
    const section = bySection.get(sectionId);
    if (section === undefined) continue;
    prompt.acceptance = sectionAcceptance(section, art);
    const skills = planSkillLines({
      siteType: siteTypeForWorld(art.styleWorld),
      motionAppetite: art.motion.score,
      sectionKind: sectionId,
      artDirection: `${section.layout} ${section.media} ${section.motion}`,
    });
    if (skills !== "") prompt.acceptance = [...prompt.acceptance, ...skills.split("\n")];
  }
  for (const prompt of generated.prompts) {
    const acceptance = prompt.acceptance ?? [];
    const missing = DESIGN_FILE_LINES.filter((line) => !acceptance.includes(line));
    if (missing.length > 0) prompt.acceptance = [...acceptance, ...missing];
  }
  return { ...generated, planned };
}
