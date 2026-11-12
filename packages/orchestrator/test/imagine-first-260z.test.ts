/**
 * 260z. Fake-provider walk of the Imagine-first chain on the towel sample.
 * The sample brief is not approved and names no second page, so the harness
 * approves a brief that keeps the towel sentence and adds Visit.
 * Providers, think, and the build spawn are fakes. No network and no Grok call.
 * A finished prompt is stored as passed. That is the done state.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  advanceDesignStages,
  approveComp,
  approveMotionRef,
  approveSiteBrief,
  approveSitePlan,
  chooseDirection,
  clearPageRenderRunner,
  clearProjectBuildRunner,
  compCandidateRel,
  compRenderRel,
  compViewFacts,
  dealDirections,
  designLockMatches,
  designReadyForBuild,
  draftKeyPageRenders,
  draftMotionRefs,
  ensureSiteBuild,
  listComps,
  listPrimaryPages,
  loadConfig,
  loadQueue,
  motionClipRel,
  onDesignLocked,
  openInterview,
  pageRequirementId,
  readBriefDesk,
  readBuildRun,
  readDirectionDeal,
  redrawCompView,
  requestCompChange,
  requiredCompViews,
  restoreProject,
  saveDirectionDeal,
  setCompGateDeps,
  setPageRenderRunner,
  setProjectBuildRunner,
  siteBuildSettled,
  startSiteBuild,
  writeDesignLock,
  type BuildSpawn,
  type CompFault,
  type CompView,
  type MotionVideoProvider,
  type PrimaryPage,
  type RenderDeskProvider,
  type SiteBrief,
  type ThinkRequest,
  type ThinkResult,
} from "@hitchhiker/engine";
import { enterFlow, type FlowPhase } from "../src/phase-lock.ts";
import { goldenPathFixtureHtml } from "../src/golden-path.ts";
import { removeTempDir } from "./remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const LINE = "The shop sells towels for the home.";
const CHANGE = "Raise the towel stack and keep the green stitch.";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

interface DrawnCall {
  aspect: string;
  model: string;
  n: number;
  prompt: string;
}

test("towel sample walks the imagine-first chain with fake providers", { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "hh-imagine-260z-"));
  const sample = path.resolve(here, "../../../samples/towel-day.hhproject");
  const previousHome = process.env.HH_PROJECT_HOME;
  process.env.HH_PROJECT_HOME = path.join(dir, ".hh-save-home");
  const draws: DrawnCall[] = [];
  const provider = drawingProvider(draws);
  const desktopShots = new Map<string, number>();
  const roundVerdict = new Map<string, "mismatch" | "match">();
  const fixes: string[] = [];
  try {
    await restoreProject(sample, { projectDir: dir, prefer: "file" });
    await step(dir, "discovery");
    await answerDiscovery(dir);
    await step(dir, "brief");
    const briefDesk = await approveSiteBrief(dir, fixtureThink as never, { confirmFallback: true });
    assert.equal(briefDesk.status, "approved");
    const planned = await approveSitePlan(dir);
    assert.equal(planned.planApproved, true);
    const brief = readBriefDesk(dir).markdown;
    await step(dir, "design");

    setPageRenderRunner(dir, async (projectDir) => {
      await draftKeyPageRenders(projectDir, { provider });
    });
    passStagesUntilLock(dir, brief);
    assert.equal(designLockMatches(dir), true);

    const pages = listPrimaryPages(dir);
    const home = pages.find((page) => page.route === "/");
    const second = pages.find((page) => page.route !== "/");
    assert.ok(home, "The sitemap has no home page.");
    assert.ok(second, "The sitemap has no second primary page.");
    const settings = loadConfig(dir).design.comps;
    const views = requiredCompViews(dir);
    assert.equal(settings.long, true);
    assert.deepEqual(views, ["desktop", "desktop-long", "mobile"]);
    const k = settings.candidates;
    assert.equal(k >= 1 && k <= 4, true);

    const drafted = await waitForCandidates(dir, pages, views, k);
    assert.equal(drafted.length, pages.length * views.length * k);
    for (const view of views) {
      const aspect = compViewFacts(view).aspect;
      const matching = draws.filter((call) => call.aspect === aspect);
      assert.equal(matching.length, pages.length * k, `${view} candidate count`);
      for (const call of matching) {
        assert.equal(call.model, settings.model);
        assert.equal(call.n, 1);
        assert.match(call.prompt, /No readable text/);
      }
    }
    const beforeRedraw = draws.length;

    requestCompChange(dir, home.route, "mobile", CHANGE);
    const redrawn = await redrawCompView(dir, home.route, "mobile", { provider });
    assert.equal(redrawn.length, k);
    assert.equal(draws.length - beforeRedraw, k);
    for (const call of draws.slice(beforeRedraw)) assert.equal(call.aspect, "9:19.5");
    const mobilePrompt = readFileSync(path.join(dir, compCandidateRel(home.route, "mobile", 1).replace(/\.png$/i, ".prompt.txt")), "utf8");
    assert.match(mobilePrompt, new RegExp(CHANGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const noted = listComps(dir).pages.find((page) => page.route === home.route);
    assert.ok(noted?.views.mobile.notes.includes(CHANGE));

    for (const page of pages) {
      for (const view of views) {
        const rel = compCandidateRel(page.route, view, 1);
        assert.equal(existsSync(path.join(dir, rel)), true, rel);
        const approved = approveComp(dir, page.route, view, rel);
        assert.equal(approved.file, compRenderRel(page.route, view));
        assert.equal(existsSync(path.join(dir, approved.file)), true);
      }
    }

    const sectionTitle = home.sections[0];
    assert.ok(sectionTitle, "Home has no section to clip.");
    writeFileSync(path.join(dir, "MOTION.md"), `- ${sectionTitle}: motion-led\n`, "utf8");
    const clips = await draftMotionRefs(dir, { provider: videoProvider() });
    assert.ok(clips.length >= 1);
    const clipRel = clips[0] ?? "";
    assert.equal(clipRel, motionClipRel(home.route, sectionIdOf(home, sectionTitle)));
    const motion = approveMotionRef(dir, home.route, sectionIdOf(home, sectionTitle));
    assert.equal(motion.file, clipRel);
    assert.equal(existsSync(path.join(dir, motion.file)), true);

    const homeReq = pageRequirementId(home.title);
    const secondReq = pageRequirementId(second.title);
    const homePromptId = findPrompt(dir, homeReq);
    const secondPromptId = findPrompt(dir, secondReq);
    const sectionId = sectionIdOf(home, sectionTitle);
    const sectionPromptId = findLayoutPrompt(dir, sectionId);
    assert.ok(homePromptId, `missing ${homeReq}`);
    assert.ok(secondPromptId, `missing ${secondReq}`);
    assert.ok(sectionPromptId, `missing layout prompt for ${sectionId}`);
    const homePrompt = readPrompt(dir, homePromptId);
    const secondPrompt = readPrompt(dir, secondPromptId);
    const sectionPrompt = readPrompt(dir, sectionPromptId);
    for (const text of [homePrompt, sectionPrompt]) {
      assert.match(text, /Open these approved comps before you write code/);
      assert.match(text, /Match this:/);
      assert.match(text, /reference\/renders\/home\.png/);
      assert.match(text, /reference\/renders\/home\.mobile\.png/);
      assert.match(text, /reference\/renders\/home\.long\.png/);
      assert.match(text, new RegExp(clipRel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(secondPrompt, /Match this:/);
    assert.match(secondPrompt, new RegExp(compRenderRel(second.route, "desktop").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(secondPrompt, new RegExp(compRenderRel(second.route, "mobile").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(secondPrompt, new RegExp(compRenderRel(second.route, "desktop-long").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    finishStages(dir, brief);
    const ready = designReadyForBuild(dir, brief);
    assert.equal(ready.ok, true, ready.reason);
    writeProjectName(dir);
    writeStack(dir);
    await step(dir, "build");

    const spawn = fakeBuild(dir, fixes);
    setProjectBuildRunner(dir, spawn);
    setCompGateDeps(dir, {
      preview: async () => ({ url: "http://127.0.0.1:4311/", port: 4311, close: async () => undefined }),
      shoot: async (req) => {
        if (req.view === "desktop") judgeRound(dir, req.out, homeReq, secondReq, desktopShots, roundVerdict);
        return { width: req.viewport.width, height: req.viewport.height };
      },
      compare: async () => ({
        layout: 1,
        palette: 0,
        edge: [0, 0, 0, 0, 0, 0],
        width: 320,
        height: 68,
        shotWidth: 1440,
        leftInk: 40,
        rightInk: 40,
      }),
      think: async (req) => {
        const id = promptIdFrom(req.composite);
        if (req.view === "desktop" && roundVerdict.get(id) === "mismatch") return { faults: [blockingFault()] };
        return { faults: [] };
      },
    });

    const started = await startSiteBuild(dir);
    assert.equal(started.buildStarted, true);
    for (let pass = 0; pass < 6; pass += 1) {
      await siteBuildSettled(dir);
      const queue = await loadQueue(dir);
      if (queue?.pause !== undefined) break;
      const failed = queue?.items.find((item) => item.status === "failed");
      if (failed !== undefined) throw new Error(failureText(dir, failed.id));
      const waiting = queue?.items.some((item) => item.status === "queued" || item.status === "running") === true;
      if (!waiting) break;
      await ensureSiteBuild(dir);
    }

    const queue = await loadQueue(dir);
    const homeItem = queue?.items.find((item) => item.id === homePromptId);
    const sectionItem = queue?.items.find((item) => item.id === sectionPromptId);
    const secondItem = queue?.items.find((item) => item.id === secondPromptId);
    assert.equal(homeItem?.status, "passed", failureText(dir, homePromptId));
    assert.equal(sectionItem?.status, "passed", failureText(dir, sectionPromptId));
    assert.equal(secondItem?.status, "paused", queueSummary(dir));
    assert.equal(queue?.pause?.reason, "comp-mismatch");
    assert.match(queue?.pause?.composites?.join("\n") ?? "", new RegExp(`qa/compare/${secondPromptId}/desktop\\.jpg`));
    assert.equal(desktopShots.get(homePromptId), 2);
    assert.equal(desktopShots.get(secondPromptId), 2);
    assert.equal(desktopShots.get(sectionPromptId), 1);
    assert.deepEqual(fixes.filter((id) => id === homePromptId), [homePromptId]);
    assert.deepEqual(fixes.filter((id) => id === secondPromptId), [secondPromptId]);
    assert.equal(readFileSync(path.join(dir, "qa", "compare", homePromptId, "metrics.json"), "utf8").includes("\"clean\": true"), true);
    assert.equal(readFileSync(path.join(dir, "qa", "compare", secondPromptId, "metrics.json"), "utf8").includes("\"clean\": false"), true);
  } finally {
    setCompGateDeps(dir, null);
    clearProjectBuildRunner(dir);
    clearPageRenderRunner(dir);
    if (previousHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = previousHome;
    await removeTempDir(dir);
  }
});

function drawingProvider(calls: DrawnCall[]): RenderDeskProvider {
  let serial = 0;
  const image = (): { b64: string }[] => {
    serial += 1;
    return [{ b64: Buffer.concat([PNG, Buffer.from(String(serial))]).toString("base64") }];
  };
  return {
    async generateImage(req) {
      calls.push({ aspect: req.aspect, model: req.model, n: req.n, prompt: req.prompt });
      return image();
    },
    async editImage(req) {
      calls.push({ aspect: req.aspect ?? "", model: req.model, n: req.n, prompt: req.prompt });
      return { images: image() };
    },
  };
}

function videoProvider(): MotionVideoProvider {
  return {
    async startVideo() {
      return { id: "clip-hero" };
    },
    async pollVideo() {
      return { bytes: Buffer.from("fake-mp4-hero") };
    },
  };
}

function blockingFault(): CompFault {
  return {
    view: "desktop",
    area: "hero",
    fault: "The hero sits too low.",
    expected: "The hero fills the top of the page.",
    fix: "Move the hero up.",
    blocking: true,
  };
}

function judgeRound(
  dir: string,
  out: string,
  homeReq: string,
  secondReq: string,
  shots: Map<string, number>,
  verdict: Map<string, "mismatch" | "match">,
): void {
  const id = promptIdFrom(out);
  if (id === "") return;
  const text = readPrompt(dir, id);
  const count = (shots.get(id) ?? 0) + 1;
  shots.set(id, count);
  if (owns(text, secondReq)) {
    verdict.set(id, "mismatch");
    return;
  }
  if (owns(text, homeReq)) {
    verdict.set(id, count === 1 ? "mismatch" : "match");
    return;
  }
  verdict.set(id, "match");
}

function fakeBuild(dir: string, fixes: string[]): BuildSpawn {
  return (request) => {
    const flag = request.args[request.args.indexOf("--prompt-file") + 1];
    if (typeof flag === "string" && existsSync(flag)) {
      const body = readFileSync(flag, "utf8");
      if (body.includes("Comp compare failed.")) fixes.push(request.promptId);
    }
    const page = path.join(dir, "dist", "index.html");
    mkdirSync(path.dirname(page), { recursive: true });
    writeFileSync(page, goldenPathFixtureHtml(heroVariant(dir)), "utf8");
    const source = path.join(dir, "src", "page.tsx");
    mkdirSync(path.dirname(source), { recursive: true });
    if (!existsSync(source)) writeFileSync(source, "export const name = \"Mostly Towels\";\n", "utf8");
    return {
      pid: 260,
      done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }),
    };
  };
}

function heroVariant(projectDir: string): string {
  const file = path.join(projectDir, ".hitchhiker", "design", "variants.json");
  if (!existsSync(file)) return "cinematic";
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(parsed)) return "cinematic";
    const heroes = parsed.filter((row) => {
      if (typeof row !== "object" || row === null) return false;
      const section = (row as { section?: unknown }).section;
      return typeof section === "string" && section.trim().toLowerCase() === "hero";
    });
    const home = heroes.find((row) => {
      const page = (row as { page?: unknown }).page;
      return typeof page === "string" && page.trim().toLowerCase() === "home";
    });
    const chosen = home ?? heroes[0];
    if (chosen === undefined || typeof chosen !== "object" || chosen === null) return "cinematic";
    const variant = (chosen as { variant?: unknown }).variant;
    return typeof variant === "string" && variant.trim() !== "" ? variant.trim() : "cinematic";
  } catch {
    return "cinematic";
  }
}

async function step(projectDir: string, to: FlowPhase): Promise<void> {
  const decision = await enterFlow(projectDir, to);
  if (!decision.ok) throw new Error(decision.reason);
}

async function answerDiscovery(projectDir: string): Promise<void> {
  const session = await openInterview(projectDir, loadConfig(projectDir).interviewDepth);
  const seen = new Set<string>();
  for (let guard = 0; guard < 400; guard += 1) {
    const question = session.next();
    if (question === null) return;
    if (seen.has(question.id)) throw new Error("A question stayed open, so the interview could not finish.");
    seen.add(question.id);
    await session.command({ type: "keep", text: LINE });
  }
  throw new Error("The interview did not finish.");
}

function sampleBrief(): SiteBrief {
  return {
    goal: LINE,
    visitor: LINE,
    action: LINE,
    offer: LINE,
    vibe: LINE,
    references: LINE,
    exists: LINE,
    protected: LINE,
    motion: LINE,
    limits: LINE,
    hosting: LINE,
    pages: "Home, Visit.",
    features: LINE,
    maintainer: LINE,
    cadence: LINE,
    languages: LINE,
    imagery: LINE,
    budget: LINE,
    session: LINE,
    logo: LINE,
    palette: LINE,
    coverage: LINE,
  };
}

function fixtureThink(req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> {
  if (req.task !== "brief-draft") return Promise.reject(new Error("That step does not need a model reply."));
  const brief = sampleBrief();
  return Promise.resolve({ value: brief, raw: JSON.stringify(brief), durationMs: 0, cassette: "hit" });
}

function passStagesUntilLock(projectDir: string, brief: string): void {
  advanceDesignStages(projectDir, { brief, approval: { stage: "sitemap", text: "Approved." } });
  advanceDesignStages(projectDir, { brief, approval: { stage: "wireframe", text: "Approved." } });
  let deal = readDirectionDeal(projectDir);
  if (deal === null || deal.pickedId === null) {
    if (deal === null) {
      deal = dealDirections();
      saveDirectionDeal(projectDir, deal);
    }
    const first = deal.directions[0];
    if (first === undefined) throw new Error("The design did not offer a direction.");
    chooseDirection(projectDir, first.id, "It fits the shop.");
    deal = readDirectionDeal(projectDir) ?? deal;
  }
  if (deal.pickedId === null) throw new Error("The design did not offer a direction.");
  writeGateShots(projectDir);
  advanceDesignStages(projectDir, { brief, approval: { stage: "style-guide", text: "Approved." } });
  writeDesignLock(projectDir, deal.pickedId);
  onDesignLocked(projectDir);
}

function finishStages(projectDir: string, brief: string): void {
  advanceDesignStages(projectDir, { brief, approval: { stage: "direction", text: "Approved." } });
  advanceDesignStages(projectDir, { brief, approval: { stage: "prebuild", text: "Approved." } });
  if (designReadyForBuild(projectDir, brief).ok) return;
  advanceDesignStages(projectDir, {
    brief,
    approval: { stage: "prebuild", text: "Approved." },
    acknowledge: true,
  });
}

function writeGateShots(projectDir: string): void {
  const refs = path.join(projectDir, "reference", "refs");
  mkdirSync(refs, { recursive: true });
  for (let index = 0; index < 6; index += 1) {
    const file = path.join(refs, `shot-${index}.png`);
    if (!existsSync(file)) writeFileSync(file, PNG);
  }
}

function writeProjectName(projectDir: string): void {
  const file = path.join(projectDir, ".hitchhiker", "project.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ name: "Mostly Towels" }, null, 2)}\n`, "utf8");
}

function writeStack(projectDir: string): void {
  const file = path.join(projectDir, ".hitchhiker", "research", "STACK-DECISION.md");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    "# STACK-DECISION\n\n## Pick\n\nvite-react\n\n## Why\n\nThe pages are finished files in dist.\n",
    "utf8",
  );
}

async function waitForCandidates(
  dir: string,
  pages: readonly PrimaryPage[],
  views: readonly CompView[],
  k: number,
): Promise<string[]> {
  const expected: string[] = [];
  for (const page of pages) {
    for (const view of views) {
      for (let index = 1; index <= k; index += 1) expected.push(compCandidateRel(page.route, view, index));
    }
  }
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (expected.every((rel) => existsSync(path.join(dir, rel)))) return expected;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const notes = [
    readOptional(path.join(dir, "reference", "comps", "README.md")),
    readOptional(path.join(dir, "reference", "renders", "README.md")),
  ]
    .filter((text) => text.trim() !== "")
    .join("\n");
  const missing = expected.filter((rel) => !existsSync(path.join(dir, rel)));
  throw new Error(`Sketches were not drawn. Missing ${missing.join(", ")}. ${notes}`.trim());
}

function sectionIdOf(page: PrimaryPage, title: string): string {
  const index = page.sections.indexOf(title);
  const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
  if (index <= 0) return base;
  const earlier = page.sections.slice(0, index).filter((item) => {
    const slug = item.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
    return slug === base;
  }).length;
  return earlier === 0 ? base : `${base}-${earlier + 1}`;
}

function findPrompt(dir: string, requirement: string): string | null {
  return promptIds(dir).find((id) => owns(readPrompt(dir, id), requirement)) ?? null;
}

function findLayoutPrompt(dir: string, sectionId: string): string | null {
  const requirement = `REQ-STRUCT-${sectionId}`;
  return (
    promptIds(dir).find((id) => {
      const text = readPrompt(dir, id);
      return owns(text, requirement) && /\blayout\b/i.test(text);
    }) ?? null
  );
}

function promptIds(dir: string): string[] {
  const folder = path.join(dir, ".hitchhiker", "prompts");
  return readdirSync(folder)
    .filter((name) => /^\d{3}\.md$/.test(name))
    .sort()
    .map((name) => name.slice(0, 3));
}

function readPrompt(dir: string, id: string): string {
  return readFileSync(path.join(dir, ".hitchhiker", "prompts", `${id}.md`), "utf8");
}

function owns(text: string, requirement: string): boolean {
  const task = /^## Task[ \t]*\n([\s\S]*?)(?=^## )/m.exec(text)?.[1] ?? "";
  const line = /^Requirements:[ \t]*(.+)$/m.exec(task)?.[1] ?? "";
  return line.split(",").map((item) => item.trim()).includes(requirement);
}

function promptIdFrom(file: string): string {
  const match = /\/qa\/compare\/([^/]+)\//.exec(file.replaceAll("\\", "/"));
  return match?.[1] ?? "";
}

function readOptional(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function failureText(dir: string, id: string): string {
  const run = readBuildRun(dir);
  const reason = run?.promptId === id ? run.reason : (run?.reason ?? "");
  return `Prompt ${id} did not finish. ${reason}`.trim();
}

function queueSummary(dir: string): string {
  return failureText(dir, "queue");
}
