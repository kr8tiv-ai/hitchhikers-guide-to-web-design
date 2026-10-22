/**
 * Before and after cards. Approve and reject post to this desk only.
 * The server records the yes. This file does not apply a pick.
 * Importing this module from Node does nothing: there is no document.
 */

import { bindApproveDeck, type ApproveRoot } from "../brand/approve-cards.ts";

const SAVE_FAILED = "That pick did not save. Try again.";

interface PickElement extends ApproveRoot {
  textContent: string | null;
  hidden?: boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): PickElement | null;
}

interface PickDocument {
  querySelector(selector: string): PickElement | null;
}

export interface PickEnv {
  document: PickDocument;
  fetch: typeof fetch;
}

export function mountPickCards(env: PickEnv): () => void {
  const root = env.document.querySelector("[data-pick-deck]");
  if (root === null) return () => undefined;
  const token = readToken(env.document);
  return bindApproveDeck(
    root,
    [],
    (itemId, status) => {
      void sendDecision(env, token, itemId, status);
    },
    { preserve: true },
  );
}

async function sendDecision(
  env: PickEnv,
  token: string | null,
  itemId: string,
  decision: "approved" | "rejected",
): Promise<void> {
  if (token === null) {
    setNote(env.document, "The desk refused this request. Reload the page.");
    return;
  }
  let response: Response;
  try {
    response = await env.fetch("/api/approve/picks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hh-csrf": token,
      },
      body: JSON.stringify({ id: itemId, decision }),
    });
  } catch {
    setNote(env.document, SAVE_FAILED);
    return;
  }
  if (!response.ok) {
    setNote(env.document, await readError(response));
    return;
  }
  mark(env.document, itemId, decision);
  setNote(env.document, "");
}

function mark(document: PickDocument, itemId: string, decision: "approved" | "rejected"): void {
  const card = document.querySelector(`[data-item-id="${cssEscape(itemId)}"]`);
  if (card === null) return;
  card.setAttribute("data-status", decision);
  const label = card.querySelector("[data-status-label]");
  if (label === null) return;
  label.setAttribute("data-status-label", decision);
  label.textContent = decision === "approved" ? "Approved" : "Rejected";
}

async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      const error = (body as { error?: unknown }).error;
      if (typeof error === "string" && error.length > 0 && error.length < 200 && !error.includes("!")) {
        return error;
      }
    }
  } catch {
    // The status line below is enough.
  }
  if (response.status === 403) return "The desk refused this request. Reload the page.";
  if (response.status === 404) return "That pick is not on the desk.";
  return SAVE_FAILED;
}

function setNote(document: PickDocument, message: string): void {
  const note = document.querySelector("[data-pick-note]");
  if (note === null) return;
  note.textContent = message;
  if (message.length === 0) note.setAttribute("hidden", "");
  else note.removeAttribute("hidden");
}

function readToken(document: PickDocument): string | null {
  const meta = document.querySelector('meta[name="hh-csrf"]');
  const token = meta?.getAttribute("content") ?? "";
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}

function cssEscape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function browserEnv(): PickEnv | null {
  const root = globalThis as { document?: PickDocument; fetch?: typeof fetch };
  const document = root.document;
  if (document === undefined || typeof document.querySelector !== "function") return null;
  if (typeof root.fetch !== "function") return null;
  const boundFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
  return { document, fetch: boundFetch };
}

const detected = browserEnv();
if (detected !== null && detected.document.querySelector("[data-pick-deck]") !== null) {
  mountPickCards(detected);
}
