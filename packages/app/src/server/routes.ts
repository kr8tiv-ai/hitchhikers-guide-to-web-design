import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  CassetteError,
  CassetteMissError,
  GrokMissingError,
  GrokUnavailableError,
  InterviewError,
  LockHeld,
  replaceViaTemp,
  ThinkTimeoutError,
  withStateLock,
  WHY_NUDGE,
  redact,
  chooseShortlist,
  dealRound,
  defaultGalleryCacheDir,
  draftThread,
  emptyWalk,
  galleryCachePaths,
  guideThinkFromScript,
  loadConfig,
  loadGallery,
  loadState,
  loadTree,
  loveCount,
  openInterview,
  parseWalkState,
  questionsForDepth,
  recordVerdict,
  requiredIds,
  runTurn,
  seedExpressAssumptions,
  think,
  writeReferences,
  type AnswerRecord,
  type GalleryEntry,
  type GuideSession,
  type GuideState,
  type GuideTurn,
  type InterviewSession,
  type Question,
  type ThinkRequest,
  type VerdictInput,
  type WalkQuery,
  type WalkState,
} from "@hitchhiker/engine";
import { escapeHtml, renderCard, type CardAssumption, type CardCounts, type CardState } from "../card.ts";
import {
  compactMapLabel,
  depthTouched,
  deskStatus,
  mastLine,
  modeNote,
  savedFooterLine,
  openRequiredCount,
  previousAssumption,
  questionNeedsConfirm,
  renderEmptyBrand,
  APPROVE_EMPTY_ACTION,
  openQuestionHref,
  renderEmptyInterview,
  renderPreflight,
  renderStartInterview,
  type DeskPreflight,
  type InterviewMode,
} from "./card.ts";
import { documentHeadExtras } from "../design/document-head.ts";
import { renderMotionPage } from "../motion-previews/index.ts";
import { galleryStatus, renderGalleryBody, type GalleryCardModel, type GalleryLoveModel, type GalleryView } from "../gallery/walk.ts";
import { renderGuideMap, renderMap } from "../map.ts";
import { renderShell } from "../shell.ts";
import { dressBrandKit, loadBrandKit, postBrandDecision, renderBrandKitError } from "./brand-desk.ts";
import { issueToken, tokensMatch } from "./csrf.ts";
import { pauseDrive, readDashboard, readDriveJson, type DriveResult } from "./drive.ts";
import { createSseHub, encodeSse, type SseHub, type SseSink } from "./sse.ts";
import {
  applySettingsPost,
  loadSettingsView,
  renderSettingsMain,
  settingsSavedLine,
  settingsStatus,
  type SettingsView,
} from "./settings.ts";
import {
  MAX_UPLOAD_BYTES,
  acceptAudio,
  acceptUpload,
  audioFilename,
  contentLengthExceeds,
  parseMultipart,
  readCapped,
} from "./uploads.ts";

interface LiveOverlay {
  forId: string | null;
  message: string | null;
  quote: string | null;
  calm: boolean;
  status: "asked" | "pushed" | "soft" | "done" | null;
  cards: Array<{ name: string; url: string; source: string }>;
  options: Array<{ label: string; why: string; source: string }>;
}

export type TurnHandler = (input: {
  kind: "answer" | "suggest" | "skip";
  questionId: string;
  text?: string;
}) => Promise<{ next: unknown; events: unknown[]; live?: LiveOverlay }>;

export interface DeskProgress {
  answered: number;
  suggested: number;
  skipped: number;
  soft: number;
  imported: number;
  phase: string;
  promptId: string;
  nextAction: string;
}

export interface DeskSession {
  question: Question | null;
  pushback: string | null;
  done: boolean;
  progress: DeskProgress;
  /** Same answer list as progress. The client renders these numbers and does not recount. */
  counts: CardCounts | null;
  assumption: CardAssumption | null;
  required: boolean;
  mastCompact: boolean;
  mastLine: string;
  mapHtml: string;
  guideHtml: string;
  transcriptHtml: string;
  statusHtml: string;
  cardHtml: string;
}

export interface DeskApp {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  close(): void;
  readonly token: string;
}

const JSON_LIMIT = 1024 * 1024;
const SRC_ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC_ROOT = path.resolve(import.meta.dirname, "..", "..", "public");
const CARD_SOURCE = path.resolve(SRC_ROOT, "card.ts");
const BRAND_SOURCE = path.resolve(SRC_ROOT, "client", "brand.ts");
const APPROVE_CARDS_SOURCE = path.resolve(SRC_ROOT, "brand", "approve-cards.ts");
const DESK_SOURCE = path.resolve(SRC_ROOT, "client", "desk.ts");
const THEME_SOURCE = path.resolve(SRC_ROOT, "client", "theme.ts");
const DRIVE_SOURCE = path.resolve(SRC_ROOT, "client", "drive.ts");
const DRIVE_MARKUP_SOURCE = path.resolve(SRC_ROOT, "drive-markup.ts");
const WALK_SOURCE = path.resolve(SRC_ROOT, "gallery", "walk.ts");
const MOTION_SOURCE = path.resolve(SRC_ROOT, "motion-previews", "index.ts");
const MOTION_ROOT = path.resolve(SRC_ROOT, "motion-previews");
const APP_NODE = path.resolve(import.meta.dirname, "..", "..", "node_modules");
const PNPM_STORE = path.resolve(import.meta.dirname, "..", "..", "..", "..", "node_modules", ".pnpm");

const STATIC_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const SAFE = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "cross-origin-resource-policy": "same-origin",
} as const;

type RouteName = "/" | "/brand" | "/approve" | "/hh-dashboard" | "/gallery" | "/motion";

const moduleCache = new Map<string, string>();

/**
 * Interview session for one desk process. The default turn is the live Guide.
 * A caller can still pass `turnHandler` to drive the desk without a model.
 * When Grok is quiet, runTurn keeps the tree ask and the session on disk.
 */
export type GuideThink = typeof think;

export async function createDeskApp(opts: {
  projectDir: string;
  turnHandler?: TurnHandler;
  cassetteNotice?: string;
  /** Tests inject the Guide model. Omitted, the desk picks replay, quiet, or live. */
  guideThink?: GuideThink;
  /**
   * PATH report from `probePathTools`. `hh app` passes it.
   * Omitted, the desk does not invent a second probe.
   */
  preflight?: DeskPreflight;
}): Promise<DeskApp> {
  const projectDir = path.resolve(opts.projectDir);
  const depth = loadConfig(projectDir).interviewDepth;
  if (opts.turnHandler === undefined && depth === "express") {
    await seedExpressAssumptions(projectDir);
  }
  const questions = questionsForDepth(loadTree(treeFile(projectDir)), depth);
  let interview = await openInterview(projectDir, depth);
  let overlay: LiveOverlay = emptyOverlay();
  const rawTurn =
    opts.turnHandler ??
    createLiveTurn(projectDir, depth, () => interview, (next) => {
      interview = next;
    }, opts.guideThink ?? selectGuideThink());
  const turn: TurnHandler = async (input) => {
    const output = await rawTurn(input);
    if (output.live !== undefined) overlay = output.live;
    return output;
  };
  const token = issueToken();
  const hub = createSseHub();
  let tail: Promise<void> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const notice = opts.cassetteNotice ?? null;
  const preflight = opts.preflight ?? null;
  const view = (): DeskSession =>
    buildSession(projectDir, interview, questions, overlay, notice, preflight, depth);

  return {
    token,
    close() {
      hub.close();
    },
    async handle(req, res) {
      const method = req.method ?? "GET";
      const pathname = normalizePath(req.url ?? "/");
      if (pathname === null) {
        sendJson(req, res, 400, { error: "The address could not be read." });
        return;
      }
      if (method !== "GET" && method !== "HEAD" && method !== "POST") {
        sendJson(req, res, 405, { error: "That method is not used here." });
        return;
      }
      if (method === "POST") {
        await handlePost(req, res, pathname, token, projectDir, turn, view, hub, enqueue, notice);
        return;
      }
      await handleGet(req, res, pathname, token, view, hub, projectDir, enqueue, req.url ?? "/", notice);
    },
  };
}

function emptyOverlay(): LiveOverlay {
  return { forId: null, message: null, quote: null, calm: false, status: null, cards: [], options: [] };
}

function createLiveTurn(
  projectDir: string,
  depth: "express" | "standard" | "deep",
  getInterview: () => InterviewSession,
  setInterview: (session: InterviewSession) => void,
  model: typeof think,
): TurnHandler {
  const reload = async (): Promise<void> => {
    setInterview(await openInterview(projectDir, depth));
  };

  return async (input) => {
    await reload();
    let started = false;
    let finished: GuideTurn | null = null;
    try {
      const current = getInterview().next();
      if (current === null || current.id !== input.questionId) {
        // A previous answer posts to the same /api/answer path. Same text stays
        // "already saved". A different text replaces that record in place.
        if (await editStoredAnswer(projectDir, input)) {
          await reload();
          const next = getInterview().next();
          return {
            next,
            events: [
              { type: "turn", kind: input.kind, questionId: input.questionId },
              { type: "session", questionId: next === null ? null : next.id },
            ],
          };
        }
        if (current === null) {
          throw new InterviewError("finished", "The interview is finished.");
        }
        if (answerStored(projectDir, input.questionId)) {
          return aheadTurn(current, input, ALREADY_SAVED_MESSAGE);
        }
        throw new InterviewError("command", "That question is no longer on the desk.");
      }
      const session: GuideSession = {
        projectDir,
        depth,
        language: "en",
        pushes: {},
      };
      started = true;
      finished = await runTurn(
        session,
        input.text === undefined ? { kind: input.kind } : { kind: input.kind, text: input.text },
        { think: model },
      );
      await reload();
      return {
        next: getInterview().next(),
        events: [
          { type: "turn", kind: input.kind, questionId: input.questionId },
          { type: "session", questionId: finished.questionId },
        ],
        live: overlayFrom(finished),
      };
    } catch (error: unknown) {
      try {
        await reload();
      } catch {
        throw error;
      }
      if (finished !== null) {
        logDeskError(error);
        return {
          next: getInterview().next(),
          events: [
            { type: "turn", kind: input.kind, questionId: input.questionId },
            { type: "session", questionId: finished.questionId },
          ],
          live: overlayFrom(finished),
        };
      }
      const next = getInterview().next();
      const moved = next === null || next.id !== input.questionId;
      if (started && moved && answerStored(projectDir, input.questionId)) {
        logDeskError(error);
        return aheadTurn(next, input, savedFailureMessage(error));
      }
      throw error;
    } finally {
      try {
        await reload();
      } catch {
        // The response is already chosen. The next turn opens the file again.
      }
    }
  };
}

function aheadTurn(
  next: Question | null,
  input: { kind: "answer" | "suggest" | "skip"; questionId: string },
  message: string,
): { next: Question | null; events: unknown[]; live: LiveOverlay } {
  return {
    next,
    events: [
      { type: "turn", kind: input.kind, questionId: input.questionId },
      { type: "session", questionId: next === null ? null : next.id },
    ],
    live: {
      forId: next === null ? null : next.id,
      message,
      quote: null,
      calm: true,
      status: next === null ? "done" : "asked",
      cards: [],
      options: [],
    },
  };
}

function overlayFrom(result: GuideTurn): LiveOverlay {
  const cards: LiveOverlay["cards"] = [];
  for (const card of result.cards ?? []) {
    cards.push({ name: card.name, url: card.url, source: card.source });
  }
  return {
    forId: result.questionId,
    message: result.message,
    quote: result.quote ?? null,
    calm: result.calm === true,
    status: result.status,
    cards,
    options: [...(result.options ?? [])],
  };
}

/**
 * Replay uses the ordered cassette. HH_LIVE=1 calls Grok.
 * Node's test runner and the older answer-one e2e stay on the tree ask,
 * because a live call would change that ask and could hang the suite.
 * The product process, with none of those flags, calls Grok.
 */
function selectGuideThink(): typeof think {
  if (process.env.HH_GUIDE_REPLAY === "1") {
    const override = process.env.HH_GUIDE_CASSETTE;
    const file =
      override !== undefined && override.trim() !== ""
        ? override
        : path.resolve(import.meta.dirname, "..", "..", "..", "engine", "test", "cassettes", "guide", "turns.json");
    return guideThinkFromScript(readFileSync(file, "utf8"));
  }
  if (process.env.HH_LIVE === "1") return think;
  const testing = process.env.NODE_TEST_CONTEXT !== undefined || process.execArgv.includes("--test");
  if (testing || process.env.HH_E2E_PROJECT !== undefined) return unavailableGuideThink();
  return think;
}

function unavailableGuideThink(): typeof think {
  return async function unavailable<T>(_req: ThinkRequest<T>) {
    throw new GrokUnavailableError("The Guide is quiet for a moment.");
  };
}

function renderLiveExtras(overlay: LiveOverlay, done: boolean): string {
  const parts: string[] = [];
  if (overlay.calm && overlay.message !== null) {
    parts.push(
      `<p class="hh-turn" data-calm="true"><span class="hh-turn__who">Guide</span> ${escapeHtml(overlay.message)}</p>`,
    );
  } else if (done && overlay.message !== null) {
    parts.push(turnLine("Guide", overlay.message, false));
  }
  for (const card of overlay.cards) {
    if (!isHttpUrl(card.url)) continue;
    parts.push(
      `<a class="hh-btn hh-btn--secondary" data-gallery="${escapeHtml(card.source)}" href="${escapeHtml(card.url)}">${escapeHtml(card.name)}</a>`,
    );
  }
  for (const option of overlay.options) {
    parts.push(
      `<p class="hh-turn" data-suggest-option="${escapeHtml(option.source)}"><span class="hh-turn__who">Suggest</span> ${escapeHtml(option.label)}. ${escapeHtml(option.why)}</p>`,
    );
  }
  if (parts.length === 0) return "";
  return `\n${parts.join("\n")}`;
}

function isHttpUrl(value: string): boolean {
  if (value.indexOf("http://") !== 0 && value.indexOf("https://") !== 0) return false;
  if (value.indexOf(" ") !== -1 || value.indexOf('"') !== -1) return false;
  return true;
}

function createEngineTurn(session: InterviewSession): TurnHandler {
  return async (input) => {
    const current = session.next();
    if (current === null) {
      throw new InterviewError("finished", "The interview is finished.");
    }
    if (current.id !== input.questionId) {
      throw new InterviewError("command", "That question is no longer on the desk.");
    }
    if (input.kind === "answer") {
      await session.command({ type: "answer", text: input.text ?? "" });
    } else if (input.kind === "suggest") {
      await session.command({ type: "suggest" });
    } else {
      await session.command({ type: "skip" });
    }
    const next = session.next();
    return {
      next,
      events: [
        { type: "turn", kind: input.kind, questionId: input.questionId },
        { type: "session", questionId: next === null ? null : next.id },
      ],
    };
  };
}

async function handlePost(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  token: string,
  projectDir: string,
  turn: TurnHandler,
  view: () => DeskSession,
  hub: SseHub,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
  notice: string | null,
): Promise<void> {
  if (pathname === "/settings") {
    await handleSettingsPost(req, res, token, projectDir, enqueue, notice);
    return;
  }
  const header = req.headers["x-hh-csrf"];
  if (typeof header !== "string" || !tokensMatch(token, header)) {
    sendJson(req, res, 403, { error: "The desk refused this request. Reload the page." });
    return;
  }
  if (pathname === "/api/answer" || pathname === "/api/suggest" || pathname === "/api/skip") {
    await handleTurn(req, res, pathname, turn, view, hub, enqueue);
    return;
  }
  if (pathname === "/api/upload") {
    await handleUpload(req, res, projectDir);
    return;
  }
  if (pathname === "/api/audio") {
    await handleAudio(req, res, projectDir);
    return;
  }
  if (pathname === "/api/gallery/verdict") {
    await handleGalleryVerdict(req, res, projectDir, enqueue);
    return;
  }
  if (pathname === "/api/gallery/shortlist") {
    await handleGalleryShortlist(req, res, projectDir, enqueue);
    return;
  }
  if (pathname === "/api/drive/pause") {
    sendDriveResult(req, res, await pauseDrive(projectDir));
    return;
  }
  if (pathname === "/api/brand") {
    await handleBrandPost(req, res, projectDir);
    return;
  }
  sendJson(req, res, 404, { error: "That route is not on the desk." });
}

async function handleBrandPost(
  req: IncomingMessage,
  res: ServerResponse,
  projectDir: string,
): Promise<void> {
  if (contentLengthExceeds(req.headers["content-length"], JSON_LIMIT)) {
    sendJson(req, res, 413, { error: "That request is too large." });
    dropRequest(req);
    return;
  }
  const capped = await readCapped(req, JSON_LIMIT);
  if (!capped.ok) {
    sendJson(req, res, 413, { error: "That request is too large." });
    dropRequest(req);
    return;
  }
  const result = await postBrandDecision(projectDir, capped.body.toString("utf8"));
  sendJson(req, res, result.status, result.body);
}

async function handleTurn(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  turn: TurnHandler,
  view: () => DeskSession,
  hub: SseHub,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
): Promise<void> {
  const kind = pathname === "/api/answer" ? "answer" : pathname === "/api/suggest" ? "suggest" : "skip";
  if (contentLengthExceeds(req.headers["content-length"], JSON_LIMIT)) {
    sendJson(req, res, 413, { error: "That request is too large." });
    dropRequest(req);
    return;
  }
  const capped = await readCapped(req, JSON_LIMIT);
  if (!capped.ok) {
    sendJson(req, res, 413, { error: "That request is too large." });
    dropRequest(req);
    return;
  }
  const parsed = parseTurnBody(capped.body.toString("utf8"), kind);
  if ("error" in parsed) {
    sendJson(req, res, 400, { error: parsed.error });
    return;
  }
  try {
    const result = await enqueue(async () => {
      const output = asTurnResult(
        await turn({
          kind,
          questionId: parsed.questionId,
          ...(parsed.text === undefined ? {} : { text: parsed.text }),
        }),
      );
      const session = view();
      hub.publish("session", session);
      for (const event of output.events) hub.publish("update", event);
      return { next: output.next, events: output.events, session };
    });
    sendJson(req, res, 200, result);
  } catch (error: unknown) {
    const mapped = turnError(error);
    if (mapped.status >= 500 || error instanceof LockHeld) logDeskError(error);
    sendJson(req, res, mapped.status, { error: mapped.message });
  }
}

async function handleUpload(
  req: IncomingMessage,
  res: ServerResponse,
  projectDir: string,
): Promise<void> {
  const loaded = await readUploadBody(req, res);
  if (loaded === null) return;
  const contentType = headerOne(req.headers["content-type"]);
  const part = parseMultipart(loaded, contentType);
  if ("error" in part) {
    sendJson(req, res, 400, { error: part.error });
    return;
  }
  const decision = acceptUpload({
    filename: part.filename,
    mime: part.mime,
    bytes: part.data.length,
  });
  if (!decision.ok) {
    sendJson(req, res, 415, { error: decision.reason });
    return;
  }
  await storeUpload(projectDir, decision.safeName, part.data);
  sendJson(req, res, 201, { ok: true, safeName: decision.safeName, bytes: part.data.length });
}

async function handleAudio(
  req: IncomingMessage,
  res: ServerResponse,
  projectDir: string,
): Promise<void> {
  // Prompt 041 transcribes the file. This package cannot depend on the voice
  // package, so the blob is only stored for that later step.
  const loaded = await readUploadBody(req, res);
  if (loaded === null) return;
  const contentType = headerOne(req.headers["content-type"]);
  if (contentType.startsWith("multipart/")) {
    const part = parseMultipart(loaded, contentType);
    if ("error" in part) {
      sendJson(req, res, 400, { error: part.error });
      return;
    }
    await storeAudio(req, res, projectDir, part.filename, part.mime, part.data);
    return;
  }
  const named = headerOne(req.headers["x-hh-filename"]);
  const filename = audioFilename(contentType, named.length === 0 ? undefined : named);
  await storeAudio(req, res, projectDir, filename, contentType, loaded);
}

async function storeAudio(
  req: IncomingMessage,
  res: ServerResponse,
  projectDir: string,
  filename: string,
  mime: string,
  data: Buffer,
): Promise<void> {
  const decision = acceptAudio({ filename, mime, bytes: data.length });
  if (!decision.ok) {
    sendJson(req, res, 415, { error: decision.reason });
    return;
  }
  await storeUpload(projectDir, decision.safeName, data);
  sendJson(req, res, 201, {
    ok: true,
    safeName: decision.safeName,
    bytes: data.length,
    stored: true,
  });
}

async function readUploadBody(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Buffer | null> {
  if (contentLengthExceeds(req.headers["content-length"], MAX_UPLOAD_BYTES)) {
    sendJson(req, res, 413, { error: "Upload is over 25 MB." });
    dropRequest(req);
    return null;
  }
  const capped = await readCapped(req, MAX_UPLOAD_BYTES);
  if (!capped.ok) {
    sendJson(req, res, 413, { error: "Upload is over 25 MB." });
    dropRequest(req);
    return null;
  }
  return capped.body;
}

/** Let the status line flush, then stop reading a body we will not keep. */
function dropRequest(req: IncomingMessage): void {
  setImmediate(() => {
    if (!req.destroyed) req.destroy();
  });
}

async function handleGet(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  token: string,
  view: () => DeskSession,
  hub: SseHub,
  projectDir: string,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
  rawUrl: string,
  notice: string | null = null,
): Promise<void> {
  if (pathname === "/") {
    const session = view();
    sendHtml(req, res, 200, renderDesk(token, session), foldStyleHeaders());
    return;
  }
  if (pathname === "/gallery") {
    const opened = await enqueue(() => openGallery(projectDir, rawUrl));
    sendHtml(req, res, 200, renderGallery(token, opened.view, notice));
    return;
  }
  if (pathname === "/api/gallery") {
    const opened = await enqueue(() => openGallery(projectDir, rawUrl));
    sendJson(req, res, 200, galleryJson(opened));
    return;
  }
  if (pathname === "/api/gallery/shot") {
    const shot = await readGalleryShot(shotTarget(rawUrl));
    if (shot === null) {
      sendJson(req, res, 404, { error: "That shot is not in the cache." });
      return;
    }
    sendBytes(req, res, 200, "image/webp", shot);
    return;
  }
  if (pathname === "/motion") {
    sendHtml(req, res, 200, renderMotion(token, notice));
    return;
  }
  if (pathname === "/client/motion.js") {
    const compiled = compileAppModule(MOTION_SOURCE);
    if (compiled === null) {
      sendHtml(req, res, 404, renderMissing(token, notice));
      return;
    }
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(compiled));
    return;
  }
  if (pathname === "/vendor/theatre-core.mjs") {
    try {
      sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(buildTheatreBundle()));
    } catch {
      sendHtml(req, res, 404, renderMissing(token, notice));
    }
    return;
  }
  if (pathname.startsWith("/vendor-pkg/")) {
    const body = readVendorModule(pathname);
    if (body === null) {
      sendHtml(req, res, 404, renderMissing(token, notice));
      return;
    }
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(body));
    return;
  }
  if (pathname.startsWith("/src/motion-previews/") && pathname.endsWith(".js")) {
    const rel = pathname.slice("/src/".length).replace(/\.js$/, ".ts");
    const compiled = compileAppModule(path.resolve(SRC_ROOT, rel));
    if (compiled === null) {
      sendHtml(req, res, 404, renderMissing(token, notice));
      return;
    }
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(compiled));
    return;
  }
  if (pathname === "/brand") {
    const loaded = await loadBrandKit(projectDir);
    if (loaded.kind === "missing") {
      sendHtml(req, res, 200, renderBrand(token, notice, view().question?.id ?? null));
      return;
    }
    const nav = `${deskMenu(false)}\n        ${routeNav("/brand")}`;
    if (loaded.kind === "bad") {
      sendHtml(req, res, 500, renderBrandKitError(token, nav));
      return;
    }
    sendHtml(req, res, 200, dressBrandKit(loaded.html, token, nav), brandKitHeaders());
    return;
  }
  if (pathname === "/approve") {
    sendHtml(req, res, 200, renderApprove(token, notice, view().question?.id ?? null));
    return;
  }
  if (pathname === "/settings") {
    try {
      const settingsView = await enqueue(() => loadSettingsView(projectDir));
      sendHtml(req, res, 200, renderSettingsDocument(token, settingsView, notice, null));
    } catch (error: unknown) {
      logDeskError(error);
      sendHtml(req, res, 500, renderSettingsFailure(token, notice));
    }
    return;
  }
  if (pathname === "/hh-dashboard") {
    const drive = await readDashboard(projectDir, token);
    if (drive.kind === "html") {
      sendHtml(req, res, drive.status, withDeskMenu(drive.html));
      return;
    }
    sendDriveResult(req, res, drive);
    return;
  }
  if (pathname === "/api/drive") {
    sendDriveResult(req, res, await readDriveJson(projectDir));
    return;
  }
  if (pathname === "/api/session") {
    sendJson(req, res, 200, view());
    return;
  }
  if (pathname === "/api/events") {
    streamEvents(req, res, view, hub);
    return;
  }
  if (pathname === "/client/desk.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(DESK_SOURCE)));
    return;
  }
  if (pathname === "/client/brand.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(BRAND_SOURCE)));
    return;
  }
  if (pathname === "/client/approve-cards.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(APPROVE_CARDS_SOURCE)));
    return;
  }
  if (pathname === "/client/theme.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(THEME_SOURCE)));
    return;
  }
  if (pathname === "/favicon.ico" || pathname === "/favicon.svg") {
    sendBytes(req, res, 200, "image/svg+xml", readFileSync(path.resolve(SRC_ROOT, "design", "favicon.svg")));
    return;
  }
  if (pathname === "/client/drive.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(DRIVE_SOURCE)));
    return;
  }
  if (pathname === "/client/drive-markup.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(DRIVE_MARKUP_SOURCE)));
    return;
  }
  if (pathname === "/client/document-head.js") {
    sendBytes(
      req,
      res,
      200,
      "text/javascript; charset=utf-8",
      Buffer.from(browserModule(path.resolve(SRC_ROOT, "design", "document-head.ts"))),
    );
    return;
  }
  if (pathname === "/client/card.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(CARD_SOURCE)));
    return;
  }
  if (pathname === "/client/walk.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(WALK_SOURCE)));
    return;
  }
  if (pathname.startsWith("/src/") || pathname.startsWith("/public/")) {
    const root = pathname.startsWith("/src/") ? SRC_ROOT : PUBLIC_ROOT;
    const prefix = pathname.startsWith("/src/") ? "/src/" : "/public/";
    const ext = path.extname(pathname).toLowerCase();
    const type = STATIC_TYPES[ext];
    if (type === undefined) {
      sendHtml(req, res, 404, renderMissing(token, notice));
      return;
    }
    const body = await readInside(root, pathname.slice(prefix.length));
    if (body === null) {
      sendHtml(req, res, 404, renderMissing(token, notice));
      return;
    }
    sendBytes(req, res, 200, type, body);
    return;
  }
  if (pathname.startsWith("/api/")) {
    sendJson(req, res, 404, { error: "That route is not on the desk." });
    return;
  }
  sendHtml(req, res, 404, renderMissing(token, notice));
}

function streamEvents(
  req: IncomingMessage,
  res: ServerResponse,
  view: () => DeskSession,
  hub: SseHub,
): void {
  const session = view();
  const sink: SseSink = {
    write(chunk) {
      if (res.writableEnded || res.destroyed) return false;
      res.write(chunk);
      return true;
    },
    end() {
      if (!res.writableEnded) res.end();
    },
  };
  req.socket?.setNoDelay(true);
  req.socket?.setTimeout(0);
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-content-type-options": "nosniff",
  });
  hub.add(sink);
  sink.write(`: connected\n\n${encodeSse("session", session)}`);
  req.on("close", () => {
    hub.remove(sink);
  });
}

function buildSession(
  projectDir: string,
  session: InterviewSession,
  questions: readonly Question[],
  overlay: LiveOverlay,
  notice: string | null,
  preflight: DeskPreflight | null,
  depth: InterviewMode,
): DeskSession {
  let question = session.next();
  const saved = loadState(projectDir);
  const promptId = question === null ? "interview:done" : `interview:${question.id}`;
  const nextAction = question === null ? "Approve the Site Brief." : `Answer ${question.id}.`;
  const state: GuideState = saved ?? {
    phase: "Don't Panic",
    slice: "The Guide",
    promptId,
    lastGoodCommit: "",
    blockers: [],
    nextAction,
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
  const coverage = session.coverage();
  const answers = readAnswers(projectDir);
  let pushback = session.lastPushback;
  const message = overlay.message;
  if (overlay.calm) {
    pushback = null;
  } else if (question !== null && message !== null && overlay.forId === question.id && overlay.status === "pushed") {
    question = { ...question, ask: message };
    pushback = overlay.quote;
  } else if (
    question !== null &&
    message !== null &&
    overlay.forId === question.id &&
    (overlay.status === "asked" || overlay.status === "soft")
  ) {
    question = { ...question, ask: message };
    pushback = null;
  }
  const done = question === null;
  const requiredList = requiredIds();
  const index = question === null ? 0 : questions.findIndex((item) => item.id === question.id) + 1;
  const counts: CardCounts | null =
    question === null || index < 1
      ? null
      : {
          index,
          total: questions.length,
          phase: state.phase,
          openRequired: openRequiredCount(questions, answers, requiredList),
          mode: depth,
          modeNote: modeNote(depth),
        };
  const assumption = previousAssumption(questions, answers, question?.id ?? null);
  const required = questionNeedsConfirm(question, requiredList);
  const card: CardState = {
    question,
    draft: "",
    pushback,
    error: null,
    done,
    pending: false,
    counts,
    assumption,
    required,
    enterHint: true,
  };
  const compact = depthTouched(questions, answers);
  const stepTotal = questions.length;
  const stepIndex = counts === null ? (done ? stepTotal : 0) : counts.index;
  const calm = overlay.calm && overlay.message !== null;
  const baseStatus = calm
    ? (overlay.message ?? "")
    : state.nextAction.trim().length > 0
      ? state.nextAction
      : "Ready.";
  const firstRun = answers.length === 0;
  const statusText = deskStatus({ base: baseStatus, firstRun, calm, preflight });
  const footerText =
    compact && !calm && question !== null && counts !== null && statusText === baseStatus
      ? savedFooterLine(question.id, stepTotal - counts.index)
      : statusText;
  let mapHtml: string;
  try {
    mapHtml = renderDeskMap(renderMap(state), state.phase, compactMapLabel(state.phase, stepIndex, stepTotal));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "The map could not be drawn.";
    mapHtml = `<p class="hh-error" role="alert">${escapeHtml(message)}</p>`;
  }
  const preflightHtml = preflight !== null && firstRun ? `${renderPreflight(preflight)}\n` : "";
  const transcript = `${preflightHtml}${renderTranscript(questions, answers, question)}${renderLiveExtras(overlay, done)}`;
  const renderedCard = renderCard(card);
  const cardHtml = renderedCard.includes("No question yet.")
    ? renderEmptyInterview(questions[0]?.id ?? null)
    : renderedCard;
  return {
    question,
    pushback,
    done,
    progress: {
      answered: coverage.answered,
      suggested: coverage.suggested,
      skipped: coverage.skipped,
      soft: coverage.soft,
      imported: coverage.imported,
      phase: state.phase,
      promptId: state.promptId,
      nextAction: state.nextAction,
    },
    counts,
    assumption,
    required,
    mastCompact: compact,
    mastLine: mastLine(state.phase, question?.id ?? null),
    mapHtml,
    guideHtml: renderGuideMap(answers, [...questions]),
    transcriptHtml: transcript,
    statusHtml: statusSpans(footerText, notice, overlay.calm),
    cardHtml,
  };
}

function statusSpans(text: string, notice: string | null | undefined, calm = false): string {
  const calmAttr = calm ? ' data-calm="true"' : "";
  const action = `<span${calmAttr}>${escapeHtml(text)}</span>`;
  if (notice === null || notice === undefined || notice.length === 0) return action;
  return `<span>${escapeHtml(notice)}</span>${action}`;
}

const VISIBLE_TURNS = 3;

interface LoggedTurn {
  id: string;
  ask: string | null;
  value: string;
}

function renderTranscript(
  tree: readonly Question[],
  answers: readonly AnswerRecord[],
  _current: Question | null,
): string {
  const asks = new Map(tree.map((question) => [question.id, question.ask]));
  const turns: LoggedTurn[] = answers.map((answer) => ({
    id: answer.id,
    ask: asks.get(answer.id) ?? null,
    value: answer.value,
  }));
  // The card title is the current question. Repeating it here printed the ask twice.
  if (turns.length === 0) {
    return turnLine("Guide", "Answers land here after you send one.", false);
  }
  const splitAt = Math.max(0, turns.length - VISIBLE_TURNS);
  const parts: string[] = [];
  if (splitAt > 0) {
    const earlier = turns
      .slice(0, splitAt)
      .map((turn, index) => renderLoggedTurn(turn, index))
      .join("\n");
    parts.push(
      `<details class="hh-qcard__look" data-earlier><summary>Earlier</summary>\n${earlier}\n</details>`,
    );
  }
  parts.push(
    ...turns.slice(splitAt).map((turn, index) => renderLoggedTurn(turn, splitAt + index)),
  );
  return parts.join("\n");
}

function renderLoggedTurn(turn: LoggedTurn, index: number): string {
  const ask = turn.ask === null ? "" : `${turnLine("Guide", turn.ask, false)}\n`;
  const id = escapeHtml(turn.id);
  const fieldId = `hh-edit-${index}`;
  return `${ask}<div class="hh-turn hh-turn--you" data-answer-id="${id}">
            <span class="hh-turn__who">You</span>
            <span data-answer-text>${escapeHtml(turn.value)}</span>
            <button type="button" class="hh-btn hh-btn--ghost" data-edit="${id}">Edit</button>
            <form hidden class="hh-qcard__composer" data-edit-form="${id}">
              <label class="hh-qcard__label" for="${fieldId}">Edit this answer</label>
              <textarea class="hh-qcard__input" id="${fieldId}" data-edit-field="${id}" rows="3" autocomplete="off">${escapeHtml(turn.value)}</textarea>
              <button type="button" class="hh-btn hh-btn--secondary" data-edit-save="${id}">Save this answer</button>
            </form>
          </div>`;
}

function turnLine(who: string, text: string, you: boolean): string {
  const cls = you ? "hh-turn hh-turn--you" : "hh-turn";
  return `<p class="${cls}"><span class="hh-turn__who">${escapeHtml(who)}</span> ${escapeHtml(text)}</p>`;
}

/**
 * Phase names stay the locked six. Each one links to a desk that already
 * exists. Mostly Harmless and So Long share Drive: the queue, the gates,
 * and deploy are on /hh-dashboard. No new route.
 */
const PHASE_HREF: Readonly<Record<string, string>> = {
  "Don't Panic": "/",
  "Babel Fish": "/brand",
  "Deep Thought": "/approve",
  "Improbability Drive": "/hh-dashboard",
  "Mostly Harmless": "/hh-dashboard",
  "So Long and Thanks for All the Fish": "/hh-dashboard",
};

/**
 * Under 720px the summary is the map and the list waits in the disclosure.
 * 375 is inside max-width 719px. 1440 is not: the summary is hidden and the
 * list stays in the rail. Author display beats the closed-details user-agent
 * rule, so the wide map does not need the open attribute.
 */
const MAP_FOLD_CSS = `.hh-map-fold { margin: 0; min-width: 0; }
.hh-map-fold > summary { display: none; }
.hh-map a.hh-map__name { color: inherit; text-decoration: none; }
.hh-map a.hh-map__name:hover { color: var(--color-accent); }
.hh-map a.hh-map__name[aria-current=step] { box-shadow: inset 0 -2px 0 var(--color-accent); }
.hh-turn form[hidden] { display: none; }
@media (max-width: 719px) {
  .hh-map-fold > summary {
    display: list-item;
    min-height: 44px;
    cursor: pointer;
    color: var(--color-ink);
    font-family: var(--font-display);
    font-weight: 600;
    font-size: var(--type-small);
    line-height: 1.3;
  }
  .hh-map-fold:not([open]) > .hh-map { display: none; }
}
@media (min-width: 720px) {
  .hh-map-fold > .hh-map { display: grid; }
}`;

function renderDeskMap(mapHtml: string, phase: string, compactLabel: string): string {
  const linked = mapHtml.replace(
    /<span class="hh-map__name">([^<]*)<\/span>/g,
    (_full, name: string) => {
      const href = PHASE_HREF[name];
      if (href === undefined) return `<span class="hh-map__name">${name}</span>`;
      const current = name === phase ? ' aria-current="step"' : "";
      return `<a class="hh-map__name" href="${href}"${current}>${name}</a>`;
    },
  );
  return `<details class="hh-map-fold">
            <summary>${escapeHtml(compactLabel)}</summary>
            ${linked}
          </details>`;
}

function renderDesk(token: string, session: DeskSession): string {
  let html = renderShell();
  const dek = `<p class="hh-dek">Don't Panic. One question at a time. The work saves on this machine.</p>`;
  const startInterview =
    session.question !== null && session.mastCompact !== true && session.counts?.index === 1
      ? `\n        <p class="hh-empty__next">${renderStartInterview(session.question.id)}</p>`
      : "";
  const fullHidden = session.mastCompact ? " hidden" : "";
  const lineHidden = session.mastCompact ? "" : " hidden";
  const mastAttr = session.mastCompact ? ' data-mast="line"' : "";
  html = mustReplace(
    html,
    '<meta charset="utf-8" />',
    `<meta charset="utf-8" />\n    <meta name="hh-csrf" content="${escapeHtml(token)}" />`,
    "charset",
  );
  html = mustReplace(
    html,
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<meta name="viewport" content="width=device-width, initial-scale=1" />\n${documentHeadExtras("Don't Panic. One question at a time. The work saves on this machine.")}`,
    "viewport",
  );
  html = mustReplace(
    html,
    `<header class="hh-mast hh-rise">
        <div class="hh-mast__row">
          <h1 class="hh-kicker">The Hitchhiker's Guide to Web Design</h1>
          <p class="hh-kicker">Desk</p>
        </div>
        <div class="hh-wordmark" role="img" aria-label="Don't Panic"></div>
        ${dek}`,
    `<header class="hh-mast hh-rise"${mastAttr}>
        <div data-mast-full${fullHidden}>
        <div class="hh-mast__row">
          <h1 class="hh-kicker">The Hitchhiker's Guide to Web Design</h1>
          <p class="hh-kicker">Desk</p>
        </div>
        <div class="hh-wordmark" role="img" aria-label="Don't Panic"></div>
        ${dek}${startInterview}
        </div>
        <p class="hh-mast__line" data-mast-line${lineHidden}>${escapeHtml(session.mastLine)}</p>
        ${deskMenu(false)}
        ${routeNav("/")}`,
    "mast",
  );
  html = mustReplace(
    html,
    '<link rel="stylesheet" href="src/shell.css" />',
    `<link rel="stylesheet" href="src/shell.css" />\n    <link rel="stylesheet" href="src/card.css" />\n    <link rel="stylesheet" href="src/motion-previews/motion.css" />\n    <style>${MAP_FOLD_CSS}</style>`,
    "shell css",
  );
  html = html.replaceAll('href="src/', 'href="/src/');
  html = replaceBlock(
    html,
    /<section class="hh-log hh-rise hh-rise--2" id="transcript" data-region="transcript" aria-label="Transcript">[\s\S]*?<\/section>/,
    `<section class="hh-log hh-rise hh-rise--2" id="transcript" data-region="transcript" aria-label="Transcript">\n            ${session.transcriptHtml}\n          </section>`,
    "transcript",
  );
  html = replaceBlock(
    html,
    /<section class="hh-rise hh-rise--3" data-region="question" aria-label="Question">[\s\S]*?<\/section>/,
    `<section class="hh-rise hh-rise--3" data-region="question" aria-label="Question">\n            ${session.cardHtml}\n          </section>`,
    "question",
  );
  html = replaceBlock(
    html,
    /<nav class="hh-rise hh-rise--4" aria-label="Guide map">[\s\S]*?<\/nav>/,
    `<nav class="hh-rise hh-rise--4" data-region="map" aria-label="Guide map">\n          ${session.mapHtml}\n        </nav>`,
    "map",
  );
  html = replaceBlock(
    html,
    /<footer class="hh-status" data-region="status">[\s\S]*?<\/footer>/,
    `<footer class="hh-status" data-region="status">\n        ${session.statusHtml}\n      </footer>`,
    "status",
  );
  const motion =
    session.question?.id.startsWith("DP-6.") === true
      ? `    <script type="module" src="/client/motion.js"></script>\n`
      : "";
  return html.replace(
    "</body>",
    `    <script type="module" src="/client/desk.js"></script>\n${motion}  </body>`,
  );
}

function renderBrand(token: string, notice: string | null = null, questionId: string | null = null): string {
  return renderPanel({
    notice,
    token,
    title: "Brand kit",
    description: "Palette, letters, and voice land on this plate after the brief is approved.",
    current: "/brand",
    kicker: "Brand kit",
    status: "The kit waits on the brief.",
    main: renderEmptyBrand(questionId),
  });
}

function renderApprove(token: string, notice: string | null = null, questionId: string | null = null): string {
  const href = escapeHtml(openQuestionHref(questionId));
  return renderPanel({
    notice,
    token,
    title: "Approvals",
    description: "Nothing is waiting for a yes.",
    current: "/approve",
    kicker: "Approvals",
    status: "Nothing is waiting for a yes.",
    main: `<div class="hh-empty hh-rise hh-rise--2">
        <h1 class="hh-empty__title">Nothing is waiting for a yes</h1>
        <p>A plate shows up here when a brief or a prompt is ready for a decision.</p>
        <p class="hh-empty__next"><a class="hh-btn hh-btn--primary" href="${href}">${APPROVE_EMPTY_ACTION}</a></p>
      </div>`,
  });
}

function renderMotion(token: string, notice: string | null = null): string {
  return renderPanel({
    notice,
    token,
    title: "Motion",
    description: "Ten short loops, then a number for how much motion the site should carry.",
    current: "/motion",
    kicker: "Motion",
    status: "Pick a number after the loops.",
    board: true,
    extraCss: ["/src/motion-previews/motion.css"],
    script: "/client/motion.js",
    main: renderMotionPage(),
  });
}

function renderMissing(token: string, notice: string | null = null): string {
  return renderPanel({
    notice,
    token,
    title: "Not on the desk",
    description: "This address is not a route.",
    current: "/",
    kicker: "Missing",
    status: "This address is not a route.",
    main: `<div class="hh-empty">
        <h1 class="hh-empty__title">This page is not on the desk</h1>
        <p>The address does not match a route.</p>
        <p class="hh-empty__next"><a class="hh-btn hh-btn--secondary" href="/">Back to the desk</a></p>
      </div>`,
  });
}

function renderPanel(opts: {
  token: string;
  title: string;
  description: string;
  current: RouteName | null;
  kicker: string;
  main: string;
  status: string;
  notice?: string | null;
  extraCss?: readonly string[];
  script?: string;
  board?: boolean;
  onSettings?: boolean;
}): string {
  const extra = (opts.extraCss ?? [])
    .map((href) => `    <link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join("\n");
  const script =
    opts.script === undefined ? "" : `    <script type="module" src="${escapeHtml(opts.script)}"></script>\n`;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="hh-csrf" content="${escapeHtml(opts.token)}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
${documentHeadExtras(opts.description)}
    <title>${escapeHtml(opts.title)}</title>
    <link rel="stylesheet" href="/src/design/tokens.css" />
    <link rel="stylesheet" href="/src/design/type.css" />
    <link rel="stylesheet" href="/src/design/components.css" />
    <link rel="stylesheet" href="/src/shell.css" />
    <link rel="stylesheet" href="/src/card.css" />
${extra}
  </head>
  <body>
    <a class="hh-skip" href="#main">Skip to the panel</a>
    <div class="hh-shell">
      <header class="hh-mast hh-rise">
        <div class="hh-mast__row">
          <p class="hh-kicker">${escapeHtml(opts.kicker)}</p>
          <p class="hh-kicker">Local desk</p>
        </div>
        <div class="hh-wordmark" role="img" aria-label="Don't Panic"></div>
        ${deskMenu(opts.onSettings === true)}
        ${routeNav(opts.current)}
      </header>
      <main id="main" class="hh-read${opts.board === true ? " hh-read--board" : ""}">
        ${opts.main}
      </main>
      <footer class="hh-status">
        ${statusSpans(opts.status, opts.notice)}
      </footer>
    </div>
${script}  </body>
</html>
`;
}

function deskMenu(onSettings: boolean): string {
  const open = onSettings ? " open" : "";
  const current = onSettings ? ' aria-current="page"' : "";
  return `<details class="hh-desk-menu hh-qcard__look"${open}>
          <summary class="hh-kicker">Desk menu</summary>
          <a class="hh-btn hh-btn--ghost" href="/settings"${current}>Settings</a>
        </details>`;
}

function withDeskMenu(html: string): string {
  if (html.includes('class="hh-desk-menu')) return html;
  const mark = `<div class="hh-wordmark hh-wordmark--quiet" role="img" aria-label="Don't Panic"></div>`;
  if (!html.includes(mark)) return html;
  return html.replace(mark, `${mark}\n        ${deskMenu(false)}`);
}

function renderSettingsDocument(
  token: string,
  view: SettingsView,
  notice: string | null,
  flash: { kind: "ok" | "warn"; text: string } | null,
): string {
  return renderPanel({
    notice,
    token,
    title: "Settings",
    description: "Voice, model, and effort. The speech-to-text rate is shown before xAI can be turned on.",
    current: null,
    onSettings: true,
    kicker: "Settings",
    status: flash?.text ?? settingsStatus(view),
    main: renderSettingsMain(view, token, flash),
  });
}

function renderSettingsFailure(token: string, notice: string | null): string {
  return renderPanel({
    notice,
    token,
    title: "Settings",
    description: "Settings could not be read.",
    current: null,
    onSettings: true,
    kicker: "Settings",
    status: "Settings could not be read.",
    main: `<div class="hh-empty">
        <h1 class="hh-empty__title">Settings could not be read</h1>
        <p>The rate card stayed unread. Nothing was turned on.</p>
      </div>`,
  });
}

async function handleSettingsPost(
  req: IncomingMessage,
  res: ServerResponse,
  token: string,
  projectDir: string,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
  notice: string | null,
): Promise<void> {
  const contentType = headerOne(req.headers["content-type"]);
  const wantsJson = contentType.split(";")[0]?.trim().toLowerCase() === "application/json";
  if (contentLengthExceeds(req.headers["content-length"], JSON_LIMIT)) {
    await replySettings(req, res, wantsJson, 413, "That request is too large.", null, token, projectDir, enqueue, notice);
    dropRequest(req);
    return;
  }
  const capped = await readCapped(req, JSON_LIMIT);
  if (!capped.ok) {
    await replySettings(req, res, wantsJson, 413, "That request is too large.", null, token, projectDir, enqueue, notice);
    dropRequest(req);
    return;
  }
  const raw = capped.body.toString("utf8");
  if (!settingsTokenOk(token, req.headers["x-hh-csrf"], raw, contentType)) {
    await replySettings(
      req,
      res,
      wantsJson,
      403,
      "The desk refused this request. Reload the page.",
      null,
      token,
      projectDir,
      enqueue,
      notice,
    );
    return;
  }
  try {
    const result = await enqueue(() => applySettingsPost(projectDir, raw, contentType));
    const text = result.error ?? settingsSavedLine(result.view);
    await replySettings(req, res, wantsJson, result.status, text, result, token, projectDir, enqueue, notice);
  } catch (error: unknown) {
    logDeskError(error);
    await replySettings(req, res, wantsJson, 500, "Settings did not save.", null, token, projectDir, enqueue, notice);
  }
}

async function replySettings(
  req: IncomingMessage,
  res: ServerResponse,
  wantsJson: boolean,
  status: number,
  text: string,
  result: { error: string | null; view: SettingsView } | null,
  token: string,
  projectDir: string,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
  notice: string | null,
): Promise<void> {
  if (wantsJson) {
    if (result === null || result.error !== null || status !== 200) {
      sendJson(req, res, status, { error: text });
      return;
    }
    sendJson(req, res, 200, {
      ok: true,
      voice: result.view.voice,
      model: result.view.model,
      effort: result.view.effort,
      accepted: result.view.accepted,
      restPerHour: result.view.restPerHour,
      streamingPerHour: result.view.streamingPerHour,
      restPriceText: result.view.restPriceText,
      streamingPriceText: result.view.streamingPriceText,
    });
    return;
  }
  try {
    const view = result?.view ?? (await enqueue(() => loadSettingsView(projectDir)));
    const flash = status === 200 ? { kind: "ok" as const, text } : { kind: "warn" as const, text };
    sendHtml(req, res, status, renderSettingsDocument(token, view, notice, flash));
  } catch (error: unknown) {
    logDeskError(error);
    sendHtml(req, res, status, renderSettingsFailure(token, notice));
  }
}

function settingsTokenOk(
  token: string,
  header: string | string[] | undefined,
  raw: string,
  contentType: string,
): boolean {
  if (typeof header === "string" && tokensMatch(token, header)) return true;
  const fromBody = csrfField(raw, contentType);
  return fromBody !== null && tokensMatch(token, fromBody);
}

function csrfField(raw: string, contentType: string): string | null {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime === "application/json") {
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
      const csrf = (value as Record<string, unknown>).csrf;
      return typeof csrf === "string" ? csrf : null;
    } catch {
      return null;
    }
  }
  if (mime === "application/x-www-form-urlencoded") return new URLSearchParams(raw).get("csrf");
  return null;
}

function routeNav(current: RouteName | null): string {
  const items = [
    ["/", "Desk"],
    ["/brand", "Brand kit"],
    ["/approve", "Approvals"],
    ["/hh-dashboard", "Drive"],
    ["/gallery", "Gallery"],
    ["/motion", "Motion"],
  ] as const;
  const links = items.map(([href, label]) => {
    const on = href === current;
    const currentAttr = on ? ' aria-current="page"' : "";
    return `<a href="${href}"${currentAttr}>${escapeHtml(label)}</a>`;
  });
  return `<nav class="hh-routes" aria-label="Desk routes">${links.join("")}</nav>`;
}

function browserModule(filePath: string): string {
  const cached = moduleCache.get(filePath);
  if (cached !== undefined) return cached;
  const source = readFileSync(filePath, "utf8");
  const stripped = stripTypeScriptTypes(source, { mode: "strip" });
  const js = stripped
    .replace(/from\s+["']\.\.\/card\.ts["']/g, 'from "/client/card.js"')
    .replace(/from\s+["']\.\/card\.ts["']/g, 'from "/client/card.js"')
    .replace(/from\s+["']\.\.\/drive-markup\.ts["']/g, 'from "/client/drive-markup.js"')
    .replace(/from\s+["']\.\/design\/document-head\.ts["']/g, 'from "/client/document-head.js"')
    .replace(/from\s+["']\.\.\/brand\/approve-cards\.ts["']/g, 'from "/client/approve-cards.js"');
  moduleCache.set(filePath, js);
  return js;
}

const VENDOR_ALLOW = new Set([
  "gsap",
  "three",
  "ogl",
  "motion",
  "framer-motion",
  "motion-dom",
  "motion-utils",
  "tslib",
  "animejs",
  "lenis",
]);

const packageRoots = new Map<string, string>();
let theatreBundle: string | null = null;

function packageJsonExists(dir: string): boolean {
  return existsSync(path.join(dir, "package.json"));
}

function findInPnpm(name: string): string | null {
  if (!existsSync(PNPM_STORE)) return null;
  const needle = name.startsWith("@") ? `${name.slice(1).replace("/", "+")}@` : `${name}@`;
  let entries: string[] = [];
  try {
    entries = readdirSync(PNPM_STORE);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.startsWith(needle)) continue;
    const candidate = path.join(PNPM_STORE, entry, "node_modules", ...name.split("/"));
    if (packageJsonExists(candidate)) return candidate;
  }
  return null;
}

function findPackageRoot(fromFile: string, name: string): string | null {
  const cached = packageRoots.get(name);
  if (cached !== undefined && packageJsonExists(cached)) return cached;
  const segments = name.split("/");
  let dir = path.dirname(fromFile);
  try {
    dir = path.dirname(realpathSync(fromFile));
  } catch {
    dir = path.dirname(fromFile);
  }
  for (let hop = 0; hop < 14; hop += 1) {
    const nested = path.join(dir, "node_modules", ...segments);
    if (packageJsonExists(nested)) {
      packageRoots.set(name, nested);
      return nested;
    }
    if (path.basename(dir) === "node_modules") {
      const sibling = path.join(dir, ...segments);
      if (packageJsonExists(sibling)) {
        packageRoots.set(name, sibling);
        return sibling;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const fromApp = path.join(APP_NODE, ...segments);
  if (packageJsonExists(fromApp)) {
    packageRoots.set(name, fromApp);
    return fromApp;
  }
  const stored = findInPnpm(name);
  if (stored !== null) {
    packageRoots.set(name, stored);
    return stored;
  }
  return null;
}

function pickBrowser(value: unknown, depth = 0): string | null {
  if (depth > 8) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickBrowser(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["browser", "import", "module", "default"]) {
    if (!(key in record)) continue;
    const found = pickBrowser(record[key], depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function matchExport(exportsField: unknown, subpath: string): string | null {
  if (typeof exportsField === "string") return subpath === "." ? exportsField : null;
  if (exportsField === null || typeof exportsField !== "object" || Array.isArray(exportsField)) {
    return null;
  }
  const record = exportsField as Record<string, unknown>;
  if (subpath in record) return pickBrowser(record[subpath]);
  const keys = Object.keys(record).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (!key.includes("*")) continue;
    const star = key.indexOf("*");
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
    const mid = subpath.slice(prefix.length, subpath.length - suffix.length);
    const picked = pickBrowser(record[key]);
    if (picked === null || !picked.includes("*")) continue;
    return picked.replace("*", mid);
  }
  return null;
}

function resolveBare(spec: string, fromFile: string): string | null {
  if (spec === "@theatre/core") return "/vendor/theatre-core.mjs";
  if (spec === "@theatre/studio" || spec.startsWith("@theatre/studio/")) return null;
  const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : (spec.split("/")[0] ?? spec);
  if (!VENDOR_ALLOW.has(name)) return null;
  const root = findPackageRoot(fromFile, name);
  if (root === null) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  } catch {
    return null;
  }
  if (manifest === null || typeof manifest !== "object") return null;
  const record = manifest as { exports?: unknown; module?: unknown; main?: unknown };
  const subpath = spec === name ? "." : `./${spec.slice(name.length + 1)}`;
  let relative = record.exports !== undefined ? matchExport(record.exports, subpath) : null;
  if (relative === null && subpath === ".") {
    if (typeof record.module === "string") relative = record.module;
    else if (typeof record.main === "string") relative = record.main;
  }
  if (relative === null || relative.startsWith("..")) return null;
  const file = path.resolve(root, relative);
  const rel = path.relative(root, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return `/vendor-pkg/${name}/${rel.replaceAll("\\", "/")}`;
}

function rewriteSpecifiers(code: string, fromFile: string): string {
  const apply = (lead: string, quote: string, spec: string): string => {
    if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:")) {
      return `${lead}${quote}${spec}${quote}`;
    }
    const next = resolveBare(spec, fromFile);
    if (next === null) return `${lead}${quote}${spec}${quote}`;
    return `${lead}${quote}${next}${quote}`;
  };
  let rewritten = code.replace(
    /(^|\n)([ \t]*(?:import|export)\b[^;\n]*?\bfrom\s*)(['"])([^'"]+)\3/g,
    (_full, brk: string, lead: string, quote: string, spec: string) => `${brk}${apply(lead, quote, spec)}`,
  );
  rewritten = rewritten.replace(
    /(\bimport\s*\(\s*)(['"])([^'"]+)\2/g,
    (_full, lead: string, quote: string, spec: string) => apply(lead, quote, spec),
  );
  return rewritten;
}

function compileAppModule(filePath: string): string | null {
  const cached = moduleCache.get(`motion:${filePath}`);
  if (cached !== undefined) return cached;
  const relative = path.relative(MOTION_ROOT, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !filePath.endsWith(".ts")) return null;
  if (!existsSync(filePath)) return null;
  const stripped = stripTypeScriptTypes(readFileSync(filePath, "utf8"), { mode: "strip" });
  const withLocal = stripped.replace(
    /((?:\bfrom\s*|\bimport\s*\(\s*))(['"])(\.[^'"]+)\2/g,
    (_full, lead: string, quote: string, spec: string) => {
      const cleaned = spec.replace(/\.ts$/, "");
      const resolved = path.resolve(path.dirname(filePath), cleaned);
      const tsFile = `${resolved}.ts`;
      if (!existsSync(tsFile)) return `${lead}${quote}${spec}${quote}`;
      const url = `/src/${path.relative(SRC_ROOT, tsFile).replaceAll("\\", "/").replace(/\.ts$/, ".js")}`;
      return `${lead}${quote}${url}${quote}`;
    },
  );
  const js = rewriteSpecifiers(withLocal, filePath);
  moduleCache.set(`motion:${filePath}`, js);
  return js;
}

function readVendorModule(urlPath: string): string | null {
  const cached = moduleCache.get(`vendor:${urlPath}`);
  if (cached !== undefined) return cached;
  const rest = urlPath.slice("/vendor-pkg/".length);
  if (rest.includes("..") || rest.includes("\\") || rest.includes("\0")) return null;
  const parts = rest.split("/").filter((part) => part.length > 0);
  let name = parts[0] ?? "";
  let relParts = parts.slice(1);
  if (name.startsWith("@")) {
    const scope = parts[1];
    if (scope === undefined) return null;
    name = `${name}/${scope}`;
    relParts = parts.slice(2);
  }
  if (!VENDOR_ALLOW.has(name)) return null;
  const leaf = relParts[relParts.length - 1] ?? "";
  const ext = path.extname(leaf).toLowerCase();
  if (ext !== ".js" && ext !== ".mjs") return null;
  const root =
    packageRoots.get(name) ??
    findPackageRoot(path.join(APP_NODE, "motion", "package.json"), name) ??
    findInPnpm(name);
  if (root === null) return null;
  const target = path.resolve(root, ...relParts);
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  let realRoot = "";
  let realTarget = "";
  try {
    realRoot = realpathSync(root);
    realTarget = realpathSync(target);
  } catch {
    return null;
  }
  const realRel = path.relative(realRoot, realTarget);
  if (realRel.startsWith("..") || path.isAbsolute(realRel)) return null;
  let source = readFileSync(realTarget, "utf8");
  if (/\bprocess\b/.test(source)) {
    source = `const process = globalThis.process ?? { env: { NODE_ENV: "production" } };\n${source}`;
  }
  const js = rewriteSpecifiers(source, realTarget);
  moduleCache.set(`vendor:${urlPath}`, js);
  return js;
}

function buildTheatreBundle(): string {
  if (theatreBundle !== null) return theatreBundle;
  const coreRoot = findPackageRoot(path.join(APP_NODE, "@theatre", "core", "package.json"), "@theatre/core");
  if (coreRoot === null) throw new Error("Theatre core is not installed.");
  const coreFile = path.join(coreRoot, "dist", "index.js");
  const dataRoot = findPackageRoot(coreFile, "@theatre/dataverse");
  if (dataRoot === null) throw new Error("Theatre dataverse is not installed.");
  const dataverse = readFileSync(path.join(dataRoot, "dist", "index.js"), "utf8");
  const core = readFileSync(coreFile, "utf8");
  theatreBundle =
    "const process = { env: { NODE_ENV: \"production\" } };\n" +
    "const __hhDataverse = {};\n" +
    "const __hhDataverseModule = { exports: __hhDataverse };\n" +
    "(function (exports, module, require) {\n" +
    dataverse +
    "\n})(__hhDataverse, __hhDataverseModule, function (name) {\n" +
    "  throw new Error('Theatre preview refused ' + String(name));\n" +
    "});\n" +
    "const __hhCoreExports = {};\n" +
    "const __hhCoreModule = { exports: __hhCoreExports };\n" +
    "(function (exports, module, require) {\n" +
    core +
    "\n})(__hhCoreExports, __hhCoreModule, function (name) {\n" +
    "  if (name === '@theatre/dataverse') return __hhDataverseModule.exports;\n" +
    "  if (name === 'util') return { types: {} };\n" +
    "  throw new Error('Theatre preview refused ' + String(name));\n" +
    "});\n" +
    "const __hhCore = __hhCoreModule.exports;\n" +
    "export const getProject = __hhCore.getProject;\n" +
    "export const createRafDriver = __hhCore.createRafDriver;\n" +
    "export const onChange = __hhCore.onChange;\n" +
    "export const val = __hhCore.val;\n" +
    "export const types = __hhCore.types;\n" +
    "export const notify = __hhCore.notify;\n" +
    "export default __hhCore;\n";
  return theatreBundle;
}

function treeFile(projectDir: string): string {
  const local = path.join(projectDir, "interview", "tree.yaml");
  if (existsSync(local)) return local;
  return path.resolve(import.meta.dirname, "..", "..", "..", "..", "interview", "tree.yaml");
}

function readAnswers(projectDir: string): AnswerRecord[] {
  const file = path.join(projectDir, ".hitchhiker", "interview.json");
  if (!existsSync(file)) return [];
  const value: unknown = JSON.parse(readFileSync(file, "utf8"));
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.answers)
      ? value.answers
      : [];
  const answers: AnswerRecord[] = [];
  for (const item of list) {
    if (!isAnswer(item)) continue;
    answers.push({ id: item.id, status: item.status, value: item.value });
  }
  return answers;
}

function isAnswer(value: unknown): value is AnswerRecord {
  if (!isRecord(value)) return false;
  const { id, status, value: text } = value;
  return (
    typeof id === "string" &&
    typeof text === "string" &&
    (status === "ANSWERED" ||
      status === "SUGGESTED" ||
      status === "SKIPPED" ||
      status === "SOFT" ||
      status === "IMPORTED")
  );
}

async function storeUpload(projectDir: string, safeName: string, data: Buffer): Promise<void> {
  const dir = path.join(projectDir, ".hitchhiker", "uploads");
  await mkdir(dir, { recursive: true });
  const target = path.resolve(dir, safeName);
  const rel = path.relative(dir, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Upload path escaped the desk folder.");
  }
  await writeFile(target, data);
}

async function readInside(root: string, relPath: string): Promise<Buffer | null> {
  if (relPath.includes("\0") || relPath.includes("..")) return null;
  const target = path.resolve(root, relPath);
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  try {
    const realRoot = await realpath(root);
    const realTarget = await realpath(target);
    const realRel = path.relative(realRoot, realTarget);
    if (realRel.startsWith("..") || path.isAbsolute(realRel)) return null;
    return await readFile(realTarget);
  } catch {
    return null;
  }
}

/**
 * Gallery walk. The desk reads a local cache and never fetches the site,
 * so a robots denial stays a note on the card. Prompt 047 is not called.
 */
interface GalleryQuery {
  industry: string | null;
  styleWorld: string | null;
}

interface GalleryDisk {
  query: GalleryQuery;
  state: WalkState;
}

interface OpenedGallery {
  view: GalleryView;
  state: WalkState;
}

interface JsonResult {
  status: number;
  body: Record<string, unknown>;
}

async function handleGalleryVerdict(
  req: IncomingMessage,
  res: ServerResponse,
  projectDir: string,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
): Promise<void> {
  const value = await readJsonBody(req, res);
  if (value === null) return;
  const parsed = parseVerdictBody(value);
  if ("error" in parsed) {
    sendJson(req, res, 400, { error: parsed.error });
    return;
  }
  const outcome = await enqueue(() => applyVerdict(projectDir, parsed.input));
  sendJson(req, res, outcome.status, outcome.body);
}

async function handleGalleryShortlist(
  req: IncomingMessage,
  res: ServerResponse,
  projectDir: string,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
): Promise<void> {
  const value = await readJsonBody(req, res);
  if (value === null) return;
  const parsed = parseShortlistBody(value);
  if ("error" in parsed) {
    sendJson(req, res, 400, { error: parsed.error });
    return;
  }
  const outcome = await enqueue(() => applyShortlist(projectDir, parsed.urls, parsed.thread));
  sendJson(req, res, outcome.status, outcome.body);
}

async function applyVerdict(projectDir: string, input: VerdictInput): Promise<JsonResult> {
  const saved = await readGalleryDisk(projectDir);
  const state = saved?.state ?? emptyWalk();
  const query = saved?.query ?? { industry: null, styleWorld: null };
  const next = recordVerdict(state, input);
  if (walkUnchanged(state, next)) {
    return { status: 400, body: { error: "That site is not in this round." } };
  }
  await writeGalleryDisk(projectDir, { query, state: next });
  if (next.verdicts.length === state.verdicts.length && next.nudge !== null) {
    return {
      status: 200,
      body: { ok: true, nudge: true, message: WHY_NUDGE, phase: next.phase },
    };
  }
  return {
    status: 200,
    body: { ok: true, nudge: false, phase: next.phase, loves: loveCount(next) },
  };
}

async function applyShortlist(projectDir: string, urls: readonly string[], thread: string): Promise<JsonResult> {
  const saved = await readGalleryDisk(projectDir);
  const state = saved?.state ?? emptyWalk();
  const query = saved?.query ?? { industry: null, styleWorld: null };
  if (state.phase !== "narrowing") {
    return { status: 409, body: { error: "The shortlist is not open." } };
  }
  const chosen = chooseShortlist(state, urls);
  if (chosen.shortlistError !== null) {
    return { status: 400, body: { error: chosen.shortlistError } };
  }
  const pack = readPack();
  const note = thread.trim().length > 0 ? thread.trim() : draftThread(chosen, pack);
  try {
    await writeReferences(projectDir, chosen, pack, note);
  } catch (error: unknown) {
    const mapped = referenceError(error);
    return { status: mapped.status, body: { error: mapped.message } };
  }
  const done: WalkState = { ...chosen, phase: "done", shortlistError: null };
  await writeGalleryDisk(projectDir, { query, state: done });
  return { status: 200, body: { ok: true, phase: "done" } };
}

async function openGallery(projectDir: string, rawUrl: string): Promise<OpenedGallery> {
  const pack = readPack();
  const saved = await readGalleryDisk(projectDir);
  let query = saved?.query ?? { industry: null, styleWorld: null };
  let state = saved?.state ?? emptyWalk();
  if (isFreshWalk(state)) query = queryFromUrl(rawUrl);
  const deal =
    pack.length === 0 && isFreshWalk(state)
      ? { state, cards: [] as GalleryEntry[] }
      : dealRound(state, pack, toWalkQuery(query));
  await writeGalleryDisk(projectDir, { query, state: deal.state });
  return { state: deal.state, view: await toGalleryView(projectDir, deal.state, deal.cards, pack) };
}

function galleryJson(opened: OpenedGallery): Record<string, unknown> {
  return {
    ok: true,
    phase: opened.view.phase,
    round: opened.view.round,
    loves: opened.view.loves,
    fillNote: opened.view.fillNote,
    missingPrompt: opened.view.missingPrompt,
    shortlist: opened.state.shortlist,
    cards: opened.view.cards.map((card) => ({
      name: card.name,
      url: card.url,
      source: card.source,
      noted: card.noted,
    })),
  };
}

function renderGallery(token: string, view: GalleryView, notice: string | null = null): string {
  return renderPanel({
    notice,
    token,
    title: "Gallery walk",
    description: "A short walk through sites worth keeping.",
    current: "/gallery",
    kicker: "Point of view",
    status: galleryStatus(view),
    board: true,
    extraCss: ["/src/gallery/gallery.css"],
    script: "/client/walk.js",
    main: renderGalleryBody(view),
  });
}

async function toGalleryView(
  projectDir: string,
  state: WalkState,
  cards: readonly GalleryEntry[],
  pack: readonly GalleryEntry[],
): Promise<GalleryView> {
  const nudgeUrl = state.nudge === null ? null : state.nudge.url;
  return {
    phase: state.phase,
    round: state.round,
    loves: loveCount(state),
    fillNote: state.fillNote,
    missingPrompt: state.missingPrompt,
    nudgeUrl,
    nudgeMessage: nudgeUrl === null ? null : WHY_NUDGE,
    cards: state.phase === "walking" ? cards.map((card) => cardModel(card)) : [],
    lovesList: lovesOf(state, pack),
    thread: state.phase === "narrowing" ? draftThread(state, pack) : "",
    written: state.phase === "done" ? await writtenNames(projectDir) : [],
  };
}

function cardModel(entry: GalleryEntry): GalleryCardModel {
  const shot = readCachedShot(entry.url);
  return {
    name: entry.name,
    url: entry.url,
    source: entry.source,
    noted: entry.noted,
    award: entry.award,
    shotNote: shot.note,
    imageUrl: shot.image ? `/api/gallery/shot?u=${encodeURIComponent(entry.url)}` : null,
  };
}

function lovesOf(state: WalkState, pack: readonly GalleryEntry[]): GalleryLoveModel[] {
  const list: GalleryLoveModel[] = [];
  for (const verdict of state.verdicts) {
    if (verdict.verdict !== "love") continue;
    const entry = pack.find((item) => item.url === verdict.url);
    list.push({ url: verdict.url, name: entry?.name ?? verdict.url, why: verdict.why });
  }
  return list;
}

function readCachedShot(url: string): { note: string | null; image: boolean } {
  const cacheDir = galleryCacheDir();
  const paths = galleryCachePaths(cacheDir, url);
  const root = path.resolve(cacheDir);
  const image = path.resolve(paths.image);
  const metaPath = path.resolve(paths.meta);
  if (!isInside(root, image) || !isInside(root, metaPath) || !existsSync(metaPath)) {
    return { note: null, image: false };
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(metaPath, "utf8"));
    if (!isThumbMeta(parsed)) return { note: null, image: false };
    if (parsed.placeholder) {
      const note = parsed.note.trim();
      return { note: note.length > 0 ? note : null, image: false };
    }
    return { note: null, image: existsSync(image) };
  } catch {
    return { note: null, image: false };
  }
}

async function readGalleryShot(url: string | null): Promise<Buffer | null> {
  if (url === null) return null;
  const cacheDir = galleryCacheDir();
  const paths = galleryCachePaths(cacheDir, url);
  const root = path.resolve(cacheDir);
  const image = path.resolve(paths.image);
  const metaPath = path.resolve(paths.meta);
  if (!isInside(root, image) || !isInside(root, metaPath)) return null;
  if (!existsSync(metaPath) || !existsSync(image)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
  if (!isThumbMeta(parsed) || parsed.placeholder) return null;
  try {
    const realRoot = await realpath(root);
    const realImage = await realpath(image);
    if (!isInside(realRoot, realImage)) return null;
    return await readFile(realImage);
  } catch {
    return null;
  }
}

function galleryPackFile(): string {
  const fromEnv = process.env.HH_GALLERY_FILE;
  if (fromEnv !== undefined && fromEnv.trim() !== "") return fromEnv;
  return path.resolve(import.meta.dirname, "..", "..", "..", "knowledge", "galleries", "curated.json");
}

function galleryCacheDir(): string {
  const fromEnv = process.env.HH_GALLERY_CACHE;
  if (fromEnv !== undefined && fromEnv.trim() !== "") return fromEnv;
  return defaultGalleryCacheDir();
}

function readPack(): GalleryEntry[] {
  try {
    return loadGallery(galleryPackFile());
  } catch {
    return [];
  }
}

async function readGalleryDisk(projectDir: string): Promise<GalleryDisk | null> {
  const file = path.join(projectDir, ".hitchhiker", "gallery-walk.json");
  try {
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!isRecord(value) || !isRecord(value.query)) return null;
    const state = parseWalkState(value.state);
    if (state === null) return null;
    const industry = value.query.industry;
    const styleWorld = value.query.styleWorld;
    if (industry !== null && typeof industry !== "string") return null;
    if (styleWorld !== null && typeof styleWorld !== "string") return null;
    return {
      query: {
        industry: typeof industry === "string" ? industry : null,
        styleWorld: typeof styleWorld === "string" ? styleWorld : null,
      },
      state,
    };
  } catch {
    return null;
  }
}

async function writeGalleryDisk(projectDir: string, disk: GalleryDisk): Promise<void> {
  const dir = path.join(projectDir, ".hitchhiker");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "gallery-walk.json"), `${JSON.stringify(disk)}\n`, "utf8");
}

async function writtenNames(projectDir: string): Promise<string[]> {
  try {
    const names = await readdir(path.join(projectDir, ".hitchhiker", "references"));
    return names.filter((name) => name.endsWith(".md")).sort();
  } catch {
    return [];
  }
}

function isFreshWalk(state: WalkState): boolean {
  return state.phase === "walking" && state.round === 0 && state.seen.length === 0 && state.verdicts.length === 0;
}

function queryFromUrl(rawUrl: string): GalleryQuery {
  const params = new URLSearchParams(rawUrl.split("?")[1] ?? "");
  const industry = params.get("industry");
  const styleWorld = params.get("styleWorld");
  return {
    industry: industry === null || industry.trim() === "" ? null : industry.trim().slice(0, 80),
    styleWorld: styleWorld === null || styleWorld.trim() === "" ? null : styleWorld.trim().slice(0, 40),
  };
}

function toWalkQuery(query: GalleryQuery): WalkQuery {
  const next: WalkQuery = {};
  if (query.industry !== null && query.industry.trim() !== "") next.industry = query.industry.trim();
  if (query.styleWorld !== null && query.styleWorld.trim() !== "") next.styleWorld = query.styleWorld.trim();
  return next;
}

function shotTarget(rawUrl: string): string | null {
  const value = new URLSearchParams(rawUrl.split("?")[1] ?? "").get("u");
  if (value === null || value.length === 0 || value.length > 2_000) return null;
  return value;
}

function walkUnchanged(before: WalkState, after: WalkState): boolean {
  return (
    before.phase === after.phase &&
    before.verdicts.length === after.verdicts.length &&
    before.nudge?.url === after.nudge?.url &&
    before.nudge?.verdict === after.nudge?.verdict
  );
}

function parseVerdictBody(value: unknown): { input: VerdictInput } | { error: string } {
  if (!isRecord(value)) return { error: "The desk could not read that request." };
  const url = value.url;
  const verdict = value.verdict;
  const why = value.why === undefined ? "" : value.why;
  if (typeof url !== "string" || url.length === 0 || url.length > 2_000) {
    return { error: "That site is not in this round." };
  }
  if (verdict !== "love" && verdict !== "meh" && verdict !== "hate") {
    return { error: "Choose love, meh, or hate." };
  }
  if (typeof why !== "string" || why.length > 4_000) return { error: "That note is too long." };
  const input: VerdictInput = { url, verdict, why };
  if (value.allowBlank === true) input.allowBlank = true;
  return { input };
}

function parseShortlistBody(value: unknown): { urls: string[]; thread: string } | { error: string } {
  if (!isRecord(value)) return { error: "The desk could not read that request." };
  const urlsRaw = value.urls === undefined ? [] : value.urls;
  if (!Array.isArray(urlsRaw) || urlsRaw.length > 20) return { error: "Pick 3 to 5 loved sites." };
  const urls: string[] = [];
  for (const item of urlsRaw) {
    if (typeof item !== "string" || item.length > 2_000) return { error: "Pick 3 to 5 loved sites." };
    urls.push(item);
  }
  const thread = value.thread === undefined ? "" : value.thread;
  if (typeof thread !== "string" || thread.length > 8_000) return { error: "That note is too long." };
  return { urls, thread };
}

async function readJsonBody(req: IncomingMessage, res: ServerResponse): Promise<unknown | null> {
  if (contentLengthExceeds(req.headers["content-length"], JSON_LIMIT)) {
    sendJson(req, res, 413, { error: "That request is too large." });
    dropRequest(req);
    return null;
  }
  const capped = await readCapped(req, JSON_LIMIT);
  if (!capped.ok) {
    sendJson(req, res, 413, { error: "That request is too large." });
    dropRequest(req);
    return null;
  }
  try {
    return JSON.parse(capped.body.toString("utf8")) as unknown;
  } catch {
    sendJson(req, res, 400, { error: "The desk could not read that request." });
    return null;
  }
}

function referenceError(error: unknown): { status: number; message: string } {
  if (error instanceof Error) {
    if (
      error.message === "The shortlist needs 3 to 5 loved sites." ||
      error.message === "There is no love to write." ||
      error.message === "The walk has not reached the shortlist."
    ) {
      return { status: 400, message: error.message };
    }
  }
  return { status: 500, message: "The shortlist did not save." };
}

function isThumbMeta(value: unknown): value is { at: number; placeholder: boolean; note: string } {
  if (!isRecord(value)) return false;
  return typeof value.at === "number" && typeof value.placeholder === "boolean" && typeof value.note === "string";
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function normalizePath(url: string): string | null {
  const pathname = url.split("?")[0] ?? "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.includes("\0")) return null;
  if (decoded.length > 1 && decoded.endsWith("/")) return decoded.slice(0, -1);
  return decoded;
}

function parseTurnBody(
  raw: string,
  kind: "answer" | "suggest" | "skip",
): { questionId: string; text?: string } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: "The desk could not read that request." };
  }
  if (!isRecord(value)) return { error: "The desk could not read that request." };
  const { questionId, text } = value;
  if (typeof questionId !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(questionId)) {
    return { error: "The question id is not valid." };
  }
  if (text !== undefined && (typeof text !== "string" || text.length > 20_000)) {
    return { error: "That answer is too long." };
  }
  if (kind === "answer" && typeof text !== "string") {
    return { error: "Write an answer or skip." };
  }
  const body: { questionId: string; text?: string } = { questionId };
  if (typeof text === "string") body.text = text;
  return body;
}

function asTurnResult(value: unknown): { next: unknown; events: unknown[] } {
  if (!isRecord(value) || !Array.isArray(value.events)) {
    throw new Error("Turn handler returned an unexpected result.");
  }
  return { next: value.next ?? null, events: value.events };
}

const REPLAY_MESSAGE =
  "The Guide is in replay mode and has no recorded answer for this. Restart hh app without HH_CASSETTE.";
const TIMEOUT_MESSAGE = "The Guide took too long to answer. Your answer is kept. Try again.";
const MISSING_MESSAGE = "Grok is not on this machine. Your answer is kept. Run hh doctor, then try again.";
const SIGNED_OUT_MESSAGE = "Grok is not signed in. Your answer is kept. Run grok login, then try again.";
const LIMITED_MESSAGE = "Grok's usage limit was reached. Your answer is kept. Try again later.";
const LOCK_MESSAGE = "Another Guide process is writing. Wait a moment.";
const NOT_SAVED_MESSAGE = "The answer did not save. Try again, or skip.";
const ALREADY_SAVED_MESSAGE = "That answer is already saved. Here is the next question.";
const DETAIL_LIMIT = 160;
const USAGE_LIMIT = /usage limit|rate limit|too many requests|\b429\b|quota exceeded/i;
const NOT_SIGNED_IN =
  /unauthorized|\b401\b|not logged in|not signed in|authentication failed|auth(?:entication)? required|sign in to grok|grok login/i;
const WRITE_CODES = new Set(["EPERM", "EBUSY", "EACCES", "ENOSPC", "EROFS", "EIO"]);

function savedFailureMessage(error: unknown): string {
  return `Saved. The Guide's next question failed: ${guideFailureMessage(error)}`;
}

function guideFailureMessage(error: unknown): string {
  if (error instanceof LockHeld) return LOCK_MESSAGE;
  if (isCassetteMiss(error)) return REPLAY_MESSAGE;
  if (error instanceof ThinkTimeoutError) return TIMEOUT_MESSAGE;
  if (error instanceof GrokMissingError) return MISSING_MESSAGE;
  const text = error instanceof Error ? error.message : "";
  if (USAGE_LIMIT.test(text)) return LIMITED_MESSAGE;
  if (NOT_SIGNED_IN.test(text)) return SIGNED_OUT_MESSAGE;
  if (isWriteFailure(error)) return "The state file was busy. Your answer is kept.";
  if (error instanceof GrokUnavailableError) {
    return `The Guide could not reach Grok. Your answer is kept. ${oneLine(error)}`;
  }
  return `The Guide hit an error: ${oneLine(error)}`;
}

function isCassetteMiss(error: unknown): boolean {
  if (error instanceof CassetteMissError || error instanceof CassetteError) return true;
  return error instanceof Error && /^cassette miss:/.test(error.message);
}

function oneLine(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const first = (raw.split(/\r?\n/, 1)[0] ?? "").replace(/\s+/g, " ").trim();
  const clean = stripSecrets(first);
  if (clean.length === 0 || clean === "[path]") return "something went wrong";
  if (clean.length <= DETAIL_LIMIT) return clean;
  return `${clean.slice(0, DETAIL_LIMIT - 3).trimEnd()}...`;
}

function stripSecrets(text: string): string {
  return redact(text)
    .replace(/[A-Za-z]:\\[^\s"]+/g, "[path]")
    .replace(/[A-Za-z]:\/[^\s"]+/g, "[path]")
    .replace(/\\\\[^\s"]+/g, "[path]")
    .replace(/\/(?:Users|home|tmp|var|private|opt)\/[^\s"]+/g, "[path]")
    .replace(/\s+/g, " ")
    .trim();
}

function isWriteFailure(error: unknown): boolean {
  const code = nodeCode(error);
  if (code !== undefined && WRITE_CODES.has(code)) return true;
  if (!(error instanceof Error)) return false;
  return /EPERM|EBUSY|EACCES/.test(error.message) && /rename|interview\.json|STATE\.md/i.test(error.message);
}

function nodeCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function answerStored(projectDir: string, questionId: string): boolean {
  return latestStoredValue(projectDir, questionId) !== null;
}

function latestStoredValue(projectDir: string, questionId: string): string | null {
  try {
    let value: string | null = null;
    for (const answer of readAnswers(projectDir)) {
      if (answer.id === questionId) value = answer.value;
    }
    return value;
  } catch {
    return null;
  }
}

/**
 * Edit posts to /api/answer with the earlier question id. The record is
 * replaced in interview.json under the state lock. Nothing new is stored.
 * Returns true only when the text actually changed.
 */
async function editStoredAnswer(
  projectDir: string,
  input: { kind: "answer" | "suggest" | "skip"; questionId: string; text?: string },
): Promise<boolean> {
  if (input.kind !== "answer" || typeof input.text !== "string") return false;
  const latest = latestStoredValue(projectDir, input.questionId);
  if (latest === null || latest === input.text) return false;
  if (input.text.trim() === "") {
    throw new InterviewError(
      "empty-answer",
      "An empty answer is not stored. Skip to keep the assumption.",
    );
  }
  await reviseStoredAnswer(projectDir, input.questionId, input.text);
  return true;
}

async function reviseStoredAnswer(projectDir: string, questionId: string, text: string): Promise<void> {
  const file = path.join(projectDir, ".hitchhiker", "interview.json");
  await withStateLock(projectDir, async () => {
    const raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new InterviewError("corrupt-answers", "interview.json is not valid JSON.");
    }
    const next = replaceLatestAnswer(parsed, questionId, text);
    if (next === null) {
      throw new InterviewError("command", "That question is no longer on the desk.");
    }
    await replaceViaTemp(file, next);
  });
}

function replaceLatestAnswer(parsed: unknown, questionId: string, text: string): string | null {
  if (Array.isArray(parsed)) {
    const index = lastAnswerIndex(parsed, questionId);
    if (index < 0) return null;
    const copy = parsed.slice();
    const item = copy[index];
    if (!isRecord(item)) return null;
    copy[index] = { ...item, status: "ANSWERED", value: text };
    return `${JSON.stringify(copy, null, 2)}\n`;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.answers)) return null;
  const index = lastAnswerIndex(parsed.answers, questionId);
  if (index < 0) return null;
  const item = parsed.answers[index];
  if (!isRecord(item)) return null;
  const answers = parsed.answers.slice();
  answers[index] = { ...item, status: "ANSWERED", value: text };
  return `${JSON.stringify({ ...parsed, answers }, null, 2)}\n`;
}

function lastAnswerIndex(list: readonly unknown[], questionId: string): number {
  let found = -1;
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (isRecord(item) && item.id === questionId) found = index;
  }
  return found;
}

function logDeskError(error: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : "turn failed";
  process.stderr.write(`Desk error: ${redact(detail).replace(/\r?\n/g, " | ")}\n`);
}

function turnError(error: unknown): { status: number; message: string } {
  if (error instanceof InterviewError) {
    if (error.code === "empty-answer") return { status: 400, message: error.message };
    if (error.code === "busy") {
      return { status: 409, message: "The desk is saving another answer. Try again." };
    }
    if (error.code === "finished" || error.code === "command") {
      return { status: 409, message: error.message };
    }
    return { status: 500, message: "The interview file could not be read." };
  }
  if (error instanceof LockHeld) return { status: 409, message: LOCK_MESSAGE };
  if (isWriteFailure(error)) return { status: 500, message: NOT_SAVED_MESSAGE };
  return { status: 500, message: guideFailureMessage(error) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function headerOne(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? "";
}

function mustReplace(html: string, from: string, to: string, label: string): string {
  if (!html.includes(from)) throw new Error(`Desk shell is missing ${label}.`);
  return html.replace(from, to);
}

function replaceBlock(html: string, pattern: RegExp, to: string, label: string): string {
  if (!pattern.test(html)) throw new Error(`Desk shell is missing ${label}.`);
  return html.replace(pattern, to);
}

function sendDriveResult(req: IncomingMessage, res: ServerResponse, result: DriveResult): void {
  if (result.kind === "html") {
    sendHtml(req, res, result.status, result.html);
    return;
  }
  sendJson(req, res, result.status, result.body);
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  sendBytes(req, res, status, "application/json; charset=utf-8", Buffer.from(JSON.stringify(body)));
}

function sendHtml(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  html: string,
  headers?: Record<string, string>,
): void {
  sendBytes(req, res, status, "text/html; charset=utf-8", Buffer.from(html), headers);
}

/**
 * The fold sheet is inline so the closed map hides before desk.js runs.
 * style-src stays 'self' plus the hash of that exact sheet. No unsafe-inline.
 */
function foldStyleHeaders(): Record<string, string> {
  const hash = createHash("sha256").update(MAP_FOLD_CSS, "utf8").digest("base64");
  return {
    "content-security-policy": SAFE["content-security-policy"].replace(
      "style-src 'self'",
      `style-src 'self' 'sha256-${hash}'`,
    ),
  };
}

/**
 * The kit sets swatch and specimen styles from checked hex and family names.
 * The desk's other pages keep style-src 'self'.
 */
function brandKitHeaders(): Record<string, string> {
  return {
    "content-security-policy": SAFE["content-security-policy"].replace(
      "style-src 'self'",
      "style-src 'self' 'unsafe-inline'",
    ),
  };
}

function sendBytes(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  type: string,
  body: Buffer,
  extra?: Record<string, string>,
): void {
  const payload = gzipBody(req, type, body);
  const headers: Record<string, string | number> = {
    ...SAFE,
    ...extra,
    "content-type": type,
    "content-length": payload.length,
  };
  if (payload !== body) {
    headers["content-encoding"] = "gzip";
    headers.vary = "Accept-Encoding";
  }
  res.writeHead(status, headers);
  if (req.method === "HEAD") res.end();
  else res.end(payload);
}

/** Text responses shrink. The phone gate counts uncompressed bytes against the simulated chain. */
function gzipBody(req: IncomingMessage, type: string, body: Buffer): Buffer {
  if (body.length < 1024) return body;
  const accept = req.headers["accept-encoding"];
  if (typeof accept !== "string" || !/\bgzip\b/.test(accept)) return body;
  if (!isCompressible(type)) return body;
  return gzipSync(body);
}

function isCompressible(type: string): boolean {
  return (
    type.startsWith("text/") ||
    type.startsWith("application/json") ||
    type.startsWith("application/javascript") ||
    type.includes("javascript") ||
    type.includes("json") ||
    type.includes("svg")
  );
}
