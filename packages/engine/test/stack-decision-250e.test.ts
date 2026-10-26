/**
 * 250e. Plan approval writes `.hitchhiker/research/STACK-DECISION.md`
 * in the shape deploy parses, and the prompt plan uses that pick.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { approveSitePlan } from "../src/guide/brief-desk.ts";
import { BRIEF_KEYS, type SiteBrief } from "../src/guide/schemas.ts";
import { draftBriefPlan, prepareSiteBuild } from "../src/guide/site-build.ts";
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import { removeTempDir } from "./remove-temp.ts";

const LINE = "The site helps a visitor book a visit.";

const ASTRO_SCAFFOLD_ACCEPTANCE = [
  "package.json sets name, private true, and type module, pins dependencies, and defines scripts dev, build, preview, check, and test as appropriate for the stack.",
  "Run pnpm install. The install succeeds, and package.json and pnpm-lock.yaml are committed.",
  "Read DESIGN.md for tokens, the type scale, color, spacing, component rules, and motion principles.",
  "Read src/scripts/motion.ts for the typed GSAP, Lenis, and Three constants. Scrub, damping, bloom, easings, durations, staggers, scroll scenes, and the reduced-motion map live there.",
];

const KEPT_VITE = "# STACK-DECISION\n\n## Pick\n\nvite-react\n\n## Why\n\nThe pages are finished files in dist.\n";
const KEPT_NEXT = "# STACK-DECISION\n\n## Pick\n\nnext\n\n## Why\n\nThe record already names Next.js.\n";

function project(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-stack-250e-"));
}

function draft(overrides: Partial<SiteBrief> = {}): SiteBrief {
  const brief = {} as SiteBrief;
  for (const key of BRIEF_KEYS) brief[key] = LINE;
  return { ...brief, ...overrides };
}

function writePending(dir: string, brief: SiteBrief): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(
    path.join(dir, ".hitchhiker", "brief-pending.json"),
    `${JSON.stringify({
      status: "pending",
      draft: brief,
      buildStarted: false,
      planApproved: false,
      error: "",
      fallback: false,
    })}\n`,
  );
}

function writeAnswers(dir: string, answers: readonly { id: string; value: string; status?: string }[]): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "interview.json"), `${JSON.stringify(answers)}\n`, "utf8");
}

function stackPath(dir: string): string {
  return path.join(dir, ".hitchhiker", "research", "STACK-DECISION.md");
}

function writeKept(dir: string, markdown: string): void {
  const file = stackPath(dir);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, markdown, "utf8");
}

function markdown(hosting: string, features: string, goal = LINE): string {
  return [`# Site Brief`, "", "## Goal", "", goal, "", "## Hosting", "", hosting, "", "## Features", "", features, ""].join("\n");
}

function scaffoldPrompt(dir: string): string {
  const prompts = path.join(dir, ".hitchhiker", "prompts");
  for (const name of readdirSync(prompts)) {
    if (!name.endsWith(".md")) continue;
    const text = readFileSync(path.join(prompts, name), "utf8");
    if (text.includes("REQ-SCAFFOLD")) return text;
  }
  assert.fail("scaffold prompt was not written");
}

function acceptanceLine(text: string): string {
  const line = text.split("\n").find((item) => item.startsWith("Acceptance:"));
  assert.ok(line, "scaffold prompt has no Acceptance line");
  return line;
}

interface ParsedShape {
  pick: string;
  shape: string;
}

async function parseSiteShape(markdown: string): Promise<ParsedShape> {
  const file = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "deploy",
    "src",
    "shape.ts",
  );
  const loaded: unknown = await import(pathToFileURL(file).href);
  assert.ok(typeof loaded === "object" && loaded !== null && "parseSiteShape" in loaded);
  const parse = (loaded as { parseSiteShape: (value: string) => ParsedShape }).parseSiteShape;
  return parse(markdown);
}

async function approvedPick(brief: SiteBrief, answers?: readonly { id: string; value: string; status?: string }[]): Promise<string> {
  const dir = project();
  try {
    writePending(dir, brief);
    if (answers !== undefined) writeAnswers(dir, answers);
    await approveSitePlan(dir);
    const file = stackPath(dir);
    assert.equal(existsSync(file), true, "plan approval writes STACK-DECISION.md");
    const decision = await parseSiteShape(readFileSync(file, "utf8"));
    assert.match(readFileSync(file, "utf8"), /^# STACK-DECISION$/m);
    return decision.pick;
  } finally {
    removeTempDir(dir);
  }
}

test("approveSitePlan writes a STACK-DECISION deploy can parse from Hosting and Features", async () => {
  assert.equal(await approvedPick(draft({ hosting: "Next.js" })), "next");
  assert.equal(await approvedPick(draft({ features: "a React app" })), "next");
  assert.equal(await approvedPick(draft({ features: "needs a server" })), "next");
  assert.equal(await approvedPick(draft({ features: "user accounts" })), "next");
  assert.equal(await approvedPick(draft({ hosting: "Vite" })), "vite-react");
  assert.equal(await approvedPick(draft({ features: "React SPA" })), "vite-react");
  assert.equal(await approvedPick(draft({ hosting: "Vite or Next.js" })), "vite-react");
  assert.equal(
    await approvedPick(draft(), [{ id: "DP-9.2", status: "ANSWERED", value: "Next.js" }]),
    "next",
  );
  assert.equal(await approvedPick(draft({ hosting: "Hostinger.", features: "A contact form." })), "astro");
  assert.equal(
    await approvedPick(draft({ hosting: "Hostinger.", features: "A contact form." }), [
      { id: "DP-9.2", status: "SKIPPED", value: "Next.js" },
    ]),
    "astro",
  );
  assert.equal(
    await approvedPick(draft({ goal: "The visitor books a server tour.", hosting: "Hostinger.", features: "A contact form." })),
    "astro",
  );
  assert.equal(
    await approvedPick(draft({ hosting: "Hostinger.", features: "A contact form." }), [
      { id: "DP-2.1", status: "ANSWERED", value: "The visitor books a server tour." },
    ]),
    "astro",
  );
});

test("draftBriefPlan and prepareSiteBuild pass the chosen stack and name the starter", async () => {
  const nextDir = project();
  const viteDir = project();
  try {
    await draftBriefPlan(nextDir, markdown("Hostinger.", "user accounts"));
    const nextText = scaffoldPrompt(nextDir);
    assert.match(nextText, /packages\/templates\/next-app/);
    assert.match(nextText, /next\.config\.ts/);
    assert.equal(nextText.includes("astro.config.ts"), false);
    const nextDecision = await parseSiteShape(readFileSync(stackPath(nextDir), "utf8"));
    assert.equal(nextDecision.pick, "next");

    await prepareSiteBuild(viteDir, markdown("Vite", "A contact form."));
    const viteText = scaffoldPrompt(viteDir);
    assert.match(viteText, /packages\/templates\/vite-react-world/);
    assert.match(viteText, /vite\.config\.ts/);
    assert.equal(viteText.includes("astro.config.ts"), false);
    const viteDecision = await parseSiteShape(readFileSync(stackPath(viteDir), "utf8"));
    assert.equal(viteDecision.pick, "vite-react");
  } finally {
    removeTempDir(nextDir);
    removeTempDir(viteDir);
  }
});

test("an existing STACK-DECISION.md is kept and its pick is used", async () => {
  const viteDir = project();
  const nextDir = project();
  try {
    writeKept(viteDir, KEPT_VITE);
    await prepareSiteBuild(viteDir, markdown("Next.js", "user accounts"));
    assert.equal(readFileSync(stackPath(viteDir), "utf8"), KEPT_VITE);
    const viteText = scaffoldPrompt(viteDir);
    assert.match(viteText, /packages\/templates\/vite-react-world/);
    assert.match(viteText, /vite\.config\.ts/);
    assert.equal(viteText.includes("packages/templates/next-app"), false);
    assert.equal((await parseSiteShape(KEPT_VITE)).pick, "vite-react");

    writeKept(nextDir, KEPT_NEXT);
    await draftBriefPlan(nextDir, markdown("Vite", "React SPA"));
    assert.equal(readFileSync(stackPath(nextDir), "utf8"), KEPT_NEXT);
    const nextText = scaffoldPrompt(nextDir);
    assert.match(nextText, /packages\/templates\/next-app/);
    assert.match(nextText, /next\.config\.ts/);
    assert.equal(nextText.includes("packages/templates/vite-react-world"), false);
  } finally {
    removeTempDir(viteDir);
    removeTempDir(nextDir);
  }
});

test("no stack decision keeps today's astro prompt bytes", async () => {
  const brief = markdown("Hostinger.", "A contact form.");
  const today = generateBriefPlan(brief);
  const explicit = generateBriefPlan(brief, "astro", []);
  assert.deepEqual(explicit.prompts, today.prompts);
  const scaffold = today.prompts.find((prompt) => prompt.requirements.includes("REQ-SCAFFOLD"));
  assert.ok(scaffold);
  assert.deepEqual(scaffold.acceptance, ASTRO_SCAFFOLD_ACCEPTANCE);

  const dir = project();
  try {
    await prepareSiteBuild(dir, brief);
    const file = stackPath(dir);
    assert.equal(existsSync(file), true, "plan approval writes STACK-DECISION.md");
    const decision = await parseSiteShape(readFileSync(file, "utf8"));
    assert.equal(decision.pick, "astro");
    assert.equal(decision.shape, "static");
    const written = scaffoldPrompt(dir);
    assert.equal(acceptanceLine(written), `Acceptance: ${ASTRO_SCAFFOLD_ACCEPTANCE.join(" ")}`);
    assert.equal(written.includes("packages/templates/"), false);
    assert.match(written, /astro\.config\.ts/);
    const prompts = path.join(dir, ".hitchhiker", "prompts");
    for (const prompt of today.prompts) {
      const text = readFileSync(path.join(prompts, `${prompt.id}.md`), "utf8");
      assert.ok(text.includes(prompt.title), prompt.id);
      const files = prompt.filesModified.length === 0 ? "none" : prompt.filesModified.join(", ");
      assert.ok(text.includes(`Files: ${files}`), prompt.id);
      if (prompt.acceptance !== undefined && prompt.acceptance.length > 0) {
        assert.ok(text.includes(`Acceptance: ${prompt.acceptance.join(" ")}`), prompt.id);
      }
      assert.equal(text.includes("packages/templates/"), false, prompt.id);
    }
  } finally {
    removeTempDir(dir);
  }
});
