import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import {
  GrokUnavailableError,
  InterviewError,
  WHY_NUDGE,
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
import { escapeHtml, renderCard, type CardState } from "../card.ts";
import { renderMotionPage } from "../motion-previews/index.ts";
import { galleryStatus, renderGalleryBody, type GalleryCardModel, type GalleryLoveModel, type GalleryView } from "../gallery/walk.ts";
import { renderGuideMap, renderMap } from "../map.ts";
import { renderShell } from "../shell.ts";
import { issueToken, tokensMatch } from "./csrf.ts";
import { createSseHub, encodeSse, type SseHub, type SseSink } from "./sse.ts";
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
const DESK_SOURCE = path.resolve(SRC_ROOT, "client", "desk.ts");
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
export async function createDeskApp(opts: {
  projectDir: string;
  turnHandler?: TurnHandler;
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
    }, selectGuideThink());
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

  const view = (): DeskSession => buildSession(projectDir, interview, questions, overlay);

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
        await handlePost(req, res, pathname, token, projectDir, turn, view, hub, enqueue);
        return;
      }
      await handleGet(req, res, pathname, token, view, hub, projectDir, enqueue, req.url ?? "/");
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
  return async (input) => {
    const current = getInterview().next();
    if (current === null) {
      throw new InterviewError("finished", "The interview is finished.");
    }
    if (current.id !== input.questionId) {
      throw new InterviewError("command", "That question is no longer on the desk.");
    }
    const session: GuideSession = {
      projectDir,
      depth,
      language: "en",
      pushes: {},
    };
    const result = await runTurn(
      session,
      input.text === undefined ? { kind: input.kind } : { kind: input.kind, text: input.text },
      { think: model },
    );
    setInterview(await openInterview(projectDir, depth));
    const next = getInterview().next();
    return {
      next,
      events: [
        { type: "turn", kind: input.kind, questionId: input.questionId },
        { type: "session", questionId: result.questionId },
      ],
      live: overlayFrom(result),
    };
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
): Promise<void> {
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
  sendJson(req, res, 404, { error: "That route is not on the desk." });
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
    if (mapped.status >= 500) {
      const detail = error instanceof Error ? error.message : "turn failed";
      process.stderr.write(`Desk error: ${detail}\n`);
    }
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
): Promise<void> {
  if (pathname === "/") {
    const session = view();
    sendHtml(req, res, 200, renderDesk(token, session));
    return;
  }
  if (pathname === "/gallery") {
    const opened = await enqueue(() => openGallery(projectDir, rawUrl));
    sendHtml(req, res, 200, renderGallery(token, opened.view));
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
    sendHtml(req, res, 200, renderMotion(token));
    return;
  }
  if (pathname === "/client/motion.js") {
    const compiled = compileAppModule(MOTION_SOURCE);
    if (compiled === null) {
      sendHtml(req, res, 404, renderMissing(token));
      return;
    }
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(compiled));
    return;
  }
  if (pathname === "/vendor/theatre-core.mjs") {
    try {
      sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(buildTheatreBundle()));
    } catch {
      sendHtml(req, res, 404, renderMissing(token));
    }
    return;
  }
  if (pathname.startsWith("/vendor-pkg/")) {
    const body = readVendorModule(pathname);
    if (body === null) {
      sendHtml(req, res, 404, renderMissing(token));
      return;
    }
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(body));
    return;
  }
  if (pathname.startsWith("/src/motion-previews/") && pathname.endsWith(".js")) {
    const rel = pathname.slice("/src/".length).replace(/\.js$/, ".ts");
    const compiled = compileAppModule(path.resolve(SRC_ROOT, rel));
    if (compiled === null) {
      sendHtml(req, res, 404, renderMissing(token));
      return;
    }
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(compiled));
    return;
  }
  if (pathname === "/brand") {
    sendHtml(req, res, 200, renderBrand(token));
    return;
  }
  if (pathname === "/approve") {
    sendHtml(req, res, 200, renderApprove(token));
    return;
  }
  if (pathname === "/hh-dashboard") {
    sendHtml(req, res, 200, renderDashboard(token));
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
      sendHtml(req, res, 404, renderMissing(token));
      return;
    }
    const body = await readInside(root, pathname.slice(prefix.length));
    if (body === null) {
      sendHtml(req, res, 404, renderMissing(token));
      return;
    }
    sendBytes(req, res, 200, type, body);
    return;
  }
  if (pathname.startsWith("/api/")) {
    sendJson(req, res, 404, { error: "That route is not on the desk." });
    return;
  }
  sendHtml(req, res, 404, renderMissing(token));
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
  const card: CardState = {
    question,
    draft: "",
    pushback,
    error: null,
    done,
    pending: false,
  };
  let mapHtml: string;
  try {
    mapHtml = renderMap(state);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "The map could not be drawn.";
    mapHtml = `<p class="hh-error" role="alert">${escapeHtml(message)}</p>`;
  }
  const statusText = overlay.calm && overlay.message !== null
    ? overlay.message
    : state.nextAction.trim().length > 0
      ? state.nextAction
      : "Ready.";
  const transcript = `${renderTranscript(questions, answers, question)}${renderLiveExtras(overlay, done)}`;
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
    mapHtml,
    guideHtml: renderGuideMap(answers, [...questions]),
    transcriptHtml: transcript,
    statusHtml: `<span${overlay.calm ? ' data-calm="true"' : ""}>${escapeHtml(statusText)}</span>`,
    cardHtml: renderCard(card),
  };
}

function renderTranscript(
  tree: readonly Question[],
  answers: readonly AnswerRecord[],
  current: Question | null,
): string {
  const asks = new Map(tree.map((question) => [question.id, question.ask]));
  const lines: string[] = [];
  for (const answer of answers) {
    const ask = asks.get(answer.id);
    if (ask !== undefined) lines.push(turnLine("Guide", ask, false));
    lines.push(turnLine("You", answer.value, true));
  }
  if (current !== null) lines.push(turnLine("Guide", current.ask, false));
  if (lines.length === 0) {
    return turnLine("Guide", "The desk is clear. Nothing has been asked yet.", false);
  }
  return lines.join("\n");
}

function turnLine(who: string, text: string, you: boolean): string {
  const cls = you ? "hh-turn hh-turn--you" : "hh-turn";
  return `<p class="${cls}"><span class="hh-turn__who">${escapeHtml(who)}</span> ${escapeHtml(text)}</p>`;
}

function renderDesk(token: string, session: DeskSession): string {
  let html = renderShell();
  const dek = `<p class="hh-dek">Don't Panic. One question at a time. The work saves on this machine.</p>`;
  html = mustReplace(
    html,
    '<meta charset="utf-8" />',
    `<meta charset="utf-8" />\n    <meta name="hh-csrf" content="${escapeHtml(token)}" />`,
    "charset",
  );
  html = mustReplace(
    html,
    dek,
    `${dek}\n        ${routeNav("/")}`,
    "dek",
  );
  html = mustReplace(
    html,
    '<link rel="stylesheet" href="src/shell.css" />',
    '<link rel="stylesheet" href="src/shell.css" />\n    <link rel="stylesheet" href="src/card.css" />\n    <link rel="stylesheet" href="src/motion-previews/motion.css" />',
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
  return html.replace(
    "</body>",
    `    <script type="module" src="/client/desk.js"></script>\n    <script type="module" src="/client/motion.js"></script>\n  </body>`,
  );
}

function renderBrand(token: string): string {
  return renderPanel({
    token,
    title: "Brand kit",
    current: "/brand",
    kicker: "Brand kit",
    status: "The kit waits on the brief.",
    main: `<section class="hh-specimen hh-rise hh-rise--2" aria-labelledby="brand-title">
        <p class="hh-kicker" id="brand-title">Type</p>
        <p class="hh-specimen__display">The kit is not printed yet.</p>
        <p class="hh-specimen__text">Palette, letters, and voice land on this plate after the brief is approved.</p>
      </section>
      <div class="hh-empty hh-rise hh-rise--3">
        <h1 class="hh-empty__title">No kit on the desk</h1>
        <p>The interview is still the work.</p>
        <p class="hh-empty__next">Finish the questions, then open this plate again.</p>
      </div>`,
  });
}

function renderApprove(token: string): string {
  return renderPanel({
    token,
    title: "Approvals",
    current: "/approve",
    kicker: "Approvals",
    status: "Nothing is waiting for a yes.",
    main: `<div class="hh-empty hh-rise hh-rise--2">
        <h1 class="hh-empty__title">Nothing is waiting for a yes</h1>
        <p>No plate is ready for a decision.</p>
        <p class="hh-empty__next">When a plate is ready, Approve and Redo sit here.</p>
      </div>
      <div class="hh-approval hh-rise hh-rise--3">
        <button class="hh-btn hh-btn--primary" type="button" aria-disabled="true">Approve</button>
        <button class="hh-btn hh-btn--secondary" type="button" aria-disabled="true">Redo</button>
        <p class="hh-approval__note">Happy with this stays the question. Nothing is queued yet.</p>
      </div>`,
  });
}

function renderDashboard(token: string): string {
  return renderPanel({
    token,
    title: "/hh-dashboard",
    current: "/hh-dashboard",
    kicker: "Local queue",
    status: "The queue is empty.",
    main: `<h1 class="hh-headline">/hh-dashboard</h1>
      <p class="hh-dek">The Guide's queue, on this machine.</p>
      <div class="hh-dash">
        <section class="hh-rise hh-rise--2" aria-labelledby="queue-title">
          <h2 class="hh-title" id="queue-title">Prompt queue</h2>
          <div class="hh-empty">
            <h2 class="hh-empty__title">The queue is empty</h2>
            <p>No prompt is running, paused, or waiting.</p>
            <p class="hh-empty__next">Rows show up here when the build starts.</p>
          </div>
        </section>
        <aside class="hh-side hh-rise hh-rise--3">
          <div class="hh-phase-mark">
            <p class="hh-phase-mark__num">01</p>
            <p class="hh-kicker">Don't Panic</p>
            <p class="hh-dek">The interview is open. The queue waits.</p>
          </div>
        </aside>
      </div>`,
  });
}

function renderMotion(token: string): string {
  return renderPanel({
    token,
    title: "Motion",
    current: "/motion",
    kicker: "Motion",
    status: "Pick a number after the loops.",
    extraCss: ["/src/motion-previews/motion.css"],
    script: "/client/motion.js",
    main: renderMotionPage(),
  });
}

function renderMissing(token: string): string {
  return renderPanel({
    token,
    title: "Not on the desk",
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
  current: RouteName;
  kicker: string;
  main: string;
  status: string;
  extraCss?: readonly string[];
  script?: string;
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
        ${routeNav(opts.current)}
      </header>
      <main id="main" class="hh-read">
        ${opts.main}
      </main>
      <footer class="hh-status">
        <span>${escapeHtml(opts.status)}</span>
      </footer>
    </div>
${script}  </body>
</html>
`;
}

function routeNav(current: RouteName): string {
  const items = [
    ["/", "Desk"],
    ["/brand", "Brand kit"],
    ["/approve", "Approvals"],
    ["/hh-dashboard", "/hh-dashboard"],
    ["/gallery", "Gallery"],
    ["/motion", "Motion"],
  ] as const;
  const links = items.map(([href, label]) => {
    const on = href === current;
    const variant = on ? "secondary" : "ghost";
    const currentAttr = on ? ' aria-current="page"' : "";
    return `<a class="hh-btn hh-btn--${variant}" href="${href}"${currentAttr}>${escapeHtml(label)}</a>`;
  });
  return `<nav class="hh-qcard__actions" aria-label="Desk routes">${links.join("")}</nav>`;
}

function browserModule(filePath: string): string {
  const cached = moduleCache.get(filePath);
  if (cached !== undefined) return cached;
  const source = readFileSync(filePath, "utf8");
  const stripped = stripTypeScriptTypes(source, { mode: "strip" });
  const js = stripped.replace(
    /from\s+["']\.\.\/card\.ts["']/g,
    'from "/client/card.js"',
  );
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

function renderGallery(token: string, view: GalleryView): string {
  return renderPanel({
    token,
    title: "Gallery walk",
    current: "/gallery",
    kicker: "Point of view",
    status: galleryStatus(view),
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
  return { status: 500, message: "The answer did not save. Try again, or skip." };
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

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  sendBytes(req, res, status, "application/json; charset=utf-8", Buffer.from(JSON.stringify(body)));
}

function sendHtml(req: IncomingMessage, res: ServerResponse, status: number, html: string): void {
  sendBytes(req, res, status, "text/html; charset=utf-8", Buffer.from(html));
}

function sendBytes(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  type: string,
  body: Buffer,
): void {
  res.writeHead(status, {
    ...SAFE,
    "content-type": type,
    "content-length": body.length,
  });
  if (req.method === "HEAD") res.end();
  else res.end(body);
}
