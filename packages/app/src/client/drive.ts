/**
 * Drive page. Polls the local queue, posts Pause with the CSRF token,
 * and repaints rows, progress, and cost. Importing this module from Node
 * does nothing: there is no document.
 */

import {
  DRIVE_MAX_ROWS,
  costText,
  escalationsHtml,
  isDriveKind,
  isDriveStatus,
  progressHtml,
  queueBodyHtml,
  verdictsHtml,
  watchdogHtml,
} from "../drive-markup.ts";
import type { DriveItem } from "../drive-markup.ts";

const POLL_MS = 3_000;
const ID_PATTERN = /^[a-z0-9-]+$/;

interface DriveElement {
  innerHTML: string;
  textContent: string | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  parentElement: DriveElement | null;
}

interface DriveEvent {
  target: DriveElement | null;
}

interface DriveDocument {
  querySelector(selector: string): DriveElement | null;
  addEventListener(type: string, listener: (event: DriveEvent) => void): void;
  removeEventListener(type: string, listener: (event: DriveEvent) => void): void;
  documentElement: { dataset: { theme?: string } };
}

export interface DriveEnv {
  document: DriveDocument;
  fetch: typeof fetch;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  matchMedia: (query: string) => { matches: boolean };
}

export function parseDriveQueue(value: unknown): DriveItem[] | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  if (value.items.length > DRIVE_MAX_ROWS) return null;
  const items: DriveItem[] = [];
  const seen = new Set<string>();
  for (const entry of value.items) {
    const item = parseItem(entry, seen);
    if (item === null) return null;
    items.push(item);
  }
  return items;
}

export function paintDrive(document: DriveDocument, items: readonly DriveItem[]): void {
  const queue = document.querySelector("#drive-queue-body");
  if (queue !== null) queue.innerHTML = queueBodyHtml(items);
  const progress = document.querySelector("#drive-progress");
  if (progress !== null) progress.innerHTML = progressHtml(items);
  const cost = document.querySelector("[data-cost-line]");
  if (cost !== null) cost.textContent = costText(items);
  const escalations = document.querySelector("#drive-escalations");
  if (escalations !== null) escalations.innerHTML = escalationsHtml(items);
  const verdicts = document.querySelector("#drive-verdicts");
  if (verdicts !== null) verdicts.innerHTML = verdictsHtml(items);
  const watchdog = document.querySelector("#drive-watchdog");
  if (watchdog !== null) watchdog.innerHTML = watchdogHtml(items);
  const pause = document.querySelector("#drive-pause");
  if (pause !== null) {
    if (items.length === 0) pause.setAttribute("aria-disabled", "true");
    else pause.removeAttribute("aria-disabled");
  }
  setNote(document, "");
}

/** Wire the current document. Returns a cleanup, or does nothing outside a browser. */
export function mountDrive(env: DriveEnv): () => void {
  const token = readToken(env.document);
  let generation = 0;
  let pausePending = false;
  paintTheme(env);

  const refresh = async (): Promise<void> => {
    if (pausePending) return;
    const ticket = generation;
    let response: Response;
    try {
      response = await env.fetch("/api/drive", { cache: "no-store" });
    } catch {
      return;
    }
    if (ticket !== generation || pausePending) return;
    if (!response.ok) {
      setNote(env.document, "The queue file could not be read.");
      return;
    }
    const items = await readItems(response);
    if (ticket !== generation || pausePending) return;
    if (items === null) {
      setNote(env.document, "The queue came back in an unknown shape.");
      return;
    }
    paintDrive(env.document, items);
  };

  const onClick = (event: DriveEvent): void => {
    const target = event.target;
    if (target === null) return;
    if (findMarked(target, "data-theme-toggle") !== null) {
      toggleTheme(env);
      return;
    }
    if (findPause(target) === null) return;
    void postPause();
  };

  const postPause = async (): Promise<void> => {
    const button = env.document.querySelector("#drive-pause");
    if (button !== null && button.getAttribute("aria-disabled") === "true") return;
    if (token === null) {
      setNote(env.document, "Reload the page.");
      return;
    }
    if (pausePending) return;
    pausePending = true;
    generation += 1;
    const ticket = generation;
    setNote(env.document, "");
    try {
      const response = await env.fetch("/api/drive/pause", {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "x-hh-csrf": token,
        },
        body: "{}",
      });
      if (ticket !== generation) return;
      const payload = await readPayload(response);
      if (!response.ok) {
        setNote(env.document, pauseFailure(response.status, payload));
        return;
      }
      const items = parseDriveQueue(payload);
      if (items === null) {
        setNote(env.document, "The queue came back in an unknown shape.");
        return;
      }
      paintDrive(env.document, items);
    } catch {
      if (ticket === generation) setNote(env.document, "Pause did not reach the desk.");
    } finally {
      if (ticket === generation) pausePending = false;
    }
  };

  env.document.addEventListener("click", onClick);
  void refresh();
  const timer = env.setInterval(() => {
    void refresh();
  }, POLL_MS);
  return () => {
    generation += 1;
    env.clearInterval(timer);
    env.document.removeEventListener("click", onClick);
  };
}

function parseItem(value: unknown, seen: Set<string>): DriveItem | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  const kind = value.kind;
  const status = value.status;
  if (typeof id !== "string" || !ID_PATTERN.test(id) || seen.has(id)) return null;
  if (typeof kind !== "string" || !isDriveKind(kind)) return null;
  if (typeof status !== "string" || !isDriveStatus(status)) return null;
  seen.add(id);
  return { id, kind, status };
}

function setNote(document: DriveDocument, message: string): void {
  const note = document.querySelector("#drive-pause-note");
  if (note === null) return;
  note.textContent = message;
  if (message.length === 0) note.setAttribute("hidden", "");
  else note.removeAttribute("hidden");
}

function pauseFailure(status: number, payload: unknown): string {
  const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : "";
  if (
    message.length > 0 &&
    message.length < 200 &&
    !message.includes("/") &&
    !message.includes("\\") &&
    !message.includes("!") &&
    !message.includes("<")
  ) {
    return message;
  }
  if (status === 409) return "No queue file is on disk.";
  if (status === 403) return "The desk refused this request. Reload the page.";
  return "Pause did not save.";
}

async function readItems(response: Response): Promise<DriveItem[] | null> {
  const payload = await readPayload(response);
  if (payload === null) return null;
  return parseDriveQueue(payload);
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readToken(document: DriveDocument): string | null {
  const meta = document.querySelector('meta[name="hh-csrf"]');
  const token = meta?.getAttribute("content") ?? "";
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}

function findPause(start: DriveElement): DriveElement | null {
  return findMarked(start, "data-action", "pause");
}

function findMarked(start: DriveElement, attr: string, expected?: string): DriveElement | null {
  let node: DriveElement | null = start;
  const seen = new Set<DriveElement>();
  while (node !== null && !seen.has(node)) {
    seen.add(node);
    const value = node.getAttribute(attr);
    if (value !== null && (expected === undefined || value === expected)) return node;
    node = node.parentElement;
  }
  return null;
}

function isNight(env: DriveEnv): boolean {
  const theme = env.document.documentElement.dataset.theme;
  if (theme === "dark") return true;
  if (theme === "light") return false;
  try {
    return env.matchMedia("(prefers-color-scheme: dark)").matches === true;
  } catch {
    return false;
  }
}

function paintTheme(env: DriveEnv): void {
  const toggle = env.document.querySelector("[data-theme-toggle]");
  if (toggle === null) return;
  toggle.textContent = isNight(env) ? "Day desk" : "Night desk";
}

function toggleTheme(env: DriveEnv): void {
  env.document.documentElement.dataset.theme = isNight(env) ? "light" : "dark";
  paintTheme(env);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `matchMedia` throws Illegal invocation when it is pulled off the window
 * and called as a bare function. Always call it on the host.
 */
export function hostMatchMedia(query: string): { matches: boolean } {
  const media = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  if (typeof media !== "function") return { matches: false };
  return media.call(globalThis, query);
}

function browserEnv(): DriveEnv | null {
  const root = globalThis as {
    document?: DriveDocument;
  };
  const document = root.document;
  if (document === undefined || typeof document.querySelector !== "function") return null;
  if (document.documentElement === undefined) return null;
  if (typeof globalThis.fetch !== "function") return null;
  if (typeof globalThis.setInterval !== "function" || typeof globalThis.clearInterval !== "function") return null;
  const boundFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
  return {
    document,
    fetch: boundFetch,
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (id) => {
      if (typeof id !== "number" && (typeof id !== "object" || id === null)) return;
      globalThis.clearInterval(id as ReturnType<typeof setInterval>);
    },
    matchMedia: hostMatchMedia,
  };
}

const detected = browserEnv();
if (detected !== null) mountDrive(detected);
