/**
 * Build the confirm plan. This function does not spawn and does not download.
 * Package managers are a PATH scan, or an injected list in tests.
 */

import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertRecipeUrl } from "./hosts.ts";
import {
  DEFAULT_WHISPER_MODEL,
  GROK_DOCS,
  GROK_INSTALL_PS1,
  GROK_INSTALL_SH,
  PLAYWRIGHT_DOCS,
  POPPLER_HOME,
  POPPLER_RECIPES,
  WHISPER_ARCHIVES,
  WHISPER_MODELS,
  WHISPER_REPO,
  type ManagerRecipe,
  whisperAssetUrl,
  whisperModelUrl,
} from "./recipes.ts";
import {
  PlanError,
  isInstallTool,
  type InstallModel,
  type InstallPlan,
  type InstallTool,
  type PlanContext,
  type PlanStep,
} from "./types.ts";

const MANAGER_NAMES = [
  "winget",
  "choco",
  "scoop",
  "brew",
  "apt-get",
  "dnf",
  "pacman",
  "zypper",
  "npm",
  "pnpm",
  "tar",
] as const;

const ADMIN_LABEL = "This step needs an admin terminal. The desk will not run it.";
const NO_ADMIN_LABEL = "Admin is not required.";
const SIGN_IN =
  "After grok is on PATH, sign in yourself. This desk does not type credentials or read tokens.";
const NOTHING_RUNS = "Nothing runs from the desk.";
const PLAYWRIGHT_SIZE =
  "Shown by the Playwright CLI during the download. The browsers cache holds Chromium.";

const URL_IN_TEXT = /https:\/\/[^\s"'<>]+/g;

export function commandOnPath(
  name: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): boolean {
  const raw = platform === "win32" ? (env.Path ?? env.PATH ?? "") : (env.PATH ?? "");
  const sep = platform === "win32" ? ";" : ":";
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const exts = platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const dir of raw.split(sep)) {
    if (dir.length === 0) continue;
    for (const ext of exts) {
      if (existsSync(pathApi.join(dir, `${name}${ext}`))) return true;
    }
  }
  return false;
}

export function managersOnPath(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  return MANAGER_NAMES.filter((name) => commandOnPath(name, env, platform));
}

export function toolDataDir(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
  const home = env.HOME ?? env.USERPROFILE ?? os.homedir();
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  if (platform === "win32") {
    const base = env.LOCALAPPDATA ?? path.win32.join(home, "AppData", "Local");
    return path.win32.join(base, "Hitchhiker", "tools");
  }
  if (platform === "darwin") {
    return path.posix.join(home, "Library", "Application Support", "Hitchhiker", "tools");
  }
  const base = env.XDG_DATA_HOME ?? pathApi.join(home, ".local", "share");
  return pathApi.join(base, "hitchhiker", "tools");
}

/** Playwright's own browsers cache. `PLAYWRIGHT_BROWSERS_PATH` wins when it is set and not "0". */
export function playwrightBrowsersCache(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
  const custom = env.PLAYWRIGHT_BROWSERS_PATH;
  if (custom !== undefined && custom !== "" && custom !== "0") return custom;
  const home = env.HOME ?? env.USERPROFILE ?? os.homedir();
  if (platform === "win32") {
    const local = env.LOCALAPPDATA ?? path.win32.join(home, "AppData", "Local");
    return path.win32.join(local, "ms-playwright");
  }
  if (platform === "darwin") return path.posix.join(home, "Library", "Caches", "ms-playwright");
  const cache = env.XDG_CACHE_HOME ?? path.posix.join(home, ".cache");
  return path.posix.join(cache, "ms-playwright");
}

export function displayArgv(argv: readonly string[]): string {
  return argv.map(quoteArg).join(" ");
}

export function displayCommand(step: PlanStep): string {
  if (step.kind === "download") return step.url === null ? "download" : `download ${step.url}`;
  return displayArgv(step.argv);
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function buildInstallPlan(
  tool: string,
  modelId: string | null,
  ctx: PlanContext,
): InstallPlan {
  if (!isInstallTool(tool)) throw new PlanError(`Unknown tool: ${tool}`);
  const plan =
    tool === "grok"
      ? grokPlan(ctx)
      : tool === "playwright"
        ? playwrightPlan(ctx)
        : tool === "whisper"
          ? whisperPlan(modelId, ctx)
          : popplerPlan(ctx);
  assertPlanUrls(plan);
  return plan;
}

export function assertPlanUrls(plan: InstallPlan): void {
  if (plan.docsUrl !== null) assertRecipeUrl(plan.docsUrl);
  if (plan.sourceUrl.length > 0) assertRecipeUrl(plan.sourceUrl);
  for (const step of plan.steps) {
    if (step.url !== null) assertRecipeUrl(step.url);
  }
  for (const step of plan.runSteps) {
    if (step.needsElevation) throw new PlanError("A runnable step must not need admin.");
    if (step.argv[0] === "sudo") throw new PlanError("A runnable step must not be sudo.");
  }
  const texts = [plan.manualCommand, plan.note, plan.signIn ?? "", plan.adminLabel, plan.sizeLabel];
  for (const text of texts) {
    for (const match of text.matchAll(URL_IN_TEXT)) {
      const url = match[0];
      if (url !== undefined) assertRecipeUrl(url);
    }
  }
}

function quoteArg(arg: string): string {
  if (arg.length === 0 || /[\s"]/.test(arg)) return `"${arg.replaceAll("\"", "\\\"")}"`;
  return arg;
}

function hasManager(ctx: PlanContext, name: string): boolean {
  return ctx.managers.includes(name);
}

function finish(input: {
  recipeId: string;
  tool: InstallTool;
  title: string;
  runSteps: readonly PlanStep[];
  sizeBytes: number | null;
  sizeExact: boolean;
  sizeLabel: string;
  location: string;
  needsAdmin: boolean;
  sourceHost: string;
  sourceUrl: string;
  manualCommand: string;
  docsUrl: string | null;
  signIn: string | null;
  models: readonly InstallModel[];
  selectedModel: string | null;
  note: string;
  workspace: string | null;
}): InstallPlan {
  const canRun = input.runSteps.length > 0 && !input.needsAdmin;
  return {
    recipeId: input.recipeId,
    tool: input.tool,
    title: input.title,
    steps: input.runSteps,
    runSteps: input.runSteps,
    sizeBytes: input.sizeBytes,
    sizeExact: input.sizeExact,
    sizeLabel: input.sizeLabel,
    location: input.location,
    needsAdmin: input.needsAdmin,
    adminLabel: input.needsAdmin ? ADMIN_LABEL : NO_ADMIN_LABEL,
    sourceHost: input.sourceHost,
    sourceUrl: input.sourceUrl,
    manualCommand: input.manualCommand,
    docsUrl: input.docsUrl,
    signIn: input.signIn,
    canRun,
    models: input.models,
    selectedModel: input.selectedModel,
    note: input.note,
    workspace: input.workspace,
  };
}

function grokPlan(ctx: PlanContext): InstallPlan {
  const manual =
    ctx.platform === "win32"
      ? `irm ${GROK_INSTALL_PS1} | iex`
      : `curl -fsSL ${GROK_INSTALL_SH} | bash`;
  const npm = hasManager(ctx, "npm");
  const step: PlanStep = {
    id: "grok-npm",
    argv: ["npm", "install", "-g", "@xai-official/grok"],
    kind: "spawn",
    needsElevation: false,
    url: null,
    dest: null,
    sha256: null,
    bytes: null,
    label: "Install the official grok package.",
  };
  return finish({
    recipeId: npm ? "grok-npm" : "grok-manual",
    tool: "grok",
    title: "Install grok",
    runSteps: npm ? [step] : [],
    sizeBytes: null,
    sizeExact: false,
    sizeLabel: "npm reports the package size as it downloads.",
    location: "The npm global prefix. grok is checked on PATH after the install.",
    needsAdmin: false,
    sourceHost: "x.ai",
    sourceUrl: GROK_DOCS,
    manualCommand: manual,
    docsUrl: GROK_DOCS,
    signIn: SIGN_IN,
    models: [],
    selectedModel: null,
    note: npm
      ? "The vendor pipe stays in the copy box. The desk does not run it."
      : NOTHING_RUNS,
    workspace: null,
  });
}

function playwrightPlan(ctx: PlanContext): InstallPlan {
  const pnpm = hasManager(ctx, "pnpm");
  const step: PlanStep = {
    id: "playwright-chromium",
    argv: ["pnpm", "exec", "playwright", "install", "chromium"],
    kind: "spawn",
    needsElevation: false,
    url: null,
    dest: null,
    sha256: null,
    bytes: null,
    label: "Install the Chromium build Playwright ships.",
    cwd: ctx.workspaceDir,
  };
  return finish({
    recipeId: pnpm ? "playwright-pnpm-chromium" : "playwright-manual",
    tool: "playwright",
    title: "Install playwright",
    runSteps: pnpm ? [step] : [],
    sizeBytes: null,
    sizeExact: false,
    sizeLabel: PLAYWRIGHT_SIZE,
    location: ctx.browsersDir,
    needsAdmin: false,
    sourceHost: "playwright.dev",
    sourceUrl: PLAYWRIGHT_DOCS,
    manualCommand: "pnpm exec playwright install chromium",
    docsUrl: PLAYWRIGHT_DOCS,
    signIn: null,
    models: [],
    selectedModel: null,
    note: pnpm ? "Runs in the Guide workspace." : NOTHING_RUNS,
    workspace: pnpm ? ctx.workspaceDir : null,
  });
}

function popplerPlan(ctx: PlanContext): InstallPlan {
  const platform = ctx.platform === "win32" || ctx.platform === "darwin" || ctx.platform === "linux"
    ? ctx.platform
    : null;
  const recipes = platform === null ? [] : POPPLER_RECIPES.filter((recipe) => recipe.platform === platform);
  const chosen = recipes.find((recipe) => hasManager(ctx, recipe.manager)) ?? null;
  const fallback = recipes[0] ?? null;
  if (chosen !== null && !chosen.needsElevation) {
    const step = managerStep(chosen);
    return finish({
      recipeId: chosen.id,
      tool: "pdftotext",
      title: "Install pdftotext",
      runSteps: [step],
      sizeBytes: null,
      sizeExact: false,
      sizeLabel: "The package manager reports the download as it runs.",
      location: "The package manager puts poppler on PATH.",
      needsAdmin: false,
      sourceHost: "poppler.freedesktop.org",
      sourceUrl: POPPLER_HOME,
      manualCommand: chosen.manual,
      docsUrl: POPPLER_HOME,
      signIn: null,
      models: [],
      selectedModel: null,
      note: "pdftotext comes from poppler.",
      workspace: null,
    });
  }
  const manual = chosen?.manual ?? fallback?.manual ?? "Install poppler from the official source.";
  const recipeId = chosen?.id ?? (platform === null ? "pdftotext-manual" : `pdftotext-manual-${platform}`);
  return finish({
    recipeId,
    tool: "pdftotext",
    title: "Install pdftotext",
    runSteps: [],
    sizeBytes: null,
    sizeExact: false,
    sizeLabel: "The package manager reports the download as it runs.",
    location: "The package manager puts poppler on PATH.",
    needsAdmin: chosen?.needsElevation === true,
    sourceHost: "poppler.freedesktop.org",
    sourceUrl: POPPLER_HOME,
    manualCommand: manual,
    docsUrl: POPPLER_HOME,
    signIn: null,
    models: [],
    selectedModel: null,
    note: chosen === null ? NOTHING_RUNS : ADMIN_LABEL,
    workspace: null,
  });
}

function managerStep(recipe: ManagerRecipe): PlanStep {
  return {
    id: recipe.id,
    argv: recipe.argv,
    kind: "spawn",
    needsElevation: false,
    url: null,
    dest: null,
    sha256: null,
    bytes: null,
    label: "Install poppler so pdftotext is on PATH.",
  };
}

function whisperPlan(modelId: string | null, ctx: PlanContext): InstallPlan {
  const models: InstallModel[] = WHISPER_MODELS.map((model) => ({
    id: model.id,
    label: model.label,
    bytes: model.bytes,
  }));
  const selectedId = modelId === null || modelId.length === 0 ? DEFAULT_WHISPER_MODEL : modelId;
  const model = WHISPER_MODELS.find((item) => item.id === selectedId);
  if (model === undefined) throw new PlanError(`Unknown whisper model: ${selectedId}`);
  const archive = WHISPER_ARCHIVES.find((item) => item.platform === ctx.platform && item.arch === ctx.arch) ?? null;
  const pathApi = ctx.platform === "win32" ? path.win32 : path.posix;
  const destDir = pathApi.join(ctx.dataDir, "whisper");
  const binaryName = ctx.platform === "win32" ? "whisper.exe" : "whisper";
  if (archive === null || !hasManager(ctx, "tar")) {
    const manual = ctx.platform === "darwin"
      ? "brew install whisper-cpp"
      : `Build whisper.cpp from ${WHISPER_REPO}`;
    return finish({
      recipeId: ctx.platform === "darwin" ? "whisper-manual-darwin" : "whisper-manual",
      tool: "whisper",
      title: "Install whisper",
      runSteps: [],
      sizeBytes: null,
      sizeExact: false,
      sizeLabel: "The release page lists the archive size.",
      location: destDir,
      needsAdmin: false,
      sourceHost: "github.com",
      sourceUrl: WHISPER_REPO,
      manualCommand: manual,
      docsUrl: WHISPER_REPO,
      signIn: null,
      models,
      selectedModel: model.id,
      note: archive === null
        ? "This OS has no prebuilt whisper.cpp binary in the pinned release. Nothing runs from the desk."
        : "tar is not on PATH, so the archive cannot be extracted. Nothing runs from the desk.",
      workspace: null,
    });
  }
  const archiveUrl = whisperAssetUrl(archive.file);
  const modelUrl = whisperModelUrl(model.id);
  const archiveDest = pathApi.join(destDir, archive.file);
  const modelDest = pathApi.join(destDir, model.id);
  const placeAs = pathApi.join(destDir, binaryName);
  const downloadArchive: PlanStep = {
    id: "whisper-archive",
    argv: [],
    kind: "download",
    needsElevation: false,
    url: archiveUrl,
    dest: archiveDest,
    sha256: archive.sha256,
    bytes: archive.bytes,
    label: "Download the whisper.cpp release archive.",
  };
  const extract: PlanStep = {
    id: "whisper-extract",
    argv: ["tar", "-xf", archiveDest, "-C", destDir],
    kind: "extract",
    needsElevation: false,
    url: null,
    dest: destDir,
    sha256: null,
    bytes: null,
    label: "Extract the archive and copy the binary.",
    placeAs,
  };
  const downloadModel: PlanStep = {
    id: "whisper-model",
    argv: [],
    kind: "download",
    needsElevation: false,
    url: modelUrl,
    dest: modelDest,
    sha256: model.sha256,
    bytes: model.bytes,
    label: "Download the whisper model.",
  };
  const bytes = archive.bytes + model.bytes;
  const modelKey = model.label.replaceAll(".", "");
  return finish({
    recipeId: `whisper-${archive.platform}-${archive.arch}-${modelKey}`,
    tool: "whisper",
    title: "Install whisper",
    runSteps: [downloadArchive, extract, downloadModel],
    sizeBytes: bytes,
    sizeExact: true,
    sizeLabel: formatMegabytes(bytes),
    location: destDir,
    needsAdmin: false,
    sourceHost: "github.com",
    sourceUrl: archiveUrl,
    manualCommand: `Download ${archiveUrl} and ${modelUrl}`,
    docsUrl: WHISPER_REPO,
    signIn: null,
    models,
    selectedModel: model.id,
    note: `The binary is copied to ${binaryName} in the install folder so the check can see it.`,
    workspace: null,
  });
}
