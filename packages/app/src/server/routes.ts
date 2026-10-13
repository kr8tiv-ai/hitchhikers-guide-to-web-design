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
  draftThread,
  emptyWalk,
  guideThinkFromScript,
  judgePushback,
  loadConfig,
  loadFacts,
  loadSessionState,
  gateQuestion,
  assetDisplayName,
  guardLogoText,
  offersForeignImageAsLogo,
  reletterChoices,
  saveConfig,
  loadGallery,
  loadState,
  loadTree,
  loveCount,
  openInterview,
  readRevisitId,
  writeRevisitId,
  GUIDE_FAIL_LINE,
  READING_LINE,
  parseWalkState,
  questionsToAsk,
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
import {
  escapeHtml,
  renderCard,
  type CardAssumption,
  type CardChoiceSet,
  type CardCounts,
  type CardState,
} from "../card.ts";
import { attachQuestionId, formatBytes } from "../client/attach.ts";
import { guideTurnText, isLogoQuestion, reshapeDeskCard, withInterviewExtras } from "../client/desk.ts";
import { engineForDesk, voiceChromeFor } from "../client/voice-engine.ts";
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
  composeStoredAnswer,
  injectBrandLogo,
  isLogoAssetName,
  isRasterLogo,
  parseLogoIntake,
  serializeLogoIntake,
  APPROVE_EMPTY_ACTION,
  type LogoIntake,
  openQuestionHref,
  renderEmptyInterview,
  renderPreflight,
  type DeskPreflight,
  type InterviewMode,
} from "./card.ts";
import { documentHeadExtras } from "../design/document-head.ts";
import { applyIdentityHead } from "./head.ts";
import { IDENTITY_CACHE, identityClaim, loadIdentity } from "./identity-files.ts";
import { renderMotionPage } from "../motion-previews/index.ts";
import { galleryStatus, renderGalleryBody, type GalleryCardModel, type GalleryLoveModel, type GalleryView } from "../gallery/walk.ts";
import { renderGuideMap, renderMap } from "../map.ts";
import { renderShell } from "../shell.ts";
import { renderFriendly, splitPublicError } from "../friendly.ts";
import { renderReplayControl, renderTour } from "../tour.ts";
import { dressBrandKit, loadBrandKit, postBrandDecision, renderBrandKitError } from "./brand-desk.ts";
import { issueToken, tokensMatch } from "./csrf.ts";
import { applyProjectChrome, projectChrome, runProjectPost } from "./project-desk.ts";
import { blockingNotes, readGuideNotes, renderGuideNotes, upsertGuideNote, type GuideNote } from "./guide-notes.ts";
import { restartInterview } from "./restart.ts";
import {
  clearAllDrafts,
  clearQuestionDraft,
  currentDraft,
  parseDraftPost,
  projectKeyFor,
  readDraftFileSync,
  readSavedFiles,
  writeDraftPost,
  type SavedFile,
} from "./draft-file.ts";
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
import { readVoiceDeskFlags, type VoiceDeskFlags } from "./voice-flags.ts";
import { createToolHandler, type ToolDeskOptions, type ToolRuntime } from "./tool-desk.ts";
import {
  MAX_ATTACH_REQUEST_BYTES,
  MAX_UPLOAD_BYTES,
  acceptAudio,
  acceptUpload,
  audioFilename,
  contentLengthExceeds,
  parseMultipart,
  parseMultipartFiles,
  plateExtension,
  readCapped,
  saveAttachParts,
} from "./uploads.ts";

interface LiveOverlay {
  forId: string | null;
  message: string | null;
  quote: string | null;
  calm: boolean;
  status: "asked" | "pushed" | "soft" | "done" | null;
  cards: Array<{ name: string; url: string; source: string }>;
  options: Array<{ label: string; why: string; source: string }>;
  /** Null when this turn has no picks. forId is the question the picks belong to. */
  choices: CardChoiceSet | null;
}

export type TurnHandler = (input: {
  kind: "answer" | "suggest" | "skip";
  questionId: string;
  text?: string;
  /** Pick on the spot. The stored status stays SUGGESTED. */
  assumed?: boolean;
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
  /** Picks for choices.forId. The card renders them only when that id is current. */
  choices: CardChoiceSet | null;
  /** Hash of the project directory. The raw path never leaves the server. */
  projectKey: string;
  /** Unsent text for the question on screen, or null when nothing is stored. */
  draft: { text: string; savedAt: string; step: number } | null;
  /** Files already in this question's upload folder. Paths stay relative. */
  savedFiles: SavedFile[];
  /** Set when the interview restarts, so an older browser copy is dropped. */
  draftsClearedAt: string | null;
  /** Stored answer when Revisit lands on a question that already has one. */
  answerDraft: string | null;
  /** Logo file slot. Null when no logo has been saved. */
  logoFile: { originalName: string; safeName: string; bytes: number | null } | null;
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
const DRAFT_STORE_SOURCE = path.resolve(SRC_ROOT, "client", "draft-store.ts");
const ATTACH_SOURCE = path.resolve(SRC_ROOT, "client", "attach.ts");
const TOOL_SOURCE = path.resolve(SRC_ROOT, "client", "tool-install.ts");
const SAVE_SOURCE = path.resolve(SRC_ROOT, "client", "save-status.ts");
const VOICE_ENGINE_SOURCE = path.resolve(SRC_ROOT, "client", "voice-engine.ts");
const VOICE_TEXT_SOURCE = path.resolve(SRC_ROOT, "client", "voice-text.ts");
const THEME_SOURCE = path.resolve(SRC_ROOT, "client", "theme.ts");
const DRIVE_SOURCE = path.resolve(SRC_ROOT, "client", "drive.ts");
const DRIVE_MARKUP_SOURCE = path.resolve(SRC_ROOT, "drive-markup.ts");
const WALK_SOURCE = path.resolve(SRC_ROOT, "gallery", "walk.ts");
const TILE_SOURCE = path.resolve(SRC_ROOT, "gallery", "tile.ts");
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
    "default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "cross-origin-resource-policy": "same-origin",
} as const;

type RouteName =
  | "/"
  | "/brand"
  | "/approve"
  | "/hh-dashboard"
  | "/gallery"
  | "/motion"
  | "/settings"
  | "/tools";

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
  /** Replaces plan, run, and recheck. Omitted, the desk uses the real recipes. */
  tools?: ToolRuntime;
  toolNow?: () => number;
}): Promise<DeskApp> {
  const projectDir = path.resolve(opts.projectDir);
  const depth = loadConfig(projectDir).interviewDepth;
  if (opts.turnHandler === undefined && depth === "express") {
    await seedExpressAssumptions(projectDir);
  }
  const questions = questionsToAsk(loadTree(treeFile(projectDir)), depth);
  let interview = await openInterview(projectDir, depth);
  const reloadInterview = async (): Promise<void> => {
    interview = await openInterview(projectDir, depth);
  };
  let overlay: LiveOverlay = emptyOverlay();
  const resetLive = (): void => {
    overlay = emptyOverlay();
  };
  const token = issueToken();
  const hub = createSseHub();
  const rawTurn =
    opts.turnHandler ??
    createLiveTurn(projectDir, depth, () => interview, (next) => {
      interview = next;
    }, opts.guideThink ?? selectGuideThink(), {
      publish: (name, data) => hub.publish(name, data),
    });
  const turn: TurnHandler = async (input) => {
    const output = await rawTurn(input);
    if (output.live !== undefined) overlay = output.live;
    return output;
  };
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
  let preflight = opts.preflight ?? null;
  const view = (): DeskSession =>
    buildSession(projectDir, interview, questions, overlay, notice, preflight, depth);
  const toolOptions: ToolDeskOptions = {
    projectDir,
    getPreflight: () => preflight,
    setPreflight(next) {
      preflight = next;
    },
    statusHtml: () => view().statusHtml,
    publish: (name, data) => hub.publish(name, data),
    ...(opts.tools === undefined ? {} : { runtime: opts.tools }),
    ...(opts.toolNow === undefined ? {} : { now: opts.toolNow }),
  };
  const handleTools = createToolHandler(toolOptions);

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
      const claim = identityClaim(pathname);
      if (claim !== "no") {
        if (method !== "GET" && method !== "HEAD") {
          sendJson(req, res, 405, { error: "That method is not used here." });
          return;
        }
        const file = claim === "file" ? loadIdentity(pathname) : null;
        if (file === null) {
          sendBytes(
            req,
            res,
            404,
            "text/plain; charset=utf-8",
            Buffer.from("That file is not on the desk.\n"),
            IDENTITY_CACHE,
          );
          return;
        }
        sendBytes(req, res, 200, file.type, file.body, { ...IDENTITY_CACHE, ...svgStylePolicy(file.type, file.body) });
        return;
      }
      if (method !== "GET" && method !== "HEAD" && method !== "POST") {
        sendJson(req, res, 405, { error: "That method is not used here." });
        return;
      }
      if (method === "POST") {
        await handlePost(
          req,
          res,
          pathname,
          token,
          projectDir,
          turn,
          view,
          hub,
          enqueue,
          notice,
          reloadInterview,
          handleTools,
          resetLive,
        );
        return;
      }
      await handleGet(
        req,
        res,
        pathname,
        token,
        view,
        hub,
        projectDir,
        enqueue,
        req.url ?? "/",
        notice,
        () => preflight,
      );
    },
  };
}

function shouldAdvanceFirst(input: { kind: string; assumed?: boolean }): boolean {
  if (input.kind !== "answer" || input.assumed === true) return false;
  // Off until a failed guide check still returns the failure line in this response.
  return process.env.HH_OPTIMISTIC === "1";
}

function shortAsk(ask: string): string {
  const clean = ask.replace(/\s+/g, " ").trim();
  if (clean.length <= 80) return clean;
  return `${clean.slice(0, 77).trimEnd()}…`;
}

async function checkAnswerInBackground(
  projectDir: string,
  question: Question,
  text: string,
  model: typeof think,
  publish?: (name: string, data: unknown) => void,
): Promise<void> {
  const ask = shortAsk(question.ask);
  publish?.("guide-note", {
    questionId: question.id,
    ask,
    message: READING_LINE,
    status: "checking",
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const tree = loadTree(treeFile(projectDir));
      const judgement = await judgePushback(question, text, 0, {
        think: model,
        projectDir,
        language: "en",
        facts: loadFacts(projectDir),
        session: loadSessionState(projectDir, tree),
        questions: tree,
        surfaceErrors: true,
      });
      if (judgement.action !== "push") {
        publish?.("guide-note", { questionId: question.id, ask, message: "", status: "kept" });
        return;
      }
      const note: GuideNote = {
        questionId: question.id,
        ask,
        message: judgement.message,
        status: "open",
      };
      await upsertGuideNote(projectDir, note);
      publish?.("guide-note", note);
      return;
    } catch {
      // One retry, then a note the person can see.
    }
  }
  const failed: GuideNote = {
    questionId: question.id,
    ask,
    message: GUIDE_FAIL_LINE,
    status: "unchecked",
  };
  await upsertGuideNote(projectDir, failed).catch(() => undefined);
  publish?.("guide-note", failed);
}

function emptyOverlay(): LiveOverlay {
  return {
    forId: null,
    message: null,
    quote: null,
    calm: false,
    status: null,
    cards: [],
    options: [],
    choices: null,
  };
}

function createLiveTurn(
  projectDir: string,
  depth: "express" | "standard" | "deep",
  getInterview: () => InterviewSession,
  setInterview: (session: InterviewSession) => void,
  model: typeof think,
  hooks?: { publish: (name: string, data: unknown) => void },
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
      const turnInput: {
        kind: "answer" | "suggest" | "skip";
        text?: string;
        assumed?: boolean;
      } = { kind: input.kind };
      if (input.text !== undefined) turnInput.text = input.text;
      if (input.assumed === true) turnInput.assumed = true;
      if (shouldAdvanceFirst(input)) {
        const text = input.text ?? "";
        await getInterview().command({ type: "keep", text });
        await reload();
        const next = getInterview().next();
        const question = current;
        void checkAnswerInBackground(projectDir, question, text, model, hooks?.publish);
        return {
          next,
          events: [
            { type: "turn", kind: input.kind, questionId: input.questionId },
            { type: "session", questionId: next === null ? null : next.id },
          ],
          live: {
            forId: next === null ? null : next.id,
            message: null,
            quote: null,
            calm: true,
            status: next === null ? "done" : "asked",
            cards: [],
            options: [],
            choices: null,
          },
        };
      }
      finished = await runTurn(session, turnInput, { think: model });
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
      choices: null,
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
    choices: copyChoices(result),
  };
}

function copyChoices(result: GuideTurn): CardChoiceSet | null {
  const items = result.choices;
  const forId = result.choicesForId;
  if (items === undefined || forId === undefined || items.length < 1) return null;
  const origin = result.choicesOrigin === "fallback" ? "fallback" : "model";
  const ids = ["A", "B", "C", "D"] as const;
  const kept: CardChoiceSet["items"] = [];
  for (let index = 0; index < items.length && index < ids.length; index += 1) {
    const item = items[index];
    const id = ids[index];
    if (item === undefined || id === undefined || item.id !== id) return null;
    if (item.label.trim() === "") return null;
    kept.push({ id, label: item.label, why: item.why, source: item.source });
  }
  if (kept.length < 1) return null;
  return { forId, origin, items: kept };
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
  if (overlay.message !== null && (overlay.calm || overlay.status === "pushed")) {
    parts.push(
      `<p class="hh-turn" data-calm="${overlay.calm ? "true" : "false"}"><span class="hh-turn__who">Guide</span> ${escapeHtml(overlay.message)}</p>`,
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
  reloadInterview: () => Promise<void>,
  handleTools: (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<void>,
  resetLive: () => void,
): Promise<void> {
  if (pathname === "/settings") {
    await handleSettingsPost(req, res, token, projectDir, enqueue, notice);
    return;
  }
  if (pathname === "/api/tour") {
    await handleTourPost(req, res, token, projectDir, enqueue);
    return;
  }
  if (
    pathname === "/api/project/save" ||
    pathname === "/api/project/open" ||
    pathname === "/api/project/remove"
  ) {
    await handleProjectRoute(req, res, pathname, token, projectDir, reloadInterview);
    return;
  }
  if (pathname === "/api/interview/restart") {
    await handleRestart(req, res, token, projectDir, enqueue, reloadInterview, resetLive);
    return;
  }
  const header = req.headers["x-hh-csrf"];
  if (typeof header !== "string" || !tokensMatch(token, header)) {
    sendJson(req, res, 403, { error: "The desk refused this request. Reload the page." });
    return;
  }
  if (pathname === "/api/effort") {
    await handleEffortPost(req, res, projectDir, enqueue);
    return;
  }
  if (pathname === "/api/revisit" || pathname === "/api/guide-note") {
    await handleGuideNotePost(req, res, pathname, projectDir, enqueue, reloadInterview, hub, view);
    return;
  }
  if (pathname === "/api/answer" || pathname === "/api/suggest" || pathname === "/api/skip") {
    await handleTurn(req, res, pathname, turn, view, hub, enqueue, projectDir);
    return;
  }
  if (pathname === "/api/draft") {
    await handleDraftPost(req, res, projectDir, enqueue);
    return;
  }
  if (pathname.startsWith("/api/attach/")) {
    const questionId = pathname.slice("/api/attach/".length);
    if (!attachQuestionId(questionId)) {
      sendJson(req, res, 400, { error: "That question does not take files." });
      dropRequest(req);
      return;
    }
    await handleAttach(req, res, projectDir, questionId);
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
  if (pathname.startsWith("/api/tools")) {
    await handleTools(req, res, pathname);
    return;
  }
  sendJson(req, res, 404, { error: "That route is not on the desk." });
}

async function handleProjectRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  token: string,
  projectDir: string,
  reloadInterview: () => Promise<void>,
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
  const result = await runProjectPost({
    pathname,
    projectDir,
    token,
    header: req.headers["x-hh-csrf"],
    raw: capped.body.toString("utf8"),
    contentType: headerOne(req.headers["content-type"]),
    accept: headerOne(req.headers.accept),
    tokensMatch,
  });
  if (result.type === "redirect") {
    if (pathname === "/api/project/open") await reloadInterview();
    res.writeHead(303, { location: result.location ?? "/" });
    res.end();
    return;
  }
  if (result.type === "html") {
    sendHtml(req, res, result.status, result.html);
    return;
  }
  sendJson(req, res, result.status, result.body);
}

async function handleRestart(
  req: IncomingMessage,
  res: ServerResponse,
  token: string,
  projectDir: string,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
  reloadInterview: () => Promise<void>,
  resetLive: () => void,
): Promise<void> {
  if (contentLengthExceeds(req.headers["content-length"], JSON_LIMIT)) {
    sendHtml(req, res, 413, restartErrorPage("That request is too large."));
    dropRequest(req);
    return;
  }
  const capped = await readCapped(req, JSON_LIMIT);
  if (!capped.ok) {
    sendHtml(req, res, 413, restartErrorPage("That request is too large."));
    dropRequest(req);
    return;
  }
  const raw = capped.body.toString("utf8");
  const contentType = headerOne(req.headers["content-type"]);
  if (!settingsTokenOk(token, req.headers["x-hh-csrf"], raw, contentType)) {
    sendHtml(req, res, 403, restartErrorPage("The desk refused this request. Reload the page."));
    return;
  }
  try {
    await enqueue(async () => {
      await restartInterview(projectDir);
      await clearAllDrafts(projectDir, new Date().toISOString());
    });
  } catch (error: unknown) {
    logDeskError(error);
    sendHtml(req, res, 500, restartErrorPage("The project could not be saved, so the interview was not restarted."));
    return;
  }
  resetLive();
  await reloadInterview();
  res.writeHead(303, { location: "/" });
  res.end();
}

function restartErrorPage(happened: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Restart</title>
    <link rel="stylesheet" href="/src/design/tokens.css" />
    <link rel="stylesheet" href="/src/design/type.css" />
    <link rel="stylesheet" href="/src/design/components.css" />
    <link rel="stylesheet" href="/src/shell.css" />
  </head>
  <body>
    <div class="hh-shell">
      <main id="main" class="hh-read">
        ${renderFriendly({
          title: "The interview was not restarted",
          happened,
          next: "Reload the desk. The interview is still on the question you had.",
          retryHref: "/",
          retryLabel: "Back to the desk",
          copyText: "Reload the desk",
        })}
      </main>
    </div>
  </body>
</html>`;
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

async function handleEffortPost(
  req: IncomingMessage,
  res: ServerResponse,
  projectDir: string,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
): Promise<void> {
  const capped = await readCapped(req, JSON_LIMIT);
  if (!capped.ok) {
    sendJson(req, res, 413, { error: "That request is too large." });
    return;
  }
  let effort = "";
  try {
    const parsed: unknown = JSON.parse(capped.body.toString("utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const value = (parsed as { effort?: unknown }).effort;
      if (typeof value === "string") effort = value;
    }
  } catch {
    effort = "";
  }
  if (effort !== "medium" && effort !== "high" && effort !== "xhigh") {
    sendJson(req, res, 400, { error: "Pick Medium, High, or Extra high." });
    return;
  }
  try {
    await enqueue(async () => {
      const current = loadConfig(projectDir);
      await saveConfig(projectDir, {
        ...current,
        effort,
        ai: { ...current.ai, effort: { ...current.ai.effort, default: effort, picked: "yes" } },
      });
    });
  } catch (error: unknown) {
    logDeskError(error);
    sendJson(req, res, 500, { error: "The effort setting did not save." });
    return;
  }
  sendJson(req, res, 200, { ok: true, effort });
}

async function handleGuideNotePost(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  projectDir: string,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
  reloadInterview: () => Promise<void>,
  hub: SseHub,
  view: () => DeskSession,
): Promise<void> {
  const capped = await readCapped(req, JSON_LIMIT);
  if (!capped.ok) {
    sendJson(req, res, 413, { error: "That request is too large." });
    return;
  }
  let questionId = "";
  let action = "";
  try {
    const parsed: unknown = JSON.parse(capped.body.toString("utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as { questionId?: unknown; action?: unknown };
      if (typeof record.questionId === "string") questionId = record.questionId;
      if (typeof record.action === "string") action = record.action;
    }
  } catch {
    questionId = "";
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(questionId)) {
    sendJson(req, res, 400, { error: "That question is not on the desk." });
    return;
  }
  const kind = pathname === "/api/revisit" ? "revisit" : action;
  try {
    await enqueue(async () => {
      if (kind === "revisit") {
        await writeRevisitId(projectDir, questionId);
        await reloadInterview();
      } else if (kind === "retry") {
        const answers = readAnswers(projectDir);
        let text = "";
        for (const answer of answers) {
          if (answer.id === questionId) text = answer.value;
        }
        const question = loadTree(treeFile(projectDir)).find((item) => item.id === questionId);
        if (question === undefined || text.trim() === "") throw new Error("missing");
        void checkAnswerInBackground(projectDir, question, text, selectGuideThink(), (name, data) =>
          hub.publish(name, data),
        );
      } else if (kind === "keep" || kind === "skip") {
        const existing = readGuideNotes(projectDir).find((note) => note.questionId === questionId);
        const note: GuideNote = {
          questionId,
          ask: existing?.ask ?? questionId,
          message: existing?.message ?? "",
          status: kind === "keep" ? "kept" : "unchecked",
        };
        await upsertGuideNote(projectDir, note);
      } else {
        throw new Error("unknown");
      }
      hub.publish("session", view());
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === "unknown" || error.message === "missing")) {
      sendJson(req, res, 400, { error: "That note action is not on the desk." });
      return;
    }
    logDeskError(error);
    sendJson(req, res, 500, { error: "The Guide note did not update." });
    return;
  }
  sendJson(req, res, 200, { ok: true, session: view() });
}

async function handleTurn(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  turn: TurnHandler,
  view: () => DeskSession,
  hub: SseHub,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
  projectDir: string,
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
  let text = parsed.text;
  if (kind === "answer") {
    text = composeStoredAnswer(projectDir, parsed.questionId, parsed.text ?? "", parsed.attachments ?? []);
    if (text.trim() === "") {
      sendJson(req, res, 400, { error: "Write an answer or skip." });
      return;
    }
  }
  try {
    const result = await enqueue(async () => {
      const output = asTurnResult(
        await turn({
          kind,
          questionId: parsed.questionId,
          ...(text === undefined ? {} : { text }),
          ...(parsed.assumed === true ? { assumed: true } : {}),
        }),
      );
      const session = view();
      const after = session.question;
      const moved = after === null || after.id !== parsed.questionId;
      if ((kind === "answer" || kind === "skip") && moved) {
        try {
          await clearQuestionDraft(projectDir, parsed.questionId);
        } catch (error: unknown) {
          logDeskError(error);
        }
      }
      hub.publish("session", view());
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

async function handleAttach(
  req: IncomingMessage,
  res: ServerResponse,
  projectDir: string,
  questionId: string,
): Promise<void> {
  if (contentLengthExceeds(req.headers["content-length"], MAX_ATTACH_REQUEST_BYTES)) {
    sendJson(req, res, 413, { error: "That upload is over 200 MB." });
    dropRequest(req);
    return;
  }
  const capped = await readCapped(req, MAX_ATTACH_REQUEST_BYTES);
  if (!capped.ok) {
    sendJson(req, res, 413, { error: "That upload is over 200 MB." });
    dropRequest(req);
    return;
  }
  const parsed = parseMultipartFiles(capped.body, headerOne(req.headers["content-type"]));
  if ("error" in parsed) {
    sendJson(req, res, 400, { error: parsed.error });
    return;
  }
  const saved = await saveAttachParts(projectDir, questionId, parsed.files);
  if (!saved.ok) {
    sendJson(req, res, 400, { error: saved.error });
    return;
  }
  for (const file of saved.files) {
    if (!file.ok || !plateExtension(file.storedName)) continue;
    const relative = `${questionId}/${file.storedName}`;
    if (!isLogoAssetName(relative)) continue;
    try {
      await rememberLogo(projectDir, relative, questionId, file.originalName, file.size, true);
    } catch {
      // The file is already in the question folder. The plate can catch up later.
    }
  }
  sendJson(req, res, 200, { ok: true, files: saved.files });
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
  const originalName = originalLeaf(part.filename);
  try {
    await rememberLogo(
      projectDir,
      decision.safeName,
      headerOne(req.headers["x-hh-question"]),
      originalName,
      part.data.length,
    );
  } catch {
    // The bytes are already in .hitchhiker/uploads. A brand-folder problem must not hide that.
  }
  sendJson(req, res, 201, {
    ok: true,
    safeName: decision.safeName,
    bytes: part.data.length,
    ...(originalName === "" ? {} : { originalName }),
  });
}

/**
 * Logo questions record a pointer the brand plate can read.
 * The bytes stay in uploads. SVG and PDF are named, not served.
 * Other upload questions keep the file and do not write this pointer.
 */
async function rememberLogo(
  projectDir: string,
  safeName: string,
  rawQuestionId: string,
  originalName?: string,
  bytes?: number,
  onlyIfEmpty = false,
): Promise<void> {
  const questionId = rawQuestionId.trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(questionId)) return;
  if (!isLogoAssetName(safeName)) return;
  const questions = loadTree(treeFile(projectDir));
  const question = questions.find((item) => item.id === questionId);
  if (question === undefined || !isLogoQuestion(question)) return;
  if (onlyIfEmpty && readLogoIntake(projectDir) !== null) return;
  const intake: LogoIntake = { safeName, questionId };
  const leaf = originalLeaf(originalName);
  if (leaf !== "") intake.originalName = leaf;
  if (bytes !== undefined && Number.isFinite(bytes) && bytes >= 0) intake.bytes = Math.floor(bytes);
  const dir = path.join(projectDir, ".hitchhiker", "brand");
  await mkdir(dir, { recursive: true });
  await replaceViaTemp(path.join(dir, "logo-intake.json"), serializeLogoIntake(intake));
}

function originalLeaf(filename: string | undefined): string {
  if (filename === undefined) return "";
  const leaf = path.basename(filename.replace(/\\/g, "/")).replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (leaf === "" || leaf === "." || leaf === ".." || leaf.includes("..")) return "";
  return leaf.slice(0, 120);
}

function logoFileFrom(intake: LogoIntake | null): DeskSession["logoFile"] {
  if (intake === null) return null;
  const originalName =
    intake.originalName !== undefined && intake.originalName !== ""
      ? intake.originalName
      : assetDisplayName(intake.safeName);
  return { originalName, safeName: intake.safeName, bytes: intake.bytes ?? null };
}

function logoStatusNote(projectDir: string): string | undefined {
  const file = logoFileFrom(readLogoIntake(projectDir));
  if (file === null) return undefined;
  return `Saved as ${file.originalName}.`;
}

function readLogoIntake(projectDir: string): LogoIntake | null {
  const file = path.join(projectDir, ".hitchhiker", "brand", "logo-intake.json");
  if (!existsSync(file)) return null;
  try {
    return parseLogoIntake(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Raster logos only. SVG is never given a route, and PDF stays a file name. */
async function sendBrandLogo(req: IncomingMessage, res: ServerResponse, projectDir: string): Promise<void> {
  const intake = readLogoIntake(projectDir);
  if (intake === null || !isRasterLogo(intake.safeName)) {
    sendJson(req, res, 404, { error: "No logo file is on the desk." });
    return;
  }
  const bytes = await readInside(path.join(projectDir, ".hitchhiker", "uploads"), intake.safeName);
  const ext = path.extname(intake.safeName).toLowerCase();
  const type = STATIC_TYPES[ext];
  if (bytes === null || type === undefined || type === "image/svg+xml") {
    sendJson(req, res, 404, { error: "No logo file is on the desk." });
    return;
  }
  sendBytes(req, res, 200, type, bytes);
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
  getPreflight: () => DeskPreflight | null = () => null,
): Promise<void> {
  if (pathname === "/") {
    const session = view();
    const flags = await enqueue(() => readVoiceDeskFlags(projectDir));
    let showTour = true;
    try {
      showTour = loadConfig(projectDir).tourSeen !== true;
    } catch {
      showTour = true;
    }
    let stay = false;
    try {
      stay = new URL(rawUrl, "http://localhost").searchParams.get("stay") === "1";
    } catch {
      stay = false;
    }
    await deliverHtml(
      req,
      res,
      200,
      renderDesk(token, session, flags, showTour, projectDir),
      projectDir,
      token,
      !stay,
      foldStyleHeaders(),
    );
    return;
  }
  if (pathname === "/gallery") {
    const opened = await enqueue(() => openGallery(projectDir, rawUrl));
    await deliverHtml(req, res, 200, renderGallery(token, opened.view, notice), projectDir, token, false);
    return;
  }
  if (pathname === "/api/gallery") {
    const opened = await enqueue(() => openGallery(projectDir, rawUrl));
    sendJson(req, res, 200, galleryJson(opened));
    return;
  }

  if (pathname === "/motion") {
    await deliverHtml(req, res, 200, renderMotion(token, notice), projectDir, token, false);
    return;
  }
  if (pathname === "/client/motion.js") {
    const compiled = compileAppModule(MOTION_SOURCE);
    if (compiled === null) {
      await deliverHtml(req, res, 404, renderMissing(token, notice), projectDir, token, false);
      return;
    }
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(compiled));
    return;
  }
  if (pathname === "/vendor/theatre-core.mjs") {
    try {
      sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(buildTheatreBundle()));
    } catch {
      await deliverHtml(req, res, 404, renderMissing(token, notice), projectDir, token, false);
    }
    return;
  }
  if (pathname.startsWith("/vendor-pkg/")) {
    const body = readVendorModule(pathname);
    if (body === null) {
      await deliverHtml(req, res, 404, renderMissing(token, notice), projectDir, token, false);
      return;
    }
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(body));
    return;
  }
  if (pathname.startsWith("/src/motion-previews/") && pathname.endsWith(".js")) {
    const rel = pathname.slice("/src/".length).replace(/\.js$/, ".ts");
    const compiled = compileAppModule(path.resolve(SRC_ROOT, rel));
    if (compiled === null) {
      await deliverHtml(req, res, 404, renderMissing(token, notice), projectDir, token, false);
      return;
    }
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(compiled));
    return;
  }
  if (pathname === "/brand") {
    const intake = readLogoIntake(projectDir);
    const questionId = view().question?.id ?? null;
    const loaded = await loadBrandKit(projectDir);
    if (loaded.kind === "missing") {
      const raster = intake !== null && isRasterLogo(intake.safeName);
      const html = raster
        ? renderBrand(token, notice, questionId, intake, ["/src/brand-kit.css"])
        : renderBrand(token, notice, questionId, intake);
      await deliverHtml(req, res, 200, html, projectDir, token, false);
      return;
    }
    const nav = `${deskMenu(token)}\n        ${routeNav("/brand")}`;
    if (loaded.kind === "bad") {
      await deliverHtml(req, res, 500, renderBrandKitError(token, nav), projectDir, token, false);
      return;
    }
    await deliverHtml(req, res, 200, injectBrandLogo(dressBrandKit(loaded.html, token, nav), intake), projectDir, token, false, brandKitHeaders());
    return;
  }
  if (pathname === "/brand/logo") {
    await sendBrandLogo(req, res, projectDir);
    return;
  }
  if (pathname === "/approve") {
    await deliverHtml(req, res, 200, renderApprove(token, notice, view().question?.id ?? null), projectDir, token, false);
    return;
  }
  if (pathname === "/tools") {
    await deliverHtml(
      req,
      res,
      200,
      renderTools(token, getPreflight(), notice, view().question?.id ?? null),
      projectDir,
      token,
      false,
    );
    return;
  }
  if (pathname === "/settings") {
    try {
      const settingsView = await enqueue(() => loadSettingsView(projectDir));
      await deliverHtml(req, res, 200, renderSettingsDocument(token, settingsView, notice, null), projectDir, token, false);
    } catch (error: unknown) {
      logDeskError(error);
      await deliverHtml(req, res, 500, renderSettingsFailure(token, notice), projectDir, token, false);
    }
    return;
  }
  if (pathname === "/hh-dashboard") {
    const drive = await readDashboard(projectDir, token);
    if (drive.kind === "html") {
      await deliverHtml(req, res, drive.status, withDeskMenu(drive.html, token), projectDir, token, false);
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
  if (pathname === "/api/draft") {
    const questionId = queryValue(rawUrl, "questionId");
    sendJson(req, res, 200, currentDraft(projectDir, questionId) ?? { text: "" });
    return;
  }
  if (pathname === "/api/events") {
    streamEvents(req, res, view, hub);
    return;
  }
  if (pathname === "/client/tooltip.js") {
    sendBytes(
      req,
      res,
      200,
      "text/javascript; charset=utf-8",
      Buffer.from(browserModule(path.resolve(SRC_ROOT, "client", "tooltip.ts"))),
    );
    return;
  }
  if (pathname === "/client/desk.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(DESK_SOURCE)));
    return;
  }
  if (pathname === "/client/draft-store.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(DRAFT_STORE_SOURCE)));
    return;
  }
  if (pathname === "/client/tour.js") {
    sendBytes(
      req,
      res,
      200,
      "text/javascript; charset=utf-8",
      Buffer.from(browserModule(path.resolve(SRC_ROOT, "client", "tour.ts"))),
    );
    return;
  }
  if (pathname === "/client/tool-install.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(TOOL_SOURCE)));
    return;
  }
  if (pathname === "/client/save-status.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(SAVE_SOURCE)));
    return;
  }
  if (pathname === "/client/voice-engine.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(VOICE_ENGINE_SOURCE)));
    return;
  }
  if (pathname === "/client/voice-text.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(VOICE_TEXT_SOURCE)));
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
  if (pathname === "/client/head.js") {
    sendBytes(
      req,
      res,
      200,
      "text/javascript; charset=utf-8",
      Buffer.from(browserModule(path.resolve(SRC_ROOT, "server", "head.ts"))),
    );
    return;
  }
  if (pathname === "/client/tokens.js") {
    sendBytes(
      req,
      res,
      200,
      "text/javascript; charset=utf-8",
      Buffer.from(browserModule(path.resolve(SRC_ROOT, "design", "tokens.ts"))),
    );
    return;
  }
  if (pathname === "/client/card.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(CARD_SOURCE)));
    return;
  }
  if (pathname === "/client/attach.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(ATTACH_SOURCE)));
    return;
  }
  if (pathname === "/client/walk.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(WALK_SOURCE)));
    return;
  }
  if (pathname === "/client/tile.js") {
    sendBytes(req, res, 200, "text/javascript; charset=utf-8", Buffer.from(browserModule(TILE_SOURCE)));
    return;
  }
  if (pathname.startsWith("/src/") || pathname.startsWith("/public/")) {
    const root = pathname.startsWith("/src/") ? SRC_ROOT : PUBLIC_ROOT;
    const prefix = pathname.startsWith("/src/") ? "/src/" : "/public/";
    const ext = path.extname(pathname).toLowerCase();
    const type = STATIC_TYPES[ext];
    if (type === undefined) {
      await deliverHtml(req, res, 404, renderMissing(token, notice), projectDir, token, false);
      return;
    }
    const body = await readInside(root, pathname.slice(prefix.length));
    if (body === null) {
      await deliverHtml(req, res, 404, renderMissing(token, notice), projectDir, token, false);
      return;
    }
    sendBytes(req, res, 200, type, body);
    return;
  }
  if (pathname.startsWith("/api/")) {
    sendJson(req, res, 404, { error: "That route is not on the desk." });
    return;
  }
  await deliverHtml(req, res, 404, renderMissing(token, notice), projectDir, token, false);
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
  if (question !== null && projectDir !== "") {
    const sessionState = loadSessionState(projectDir, questions);
    const gate = gateQuestion(question, sessionState, questions);
    if (gate.action === "confirm") question = { ...question, ask: gate.ask };
  }
  const saved = loadState(projectDir);
  const notes = readGuideNotes(projectDir);
  const blocked = blockingNotes(notes);
  const promptId = question === null ? "interview:done" : `interview:${question.id}`;
  const nextAction =
    question === null && blocked.length > 0
      ? `The Guide still wants a look at ${blocked.map((note) => note.questionId).join(", ")}.`
      : question === null
        ? "Approve the Site Brief."
        : `Answer ${question.id}.`;
  const state: GuideState = saved ?? {
    phase: "Don't Panic",
    slice: "The Guide",
    promptId,
    lastGoodCommit: "",
    blockers: [],
    nextAction,
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
  if (saved !== null && question === null && blocked.length > 0) {
    state.nextAction = nextAction;
  }
  const coverage = session.coverage();
  const answers = readAnswers(projectDir);
  let pushback = session.lastPushback;
  const revisitId = readRevisitId(projectDir);
  let answerDraft: string | null = null;
  if (question !== null && revisitId === question.id) {
    let stored = "";
    for (const answer of answers) {
      if (answer.id === question.id) stored = answer.value;
    }
    const clean = stored.replace(/^ASSUMED:\s*/i, "").trim();
    if (clean !== "") answerDraft = clean;
    const revisitQuestionId = question.id;
    const thought = notes.find((note) => note.questionId === revisitQuestionId && note.status === "open");
    if (thought !== undefined && (pushback === null || pushback === "")) pushback = thought.message;
  }
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
  const questionId = question?.id ?? null;
  const index = questionId === null ? 0 : questions.findIndex((item) => item.id === questionId) + 1;
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
  let choices =
    question !== null && overlay.choices !== null && overlay.choices.forId === question.id
      ? overlay.choices
      : null;
  const drafts = readDraftFileSync(projectDir);
  const fileShown =
    drafts.shown !== null && question !== null && drafts.shown.forId === question.id ? drafts.shown : null;
  if (question !== null && fileShown !== null && !overlay.calm) {
    const memoryPush = overlay.forId === question.id && overlay.status === "pushed" && overlay.quote !== null;
    if (!memoryPush && (pushback === null || pushback === "") && fileShown.pushback !== null) {
      pushback = fileShown.pushback;
    }
    if (choices === null && fileShown.choices !== null) choices = fileShown.choices;
  }
  const savedFiles = readSavedFiles(projectDir, question?.id ?? null);
  const stored = question === null ? null : (drafts.entries[question.id] ?? null);
  const guarded = applyLogoGuard(projectDir, question, questions, choices);
  question = guarded.question;
  choices = guarded.choices;
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
    choices,
    ...(savedFiles.length > 0 ? { attach: chipsFromSaved(savedFiles) } : {}),
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
    const split = splitPublicError(message);
    mapHtml =
      split.detail === null
        ? `<p class="hh-error" role="alert">${escapeHtml(split.summary)}</p>`
        : `<div class="hh-error" role="alert"><p>${escapeHtml(split.summary)}</p><p>Reload the desk. The map is a guide, and the question still works.</p><details class="hh-details"><summary>Details</summary><pre class="hh-details__pre">${escapeHtml(split.detail)}</pre></details></div>`;
  }
  const showPreflight =
    preflight !== null && (firstRun || preflight.probes.some((probe) => probe.ok === false));
  const preflightHtml = showPreflight && preflight !== null ? `${renderPreflight(preflight)}\n` : "";
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
    // The held card can still be the question that was just suggested, after the
    // cursor has moved. Send that choice set. The rendered card only shows a set
    // whose forId is the question on screen.
    choices: filterLogoChoices(overlay.choices ?? choices, projectDir, questions),
    projectKey: projectKeyFor(projectDir),
    draft: stored,
    savedFiles,
    draftsClearedAt: drafts.clearedAt,
    answerDraft,
    logoFile: logoFileFrom(projectDir === "" ? null : readLogoIntake(projectDir)),
  };
}

function filterLogoChoices(
  set: CardChoiceSet | null,
  projectDir: string,
  questions: readonly Question[],
): CardChoiceSet | null {
  if (set === null || projectDir === "") return set;
  const state = loadSessionState(projectDir, questions);
  const kept = set.items.filter((item) => !offersForeignImageAsLogo(item.label, state));
  if (kept.length === 0) return null;
  if (kept.length === set.items.length) return set;
  const items = reletterChoices(kept);
  return { ...set, items };
}

function applyLogoGuard(
  projectDir: string,
  question: Question | null,
  questions: readonly Question[],
  choices: CardChoiceSet | null,
): { question: Question | null; choices: CardChoiceSet | null } {
  if (question === null || projectDir === "") return { question, choices };
  const state = loadSessionState(projectDir, questions);
  const ask = guardLogoText(question.ask, state, question, questions);
  const next = ask === question.ask ? question : { ...question, ask };
  if (choices === null) return { question: next, choices };
  const kept = choices.items.filter((item) => !offersForeignImageAsLogo(item.label, state));
  const items = reletterChoices(kept);
  return { question: next, choices: items.length === 0 ? null : { ...choices, items } };
}

function chipsFromSaved(files: readonly SavedFile[]): NonNullable<CardState["attach"]> {
  return {
    linkDraft: "",
    uploading: null,
    live: "",
    chips: files.map((file, index) => ({
      id: `s${index + 1}`,
      kind: "file" as const,
      label: file.originalName,
      detail: formatBytes(file.size),
      removeName: `Remove ${file.originalName}`,
      ready: true,
    })),
  };
}

async function handleDraftPost(
  req: IncomingMessage,
  res: ServerResponse,
  projectDir: string,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
): Promise<void> {
  if (contentLengthExceeds(req.headers["content-length"], JSON_LIMIT)) {
    sendJson(req, res, 413, { error: "That draft is too long." });
    dropRequest(req);
    return;
  }
  const capped = await readCapped(req, JSON_LIMIT);
  if (!capped.ok) {
    sendJson(req, res, 413, { error: "That draft is too long." });
    dropRequest(req);
    return;
  }
  const parsed = parseDraftPost(capped.body.toString("utf8"));
  if ("error" in parsed) {
    sendJson(req, res, 400, { error: parsed.error });
    return;
  }
  try {
    await enqueue(() => writeDraftPost(projectDir, parsed));
  } catch (error: unknown) {
    logDeskError(error);
    sendJson(req, res, 500, { error: "The draft could not be saved." });
    return;
  }
  sendJson(req, res, 200, { ok: true });
}

function statusSpans(text: string, notice: string | null | undefined, calm = false): string {
  const calmAttr = calm ? ' data-calm="true"' : "";
  const action = `<span${calmAttr}>${escapeHtml(text)}</span>`;
  const chip = `<span tabindex="0" data-tip="Where the desk is right now.">${action}</span>`;
  if (notice === null || notice === undefined || notice.length === 0) return chip;
  return `<span tabindex="0" data-tip="A note from the last action.">${escapeHtml(notice)}</span>${chip}`;
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
 * list stays in the rail. Chromium hides a closed details body with
 * content-visibility on ::details-content, so display:grid on the list is
 * not enough. The wide query turns that visibility back on. The element
 * stays closed, and the narrow query still hides the list.
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
  .hh-map-fold::details-content { content-visibility: visible; }
  .hh-map-fold > .hh-map { display: grid; }
}
/* Logo drop sits above the composer. 375 is under 720px, so the composer sticks and this zone scrolls with the question. 1440 is outside that query, and the zone stays in the 40rem read column. */
.hh-qcard__drop { display: grid; gap: var(--space-2); min-width: 0; max-width: 100%; padding: var(--space-4); border: 1px dashed color-mix(in srgb, var(--color-ink) 32%, transparent); border-radius: var(--radius-md); }
.hh-qcard__file { display: block; width: 100%; max-width: 100%; min-height: 44px; color: var(--color-ink); font-family: var(--font-text); font-size: var(--type-small); }
.hh-qcard__file:focus-visible, .hh-qcard__lang > summary:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 3px; }
.hh-qcard__lang > summary { display: flex; align-items: center; min-height: 44px; cursor: pointer; color: var(--color-ink); font-family: var(--font-display); font-weight: 600; font-size: var(--type-small); }`;

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

function renderDesk(
  token: string,
  session: DeskSession,
  flags?: VoiceDeskFlags,
  showTour = false,
  projectDir = "",
): string {
  const voiceFlags = flags ?? { xaiSetting: false, rateAccepted: false, localWhisper: false };
  const engine = engineForDesk(voiceFlags, true);
  const chrome = voiceChromeFor(engine);
  let html = renderShell();
  const dek = `<p class="hh-dek">Don't Panic. One question at a time. The work saves on this machine.</p>`;
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
    `<header class="hh-mast hh-mast--desk hh-rise"${mastAttr}>
        <div data-mast-full${fullHidden}>
        <div class="hh-mast__row">
          <h1 class="hh-kicker">The Hitchhiker's Guide to Web Design</h1>
          <p class="hh-kicker">Desk</p>
        </div>
        <div class="hh-wordmark" role="img" aria-label="Don't Panic"></div>
        ${dek}
        </div>
        <p class="hh-mast__line" data-mast-line${lineHidden}>${escapeHtml(session.mastLine)}</p>
        ${deskMenu(token)}
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
    `<section class="hh-log hh-rise hh-rise--2" id="transcript" data-region="transcript" data-tour-spot="transcript" aria-label="Transcript">\n            ${session.transcriptHtml}\n          </section>`,
    "transcript",
  );
  const guideLive = escapeHtml(guideTurnText(session.question?.ask ?? null, session.done));
  html = replaceBlock(
    html,
    /<section class="hh-rise hh-rise--3" data-region="question" aria-label="Question">[\s\S]*?<\/section>/,
    `<section class="hh-rise hh-rise--3" data-region="question" data-tour-spot="question" data-hh-ready data-xai-setting="${voiceFlags.xaiSetting ? "true" : "false"}" data-rate-accepted="${voiceFlags.rateAccepted ? "true" : "false"}" data-local-whisper="${voiceFlags.localWhisper ? "true" : "false"}" aria-label="Question">\n            ${withInterviewExtras(reshapeDeskCard(session.cardHtml, engine === "web-speech", chrome), session.question, logoStatusNote(projectDir))}\n          </section>\n          <p class="hh-guide-live" data-guide-live aria-live="polite">${guideLive}</p>\n          ${projectDir === "" ? `<div data-guide-notes></div>` : renderGuideNotes(readGuideNotes(projectDir))}`,
    "question",
  );
  html = mustReplace(
    html,
    '<div class="hh-interview__head" data-interview-head></div>',
    interviewHead(token, session),
    "interview head",
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
    `<footer class="hh-status" data-region="status" data-tour-spot="status">\n        ${session.statusHtml}\n      </footer>`,
    "status",
  );
  const motion =
    session.question?.id.startsWith("DP-6.") === true
      ? `    <script type="module" src="/client/motion.js"></script>\n`
      : "";
  if (showTour) {
    html = html.replace(
      '<section class="hh-log hh-rise hh-rise--2" id="transcript"',
      `${renderTour(token)}\n          <section class="hh-log hh-rise hh-rise--2" id="transcript"`,
    );
  }
  return html.replace(
    "</body>",
    `    <script type="module" src="/client/tooltip.js"></script>\n    <script type="module" src="/client/desk.js"></script>\n${motion}  </body>`,
  );
}

function interviewHead(token: string, session: DeskSession): string {
  const index = session.counts?.index ?? 1;
  const total = session.counts?.total ?? 1;
  return `<div class="hh-interview__head" data-interview-head>
            <p class="hh-progress" data-progress>Question ${index} of ${total}</p>
            <button class="hh-btn hh-btn--secondary" type="button" data-restart-open="restart" data-tip="Saves the project file, then returns the interview to the first question.">Restart the interview</button>
          </div>
          <dialog class="hh-dialog" data-restart-dialog aria-labelledby="hh-restart-title">
            <h2 class="hh-title" id="hh-restart-title">Restart the interview</h2>
            <p>Progress is saved. The project file keeps what you already wrote. The interview returns to the first question.</p>
            <form method="post" action="/api/interview/restart" class="hh-dialog__actions">
              <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
              <button class="hh-btn hh-btn--secondary" type="button" data-restart-cancel="cancel" autofocus data-tip="Closes this dialog. The interview stays on this question.">Cancel</button>
              <button class="hh-btn hh-btn--secondary" type="submit" data-tip="Saves the project, then starts again at the first question.">Restart the interview</button>
            </form>
          </dialog>`;
}

function renderBrand(
  token: string,
  notice: string | null = null,
  questionId: string | null = null,
  intake: LogoIntake | null = null,
  extraCss?: readonly string[],
): string {
  return renderPanel({
    notice,
    token,
    title: "Brand kit",
    description: "Palette, letters, and voice land on this plate after the brief is approved.",
    current: "/brand",
    kicker: "Brand kit",
    status: "The kit waits on the brief.",
    main: renderEmptyBrand(questionId, intake),
    ...(extraCss === undefined ? {} : { extraCss }),
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
        <p class="hh-empty__next"><a class="hh-btn hh-btn--primary" href="${href}" data-tip="Opens the question that is still waiting.">${APPROVE_EMPTY_ACTION}</a></p>
      </div>`,
  });
}

function renderTools(
  token: string,
  preflight: DeskPreflight | null,
  notice: string | null,
  questionId: string | null,
): string {
  const href = escapeHtml(openQuestionHref(questionId));
  const back = `<p class="hh-empty__next"><a class="hh-btn hh-btn--primary" href="${href}" data-tip="Returns to the interview question.">Back to the interview</a></p>`;
  const main =
    preflight === null
      ? `<div class="hh-empty hh-rise hh-rise--2"><h1 class="hh-empty__title">Install tools</h1><p>No tool report is on this desk yet.</p>${back}</div>`
      : `<div class="hh-rise hh-rise--2"><h1 class="hh-title">Install tools</h1><p>These checks match the doctor. An install stays on this machine and waits for a yes.</p>${renderPreflight(preflight)}${back}</div>`;
  return renderPanel({
    notice,
    token,
    title: "Install tools",
    description: "Which tools are on this machine, and how to install a missing one.",
    current: "/tools",
    kicker: "Install tools",
    status: preflight === null ? "No tool report is on this desk yet." : "Tool report for this machine.",
    script: "/client/desk.js",
    main,
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
    main: renderFriendly({
      title: "This page is not on the desk",
      happened: "The address does not match a route.",
      next: "Go back to the desk and pick a page from the list.",
      retryHref: "/",
      retryLabel: "Back to the desk",
      copyText: "Open the desk at /",
    }),
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
}): string {
  const extra = (opts.extraCss ?? [])
    .map((href) => `    <link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join("\n");
  const pageScript =
    opts.script === undefined ? "" : `    <script type="module" src="${escapeHtml(opts.script)}"></script>\n`;
  const script = `    <script type="module" src="/client/tooltip.js"></script>\n${pageScript}`;
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
      <header class="hh-mast hh-mast--desk hh-rise">
        <div class="hh-mast__row">
          <p class="hh-kicker">${escapeHtml(opts.kicker)}</p>
          <p class="hh-kicker">Local desk</p>
        </div>
        <div class="hh-wordmark" role="img" aria-label="Don't Panic"></div>
        ${deskMenu(opts.token)}
        ${routeNav(opts.current)}
      </header>
      <main id="main" class="hh-read${opts.board === true ? " hh-read--board" : ""}" data-hh-ready>
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

function deskMenu(token: string): string {
  return `<details class="hh-desk-menu hh-qcard__look">
          <summary class="hh-kicker" data-tip="Replay the first five minutes. Settings live in the route list.">Desk menu</summary>
          ${renderReplayControl(token)}
        </details>`;
}

function withDeskMenu(html: string, token: string): string {
  if (html.includes('class="hh-desk-menu')) return html;
  const mark = `<div class="hh-wordmark hh-wordmark--quiet" role="img" aria-label="Don't Panic"></div>`;
  if (!html.includes(mark)) return html;
  return html.replace(
    mark,
    `${mark}\n        ${deskMenu(token)}\n        ${routeNav("/hh-dashboard")}`,
  );
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
    current: "/settings",
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
    current: "/settings",
    kicker: "Settings",
    status: "Settings could not be read.",
    main: renderFriendly({
      title: "Settings could not be read",
      happened: "The rate card stayed unread. Nothing was turned on.",
      next: "Reload settings. If it fails again, run hh doctor and come back.",
      retryHref: "/settings",
      retryLabel: "Try again",
      copyText: "hh doctor",
      detail: "Settings read failed before the form was shown. xAI speech-to-text stayed off.",
    }),
  });
}

async function handleTourPost(
  req: IncomingMessage,
  res: ServerResponse,
  token: string,
  projectDir: string,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
): Promise<void> {
  if (contentLengthExceeds(req.headers["content-length"], JSON_LIMIT)) {
    sendHtml(req, res, 413, tourErrorPage("That request is too large."));
    dropRequest(req);
    return;
  }
  const capped = await readCapped(req, JSON_LIMIT);
  if (!capped.ok) {
    sendHtml(req, res, 413, tourErrorPage("That request is too large."));
    dropRequest(req);
    return;
  }
  const raw = capped.body.toString("utf8");
  const contentType = headerOne(req.headers["content-type"]);
  if (!settingsTokenOk(token, req.headers["x-hh-csrf"], raw, contentType)) {
    sendHtml(req, res, 403, tourErrorPage("The desk refused this request. Reload the page."));
    return;
  }
  const tour = new URLSearchParams(raw).get("tour");
  if (tour !== "seen" && tour !== "replay") {
    sendHtml(req, res, 400, tourErrorPage("The tour action was not recognised."));
    return;
  }
  try {
    await enqueue(async () => {
      const current = loadConfig(projectDir);
      await saveConfig(projectDir, { ...current, tourSeen: tour === "seen" });
    });
  } catch (error: unknown) {
    logDeskError(error);
    const detail = error instanceof Error ? error.message : "The tour setting did not save.";
    sendHtml(req, res, 500, tourErrorPage("The tour setting did not save.", detail));
    return;
  }
  res.writeHead(303, { location: "/" });
  res.end();
}

function tourErrorPage(happened: string, detail?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tour</title>
    <link rel="stylesheet" href="/src/design/tokens.css" />
    <link rel="stylesheet" href="/src/design/type.css" />
    <link rel="stylesheet" href="/src/design/components.css" />
    <link rel="stylesheet" href="/src/shell.css" />
  </head>
  <body>
    <div class="hh-shell">
      <main id="main" class="hh-read">
        ${renderFriendly({
          title: "The tour did not update",
          happened,
          next: "Reload the desk and try Skip tour or Replay tour again.",
          retryHref: "/",
          retryLabel: "Back to the desk",
          copyText: "Reload the desk",
          ...(detail === undefined ? {} : { detail }),
        })}
      </main>
    </div>
    <script type="module" src="/client/save-status.js"></script>
  </body>
</html>`;
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
    await deliverHtml(req, res, status, renderSettingsDocument(token, view, notice, flash), projectDir, token, false);
  } catch (error: unknown) {
    logDeskError(error);
    await deliverHtml(req, res, status, renderSettingsFailure(token, notice), projectDir, token, false);
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

function navIcon(name: string): string {
  const paths: Record<string, string> = {
    desk: "M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5",
    brand: "M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z",
    approve: "M5 12l4 4 10-10",
    drive: "M4 16l4-8h8l4 8z",
    settings: "M4 8h8 M16 8h4 M4 16h4 M12 16h8",
    tools: "M14 6l4 4-8 8H6v-4z",
    gallery: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
    motion: "M3 15c2.5 0 2.5-6 5-6s2.5 6 5 6 2.5-6 5-6 2.5 6 5 6",
  };
  const d = paths[name] ?? paths.desk ?? "M5 4h14v16H5z";
  return `<svg class="hh-nav__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function routeNav(current: RouteName | null): string {
  const items = [
    { href: "/", label: "Desk", icon: "desk", tip: "The interview. One question, then the next." },
    { href: "/brand", label: "Brand", icon: "brand", tip: "The brand kit. Palette, letters, and voice after the brief is approved." },
    { href: "/approve", label: "Approvals", icon: "approve", tip: "Decisions waiting for a yes. The queue does not start without one." },
    { href: "/hh-dashboard", label: "Drive", icon: "drive", tip: "The local queue. Pause, cost, and what the build is doing." },
    { href: "/settings", label: "Settings", icon: "settings", tip: "Voice, model, and effort for this project." },
    { href: "/tools", label: "Install tools", icon: "tools", tip: "Which tools are on this machine, and how to install a missing one." },
    { href: "/gallery", label: "Gallery", icon: "gallery", tip: "Reference sites. Keep the ones that fit." },
    { href: "/motion", label: "Motion", icon: "motion", tip: "Short motion loops, then a number for how much the site should move." },
  ] as const;
  const links = items.map((item) => {
    const on = item.href === current;
    const spot = item.href === "/approve" ? ' data-tour-spot="approve"' : "";
    const currentAttr = on ? ' aria-current="page"' : "";
    return `<a href="${item.href}"${currentAttr}${spot} data-tip="${escapeHtml(item.tip)}">${navIcon(item.icon)}<span>${escapeHtml(item.label)}</span></a>`;
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
    .replace(/from\s+["']\.\/client\/attach\.ts["']/g, 'from "/client/attach.js"')
    .replace(/from\s+["']\.\/attach\.ts["']/g, 'from "/client/attach.js"')
    .replace(/from\s+["']\.\.\/drive-markup\.ts["']/g, 'from "/client/drive-markup.js"')
    .replace(/from\s+["']\.\/design\/document-head\.ts["']/g, 'from "/client/document-head.js"')
    .replace(/from\s+["']\.\.\/server\/head\.ts["']/g, 'from "/client/head.js"')
    .replace(/from\s+["']\.\.\/design\/tokens\.ts["']/g, 'from "/client/tokens.js"')
    .replace(/from\s+["']\.\/tokens\.ts["']/g, 'from "/client/tokens.js"')
    .replace(/from\s+["']\.\.\/brand\/approve-cards\.ts["']/g, 'from "/client/approve-cards.js"')
    .replace(/from\s+["']\.\/voice-engine\.ts["']/g, 'from "/client/voice-engine.js"')
    .replace(/from\s+["']\.\/voice-text\.ts["']/g, 'from "/client/voice-text.js"')
    .replace(/from\s+["']\.\/draft-store\.ts["']/g, 'from "/client/draft-store.js"')
    .replace(/from\s+["']\.\/tool-install\.ts["']/g, 'from "/client/tool-install.js"')
    .replace(/from\s+["']\.\/tour\.ts["']/g, 'from "/client/tour.js"')
    .replace(/from\s+["']\.\/tile\.ts["']/g, 'from "/client/tile.js"');
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
 * Gallery walk. Cards use a generated tile. The desk does not serve
 * third-party screenshots. HH_GALLERY_CACHE is left unread on purpose.
 */
interface GalleryQuery {
  industry: string | null;
  styleWorld: string | null;
  family: string | null;
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
  const query = saved?.query ?? { industry: null, styleWorld: null, family: null };
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
  const query = saved?.query ?? { industry: null, styleWorld: null, family: null };
  if (state.phase !== "narrowing") {
    return { status: 409, body: { error: "The shortlist is not open." } };
  }
  const chosen = chooseShortlist(state, urls);
  if (chosen.shortlistError !== null) {
    return { status: 400, body: { error: chosen.shortlistError } };
  }
  const loaded = readPack();
  const pack = loaded.entries;
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
  const loaded = readPack();
  if (loaded.error !== null) {
    const state = emptyWalk();
    const view = await toGalleryView(projectDir, state, [], [], loaded.error);
    return { state, view };
  }
  const pack = loaded.entries;
  const saved = await readGalleryDisk(projectDir);
  let query = saved?.query ?? { industry: null, styleWorld: null, family: null };
  let state = saved?.state ?? emptyWalk();
  if (isFreshWalk(state)) query = queryFromUrl(rawUrl);
  const deal =
    pack.length === 0 && isFreshWalk(state)
      ? { state, cards: [] as GalleryEntry[] }
      : dealRound(state, pack, toWalkQuery(query));
  await writeGalleryDisk(projectDir, { query, state: deal.state });
  return { state: deal.state, view: await toGalleryView(projectDir, deal.state, deal.cards, pack, null) };
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
  packError: string | null,
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
    packError,
  };
}

function cardModel(entry: GalleryEntry): GalleryCardModel {
  const sourceName = entry.sourceName ?? sourceNameFor(entry.source);
  return {
    name: entry.name,
    url: entry.url,
    source: entry.source,
    noted: entry.noted,
    award: entry.award,
    family: entry.family ?? "",
    id: entry.id ?? entry.url,
    title: entry.title ?? "",
    why: entry.why ?? entry.noted,
    borrow: entry.borrow ?? "",
    typography: entry.typography ?? "",
    paletteNote: entry.palette?.note ?? "",
    sourceName,
    sourcePage: entry.sourcePage ?? null,
  };
}

function sourceNameFor(source: string): string {
  if (source === "godly") return "Godly";
  if (source === "awwwards") return "Awwwards";
  if (source === "recent") return "Recent (formerly Godly)";
  if (source === "gsap-showcase") return "GSAP Showcase";
  if (source === "aura") return "aura.build";
  return "Direct pick";
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

function galleryPackFile(): string {
  const fromEnv = process.env.HH_GALLERY_FILE;
  if (fromEnv !== undefined && fromEnv.trim() !== "") return fromEnv;
  return path.resolve(import.meta.dirname, "..", "..", "..", "knowledge", "galleries", "curated.json");
}

function readPack(): { entries: GalleryEntry[]; error: string | null } {
  try {
    return { entries: loadGallery(galleryPackFile()), error: null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "The gallery pack could not be read.";
    console.error(message);
    return { entries: [], error: message };
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
    const family = value.query.family;
    if (industry !== null && typeof industry !== "string") return null;
    if (styleWorld !== null && typeof styleWorld !== "string") return null;
    if (family !== undefined && family !== null && typeof family !== "string") return null;
    return {
      query: {
        industry: typeof industry === "string" ? industry : null,
        styleWorld: typeof styleWorld === "string" ? styleWorld : null,
        family: typeof family === "string" ? family : null,
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
  const family = params.get("family");
  return {
    industry: industry === null || industry.trim() === "" ? null : industry.trim().slice(0, 80),
    styleWorld: styleWorld === null || styleWorld.trim() === "" ? null : styleWorld.trim().slice(0, 40),
    family: family === null || family.trim() === "" ? null : family.trim().slice(0, 40),
  };
}

function toWalkQuery(query: GalleryQuery): WalkQuery {
  const next: WalkQuery = {};
  if (query.industry !== null && query.industry.trim() !== "") next.industry = query.industry.trim();
  if (query.styleWorld !== null && query.styleWorld.trim() !== "") next.styleWorld = query.styleWorld.trim();
  if (query.family !== null && query.family.trim() !== "") next.family = query.family.trim();
  return next;
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

function queryValue(rawUrl: string, name: string): string | null {
  const query = rawUrl.split("?")[1] ?? "";
  if (query === "") return null;
  try {
    return new URLSearchParams(query).get(name);
  } catch {
    return null;
  }
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
): { questionId: string; text?: string; assumed?: boolean; attachments?: unknown[] } | { error: string } {
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
  const attachments = value.attachments;
  if (attachments !== undefined && !Array.isArray(attachments)) {
    return { error: "The desk could not read that request." };
  }
  if (Array.isArray(attachments) && attachments.length > 20) {
    return { error: "That answer has too many attachments." };
  }
  if (kind === "answer" && typeof text !== "string" && !Array.isArray(attachments)) {
    return { error: "Write an answer or skip." };
  }
  const body: { questionId: string; text?: string; assumed?: boolean; attachments?: unknown[] } = {
    questionId,
  };
  if (typeof text === "string") body.text = text;
  if (Array.isArray(attachments)) body.attachments = attachments;
  if (kind === "answer" && value.assumed === true) body.assumed = true;
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
  input: { kind: "answer" | "suggest" | "skip"; questionId: string; text?: string; assumed?: boolean },
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
  await reviseStoredAnswer(projectDir, input.questionId, input.text, input.assumed === true);
  return true;
}

async function reviseStoredAnswer(
  projectDir: string,
  questionId: string,
  text: string,
  assumed: boolean,
): Promise<void> {
  const file = path.join(projectDir, ".hitchhiker", "interview.json");
  await withStateLock(projectDir, async () => {
    const raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new InterviewError("corrupt-answers", "interview.json is not valid JSON.");
    }
    const next = replaceLatestAnswer(parsed, questionId, text, assumed);
    if (next === null) {
      throw new InterviewError("command", "That question is no longer on the desk.");
    }
    await replaceViaTemp(file, next);
  });
}

function replaceLatestAnswer(
  parsed: unknown,
  questionId: string,
  text: string,
  assumed: boolean,
): string | null {
  const status = assumed ? "SUGGESTED" : "ANSWERED";
  if (Array.isArray(parsed)) {
    const index = lastAnswerIndex(parsed, questionId);
    if (index < 0) return null;
    const copy = parsed.slice();
    const item = copy[index];
    if (!isRecord(item)) return null;
    copy[index] = { ...item, status, value: text };
    return `${JSON.stringify(copy, null, 2)}\n`;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.answers)) return null;
  const index = lastAnswerIndex(parsed.answers, questionId);
  if (index < 0) return null;
  const item = parsed.answers[index];
  if (!isRecord(item)) return null;
  const answers = parsed.answers.slice();
  answers[index] = { ...item, status, value: text };
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

async function deliverHtml(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  html: string,
  projectDir: string,
  token: string,
  first: boolean,
  headers?: Record<string, string>,
): Promise<void> {
  const chrome = await projectChrome(projectDir, token, first);
  sendHtml(req, res, status, applyProjectChrome(html, chrome), headers);
}

function sendHtml(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  html: string,
  headers?: Record<string, string>,
): void {
  sendBytes(req, res, status, "text/html; charset=utf-8", Buffer.from(applyIdentityHead(html, req)), headers);
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

/**
 * Icon SVGs carry a small style block for light and dark.
 * The desk CSP blocks inline style, so the hash of that block is the only exception.
 */
function svgStylePolicy(type: string, body: Buffer): Record<string, string> {
  if (type !== "image/svg+xml") return {};
  const style = /<style>([\s\S]*?)<\/style>/.exec(body.toString("utf8"))?.[1];
  if (style === undefined) return {};
  const hash = createHash("sha256").update(style, "utf8").digest("base64");
  return {
    "content-security-policy": `default-src 'none'; script-src 'none'; style-src 'sha256-${hash}'; base-uri 'none'`,
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
