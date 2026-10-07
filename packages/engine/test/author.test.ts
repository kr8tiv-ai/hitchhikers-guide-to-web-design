import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { cassetteKey, writeCassette } from "../src/ai/cassette.ts";
import { think, type ThinkRequest, type ThinkResult } from "../src/ai/think.ts";
import { defaultConfig } from "../src/config.ts";
import { assembleContext, estimateTokens } from "../src/spec/context-doc.ts";
import {
  AUTHOR_BODY_SCHEMA,
  AUTHOR_EFFORT,
  AUTHOR_MODEL,
  AUTHOR_TASK,
  AUTHOR_TOKEN_BUDGET,
} from "../src/spec/author-schemas.ts";
import {
  AuthorError,
  anchorsFor,
  authorPackage,
  buildAuthorRequest,
  goldenName,
  pickGolden,
  type AuthorContext,
} from "../src/spec/author.ts";
import {
  discussFramework,
  registerInflight,
  retargetSkeleton,
} from "../src/spec/framework-discussion.ts";
import {
  MOTION_BIND_SENTENCE,
  generateSkeleton,
  type SitePrompt,
  type SitePromptSkeleton,
  type SiteSkeletonInput,
  type SiteStack,
} from "../src/spec/site-prompts.ts";
import { SITE_RULES } from "../src/spec/site-rules.ts";
import { validatePackage } from "../src/spec/site-validate.ts";
import { StackError, decideStack, type StackDecision } from "../src/spec/stack.ts";

const CREDIT =
  "Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.";

const SLOTS = ["{{library}}", "{{element}}", "{{page}}", "{{section}}", "{{anchor}}", "{{files}}"] as const;

const HEADINGS = ["Goal", "Files", "Steps", "must_haves", "Verify"] as const;

const TAGS = ["objective", "read_first", "task", "must_haves", "verify", "report_back", "commit"] as const;

const MATT_PHRASES = [
  "No effects yet; motion comes in a later prompt.",
  "Motion must feel confident and quick but never bouncy",
  "Install Playwright as a dev dependency.",
  "about 56px",
  "after 80px of scroll",
  "simply visible",
  "lenis.on('scroll', ScrollTrigger.update)",
  "400vh",
  "@theatre/core",
  "If it's a 6, say 6",
  "headline is 14 words",
  "Book a call",
  "explicit yes",
  "Fresh start",
  "@font-face",
] as const;

const SPOT = {
  nav: "The bar is 56px tall. It frosts after 80px of scroll.",
  hero: "Full viewport height. On mobile, use the still image, not the video.",
  scroll: "Duration is 600ms. There is no second scroll owner.",
  credits: "The credits row has name, author, license, link, usedFor, and category.",
  deploy: "Deploy only after an explicit yes. The token stays in the environment.",
} as const;

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const goldenDir = path.join(repo, "packages", "knowledge", "golden");
const packsDir = path.join(repo, "packages", "knowledge", "packs");
const templatesDir = path.join(repo, "packages", "templates");

function calmInput(stack: SiteStack = "astro"): SiteSkeletonInput {
  return {
    pages: [
      { id: "home", title: "Home", sections: ["hero", "offer", "proof"] },
      { id: "work", title: "Work", sections: ["selected", "process"] },
      { id: "visit", title: "Visit", sections: ["hours", "find"] },
    ],
    effects: [{ id: "hero-mark", library: "css-scroll", sectionId: "hero", page: "home" }],
    features: ["contact form"],
    integrations: ["resend"],
    seoItems: ["sitemap", "json-ld"],
    stack,
    protectedPaths: ["src/pages/index.astro#splash"],
  };
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function lastNonEmptyLine(text: string): string {
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line !== undefined && line.trim() !== "") return line.trim();
  }
  return "";
}

function towelContext(): string {
  return assembleContext({
    name: "Towel and Tea",
    siteWhy: "A calm tea room site for the fixture.",
    gloss: {
      brand: "Warm paper, ink, and a single green.",
      voice: "Short sentences. No hype.",
      motion: "One scroll owner. Quick, never bouncy.",
      stack: "Astro for a content site.",
      sections: "Home, work, and visit, with a hero.",
    },
  }).markdown;
}

function authorCtx(projectDir: string, contextMd: string): AuthorContext {
  return { contextMd, packsDir, goldenDir, templatesDir, projectDir };
}

function skeleton(partial: Partial<SitePromptSkeleton> & Pick<SitePromptSkeleton, "title" | "requirements">): SitePromptSkeleton {
  const entry: SitePromptSkeleton = {
    id: partial.id ?? "001",
    phase: partial.phase ?? "improbability-drive",
    slice: partial.slice ?? "Vogon Constructor Fleet",
    title: partial.title,
    tier: partial.tier ?? "Towel",
    effort: partial.effort ?? "medium",
    model: partial.model ?? "grok-4.7",
    dependsOn: partial.dependsOn ?? [],
    filesModified: partial.filesModified ?? ["src/styles/tokens.css"],
    requirements: partial.requirements,
    protected: partial.protected ?? [],
    reviewAfter: partial.reviewAfter ?? false,
    maxTurns: partial.maxTurns ?? 40,
    kind: partial.kind ?? "build",
  };
  if (partial.library !== undefined) entry.library = partial.library;
  return entry;
}

function anchorIds(input: string): string[] {
  const start = input.indexOf("\nANCHORS:\n");
  const end = input.indexOf("\nEND_ANCHORS");
  assert.ok(start >= 0 && end > start);
  const block = input.slice(start + "\nANCHORS:\n".length, end);
  const ids: string[] = [];
  for (const match of block.matchAll(/^#([a-z0-9-]+)$/gm)) {
    const id = match[1];
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

function entryFrom(input: string): SitePromptSkeleton {
  const start = input.indexOf("SKELETON_JSON:\n");
  const end = input.indexOf("\nEND_SKELETON");
  assert.ok(start >= 0 && end > start);
  const parsed: unknown = JSON.parse(input.slice(start + "SKELETON_JSON:\n".length, end));
  assert.ok(parsed !== null && typeof parsed === "object");
  return parsed as SitePromptSkeleton;
}

function spotLine(entry: SitePromptSkeleton): string {
  const req = entry.requirements[0] ?? "";
  const lines: string[] = [];
  if (req === "REQ-NAV") lines.push(SPOT.nav);
  if (req === "REQ-STRUCT-hero") lines.push(SPOT.hero);
  if (entry.library === "css-scroll") lines.push(SPOT.scroll);
  if (req === "REQ-CREDITS") lines.push(SPOT.credits);
  if (req === "REQ-DEPLOY") lines.push(SPOT.deploy);
  return lines.join("\n");
}

function bodyFor(entry: SitePromptSkeleton, anchors: readonly string[]): string {
  const motion =
    entry.library === undefined ? "" : `\n${entry.library}\n${MOTION_BIND_SENTENCE}\n`;
  return [
    "<objective>",
    entry.title,
    "</objective>",
    "<read_first>",
    ...anchors.map((id) => `@.hitchhiker/CONTEXT.md#${id}`),
    "</read_first>",
    "<task>",
    entry.title,
    ...entry.filesModified,
    spotLine(entry),
    motion,
    "</task>",
    "<must_haves>",
    `truths: [${JSON.stringify(entry.title)}]`,
    `artifacts: [${JSON.stringify(entry.filesModified[0] ?? entry.id)}]`,
    `key_links: [${JSON.stringify(`${entry.id} edits the files named in this prompt.`)}]`,
    `prohibitions: ["Do not invent testimonials."]`,
    "</must_haves>",
    "<verify>",
    "npm run build",
    "</verify>",
    "<report_back>",
    "Report the files and anything assumed.",
    "</report_back>",
    "<commit>",
    `feat(site): ${entry.id}`,
    "</commit>",
  ].join("\n");
}

type ScriptMode = "ok" | "repair-once" | "double-fail" | "override-next" | "override-forever";

function scripted(mode: ScriptMode, decision?: StackDecision): {
  think: typeof think;
  calls: () => number;
  requests: () => string[];
  bodies: () => Map<string, string>;
} {
  const requests: string[] = [];
  const bodies = new Map<string, string>();
  let calls = 0;
  const impl: typeof think = async <T>(req: ThinkRequest<T>): Promise<ThinkResult<T>> => {
    calls += 1;
    assert.equal(req.task, AUTHOR_TASK);
    assert.equal(req.model, AUTHOR_MODEL);
    assert.equal(req.effort, AUTHOR_EFFORT);
    assert.deepEqual(req.schema, AUTHOR_BODY_SCHEMA);
    requests.push(req.input);
    if (mode === "override-next" && calls === 1 && decision !== undefined) {
      await discussFramework(decision, {
        ask: async () => ({ override: "next" }),
      });
    }
    if (mode === "override-forever" && decision !== undefined) {
      await discussFramework(decision, {
        ask: async () => ({ override: "next" }),
      });
    }
    const entry = entryFrom(req.input);
    const failed = req.input.includes("failed validation");
    let body = "";
    if (mode === "double-fail" && entry.id === "001") body = "nope";
    else if (mode === "repair-once" && entry.id === "001" && !failed) body = "nope";
    else {
      const anchors = anchorIds(req.input);
      assert.ok(anchors.length > 0, entry.id);
      body = bodyFor(entry, anchors);
      bodies.set(entry.id, body);
    }
    return {
      value: { body } as T,
      raw: JSON.stringify({ body }),
      durationMs: 1,
      cassette: "live",
    };
  };
  return {
    think: impl,
    calls: () => calls,
    requests: () => requests,
    bodies: () => bodies,
  };
}

function promptsFrom(skeletonRows: readonly SitePromptSkeleton[], bodies: ReadonlyMap<string, string>): SitePrompt[] {
  return skeletonRows.map((entry) => {
    const body = bodies.get(entry.id);
    assert.equal(typeof body, "string", entry.id);
    const prompt: SitePrompt = {
      ...entry,
      rules: SITE_RULES,
      body: body ?? "",
    };
    return prompt;
  });
}

function dropHeading(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line === `## ${heading}`);
  assert.ok(start >= 0, heading);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined && line.startsWith("## ")) {
      end = index;
      break;
    }
  }
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
}

function promptFile(dir: string, id: string): string | undefined {
  const names = readdirSync(dir).filter((name) => name.startsWith(`${id}-`) && name.endsWith(".md"));
  const name = names[0];
  if (name === undefined) return undefined;
  return readFileSync(path.join(dir, name), "utf8");
}

test("about 40 golden templates carry slots, sections, and the denylist", () => {
  const names = readdirSync(goldenDir).filter((name) => name.endsWith(".md")).sort();
  assert.ok(names.length >= 40 && names.length <= 48, `count ${names.length}`);
  let credited = 0;
  for (const name of names) {
    const text = readFileSync(path.join(goldenDir, name), "utf8");
    assert.equal(/act as a/i.test(text), false, name);
    assert.equal(/ignore previous/i.test(text), false, name);
    assert.equal(text.includes("\u2014"), false, name);
    assert.equal(text.includes("!"), false, name);
    assert.ok(wordCount(text) < 900, `${name} ${wordCount(text)}`);
    assert.ok(text.includes("site-rules.ts"), name);
    for (const heading of HEADINGS) {
      assert.match(text, new RegExp(`^# ${heading}\\r?$`, "m"), `${name} ${heading}`);
    }
    for (const key of ["truths:", "artifacts:", "key_links:", "prohibitions:"]) {
      assert.ok(text.includes(key), `${name} ${key}`);
    }
    for (const slot of SLOTS) assert.ok(text.includes(slot), `${name} ${slot}`);
    for (const tag of TAGS) assert.match(text, new RegExp(`<${tag}>`), `${name} ${tag}`);
    const quoted = MATT_PHRASES.some((phrase) => text.includes(phrase));
    if (quoted || text.includes(CREDIT)) {
      assert.equal(lastNonEmptyLine(text), CREDIT, name);
      credited += 1;
    }
  }
  assert.ok(credited >= 30, `credited ${credited}`);
});

test("pickGolden maps kinds onto template files", () => {
  const cases: Array<[SitePromptSkeleton, string]> = [
    [skeleton({ title: "Scaffold the strict TypeScript project.", requirements: ["REQ-SCAFFOLD"] }), "setup.md"],
    [skeleton({ title: "Add the font files and the font-face rules.", requirements: ["REQ-FONTS"] }), "fonts.md"],
    [skeleton({ title: "Add the document shell.", requirements: ["REQ-LAYOUT"] }), "layout.md"],
    [skeleton({ title: "Set color and type tokens from the approved brand.", requirements: ["REQ-TOKENS"] }), "tokens.md"],
    [skeleton({ title: "Record the approved page ids and titles in the route module.", requirements: ["REQ-ROUTES"] }), "routes.md"],
    [skeleton({ title: "Add the site nav from the route module.", requirements: ["REQ-NAV"] }), "nav.md"],
    [skeleton({ title: "Build the hero layout on Home with no effect library.", requirements: ["REQ-STRUCT-hero"] }), "hero.md"],
    [skeleton({ title: "Build the offer layout on Home with no effect library.", requirements: ["REQ-STRUCT-offer"] }), "section.md"],
    [skeleton({ title: "Place real copy in the hero section.", requirements: ["REQ-COPY-hero"] }), "page.md"],
    [skeleton({ title: "Add the feature: contact form.", requirements: ["REQ-FEAT-contact-form"] }), "forms.md"],
    [skeleton({ title: "Add the feature: gallery.", requirements: ["REQ-FEAT-gallery"] }), "feature.md"],
    [skeleton({ title: "Add the SEO item: blog.", requirements: ["REQ-SEO-blog"] }), "blog.md"],
    [skeleton({ title: "Add the SEO item: sitemap.", requirements: ["REQ-SEO-sitemap"] }), "seo.md"],
    [skeleton({ title: "Bind gsap on the hero section with a split.", requirements: ["REQ-FX-hero"], library: "gsap" }), "split-text.md"],
    [skeleton({ title: "Bind gsap on the hero section with a scroll video scrub.", requirements: ["REQ-FX-hero"], library: "gsap" }), "scroll-video.md"],
    [skeleton({ title: "Bind gsap on the hero section as a transition.", requirements: ["REQ-FX-hero"], library: "gsap" }), "transitions.md"],
    [skeleton({ title: "Bind gsap on the hero section as a reveal.", requirements: ["REQ-FX-hero"], library: "gsap" }), "reveals.md"],
    [skeleton({ title: "Bind gsap on the hero section.", requirements: ["REQ-FX-hero"], library: "gsap" }), "motion.md"],
    [skeleton({ title: "Bind lenis on the hero section.", requirements: ["REQ-FX-hero"], library: "lenis" }), "lenis.md"],
    [skeleton({ title: "Bind ogl on the hero section.", requirements: ["REQ-FX-hero"], library: "ogl" }), "shader.md"],
    [skeleton({ title: "Bind three on the hero section.", requirements: ["REQ-FX-hero"], library: "three" }), "three.md"],
    [skeleton({ title: "Bind css-scroll on the hero section.", requirements: ["REQ-FX-hero"], library: "css-scroll" }), "css-scroll.md"],
    [skeleton({ title: "Run Lighthouse on the phone path.", requirements: ["REQ-GATE-LIGHTHOUSE"] }), "lighthouse.md"],
    [skeleton({ title: "Open every page at 375.", requirements: ["REQ-GATE-PLAYWRIGHT"] }), "qa.md"],
    [skeleton({ title: "Apply the fix list from the jury.", requirements: ["REQ-JURY"] }), "fix.md"],
    [skeleton({ title: "Final once-over.", requirements: ["REQ-ONCE-OVER"], kind: "once-over" }), "once-over.md"],
    [skeleton({ title: "Deploy only after an explicit yes.", requirements: ["REQ-DEPLOY"] }), "deploy.md"],
    [skeleton({ title: "Elevate pass for type and spacing.", requirements: ["REQ-ELEVATE-TYPE"] }), "elevate-type.md"],
  ];
  for (const [entry, file] of cases) {
    const picked = pickGolden(entry, goldenDir);
    assert.equal(path.basename(picked), file, entry.title);
    assert.equal(readFileSync(picked, "utf8").length > 0, true, file);
  }
  for (const entry of generateSkeleton(calmInput()).prompts) {
    const picked = pickGolden(entry, goldenDir);
    assert.equal(readFileSync(picked, "utf8").includes("# Goal"), true, entry.title);
  }
});

test("retargetSkeleton matches generateSkeleton and leaves protected paths", () => {
  const stacks: readonly SiteStack[] = ["astro", "next", "vite-react", "sveltekit"];
  for (const from of stacks) {
    const source = generateSkeleton(calmInput(from)).prompts;
    for (const to of stacks) {
      const retargeted = retargetSkeleton(source, to);
      const expected = generateSkeleton(calmInput(to)).prompts;
      assert.equal(retargeted.length, expected.length, `${from} to ${to}`);
      retargeted.forEach((entry, index) => {
        const want = expected[index];
        const original = source[index];
        assert.ok(want && original);
        assert.deepEqual(entry.filesModified, want.filesModified, `${from} to ${to} ${entry.id} ${entry.title}`);
        assert.deepEqual(entry.protected, original.protected, entry.id);
        assert.equal(entry.library, original.library);
      });
    }
  }
});

test("a huge pack excerpt is trimmed before the anchor and the skeleton", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-author-pack-"));
  try {
    const packRoot = path.join(dir, "packs", "anti-slop");
    mkdirSync(packRoot, { recursive: true });
    const sentinel = "SENTINELTAIL";
    writeFileSync(path.join(packRoot, "SKILL.md"), `${"word ".repeat(200_000)}${sentinel}`, "utf8");
    const entry = skeleton({
      title: "Build the offer layout on Home with no effect library.",
      requirements: ["REQ-STRUCT-offer"],
      filesModified: ["src/components/SectionOffer.astro"],
    });
    const request = buildAuthorRequest(entry, {
      contextMd: "# CONTEXT\n\n## Sections\n\nHome, work, and visit.\n",
      packsDir: path.join(dir, "packs"),
      goldenDir,
      templatesDir: dir,
      projectDir: dir,
    });
    assert.ok(estimateTokens(request.input) <= AUTHOR_TOKEN_BUDGET);
    assert.equal(request.input.includes(sentinel), false);
    assert.ok(request.input.includes("SKELETON_JSON:"));
    assert.ok(request.input.includes("#sections"));
    assert.equal(request.goldenName, "section");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("framework discussion and authored packages", async () => {
  const decision = decideStack({
    siteType: "brand",
    motionLevel: 4,
    persistentCanvas: false,
  });
  assert.equal(decision.pick, "astro");
  const accepted = await discussFramework(decision, {
    ask: async (card) => {
      assert.ok(card !== null && typeof card === "object");
      const shown = card as { pick: string; why: string; alternatives: string; tradeoffs: string };
      assert.equal(shown.pick, "astro");
      assert.ok(shown.why.length > 0);
      assert.ok(shown.alternatives.length > 0);
      assert.ok(shown.tradeoffs.length > 0);
      return "accept";
    },
  });
  assert.equal(accepted, decision);

  const insisted = await discussFramework(decision, {
    ask: async () => ({ override: "sveltekit" }),
  });
  assert.equal(insisted.pick, "sveltekit");
  assert.equal(insisted.insisted, true);
  assert.match(insisted.markdown, /thinner/);
  assert.equal(insisted.markdown.includes("!"), false);
  assert.match(insisted.markdown, /^# STACK-DECISION/m);
  assert.match(insisted.markdown, /^## Pick/m);
  assert.match(insisted.markdown, /^## Why/m);
  assert.match(insisted.markdown, /^## Alternatives/m);

  const same = await discussFramework(decision, {
    ask: async () => ({ override: "astro" }),
  });
  assert.equal(same.pick, "astro");
  assert.equal(same.insisted, true);
  assert.equal(same.markdown, decision.markdown);

  let stopped = 0;
  registerInflight({
    id: Symbol("test"),
    stop() {
      stopped += 1;
    },
  });
  try {
    await discussFramework(decision, { ask: async () => ({ override: "astro" }) });
    assert.equal(stopped, 0);
    const changed = await discussFramework(decision, { ask: async () => ({ override: "next" }) });
    assert.equal(stopped, 1);
    assert.equal(changed.pick, "next");
  } finally {
    registerInflight(null);
  }

  await assert.rejects(
    () => discussFramework(decision, { ask: async () => ({ override: "wordpress" }) }),
    StackError,
  );

  const skeletonRows = generateSkeleton(calmInput()).prompts;
  assert.ok(skeletonRows.length >= 50 && skeletonRows.length <= 150);
  const contextMd = towelContext();
  const projectDir = await mkdtemp(path.join(os.tmpdir(), "hh-author-"));
  try {
    const happy = scripted("ok");
    const authored = await authorPackage(skeletonRows, authorCtx(projectDir, contextMd), { think: happy.think });
    assert.deepEqual(authored.needsHuman, []);
    assert.equal(authored.written.length, skeletonRows.length);
    assert.equal(happy.calls(), skeletonRows.length);
    const promptsDir = path.join(projectDir, ".hitchhiker", "prompts");
    const report = validatePackage(promptsFrom(skeletonRows, happy.bodies()));
    assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
    for (const sentence of Object.values(SPOT)) {
      const hit = authored.written.some((file) => readFileSync(file, "utf8").includes(sentence));
      assert.equal(hit, true, sentence);
    }
    const nav = skeletonRows.find((entry) => entry.requirements[0] === "REQ-NAV");
    const hero = skeletonRows.find((entry) => entry.requirements[0] === "REQ-STRUCT-hero");
    const scroll = skeletonRows.find((entry) => entry.library === "css-scroll");
    const credits = skeletonRows.find((entry) => entry.requirements[0] === "REQ-CREDITS");
    const deploy = skeletonRows.find((entry) => entry.requirements[0] === "REQ-DEPLOY");
    assert.ok(nav && hero && scroll && credits && deploy);
    for (const entry of [nav, hero, scroll, credits, deploy]) {
      const text = promptFile(promptsDir, entry.id);
      assert.ok(text, entry.id);
      assert.ok(text.includes(SITE_RULES));
      assert.ok(text.includes(spotLine(entry).split("\n")[0] ?? entry.title));
      const file = entry.filesModified[0];
      assert.ok(file);
      assert.ok(text.includes(file), entry.id);
      assert.equal(text.includes("as before"), false, entry.id);
      assert.equal(text.includes("see above"), false, entry.id);
      assert.equal(text.includes("same as previous"), false, entry.id);
      assert.equal(text.includes("!"), false, entry.id);
    }

    const repairDir = await mkdtemp(path.join(os.tmpdir(), "hh-author-repair-"));
    try {
      const repair = scripted("repair-once");
      const repaired = await authorPackage(skeletonRows, authorCtx(repairDir, contextMd), { think: repair.think });
      assert.deepEqual(repaired.needsHuman, []);
      assert.equal(repaired.written.length, skeletonRows.length);
      assert.equal(repair.calls(), skeletonRows.length + 1);
      const repairedReport = validatePackage(promptsFrom(skeletonRows, repair.bodies()));
      assert.equal(repairedReport.ok, true, JSON.stringify(repairedReport.errors, null, 2));
    } finally {
      rmSync(repairDir, { recursive: true, force: true });
    }

    const failDir = await mkdtemp(path.join(os.tmpdir(), "hh-author-fail-"));
    try {
      const failing = scripted("double-fail");
      const failed = await authorPackage(skeletonRows, authorCtx(failDir, contextMd), { think: failing.think });
      assert.deepEqual(failed.needsHuman, ["001"]);
      assert.equal(failed.written.length, skeletonRows.length - 1);
      assert.equal(promptFile(path.join(failDir, ".hitchhiker", "prompts"), "001"), undefined);
      assert.equal(failing.calls(), skeletonRows.length + 1);
      const second = skeletonRows[1];
      assert.ok(second);
      assert.ok(promptFile(path.join(failDir, ".hitchhiker", "prompts"), second.id));
    } finally {
      rmSync(failDir, { recursive: true, force: true });
    }

    const missingDir = await mkdtemp(path.join(os.tmpdir(), "hh-author-missing-"));
    try {
      const missingMd = dropHeading(contextMd, "Motion");
      const missing = scripted("ok");
      const result = await authorPackage(skeletonRows, authorCtx(missingDir, missingMd), { think: missing.think });
      const motionIds = skeletonRows
        .filter((entry) => anchorsFor(goldenName(entry)).includes("motion"))
        .map((entry) => entry.id);
      assert.ok(motionIds.length >= 1);
      assert.deepEqual([...result.needsHuman].sort(), [...motionIds].sort());
      const promptsRoot = path.join(missingDir, ".hitchhiker", "prompts");
      for (const id of motionIds) {
        assert.equal(promptFile(promptsRoot, id), undefined, id);
        const seen = missing.requests().filter((input) => entryFrom(input).id === id);
        assert.equal(seen.length, 2, id);
        assert.ok(seen.every((input) => input.includes("MISSING ANCHOR #motion")), id);
      }
      const routes = skeletonRows.find((entry) => entry.requirements[0] === "REQ-ROUTES");
      assert.ok(routes);
      assert.equal(motionIds.includes(routes.id), false);
      assert.ok(promptFile(promptsRoot, routes.id));
      const scrollId = skeletonRows.find((entry) => entry.library === "css-scroll")?.id;
      assert.ok(scrollId);
      assert.ok(result.needsHuman.includes(scrollId));
    } finally {
      rmSync(missingDir, { recursive: true, force: true });
    }

    const swapDir = await mkdtemp(path.join(os.tmpdir(), "hh-author-swap-"));
    try {
      const swap = scripted("override-next", decision);
      const swapped = await authorPackage(skeletonRows, authorCtx(swapDir, contextMd), { think: swap.think });
      const nextRows = generateSkeleton(calmInput("next")).prompts;
      assert.equal(swapped.needsHuman.length, 0);
      assert.equal(swapped.written.length, nextRows.length);
      assert.equal(swap.calls(), skeletonRows.length + 1);
      const navNext = nextRows.find((entry) => entry.requirements[0] === "REQ-NAV");
      assert.ok(navNext);
      const navText = promptFile(path.join(swapDir, ".hitchhiker", "prompts"), navNext.id);
      assert.ok(navText);
      assert.ok(navText.includes("src/components/Nav.tsx"));
      assert.ok(navText.includes("src/app/layout.tsx"));
      assert.equal(navText.includes("src/components/Nav.astro"), false);
      const later = swap.requests().slice(1);
      assert.ok(later.length > 0);
      for (const input of later) {
        const files = entryFrom(input).filesModified;
        assert.equal(files.some((file) => file.endsWith(".astro")), false, files.join(","));
        assert.equal(files.includes("astro.config.ts"), false);
      }
      const nextReport = validatePackage(promptsFrom(nextRows, swap.bodies()));
      assert.equal(nextReport.ok, true, JSON.stringify(nextReport.errors, null, 2));
    } finally {
      rmSync(swapDir, { recursive: true, force: true });
    }

    await assert.rejects(
      () => authorPackage(skeletonRows, authorCtx(projectDir, contextMd), { think: scripted("override-forever", decision).think }),
      AuthorError,
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
    registerInflight(null);
  }
});

test("replay returns an authored body and does not spawn", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-author-cassette-"));
  try {
    const entry = generateSkeleton(calmInput()).prompts[0];
    assert.ok(entry);
    const request = buildAuthorRequest(entry, authorCtx(dir, towelContext()));
    const body = bodyFor(entry, anchorsFor(goldenName(entry)));
    const key = cassetteKey({
      task: AUTHOR_TASK,
      model: AUTHOR_MODEL,
      effort: AUTHOR_EFFORT,
      schema: AUTHOR_BODY_SCHEMA,
      input: request.input,
    });
    const cassetteDir = path.join(dir, "cassettes");
    writeCassette(cassetteDir, {
      task: AUTHOR_TASK,
      model: AUTHOR_MODEL,
      effort: AUTHOR_EFFORT,
      key,
      result: { body },
      raw: JSON.stringify({ body }),
      durationMs: 12,
    });
    let spawned = 0;
    const result = await think<{ body: string }>(
      {
        task: AUTHOR_TASK,
        model: AUTHOR_MODEL,
        effort: AUTHOR_EFFORT,
        schema: AUTHOR_BODY_SCHEMA,
        input: request.input,
      },
      {
        spawnImpl: async () => {
          spawned += 1;
          throw new Error("spawned during replay");
        },
        projectDir: dir,
        cassetteDir,
        config: defaultConfig(),
        env: { HH_CASSETTE: "replay", PATH: "" },
      },
    );
    assert.equal(spawned, 0);
    assert.equal(result.cassette, "hit");
    assert.equal(result.value.body, body);
    assert.equal(result.durationMs, 12);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
