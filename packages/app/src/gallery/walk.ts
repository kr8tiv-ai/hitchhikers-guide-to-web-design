/**
 * Gallery walk screen. Renders with the 015 example-site card.
 * The browser half posts verdicts. Importing this file in Node does not bind a document.
 */

export interface GalleryCardModel {
  name: string;
  url: string;
  source: string;
  noted: string;
  award: string;
  shotNote: string | null;
  imageUrl: string | null;
}

export interface GalleryLoveModel {
  url: string;
  name: string;
  why: string;
}

export interface GalleryView {
  phase: "walking" | "narrowing" | "done";
  round: number;
  loves: number;
  fillNote: string | null;
  missingPrompt: string | null;
  nudgeUrl: string | null;
  nudgeMessage: string | null;
  cards: GalleryCardModel[];
  lovesList: GalleryLoveModel[];
  thread: string;
  written: string[];
}

export function galleryStatus(view: GalleryView): string {
  if (view.phase === "done") return "The shortlist is on disk.";
  if (view.phase === "narrowing") {
    return view.loves === 0 ? "Nothing was a love." : "Narrow the loves to a shortlist.";
  }
  return `Round ${view.round}. ${view.loves} loves so far.`;
}

export function renderGalleryBody(view: GalleryView): string {
  const open = `<h1 class="hh-headline">Gallery walk</h1>
<section id="hh-gallery" data-phase="${escapeHtml(view.phase)}" data-loves="${view.loves}" data-round="${view.round}">`;
  if (view.phase === "done") return `${open}\n${renderDone(view)}\n</section>`;
  if (view.phase === "narrowing") return `${open}\n${renderNarrow(view)}\n</section>`;
  return `${open}\n${renderWalking(view)}\n</section>`;
}

function renderWalking(view: GalleryView): string {
  const note =
    view.fillNote === null
      ? ""
      : `<p class="hh-gallery__note">${escapeHtml(view.fillNote)}</p>`;
  const cards = view.cards.map((card, index) => renderCard(card, view, index === 0)).join("\n");
  const empty =
    view.cards.length === 0
      ? `<div class="hh-empty"><h2 class="hh-empty__title">No sites matched</h2><p>The pack has nothing left to show.</p><p class="hh-empty__next">Reload the page, or widen the industry filter.</p></div>`
      : "";
  return `<p class="hh-dek">Four sites at a time, two from Godly and two from Awwwards. Mark each one love, meh, or hate, and say why.</p>
${note}
<p class="hh-gallery__hint">L, M, and H mark the card you are on.</p>
<div class="hh-sites">${cards}</div>
${empty}`;
}

function renderCard(card: GalleryCardModel, view: GalleryView, active: boolean): string {
  const href = safeHref(card.url);
  const link =
    href === null
      ? ""
      : `<a class="hh-btn hh-btn--ghost" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Open site</a>`;
  const nudged = view.nudgeUrl === card.url;
  const nudge =
    nudged && view.nudgeMessage !== null
      ? `<p class="hh-error" data-nudge role="alert">${escapeHtml(view.nudgeMessage)}</p>`
      : `<p class="hh-error" data-nudge role="alert" hidden></p>`;
  const shot =
    card.imageUrl !== null && card.imageUrl.startsWith("/api/gallery/shot")
      ? `<img class="hh-site__img" alt="" src="${escapeHtml(card.imageUrl)}" />`
      : "";
  const shotNote =
    card.shotNote === null ? "" : `<p class="hh-shot-note">${escapeHtml(card.shotNote)}</p>`;
  const award =
    card.award === "none" ? "" : `<p class="hh-kicker">${escapeHtml(card.award)}</p>`;
  const activeClass = active ? " hh-site is-active" : " hh-site";
  const nudgedAttr = nudged ? ' data-nudged="true"' : "";
  return `<article class="${activeClass.trim()}" data-url="${escapeHtml(card.url)}" data-gallery="${escapeHtml(card.source)}" data-placeholder="${card.imageUrl === null ? "true" : "false"}"${nudgedAttr} tabindex="0">
  <div class="hh-site__shot" aria-hidden="true">${shot}<span class="hh-site__mark">${escapeHtml(monogram(card.name))}</span></div>
  <div class="hh-site__body">
    <p class="hh-kicker">${escapeHtml(sourceLabel(card))}</p>
    ${award}
    <h2 class="hh-site__title">${escapeHtml(card.name)}</h2>
    <p class="hh-site__note">${escapeHtml(card.noted)}</p>
    ${shotNote}
    <div class="hh-gallery__tools">${link}</div>
    <div class="hh-site__votes" role="group" aria-label="${escapeHtml(card.name)}">
      <button class="hh-vote" type="button" data-vote="love" aria-pressed="false">Love</button>
      <button class="hh-vote" type="button" data-vote="meh" aria-pressed="false">Meh</button>
      <button class="hh-vote" type="button" data-vote="hate" aria-pressed="false">Hate</button>
    </div>
    <label class="hh-qcard__label" for="${fieldId(card.url)}">Why this one</label>
    <textarea class="hh-qcard__input hh-gallery__why" id="${fieldId(card.url)}" rows="3"></textarea>
    ${nudge}
    <button class="hh-btn hh-btn--primary" type="button" data-keep>Keep this</button>
  </div>
</article>`;
}

function renderNarrow(view: GalleryView): string {
  const prompt =
    view.loves === 0
      ? (view.missingPrompt ?? "None of these were a love. Say what was missing.")
      : view.loves < 3
        ? "There are fewer than three loves, so each one stays."
        : "Pick 3 to 5. The reason you already gave is the part that is kept.";
  const locked = view.loves > 0 && view.loves < 3;
  const cards = view.lovesList
    .map((love) => {
      const checked = locked ? " checked" : "";
      const disabled = locked ? " disabled" : "";
      return `<article class="hh-site">
  <div class="hh-site__shot" aria-hidden="true"><span class="hh-site__mark">${escapeHtml(monogram(love.name))}</span></div>
  <div class="hh-site__body">
    <label class="hh-short__row">
      <input type="checkbox" data-pick value="${escapeHtml(love.url)}"${checked}${disabled} />
      <span>
        <h2 class="hh-site__title">${escapeHtml(love.name)}</h2>
        <p class="hh-site__note">${escapeHtml(love.why)}</p>
      </span>
    </label>
  </div>
</article>`;
    })
    .join("\n");
  const label = view.loves === 0 ? "What was missing" : "Common thread";
  const button = view.loves === 0 ? "Keep that note" : "Write the shortlist";
  return `<p class="hh-dek">${escapeHtml(prompt)}</p>
<div class="hh-sites">${cards}</div>
<label class="hh-qcard__label" for="hh-thread">${label}</label>
<textarea class="hh-qcard__input" id="hh-thread" rows="4">${escapeHtml(view.thread)}</textarea>
<p class="hh-error" data-shortlist-error role="alert" hidden></p>
<button class="hh-btn hh-btn--primary" type="button" data-shortlist>${button}</button>`;
}

function renderDone(view: GalleryView): string {
  const files =
    view.written.length === 0
      ? "<p>The reference folder is ready for the next read.</p>"
      : `<ul class="hh-log">${view.written
          .map((name) => `<li class="hh-turn">${escapeHtml(name)}</li>`)
          .join("")}</ul>`;
  return `<div class="hh-empty">
  <h2 class="hh-empty__title">The shortlist is saved</h2>
  <p>Babel Fish and Deep Thought read the thinking, not a copy of the look.</p>
  <p class="hh-empty__next">The files sit in references on this machine.</p>
</div>
${files}`;
}

function sourceLabel(card: GalleryCardModel): string {
  try {
    const host = new URL(card.url).hostname.toLowerCase();
    if (host === "aura.build" || host.endsWith(".aura.build")) return "aura.build";
  } catch {
    // A broken url still gets the source label below.
  }
  if (card.source === "godly") return "Godly";
  if (card.source === "awwwards") return "Awwwards";
  return "Listed";
}

function monogram(name: string): string {
  const letters = name.replace(/[^A-Za-z0-9]/g, "");
  if (letters.length === 0) return "Hh";
  return letters.slice(0, 2);
}

function fieldId(url: string): string {
  let hash = 0;
  for (let index = 0; index < url.length; index += 1) {
    hash = (hash * 33 + url.charCodeAt(index)) >>> 0;
  }
  return `hh-why-${hash.toString(16)}`;
}

function safeHref(url: string): string | null {
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  if (url.includes(" ") || url.includes('"') || url.includes("<") || url.includes(">")) return null;
  return url;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

interface WalkElement {
  tagName?: string;
  value?: string;
  parentElement: WalkElement | null;
  className?: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): WalkElement | null;
  querySelectorAll(selector: string): WalkList;
  focus?: () => void;
}

interface WalkList {
  length: number;
  forEach(callback: (element: WalkElement) => void): void;
}

interface WalkEvent {
  key?: string;
  target: WalkElement | null;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  preventDefault(): void;
}

interface WalkDocument {
  activeElement: WalkElement | null;
  querySelector(selector: string): WalkElement | null;
  addEventListener(type: string, listener: (event: WalkEvent) => void): void;
}

interface WalkEnv {
  document: WalkDocument;
  fetch: typeof fetch;
  assign: (url: string) => void;
}

const CHOOSE = "Choose love, meh, or hate.";
const SAVE_FAILED = "That mark did not save. Try again.";

function browserEnv(): WalkEnv | null {
  const root = globalThis as {
    document?: WalkDocument;
    fetch?: typeof fetch;
    location?: { assign(url: string): void };
  };
  const document = root.document;
  if (document === undefined || typeof document.querySelector !== "function") return null;
  if (document.querySelector("#hh-gallery") === null) return null;
  const assign = root.location?.assign.bind(root.location);
  if (assign === undefined) return null;
  const boundFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
  return { document, fetch: boundFetch, assign };
}

function mountWalk(env: WalkEnv): void {
  const token = readToken(env.document);
  env.document.addEventListener("click", (event) => {
    const vote = closestAttr(event.target, "data-vote");
    if (vote !== null) {
      const card = cardFrom(event.target);
      const kind = vote.getAttribute("data-vote");
      if (card !== null && (kind === "love" || kind === "meh" || kind === "hate")) choose(card, kind);
      return;
    }
    if (closestAttr(event.target, "data-keep") !== null) {
      const card = cardFrom(event.target);
      if (card !== null) void keep(env, token, card);
      return;
    }
    if (closestAttr(event.target, "data-shortlist") !== null) {
      void writeShortlist(env, token);
    }
  });
  env.document.addEventListener("keydown", (event) => {
    if (event.metaKey === true || event.ctrlKey === true || event.altKey === true) return;
    if (isTyping(event.target)) return;
    const key = event.key?.toLowerCase();
    if (key !== "l" && key !== "m" && key !== "h") return;
    const card = cardFrom(env.document.activeElement) ?? env.document.querySelector(".hh-site.is-active");
    if (card === null) return;
    event.preventDefault();
    choose(card, key === "l" ? "love" : key === "m" ? "meh" : "hate");
  });
}

function choose(card: WalkElement, verdict: string): void {
  card.setAttribute("data-choice", verdict);
  card.querySelectorAll("[data-vote]").forEach((button) => {
    const on = button.getAttribute("data-vote") === verdict;
    button.setAttribute("aria-pressed", on ? "true" : "false");
    const parts = (button.getAttribute("class") ?? "")
      .split(" ")
      .filter((part) => part !== "" && part !== "is-selected");
    if (on) parts.push("is-selected");
    button.setAttribute("class", parts.join(" "));
  });
  if (verdict === "love" || verdict === "hate") card.querySelector("textarea")?.focus?.();
}

async function keep(env: WalkEnv, token: string | null, card: WalkElement): Promise<void> {
  if (token === null) {
    show(card, SAVE_FAILED);
    return;
  }
  const verdict = card.getAttribute("data-choice");
  if (verdict !== "love" && verdict !== "meh" && verdict !== "hate") {
    show(card, CHOOSE);
    return;
  }
  const url = card.getAttribute("data-url") ?? "";
  const why = card.querySelector("textarea")?.value ?? "";
  const allowBlank = card.getAttribute("data-nudged") === "true";
  let payload: unknown;
  try {
    payload = await postJson(
      env,
      token,
      "/api/gallery/verdict",
      allowBlank ? { url, verdict, why, allowBlank: true } : { url, verdict, why },
    );
  } catch {
    show(card, SAVE_FAILED);
    return;
  }
  if (!isRecord(payload)) {
    show(card, SAVE_FAILED);
    return;
  }
  if (payload.nudge === true) {
    card.setAttribute("data-nudged", "true");
    show(card, typeof payload.message === "string" ? payload.message : CHOOSE);
    return;
  }
  if (payload.ok !== true) {
    show(card, typeof payload.error === "string" ? payload.error : SAVE_FAILED);
    return;
  }
  env.assign("/gallery");
}

async function writeShortlist(env: WalkEnv, token: string | null): Promise<void> {
  const slot = env.document.querySelector("[data-shortlist-error]");
  if (token === null) {
    showSlot(slot, SAVE_FAILED);
    return;
  }
  const urls: string[] = [];
  const boxes = env.document.querySelector("#hh-gallery")?.querySelectorAll("[data-pick]");
  boxes?.forEach((box) => {
    const element = box as WalkElement & { checked?: boolean };
    if (element.checked === true) {
      const value = element.getAttribute("value") ?? element.value ?? "";
      if (value !== "") urls.push(value);
    }
  });
  const thread = env.document.querySelector("#hh-thread")?.value ?? "";
  let payload: unknown;
  try {
    payload = await postJson(env, token, "/api/gallery/shortlist", { urls, thread });
  } catch {
    showSlot(slot, SAVE_FAILED);
    return;
  }
  if (!isRecord(payload) || payload.ok !== true) {
    const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : SAVE_FAILED;
    showSlot(slot, message);
    return;
  }
  env.assign("/gallery");
}

async function postJson(env: WalkEnv, token: string, url: string, body: unknown): Promise<unknown> {
  const response = await env.fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-hh-csrf": token,
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

function show(card: WalkElement, message: string): void {
  const slot = card.querySelector("[data-nudge]");
  showSlot(slot, message);
}

function showSlot(slot: WalkElement | null, message: string): void {
  if (slot === null) return;
  slot.removeAttribute("hidden");
  const node = slot as WalkElement & { textContent?: string };
  node.textContent = message;
}

function readToken(document: WalkDocument): string | null {
  const meta = document.querySelector('meta[name="hh-csrf"]');
  const token = meta?.getAttribute("content") ?? "";
  return token.length === 0 ? null : token;
}

function closestAttr(start: WalkElement | null, name: string): WalkElement | null {
  let node = start;
  const seen = new Set<WalkElement>();
  while (node !== null && !seen.has(node)) {
    seen.add(node);
    if (node.getAttribute(name) !== null) return node;
    node = node.parentElement;
  }
  return null;
}

function cardFrom(start: WalkElement | null): WalkElement | null {
  let node = start;
  const seen = new Set<WalkElement>();
  while (node !== null && !seen.has(node)) {
    seen.add(node);
    const className = node.getAttribute("class") ?? "";
    if (className.split(" ").includes("hh-site")) return node;
    node = node.parentElement;
  }
  return null;
}

function isTyping(target: WalkElement | null): boolean {
  const tag = target?.tagName?.toLowerCase() ?? "";
  return tag === "textarea" || tag === "input" || tag === "select";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const detected = browserEnv();
if (detected !== null) mountWalk(detected);
