/**
 * One tooltip for every control that carries data-tip.
 * Hover, keyboard focus, and a touch hold all open it.
 * Escape dismisses it without moving focus. The pointer can rest on the tip.
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

function place(trigger: HTMLElement, tip: HTMLElement): void {
  const rect = trigger.getBoundingClientRect();
  const margin = 8;
  tip.hidden = false;
  tip.style.maxWidth = `${Math.max(160, Math.min(256, window.innerWidth - margin * 2))}px`;
  const box = tip.getBoundingClientRect();
  let top = rect.bottom + margin;
  if (top + box.height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - box.height - margin);
  }
  let left = rect.left;
  if (left + box.width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - box.width - margin);
  }
  tip.style.top = `${Math.round(top)}px`;
  tip.style.left = `${Math.round(left)}px`;
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
    const active = pair.trigger.ownerDocument.activeElement;
    if (active === pair.trigger) return;
    if (nearBox(pair.trigger) || nearBox(pair.tip)) {
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
    scheduleHide(pair);
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
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-tour]") !== null) return true;
  const voice = doc.querySelector("[data-voice='hold'][aria-pressed='true']");
  if (voice === null) return false;
  return target === voice || voice.contains(target) || target.closest("#hh-card-draft") !== null;
}

const detected = globalThis.document;
if (detected !== undefined && detected.body !== null) mountTooltips(detected);
