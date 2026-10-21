/**
 * One tooltip for every control that carries data-tip.
 * Hover, keyboard focus, and a touch hold all open it.
 * Escape dismisses it without moving focus.
 * The tip sits above or beside its control, and flips when that spot is taken.
 * It never covers the answer box or the options. The pointer leaving the
 * control, blur, Escape, and typing in the answer all close it.
 * The tip does not take clicks, so the control under it still activates.
 */

const SHOW_MS = 80;
const HIDE_MS = 200;
const HOLD_MS = 450;
const HOVER_PAD = 12;
let serial = 0;
const pointer = { x: -1, y: -1 };

interface TipPair {
  trigger: HTMLElement;
  tip: HTMLElement;
  showTimer: ReturnType<typeof setTimeout> | null;
  hideTimer: ReturnType<typeof setTimeout> | null;
  holdTimer: ReturnType<typeof setTimeout> | null;
  holding: boolean;
}

const pairs = new Set<TipPair>();

function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
  if (timer !== null) clearTimeout(timer);
}

function hidePair(pair: TipPair): void {
  clearTimer(pair.showTimer);
  clearTimer(pair.hideTimer);
  pair.showTimer = null;
  pair.hideTimer = null;
  pair.tip.hidden = true;
}

function hideAll(): void {
  for (const pair of pairs) hidePair(pair);
}

/** Typing in the answer or the choices closes every tip. The desk already listens for input. */
export function hideOpenTips(): void {
  hideAll();
}

const MARGIN = 8;
const ANSWER = "#hh-card-draft, [data-choices]";

interface Spot {
  top: number;
  left: number;
  preference: number;
}

function obstacleRects(doc: Document): DOMRect[] {
  const rects: DOMRect[] = [];
  doc.querySelectorAll(ANSWER).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    rects.push(rect);
  });
  return rects;
}

function hits(spot: Spot, width: number, height: number, obstacles: readonly DOMRect[]): boolean {
  const right = spot.left + width;
  const bottom = spot.top + height;
  for (const obstacle of obstacles) {
    const clear =
      right <= obstacle.left ||
      obstacle.right <= spot.left ||
      bottom <= obstacle.top ||
      obstacle.bottom <= spot.top;
    if (!clear) return true;
  }
  return false;
}

function inView(spot: Spot, width: number, height: number, vw: number, vh: number): boolean {
  return (
    spot.left >= MARGIN &&
    spot.top >= MARGIN &&
    spot.left + width <= vw - MARGIN &&
    spot.top + height <= vh - MARGIN
  );
}

function place(trigger: HTMLElement, tip: HTMLElement): void {
  const rect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (rect.width <= 0 || rect.height <= 0 || rect.bottom < MARGIN || rect.top > vh - MARGIN) {
    tip.hidden = true;
    return;
  }
  tip.hidden = false;
  tip.style.maxWidth = `${Math.max(160, Math.min(256, vw - MARGIN * 2))}px`;
  const box = tip.getBoundingClientRect();
  const width = box.width;
  const height = box.height;
  const obstacles = obstacleRects(trigger.ownerDocument);
  const clampLeft = (left: number): number => Math.max(MARGIN, Math.min(left, vw - width - MARGIN));
  const spots: Spot[] = [
    { top: rect.top - height - MARGIN, left: clampLeft(rect.left), preference: 0 },
    { top: rect.top - height - MARGIN, left: clampLeft(rect.right - width), preference: 0 },
    { top: rect.top, left: rect.right + MARGIN, preference: 1 },
    { top: rect.bottom - height, left: rect.right + MARGIN, preference: 1 },
    { top: rect.top, left: rect.left - width - MARGIN, preference: 1 },
    { top: rect.bottom - height, left: rect.left - width - MARGIN, preference: 1 },
    { top: rect.bottom + MARGIN, left: clampLeft(rect.left), preference: 2 },
    { top: rect.bottom + MARGIN, left: clampLeft(rect.right - width), preference: 2 },
  ];
  for (const obstacle of obstacles) {
    spots.push({ top: obstacle.top - height - MARGIN, left: clampLeft(rect.left), preference: 3 });
  }
  let best: Spot | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const spot of spots) {
    let score = spot.preference;
    if (!inView(spot, width, height, vw, vh)) score += 10_000;
    if (hits(spot, width, height, obstacles)) score += 20_000;
    if (score < bestScore) {
      best = spot;
      bestScore = score;
    }
  }
  if (best === null || bestScore >= 10_000) {
    tip.hidden = true;
    return;
  }
  tip.style.top = `${Math.round(best.top)}px`;
  tip.style.left = `${Math.round(best.left)}px`;
}

function coversAnswer(doc: Document): boolean {
  const nodes = doc.querySelectorAll(ANSWER);
  for (const node of nodes) {
    if (node instanceof HTMLElement && nearBox(node)) return true;
  }
  return false;
}

function showPair(pair: TipPair): void {
  clearTimer(pair.hideTimer);
  pair.hideTimer = null;
  for (const other of pairs) {
    if (other !== pair) hidePair(other);
  }
  place(pair.trigger, pair.tip);
}

function scheduleShow(pair: TipPair): void {
  clearTimer(pair.showTimer);
  pair.showTimer = setTimeout(() => {
    pair.showTimer = null;
    showPair(pair);
  }, SHOW_MS);
}

function nearBox(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return (
    pointer.x >= rect.left - HOVER_PAD &&
    pointer.x <= rect.right + HOVER_PAD &&
    pointer.y >= rect.top - HOVER_PAD &&
    pointer.y <= rect.bottom + HOVER_PAD
  );
}

function scheduleHide(pair: TipPair): void {
  clearTimer(pair.hideTimer);
  pair.hideTimer = setTimeout(() => {
    pair.hideTimer = null;
    if (coversAnswer(pair.trigger.ownerDocument)) {
      pair.tip.hidden = true;
      return;
    }
    if (nearBox(pair.trigger)) {
      scheduleHide(pair);
      return;
    }
    pair.tip.hidden = true;
  }, HIDE_MS);
}

function describedBy(trigger: HTMLElement, id: string): void {
  const current = trigger.getAttribute("aria-describedby") ?? "";
  const parts = current.split(/\s+/).filter((part) => part.length > 0 && part !== id);
  parts.push(id);
  trigger.setAttribute("aria-describedby", parts.join(" "));
}

function bind(doc: Document, trigger: HTMLElement): void {
  if (trigger.getAttribute("data-tip-id") !== null) return;
  const text = (trigger.getAttribute("data-tip") ?? "").trim();
  if (text.length === 0) return;
  serial += 1;
  const id = `hh-tip-${serial}`;
  const tipId = `hh-tip-for-${serial}`;
  trigger.setAttribute("data-tip-id", tipId);
  const tip = doc.createElement("span");
  tip.id = id;
  tip.className = "hh-tip";
  tip.setAttribute("role", "tooltip");
  tip.setAttribute("data-for", tipId);
  tip.hidden = true;
  tip.textContent = text;
  const host = doc.querySelector("main") ?? doc.body;
  host.appendChild(tip);
  describedBy(trigger, id);
  const pair: TipPair = {
    trigger,
    tip,
    showTimer: null,
    hideTimer: null,
    holdTimer: null,
    holding: false,
  };
  pairs.add(pair);
  trigger.addEventListener("mouseenter", () => scheduleShow(pair));
  trigger.addEventListener("mouseleave", () => scheduleHide(pair));
  trigger.addEventListener("focusin", () => showPair(pair));
  trigger.addEventListener("focusout", (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && trigger.contains(next)) return;
    hidePair(pair);
  });
  trigger.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    clearTimer(pair.holdTimer);
    pair.holding = false;
    pair.holdTimer = setTimeout(() => {
      pair.holdTimer = null;
      pair.holding = true;
      trigger.setAttribute("data-tip-hold", "1");
      showPair(pair);
    }, HOLD_MS);
  });
  const endHold = (): void => {
    clearTimer(pair.holdTimer);
    pair.holdTimer = null;
  };
  trigger.addEventListener("pointerup", endHold);
  trigger.addEventListener("pointercancel", endHold);
  trigger.addEventListener(
    "click",
    (event) => {
      if (trigger.getAttribute("data-tip-hold") !== "1") return;
      event.preventDefault();
      event.stopPropagation();
      trigger.removeAttribute("data-tip-hold");
      pair.holding = false;
    },
    true,
  );
}

function dropOrphans(doc: Document): void {
  for (const pair of pairs) {
    if (pair.trigger.isConnected) continue;
    clearTimer(pair.showTimer);
    clearTimer(pair.hideTimer);
    clearTimer(pair.holdTimer);
    pair.tip.remove();
    pairs.delete(pair);
  }
  doc.querySelectorAll(".hh-tip").forEach((tip) => {
    const owner = tip.getAttribute("data-for");
    if (owner === null || doc.querySelector(`[data-tip-id="${owner}"]`) === null) tip.remove();
  });
}

function rescan(doc: Document): void {
  dropOrphans(doc);
  doc.querySelectorAll("[data-tip]").forEach((node) => {
    if (node instanceof HTMLElement) bind(doc, node);
  });
  doc.documentElement.setAttribute("data-tips", "ready");
}

function watchKeyboard(doc: Document): void {
  const view = window.visualViewport;
  if (view === null) return;
  const sync = (): void => {
    const inset = Math.max(0, window.innerHeight - view.height - view.offsetTop);
    doc.documentElement.style.setProperty("--hh-keyboard", `${Math.round(inset)}px`);
  };
  view.addEventListener("resize", sync);
  view.addEventListener("scroll", sync);
  sync();
}

export function mountTooltips(doc: Document): void {
  let frame = 0;
  const schedule = (): void => {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      rescan(doc);
    });
  };
  rescan(doc);
  const observer = new MutationObserver(() => schedule());
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-tip"],
  });
  doc.addEventListener(
    "pointermove",
    (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    },
    { passive: true },
  );
  doc.addEventListener(
    "toggle",
    (event) => {
      const dialog = event.target;
      if (!(dialog instanceof HTMLDialogElement) || dialog.open !== true) return;
      for (const pair of pairs) {
        if (!dialog.contains(pair.trigger)) hidePair(pair);
      }
    },
    true,
  );
  const follow = (): void => {
    for (const pair of pairs) {
      if (pair.tip.hidden) continue;
      place(pair.trigger, pair.tip);
    }
  };
  doc.addEventListener("scroll", follow, true);
  window.addEventListener("resize", follow);
  doc.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      const open = doc.querySelector(".hh-tip:not([hidden])");
      if (open === null) return;
      hideAll();
      if (escapeShouldPass(doc, event)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
  watchKeyboard(doc);
}

/** A dialog, the tour, and an active mic already use Escape. Let that key through. */
function escapeShouldPass(doc: Document, event: KeyboardEvent): boolean {
  if (doc.querySelector("dialog[open]") !== null) return true;
  // The splash cue does not use this key. A tip must not swallow it either.
  if (doc.querySelector("[data-splash-cover]") !== null) return true;
  // The tour takes Escape from anywhere while it is open, including the desk behind it.
  if (doc.querySelector("[data-tour]") !== null) return true;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const voice = doc.querySelector("[data-voice='hold'][aria-pressed='true']");
  if (voice === null) return false;
  return target === voice || voice.contains(target) || target.closest("#hh-card-draft") !== null;
}

const detected = globalThis.document;
if (detected !== undefined && detected.body !== null) mountTooltips(detected);
