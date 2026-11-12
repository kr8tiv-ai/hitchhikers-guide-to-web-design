/**
 * Compare gate. A page or section prompt is not done until the built page
 * matches its approved sketches, or the queue pauses for the owner.
 * The 245l screenshot loop is not in this tree, so this gate is its own close step.
 * Playwright stays in qa. This module loads it only when a view is actually shot.
 * Prompts with no page, and pages with no approved sketch, skip with a logged reason.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateJson, type JsonSchema } from "../ai/schema-validate.ts";
import { think } from "../ai/think.ts";
import { loadConfig, type CompareConfig } from "../config.ts";
import { packagedModule } from "../packaged-dir.ts";
import { lastFinishedPrompt, loadQueue, saveQueue, type QueueFile, type QueuePause } from "../queue-file.ts";
import {
  approvedCompViews,
  approvedSectionClips,
  compRoutesForSection,
  type ApprovedCompView,
  type CompView,
} from "./comps.ts";
import { listPrimaryPages } from "./page-renders.ts";
import { visualTargetOf } from "./site-prompts.ts";

const DESK_PORT = 4175;
const SHOOT_MS = 20_000;
const COMPARE_MS = 30_000;
const PREVIEW_MS = 15_000;
const CLOSE_MS = 5_000;
const PROMPT_ID = /^[a-z0-9-]+$/;
const SKIP_NO_PAGE = "Skipped the compare. This prompt does not own a page.";
const SKIP_NO_SKETCH = "Skipped the compare. This page has no approved sketch.";
const SKIP_NO_ROUTE = "Skipped the compare. This section is not on a page.";
const PAUSE_MISMATCH = "The built page does not match the approved sketch.";
const PAUSE_INFRA = "The compare could not finish, so the queue is paused.";
const PAUSE_REASON = "comp-mismatch";
const LONG_HEIGHT = 2880;

const FAULT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["faults"],
  properties: {
    faults: {
      type: "array",
      items: {
        type: "object",
        required: ["view", "area", "fault", "expected", "fix", "blocking"],
        properties: {
          view: { type: "string" },
          area: { type: "string" },
          fault: { type: "string" },
          expected: { type: "string" },
          fix: { type: "string" },
          blocking: { type: "boolean" },
        },
      },
    },
  },
};

export interface CompFault {
  view: string;
  area: string;
  fault: string;
  expected: string;
  fix: string;
  blocking: boolean;
}

export interface CompFixTurn {
  text: string;
  faults: CompFault[];
  compPaths: string[];
  composites: string[];
  round: number;
}

export interface CompCompareResult {
  layout: number;
  palette: number;
  edge: number[];
  width: number;
  height: number;
  shotWidth: number;
  leftInk: number;
  rightInk: number;
}

export interface CompShootRequest {
  url: string;
  route: string;
  view: CompView;
  viewport: { width: number; height: number };
  fullPage: boolean;
  out: string;
  timeoutMs: number;
}

export interface CompCompareRequest {
  shot: string;
  comp: string;
  view: string;
  out: string;
}

export interface CompThinkRequest {
  view: string;
  comp: string;
  shot: string;
  composite: string;
}

export interface CompMotionRequest {
  url: string;
  route: string;
  sectionId?: string;
  seconds: number;
  band?: { y: number; height: number };
  longHeight: number;
  outDir: string;
  timeoutMs: number;
}

export interface CompPreviewSession {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export interface CompGateDeps {
  log?: (line: string) => void;
  shoot?: (req: CompShootRequest) => Promise<{ width: number; height: number }>;
  compare?: (req: CompCompareRequest) => Promise<CompCompareResult>;
  think?: (req: CompThinkRequest) => Promise<{ faults: CompFault[] }>;
  preview?: (projectDir: string) => Promise<CompPreviewSession>;
  recordMotion?: (req: CompMotionRequest) => Promise<{ video: string }>;
  ffmpeg?: () => Promise<boolean>;
  extractFrames?: (video: string, outDir: string, count: number) => Promise<string[]>;
  contactSheet?: (frames: string[], out: string) => Promise<void>;
  rerun?: (turn: CompFixTurn) => Promise<void>;
  now?: () => Date;
}

export interface CompViewReport {
  view: string;
  layout: number;
  palette: number;
  edge: number[];
  composite: string;
  comp: string;
  shot: string;
  width: number;
  height: number;
}

export interface CompGateResult {
  status: "clean" | "paused" | "skipped";
  reason: string;
  roundsUsed: number;
  composites: string[];
  faults: CompFault[];
}

interface RoundShot {
  reports: CompViewReport[];
  faults: CompFault[];
  composites: string[];
  compPaths: string[];
}

interface BrowserDeps {
  shoot: (req: CompShootRequest) => Promise<{ width: number; height: number }>;
  compare: (req: CompCompareRequest) => Promise<CompCompareResult>;
  preview: (projectDir: string) => Promise<CompPreviewSession>;
  recordMotion: (req: CompMotionRequest) => Promise<{ video: string }>;
  ffmpeg: () => Promise<boolean>;
  extractFrames: (video: string, outDir: string, count: number) => Promise<string[]>;
  contactSheet: (frames: string[], out: string) => Promise<void>;
}

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(label));
      },
    );
  });
}

function note(deps: CompGateDeps, line: string): void {
  deps.log?.(line.endsWith("\n") ? line : `${line}\n`);
}

function promptTarget(projectDir: string, promptId: string): { route?: string; sectionId?: string } | null {
  let text = "";
  try {
    text = readFileSync(path.join(projectDir, ".hitchhiker", "prompts", `${promptId}.md`), "utf8");
  } catch {
    return null;
  }
  const body = text.replace(/\r\n/g, "\n");
  const title = /^# (.+)$/m.exec(body)?.[1]?.trim() ?? "";
  const task = /^## Task[ \t]*\n([\s\S]*?)(?=^## )/m.exec(body)?.[1] ?? "";
  const line = /^Requirements:[ \t]*(.+)$/m.exec(task)?.[1] ?? "";
  const requirements = line
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  const route = /^Route:[ \t]*(\S+)[ \t]*$/m.exec(task)?.[1];
  if (title === "" && requirements.length === 0) return null;
  return visualTargetOf({ title, requirements, ...(route === undefined ? {} : { route }) });
}

function resolvePage(
  projectDir: string,
  promptId: string,
  page: string | { route: string; sectionId?: string } | null,
): { route?: string; sectionId?: string } | null {
  if (typeof page === "string") return page.trim() === "" ? null : { route: page.trim() };
  if (page !== null) {
    const route = page.route.trim();
    const sectionId = page.sectionId?.trim() ?? "";
    if (route !== "" && sectionId !== "") return { route, sectionId };
    if (route !== "") return { route };
    if (sectionId !== "") return { sectionId };
    return null;
  }
  return promptTarget(projectDir, promptId);
}

function routeForTarget(projectDir: string, target: { route?: string; sectionId?: string }): string | null {
  if (target.route !== undefined && target.route !== "") return target.route;
  const sectionId = target.sectionId;
  if (sectionId === undefined || sectionId === "") return null;
  const fromComps = compRoutesForSection(projectDir, sectionId);
  if (fromComps.length === 1) return fromComps[0] ?? null;
  const listed = listPrimaryPages(projectDir).filter((item) => item.sections.includes(sectionId));
  if (listed.length > 0) return listed[0]?.route ?? null;
  return null;
}

function compareDir(promptId: string): string {
  return `qa/compare/${promptId}`;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function metricFaults(view: string, metrics: CompCompareResult, floors: CompareConfig): CompFault[] {
  const faults: CompFault[] = [];
  if (metrics.layout < floors.layoutMin) {
    faults.push({
      view,
      area: "page",
      fault: "The layout does not match the sketch.",
      expected: `Layout similarity at least ${floors.layoutMin}. This shot scored ${metrics.layout.toFixed(2)}.`,
      fix: "Match the approved sketch.",
      blocking: true,
    });
  }
  if (metrics.palette > floors.paletteMax) {
    faults.push({
      view,
      area: "colour",
      fault: "The colours do not match the sketch.",
      expected: `Palette distance at most ${floors.paletteMax}. This shot scored ${metrics.palette.toFixed(1)}.`,
      fix: "Match the approved sketch.",
      blocking: true,
    });
  }
  const edge = mean(metrics.edge);
  if (edge > floors.edgeMax) {
    faults.push({
      view,
      area: "bands",
      fault: "The bands do not match the sketch.",
      expected: `Edge difference at most ${floors.edgeMax}. This shot scored ${edge.toFixed(2)}.`,
      fix: "Match the approved sketch.",
      blocking: true,
    });
  }
  return faults;
}

function readFaults(value: unknown): CompFault[] {
  const errors = validateJson(value, FAULT_SCHEMA);
  if (errors.length > 0) throw new Error("The compare review was not usable.");
  if (typeof value !== "object" || value === null) throw new Error("The compare review was not usable.");
  const rows = (value as { faults?: unknown }).faults;
  if (!Array.isArray(rows)) throw new Error("The compare review was not usable.");
  const faults: CompFault[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) throw new Error("The compare review was not usable.");
    const item = row as Record<string, unknown>;
    if (
      typeof item.view !== "string" ||
      typeof item.area !== "string" ||
      typeof item.fault !== "string" ||
      typeof item.expected !== "string" ||
      typeof item.fix !== "string" ||
      typeof item.blocking !== "boolean"
    ) {
      throw new Error("The compare review was not usable.");
    }
    faults.push({
      view: item.view,
      area: item.area,
      fault: item.fault,
      expected: item.expected,
      fix: item.fix,
      blocking: item.blocking,
    });
  }
  return faults;
}

function fixText(faults: readonly CompFault[], compPaths: readonly string[]): string {
  const lines = ["Comp compare failed."];
  for (const fault of faults) {
    if (!fault.blocking) continue;
    lines.push(`${fault.view} ${fault.area}: ${fault.fault} Expected: ${fault.expected} Fix: ${fault.fix}`);
  }
  for (const file of compPaths) lines.push(`Sketch: ${file}`);
  return lines.join("\n");
}

function writeReports(
  projectDir: string,
  promptId: string,
  route: string,
  roundsUsed: number,
  clean: boolean,
  skipped: string,
  floors: CompareConfig,
  reports: readonly CompViewReport[],
  faults: readonly CompFault[],
): void {
  const dir = path.join(projectDir, compareDir(promptId));
  mkdirSync(dir, { recursive: true });
  const body = {
    promptId,
    route,
    roundsUsed,
    clean,
    ...(skipped === "" ? {} : { skipped: true, reason: skipped }),
    floors,
    views: reports,
  };
  writeFileSync(path.join(dir, "metrics.json"), `${JSON.stringify(body, null, 2)}\n`, "utf8");
  const lines =
    skipped !== ""
      ? [skipped]
      : faults.length === 0
        ? ["No blocking faults."]
        : faults.map((fault) => {
            const mark = fault.blocking ? "Blocking" : "Note";
            return `${mark}. ${fault.view} ${fault.area}: ${fault.fault} Expected: ${fault.expected} Fix: ${fault.fix}`;
          });
  writeFileSync(path.join(dir, "faults.md"), `${lines.join("\n")}\n`, "utf8");
}

async function pauseQueue(
  projectDir: string,
  promptId: string,
  composites: readonly string[],
  deps: CompGateDeps,
): Promise<void> {
  const existing = await loadQueue(projectDir);
  const items = (existing?.items ?? []).map((item) =>
    item.id === promptId ? { ...item, status: "paused" as const } : { ...item },
  );
  if (!items.some((item) => item.id === promptId) && PROMPT_ID.test(promptId)) {
    items.push({ id: promptId, kind: "build", status: "paused" });
  }
  const at = (deps.now ?? (() => new Date()))().toISOString();
  const pause: QueuePause = { at, after: lastFinishedPrompt(items), reason: PAUSE_REASON };
  if (composites.length > 0) pause.composites = [...composites];
  const next: QueueFile = { items, pause };
  await saveQueue(projectDir, next);
}

function pageUrl(base: string, route: string): string {
  const origin = new URL(base);
  const target = route.startsWith("/") ? route : `/${route}`;
  return new URL(target, origin).toString();
}

async function shutPreview(session: CompPreviewSession): Promise<void> {
  await withTimeout(session.close(), CLOSE_MS, "Preview close timed out.").catch(() => undefined);
}

let browserDeps: Promise<BrowserDeps> | null = null;

function loadBrowserDeps(): Promise<BrowserDeps> {
  if (browserDeps === null) browserDeps = importBrowserDeps();
  return browserDeps;
}

async function importBrowserDeps(): Promise<BrowserDeps> {
  const qa = (await import(pathToFileURL(packagedModule("qa", "src/comp-compare.ts")).href)) as {
    shootBuiltView(req: {
      url: string;
      viewport: { width: number; height: number };
      fullPage: boolean;
      out: string;
      timeoutMs: number;
    }): Promise<{ width: number; height: number; file: string }>;
    compareToComp(req: CompCompareRequest): Promise<CompCompareResult>;
    recordSectionMotion(req: {
      url: string;
      seconds: number;
      band?: { y: number; height: number };
      longHeight: number;
      outDir: string;
      timeoutMs: number;
    }): Promise<{ video: string }>;
    ffmpegOnPath(): Promise<boolean>;
    extractFrames(video: string, outDir: string, count: number): Promise<string[]>;
    writeMotionSheet(frames: string[], out: string, label?: string): Promise<void>;
  };
  const deploy = (await import(pathToFileURL(packagedModule("deploy", "src/preview.ts")).href)) as {
    openPreview(req: { projectDir: string; outputDir: string }): Promise<CompPreviewSession>;
  };
  return {
    shoot: async (req) => {
      const shot = await qa.shootBuiltView({
        url: req.url,
        viewport: req.viewport,
        fullPage: req.fullPage,
        out: req.out,
        timeoutMs: req.timeoutMs,
      });
      return { width: shot.width, height: shot.height };
    },
    compare: (req) => qa.compareToComp(req),
    preview: (projectDir) => deploy.openPreview({ projectDir, outputDir: path.join(projectDir, "dist") }),
    recordMotion: (req) =>
      qa.recordSectionMotion({
        url: req.url,
        seconds: req.seconds,
        ...(req.band === undefined ? {} : { band: req.band }),
        longHeight: req.longHeight,
        outDir: req.outDir,
        timeoutMs: req.timeoutMs,
      }),
    ffmpeg: () => qa.ffmpegOnPath(),
    extractFrames: (video, outDir, count) => qa.extractFrames(video, outDir, count),
    contactSheet: (frames, out) => qa.writeMotionSheet(frames, out, "COMP then BUILD"),
  };
}

async function productionThink(projectDir: string, req: CompThinkRequest): Promise<{ faults: CompFault[] }> {
  const result = await think(
    {
      task: req.view === "motion" ? "comp-motion" : "comp-compare",
      schema: FAULT_SCHEMA,
      input: JSON.stringify({
        view: req.view,
        comp: req.comp,
        shot: req.shot,
        note: "The sketch has no real words. Compare structure, colour, and bands. Name the area, what is wrong, what the sketch shows, and the fix.",
      }),
      images: [req.comp, req.shot],
      effort: "high",
    },
    { projectDir },
  );
  return { faults: readFaults(result.value) };
}

async function shootRound(
  projectDir: string,
  promptId: string,
  route: string,
  views: readonly ApprovedCompView[],
  url: string,
  floors: CompareConfig,
  deps: CompGateDeps,
  browser: BrowserDeps,
): Promise<RoundShot> {
  const reports: CompViewReport[] = [];
  const faults: CompFault[] = [];
  const composites: string[] = [];
  const compPaths: string[] = [];
  const shoot = deps.shoot ?? browser.shoot;
  const compare = deps.compare ?? browser.compare;
  const review = deps.think ?? ((req: CompThinkRequest) => productionThink(projectDir, req));
  for (const view of views) {
    const shotRel = `${compareDir(promptId)}/${view.view}-shot.png`;
    const compositeRel = `${compareDir(promptId)}/${view.view}.jpg`;
    const shotAbs = path.join(projectDir, shotRel);
    const compositeAbs = path.join(projectDir, compositeRel);
    mkdirSync(path.dirname(shotAbs), { recursive: true });
    await withTimeout(
      shoot({
        url,
        route,
        view: view.view,
        viewport: { width: view.viewport[0], height: view.viewport[1] },
        fullPage: view.fullPage,
        out: shotAbs,
        timeoutMs: SHOOT_MS,
      }),
      SHOOT_MS + 2_000,
      "The page shot timed out.",
    );
    const metrics = await withTimeout(
      compare({
        shot: shotAbs,
        comp: path.join(projectDir, view.file),
        view: view.view,
        out: compositeAbs,
      }),
      COMPARE_MS,
      "The compare timed out.",
    );
    if (!Number.isFinite(metrics.layout) || !Number.isFinite(metrics.palette)) {
      throw new Error("The compare did not return scores.");
    }
    reports.push({
      view: view.view,
      layout: metrics.layout,
      palette: metrics.palette,
      edge: metrics.edge,
      composite: compositeRel,
      comp: view.file,
      shot: shotRel,
      width: metrics.width,
      height: metrics.height,
    });
    composites.push(compositeRel);
    compPaths.push(view.file);
    faults.push(...metricFaults(view.view, metrics, floors));
    const reviewed = await withTimeout(
      review({ view: view.view, comp: path.join(projectDir, view.file), shot: shotAbs, composite: compositeAbs }),
      COMPARE_MS,
      "The compare review timed out.",
    );
    faults.push(...readFaults(reviewed));
  }
  return { reports, faults, composites, compPaths };
}

async function reviewMotion(
  projectDir: string,
  promptId: string,
  route: string,
  sectionId: string | undefined,
  url: string,
  views: readonly ApprovedCompView[],
  floors: CompareConfig,
  deps: CompGateDeps,
  browser: BrowserDeps,
): Promise<CompFault[]> {
  const clips = approvedSectionClips(projectDir, route, sectionId);
  if (clips.length === 0) return [];
  const record = deps.recordMotion ?? browser.recordMotion;
  if (deps.recordMotion === undefined && deps.shoot !== undefined) {
    note(deps, "Skipped the motion compare. Recording is not connected.");
    return [];
  }
  const ffmpeg = deps.ffmpeg ?? browser.ffmpeg;
  const hasFfmpeg = await ffmpeg();
  if (!hasFfmpeg) {
    note(deps, "Skipped the motion compare. ffmpeg is not on PATH.");
    return [];
  }
  const extract = deps.extractFrames ?? browser.extractFrames;
  const sheet = deps.contactSheet ?? browser.contactSheet;
  const review = deps.think ?? ((req: CompThinkRequest) => productionThink(projectDir, req));
  const long = views.find((view) => view.view === "desktop-long");
  const longHeight = long?.viewport[1] ?? LONG_HEIGHT;
  const seconds = loadConfig(projectDir).design.motionRefs.seconds;
  const faults: CompFault[] = [];
  const limited = clips.slice(0, 3);
  for (const clip of limited) {
    const outDir = path.join(projectDir, compareDir(promptId), "motion-frames", clip.sectionId);
    const recorded = await withTimeout(
      record({
        url,
        route,
        ...(sectionId === undefined ? {} : { sectionId }),
        seconds: Math.min(10, seconds),
        ...(clip.band === undefined ? {} : { band: { y: clip.band.y, height: clip.band.height } }),
        longHeight,
        outDir,
        timeoutMs: Math.min(10, seconds) * 1000 + 15_000,
      }),
      Math.min(10, seconds) * 1000 + 20_000,
      "The motion recording timed out.",
    );
    const built = await extract(recorded.video, path.join(outDir, "built"), 12);
    const sketched = await extract(path.join(projectDir, clip.file), path.join(outDir, "sketch"), 12);
    const sheetRel = `${compareDir(promptId)}/motion.jpg`;
    const sheetAbs = path.join(projectDir, sheetRel);
    await sheet([...sketched, ...built], sheetAbs);
    const reviewed = await withTimeout(
      review({ view: "motion", comp: path.join(projectDir, clip.file), shot: sheetAbs, composite: sheetAbs }),
      COMPARE_MS,
      "The compare review timed out.",
    );
    for (const fault of readFaults(reviewed)) {
      faults.push({
        ...fault,
        view: "motion",
        blocking: floors.motionBlocking && fault.blocking,
      });
    }
  }
  return faults;
}

function blocking(faults: readonly CompFault[]): CompFault[] {
  return faults.filter((fault) => fault.blocking);
}

/**
 * Shoot each approved view, score it, and ask for one vision review.
 * A blocking miss is one fix turn, then a reshoot, up to design.compare.rounds.
 * Out of rounds, the queue pauses. A prompt with no page skips.
 */
export async function runCompGate(
  projectDir: string,
  promptId: string,
  page: string | { route: string; sectionId?: string } | null,
  deps: CompGateDeps = {},
): Promise<CompGateResult> {
  if (!PROMPT_ID.test(promptId)) throw new Error("Name the prompt.");
  const floors = loadConfig(projectDir).design.compare;
  const target = resolvePage(projectDir, promptId, page);
  if (target === null) {
    note(deps, SKIP_NO_PAGE);
    writeReports(projectDir, promptId, "", 0, false, SKIP_NO_PAGE, floors, [], []);
    return { status: "skipped", reason: SKIP_NO_PAGE, roundsUsed: 0, composites: [], faults: [] };
  }
  const route = routeForTarget(projectDir, target);
  if (route === null) {
    note(deps, SKIP_NO_ROUTE);
    writeReports(projectDir, promptId, "", 0, false, SKIP_NO_ROUTE, floors, [], []);
    return { status: "skipped", reason: SKIP_NO_ROUTE, roundsUsed: 0, composites: [], faults: [] };
  }
  const views = approvedCompViews(projectDir, route);
  if (views.length === 0) {
    note(deps, SKIP_NO_SKETCH);
    writeReports(projectDir, promptId, route, 0, false, SKIP_NO_SKETCH, floors, [], []);
    return { status: "skipped", reason: SKIP_NO_SKETCH, roundsUsed: 0, composites: [], faults: [] };
  }

  const needsBrowser = deps.shoot === undefined || deps.compare === undefined;
  const browser = needsBrowser ? await loadBrowserDeps() : emptyBrowser();
  let session: CompPreviewSession | null = null;
  const pauseInfra = async (): Promise<CompGateResult> => {
    const composites = compositePaths(projectDir, promptId);
    try {
      await pauseQueue(projectDir, promptId, composites, deps);
    } catch {
      // A later pause write is what the desk reads when this one fails.
    }
    note(deps, PAUSE_INFRA);
    return { status: "paused", reason: PAUSE_INFRA, roundsUsed: 0, composites, faults: [] };
  };
  try {
    try {
      if (deps.preview !== undefined) {
        session = await withTimeout(deps.preview(projectDir), PREVIEW_MS, "Preview timed out.");
      } else if (deps.shoot === undefined) {
        session = await withTimeout(browser.preview(projectDir), PREVIEW_MS, "Preview timed out.");
      }
      if (session !== null && session.port === DESK_PORT) {
        throw new Error("Refusing the desk port 4175. The compare uses the site preview.");
      }
    } catch (error: unknown) {
      note(deps, error instanceof Error ? error.message : PAUSE_INFRA);
      return pauseInfra();
    }
    const url = session === null ? "http://127.0.0.1/" : pageUrl(session.url, route);
    let reports: CompViewReport[] = [];
    let faults: CompFault[] = [];
    let composites: string[] = [];
    let roundsUsed = 0;
    for (let attempt = 1; attempt <= floors.rounds; attempt += 1) {
      roundsUsed = attempt;
      let shot: RoundShot;
      try {
        shot = await shootRound(projectDir, promptId, route, views, url, floors, deps, browser);
      } catch (error: unknown) {
        note(deps, error instanceof Error ? error.message : PAUSE_INFRA);
        return pauseInfra();
      }
      reports = shot.reports;
      faults = shot.faults;
      composites = shot.composites;
      if (blocking(faults).length === 0) {
        try {
          const motion = await reviewMotion(
            projectDir,
            promptId,
            route,
            target.sectionId,
            url,
            views,
            floors,
            deps,
            browser,
          );
          faults = [...faults, ...motion];
          if (motion.length > 0) composites = [...composites, `${compareDir(promptId)}/motion.jpg`];
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "The motion compare did not finish.";
          note(deps, message);
          if (floors.motionBlocking) return pauseInfra();
          note(deps, "Skipped the motion compare. The clip could not be read.");
        }
      }
      const blocked = blocking(faults);
      if (blocked.length === 0) {
        writeReports(projectDir, promptId, route, roundsUsed, true, "", floors, reports, faults);
        return { status: "clean", reason: "", roundsUsed, composites, faults };
      }
      writeReports(projectDir, promptId, route, roundsUsed, false, "", floors, reports, faults);
      if (attempt === floors.rounds || deps.rerun === undefined) {
        await pauseQueue(projectDir, promptId, composites, deps);
        note(deps, PAUSE_MISMATCH);
        return { status: "paused", reason: PAUSE_MISMATCH, roundsUsed, composites, faults };
      }
      note(deps, "Comp compare failed. Sending the page back for a fix.");
      await deps.rerun({
        text: fixText(blocked, shot.compPaths),
        faults: blocked,
        compPaths: [...shot.compPaths],
        composites: [...composites],
        round: attempt,
      });
    }
    await pauseQueue(projectDir, promptId, composites, deps);
    note(deps, PAUSE_MISMATCH);
    return { status: "paused", reason: PAUSE_MISMATCH, roundsUsed, composites, faults };
  } finally {
    if (session !== null) await shutPreview(session);
  }
}

function compositePaths(projectDir: string, promptId: string): string[] {
  const dir = compareDir(promptId);
  const names = ["desktop.jpg", "desktop-long.jpg", "mobile.jpg", "motion.jpg"];
  const found: string[] = [];
  for (const name of names) {
    const rel = `${dir}/${name}`;
    if (existsSync(path.join(projectDir, rel))) found.push(rel);
  }
  return found;
}

function emptyBrowser(): BrowserDeps {
  const missing = async (): Promise<never> => {
    throw new Error("The compare is not connected.");
  };
  return {
    shoot: missing,
    compare: missing,
    preview: missing,
    recordMotion: missing,
    ffmpeg: async () => false,
    extractFrames: async () => [],
    contactSheet: async () => undefined,
  };
}
