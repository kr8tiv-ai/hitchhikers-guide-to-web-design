/**
 * Brand kit page. Approve and Redo post to this desk only.
 * bindApproveDeck stays a callback. The file write is the server's.
 * Importing this module from Node does nothing: there is no document.
 */

import { bindApproveDeck, type ApproveRoot } from "../brand/approve-cards.ts";

const SAVE_FAILED = "The brand file did not save.";

interface BrandElement extends ApproveRoot {
  textContent: string | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): BrandElement | null;
}

interface BrandDocument {
  querySelector(selector: string): BrandElement | null;
}

export interface BrandEnv {
  document: BrandDocument;
  fetch: typeof fetch;
}

export function mountBrand(env: BrandEnv): () => void {
  const root = env.document.querySelector("[data-brand-desk]");
  if (root === null) return () => undefined;
  const token = readToken(env.document);
  return bindApproveDeck(root, [], (itemId, status) => {
    void sendDecision(env, token, itemId, status === "approved" ? "approve" : "redo");
  });
}

async function sendDecision(
  env: BrandEnv,
  token: string | null,
  section: string,
  action: "approve" | "redo",
): Promise<void> {
  if (token === null) {
    setNote(env.document, "Reload the page.");
    return;
  }
  let response: Response;
  try {
    response = await env.fetch("/api/brand", {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-hh-csrf": token,
      },
      body: JSON.stringify({ section, action }),
    });
  } catch {
    setNote(env.document, SAVE_FAILED);
    return;
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    setNote(env.document, failureNote(response.status, payload));
    return;
  }
  const approved = isRecord(payload) && payload.allApproved === true;
  if (approved) setNote(env.document, "Status: approved.");
  else if (action === "redo") setNote(env.document, "That section is cleared. The file is draft.");
  else setNote(env.document, "Saved. The file stays draft until every section is approved.");
}

function failureNote(status: number, payload: unknown): string {
  const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : "";
  if (
    message.length > 0 &&
    message.length < 200 &&
    !message.includes("!") &&
    !message.includes("/") &&
    !message.includes("\\") &&
    !message.includes("<")
  ) {
    return message;
  }
  if (status === 403) return "The desk refused this request. Reload the page.";
  if (status === 400) return "That section is not on the brand file.";
  return SAVE_FAILED;
}

function setNote(document: BrandDocument, message: string): void {
  const note = document.querySelector("[data-brand-note]");
  if (note === null) return;
  note.textContent = message;
  if (message.length === 0) note.setAttribute("hidden", "");
  else note.removeAttribute("hidden");
}

function readToken(document: BrandDocument): string | null {
  const meta = document.querySelector('meta[name="hh-csrf"]');
  const token = meta?.getAttribute("content") ?? "";
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function browserEnv(): BrandEnv | null {
  const root = globalThis as { document?: BrandDocument; fetch?: typeof fetch };
  const document = root.document;
  if (document === undefined || typeof document.querySelector !== "function") return null;
  if (typeof root.fetch !== "function") return null;
  const boundFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
  return { document, fetch: boundFetch };
}

const detected = browserEnv();
if (detected !== null && detected.document.querySelector("[data-brand-desk]") !== null) {
  mountBrand(detected);
}
