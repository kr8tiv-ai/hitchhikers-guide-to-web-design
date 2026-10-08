/**
 * Before-we-jump cards for a phase start.
 * Loopback only, same host check as the desk. The question markup is the
 * shared card. Suggest stays on this page and does not call a model.
 */

import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import {
  onPhaseStart,
  savePartial,
  think,
  type BeforeJumpAnswer,
  type BeforeJumpCard,
  type BeforeJumpPhase,
  type Question,
  type ThinkRequest,
  type ThinkResult,
} from "@hitchhiker/engine";
import { escapeHtml, renderCard } from "../card.ts";

const LOOPBACK = "127.0.0.1";
const BODY_LIMIT = 32_768;

const PHASES: readonly { id: string; name: string }[] = [
  { id: "dont-panic", name: "Don't Panic" },
  { id: "babel-fish", name: "Babel Fish" },
  { id: "deep-thought", name: "Deep Thought" },
  { id: "improbability-drive", name: "Improbability Drive" },
  { id: "mostly-harmless", name: "Mostly Harmless" },
  { id: "so-long", name: "So Long and Thanks for All the Fish" },
];

const STYLES: Record<string, string> = {
  "/src/design/tokens.css": "design/tokens.css",
  "/src/design/type.css": "design/type.css",
  "/src/design/components.css": "design/components.css",
  "/src/shell.css": "shell.css",
  "/src/card.css": "card.css",
};

export interface BeforeJumpServer {
  url: string;
  finished: Promise<{ asked: number; written: string[] }>;
  close(): Promise<void>;
}

export interface BeforeJumpServerOptions {
  projectDir: string;
  phase: BeforeJumpPhase;
  think?: typeof think;
}

interface Session {
  phase: BeforeJumpPhase;
  projectDir: string;
  batch: BeforeJumpCard[];
  index: number;
  collected: BeforeJumpAnswer[];
  pending: ((answers: BeforeJumpAnswer[]) => void) | null;
  screen: "loading" | "card" | "settling" | "done" | "error";
  draft: string;
  error: string | null;
  waiters: Array<() => void>;
  busy: boolean;
}

const appSrc = path.resolve(import.meta.dirname, "..");
const cssCache = new Map<string, string>();

async function quietThink<T>(req: ThinkRequest<T>): Promise<ThinkResult<T>> {
  if (req.task !== "before-jump-contradiction") {
    throw new Error("This desk only checks before-jump contradictions.");
  }
  return {
    value: { contradicts: false, section: "" } as T,
    raw: "{}",
    durationMs: 0,
    cassette: "hit",
  };
}

/**
 * Serve the before-we-jump cards for one phase start.
 * The URL is returned after the first card is ready. Close commits answers
 * already given and lets the rest come back on the next start.
 */
export async function startBeforeJumpServer(opts: BeforeJumpServerOptions): Promise<BeforeJumpServer> {
  const session: Session = {
    phase: opts.phase,
    projectDir: path.resolve(opts.projectDir),
    batch: [],
    index: 0,
    collected: [],
    pending: null,
    screen: "loading",
    draft: "",
    error: null,
    waiters: [],
    busy: false,
  };

  let readySettled = false;
  let resolveReady: () => void = () => undefined;
  let rejectReady: (error: unknown) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  function notify(): void {
    const waiting = session.waiters;
    session.waiters = [];
    for (const waiter of waiting) waiter();
  }

  function markReady(): void {
    if (readySettled) return;
    readySettled = true;
    resolveReady();
  }

  function fail(error: unknown): void {
    session.screen = "error";
    if (!readySettled) {
      readySettled = true;
      rejectReady(error);
    }
    notify();
  }

  function ask(cards: BeforeJumpCard[]): Promise<BeforeJumpAnswer[]> {
    session.batch = cards;
    session.index = 0;
    session.collected = [];
    session.draft = "";
    session.error = null;
    session.screen = "card";
    markReady();
    notify();
    return new Promise((resolve) => {
      session.pending = resolve;
    });
  }

  const finished = onPhaseStart(session.phase, session.projectDir, {
    ask,
    think: opts.think ?? quietThink,
  }).then(
    (result) => {
      session.screen = "done";
      notify();
      return result;
    },
    (error: unknown) => {
      fail(error);
      throw error;
    },
  );
  void finished.catch(() => undefined);

  const server = createServer((req, res) => {
    void handle(server, session, req, res);
  });
  server.requestTimeout = 0;
  server.timeout = 0;

  let closing: Promise<void> | null = null;
  async function shutdown(): Promise<void> {
    const resolve = session.pending;
    session.pending = null;
    if (resolve !== null) resolve([...session.collected]);
    await new Promise<void>((resolveClose) => {
      server.close(() => resolveClose());
    });
    await finished.catch(() => undefined);
  }

  function close(): Promise<void> {
    if (closing === null) closing = shutdown();
    return closing;
  }

  try {
    await listen(server);
  } catch (error: unknown) {
    await close();
    throw error;
  }

  try {
    await ready;
  } catch (error: unknown) {
    await close();
    throw error;
  }

  const address = server.address();
  if (address === null || typeof address === "string" || address.address !== LOOPBACK) {
    await close();
    throw new Error("Before we jump did not bind to 127.0.0.1.");
  }

  return {
    url: `http://${LOOPBACK}:${address.port}/`,
    finished,
    close,
  };
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, LOOPBACK, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function handle(server: Server, session: Session, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const address = server.address();
  const port = address !== null && typeof address === "object" ? address.port : 0;
  const host = typeof req.headers.host === "string" ? req.headers.host : undefined;
  if (!checkHost(host, port)) {
    send(res, 421, "text/plain; charset=utf-8", "The desk only answers on localhost.");
    return;
  }

  const url = new URL(req.url ?? "/", `http://${LOOPBACK}`);
  if (req.method === "GET" && url.pathname === "/") {
    send(res, 200, "text/html; charset=utf-8", renderPage(session));
    return;
  }
  if (req.method === "GET" && Object.hasOwn(STYLES, url.pathname)) {
    const rel = STYLES[url.pathname];
    if (rel === undefined || !rel.endsWith(".css")) {
      send(res, 404, "text/plain; charset=utf-8", "This page is not on the desk.");
      return;
    }
    send(res, 200, "text/css; charset=utf-8", readCss(rel));
    return;
  }
  if (req.method === "POST" && url.pathname === "/answer") {
    await postAnswer(session, req, res);
    return;
  }
  send(res, 404, "text/plain; charset=utf-8", "This page is not on the desk.");
}

async function postAnswer(session: Session, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (session.busy || session.screen !== "card" || session.pending === null) {
    send(res, 409, "application/json; charset=utf-8", `${JSON.stringify({ error: "No question is waiting." })}\n`);
    return;
  }
  session.busy = true;
  try {
    const body = await readBody(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body) as unknown;
    } catch {
      send(res, 400, "application/json; charset=utf-8", `${JSON.stringify({ error: "The answer was not JSON." })}\n`);
      return;
    }
    if (typeof parsed !== "object" || parsed === null) {
      send(res, 400, "application/json; charset=utf-8", `${JSON.stringify({ error: "The answer was not JSON." })}\n`);
      return;
    }
    const record = parsed as { action?: unknown; text?: unknown };
    const action = record.action;
    const text = typeof record.text === "string" ? record.text : "";
    if (action !== "answer" && action !== "suggest" && action !== "skip" && action !== "jump") {
      send(res, 400, "application/json; charset=utf-8", `${JSON.stringify({ error: "Unknown action." })}\n`);
      return;
    }
    const card = session.batch[session.index];
    if (card === undefined) {
      send(res, 409, "application/json; charset=utf-8", `${JSON.stringify({ error: "No question is waiting." })}\n`);
      return;
    }
    if (action === "suggest") {
      session.draft = "Name the concrete change.";
      session.error = null;
      send(res, 204, "text/plain; charset=utf-8", "");
      return;
    }
    await applyAction(session, card, action, text);
    await waitForChange(session);
    send(res, 204, "text/plain; charset=utf-8", "");
  } catch {
    send(res, 400, "application/json; charset=utf-8", `${JSON.stringify({ error: "The answer did not save." })}\n`);
  } finally {
    session.busy = false;
  }
}

async function applyAction(
  session: Session,
  card: BeforeJumpCard,
  action: "answer" | "skip" | "jump",
  text: string,
): Promise<void> {
  const typedJump = action === "answer" && text.trim().toLowerCase() === "jump";
  const nextAction = isPureJump(card) || action === "jump" || typedJump ? "jump" : action;
  if (nextAction === "answer" && text.trim() === "") {
    session.error = "Write an answer, skip, or say jump.";
    return;
  }
  const answer: BeforeJumpAnswer = {
    id: card.id,
    action: nextAction,
    text: nextAction === "jump" && text.trim() === "" ? "jump" : text,
    target: card.target,
    field: card.field,
    answerId: card.answerId,
  };
  if (nextAction === "answer") {
    try {
      await savePartial(session.projectDir, session.phase, [answer]);
    } catch {
      session.error = "The answer did not save. Try again, or skip.";
      return;
    }
  }
  session.collected.push(answer);
  session.draft = "";
  session.error = null;
  if (nextAction === "jump" || isPureJump(card)) {
    finishBatch(session);
    return;
  }
  session.index += 1;
  if (session.index >= session.batch.length) finishBatch(session);
}

function finishBatch(session: Session): void {
  const resolve = session.pending;
  session.pending = null;
  session.screen = "settling";
  const answers = [...session.collected];
  if (resolve !== null) resolve(answers);
}

function waitForChange(session: Session): Promise<void> {
  if (session.screen !== "settling") return Promise.resolve();
  return new Promise((resolve) => {
    session.waiters.push(resolve);
  });
}

function isPureJump(card: BeforeJumpCard): boolean {
  return card.id === "jump";
}

function renderPage(session: Session): string {
  const card = session.batch[session.index];
  let main = "";
  let progress = "Reading the open gaps.";
  let status = "Reading the open gaps.";
  if (session.screen === "error") {
    main = `<article class="hh-qcard" aria-labelledby="hh-card-ask">
  <h2 class="hh-qcard__title" id="hh-card-ask">The questions did not load.</h2>
  <p class="hh-qcard__why">Start the phase again.</p>
</article>`;
    progress = "Start the phase again.";
    status = "The questions did not load.";
  } else if (session.screen === "done") {
    main = `<article class="hh-qcard" data-done="true" aria-labelledby="hh-card-ask">
  <h2 class="hh-qcard__title" id="hh-card-ask">The phase can start.</h2>
  <p class="hh-qcard__why">The open gaps are written down.</p>
</article>`;
    progress = "The phase can start.";
    status = "The phase can start.";
  } else if (session.screen === "card" && card !== undefined && isPureJump(card)) {
    main = renderJump(card);
    progress = "Nothing is open.";
    status = "No gap is open. This phase can start.";
  } else if (session.screen === "card" && card !== undefined) {
    main = renderQuestion(card, session.draft, session.error);
    progress = `Question ${session.index + 1} of ${session.batch.length}`;
    status = "Answers land in the files that own them.";
  } else {
    main = `<article class="hh-qcard" aria-labelledby="hh-card-ask">
  <h2 class="hh-qcard__title" id="hh-card-ask">Reading the open gaps.</h2>
  <p class="hh-qcard__why">The list comes from the files already in this project.</p>
</article>`;
  }

  const phaseName = PHASES.find((item) => item.id === session.phase)?.name ?? session.phase;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Before we jump</title>
    <link rel="stylesheet" href="/src/design/tokens.css" />
    <link rel="stylesheet" href="/src/design/type.css" />
    <link rel="stylesheet" href="/src/design/components.css" />
    <link rel="stylesheet" href="/src/shell.css" />
    <link rel="stylesheet" href="/src/card.css" />
  </head>
  <body data-before-jump="true" data-phase="${escapeHtml(session.phase)}">
    <a class="hh-skip" href="#main">Skip to the question</a>
    <div class="hh-shell">
      <header class="hh-mast">
        <div class="hh-mast__row">
          <p class="hh-kicker">Before we jump</p>
          <p class="hh-kicker">${escapeHtml(phaseName)}</p>
        </div>
        <div class="hh-wordmark" role="img" aria-label="Don't Panic"></div>
        <p class="hh-dek">Anything to add before we jump?</p>
      </header>
      <div class="hh-columns">
        <main id="main" class="hh-read" data-index="${session.index}">
          <p class="hh-kicker" id="hh-card-progress">${escapeHtml(progress)}</p>
          ${main}
        </main>
        ${phaseMap(session.phase)}
      </div>
      <footer class="hh-status"><span>${escapeHtml(status)}</span></footer>
    </div>
    <script>${PAGE_SCRIPT}</script>
  </body>
</html>
`;
}

function renderJump(card: BeforeJumpCard): string {
  return `<article class="hh-qcard" data-jump="true" aria-labelledby="hh-card-ask">
  <h2 class="hh-qcard__title" id="hh-card-ask">${escapeHtml(card.ask)}</h2>
  <p class="hh-qcard__why">${escapeHtml(card.why)}</p>
  <div class="hh-qcard__actions">
    <button class="hh-btn hh-btn--primary" type="button" data-action="jump">Jump</button>
  </div>
</article>`;
}

function renderQuestion(card: BeforeJumpCard, draft: string, error: string | null): string {
  const question: Question = {
    id: card.id,
    module: "before-jump",
    depth: ["standard"],
    ask: card.ask,
    why: card.why,
    input: ["text"],
    skipDefault: "Skip",
    writes: card.answerId === null ? [] : [`before-jump#${card.answerId}`],
  };
  return renderCard({
    question,
    draft,
    pushback: null,
    error,
    done: false,
    pending: false,
  });
}

function phaseMap(current: string): string {
  const items = PHASES.map((item, index) => {
    const on = item.id === current;
    const marker = on ? " hh-map__item--current" : "";
    const currentAttr = on ? ' aria-current="step"' : "";
    const number = String(index + 1).padStart(2, "0");
    return `<li class="hh-map__item${marker}"${currentAttr}>
      <span class="hh-map__index">${number}</span>
      <span class="hh-map__name">${escapeHtml(item.name)}</span>
      <span class="hh-map__note">${on ? "Before we jump" : "Phase"}</span>
    </li>`;
  });
  return `<nav aria-label="Phases"><ol class="hh-map">${items.join("")}</ol></nav>`;
}

const PAGE_SCRIPT = `
(function () {
  var draft = document.querySelector("#hh-card-draft");
  var answer = document.querySelector("[data-action='answer']");
  var sending = false;
  function sync() {
    if (!draft || !answer) return;
    answer.disabled = draft.value.trim() === "";
  }
  if (draft) draft.addEventListener("input", sync);
  sync();
  var root = document.querySelector("[data-before-jump='true']");
  if (!root) return;
  root.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var button = target.closest("[data-action]");
    if (!button) return;
    var action = button.getAttribute("data-action");
    if (action === "suggest") {
      if (draft) {
        draft.value = "Name the concrete change.";
        sync();
      }
      return;
    }
    var text = draft ? draft.value : "";
    if (action === "answer" && text.trim().toLowerCase() === "jump") action = "jump";
    send(action, text);
  });
  function send(action, text) {
    if (sending || !action) return;
    sending = true;
    fetch("/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: action, text: text })
    }).then(function () {
      location.replace("/");
    });
  }
})();
`;

function readCss(rel: string): string {
  const cached = cssCache.get(rel);
  if (cached !== undefined) return cached;
  const file = path.resolve(appSrc, rel);
  const root = appSrc.endsWith(path.sep) ? appSrc : `${appSrc}${path.sep}`;
  if (file !== appSrc && !file.startsWith(root)) {
    throw new Error("CSS path left the app source tree.");
  }
  const css = readFileSync(file, "utf8");
  cssCache.set(rel, css);
  return css;
}

function checkHost(hostHeader: string | undefined, port: number): boolean {
  if (hostHeader === undefined) return false;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  const host = hostHeader.trim().toLowerCase();
  if (host.length === 0 || host.includes(",") || host.includes(" ") || host.includes("\t")) return false;
  return host === `${LOOPBACK}:${port}` || host === `localhost:${port}`;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  if (res.headersSent) return;
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}
