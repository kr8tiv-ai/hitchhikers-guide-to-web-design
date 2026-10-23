/**
 * Keyboard for the first-five-minutes plate.
 * Arrows move steps. Escape skips. Reduced motion is CSS, so this file does not animate.
 */

export interface TourKeyEvent {
  key?: string;
  target?: unknown | null;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

export interface TourNode {
  getAttribute?(name: string): string | null;
  setAttribute?(name: string, value: string): void;
  removeAttribute?(name: string): void;
  querySelector?(selector: string): TourNode | null;
  querySelectorAll?(selector: string): TourNode[];
  textContent?: string | null;
  hidden?: boolean;
  focus?: () => void;
  closest?(selector: string): TourNode | null;
  scrollIntoView?(options?: {
    block?: "start" | "center" | "end" | "nearest";
    inline?: "start" | "center" | "end" | "nearest";
    behavior?: "auto" | "smooth";
  }): void;
  requestSubmit?: () => void;
  click?: () => void;
  addEventListener?(type: string, listener: (event: TourClick) => void): void;
  removeEventListener?(type: string, listener: (event: TourClick) => void): void;
}

interface TourClick {
  target?: unknown | null;
}

export interface TourDocument {
  querySelector(selector: string): TourNode | null;
  activeElement?: TourNode | null;
}

interface TourKeyHost {
  addEventListener?(type: string, listener: (event: TourKeyEvent) => void, capture?: boolean): void;
  removeEventListener?(type: string, listener: (event: TourKeyEvent) => void, capture?: boolean): void;
}

const LAST_LABEL = "Done";
const NEXT_LABEL = "Next";

export function mountTour(doc: TourDocument): () => void {
  const tour = doc.querySelector("[data-tour]");
  if (tour === null) return () => undefined;
  const onClick = (event: TourClick): void => {
    const target = event.target;
    if (typeof target !== "object" || target === null) return;
    const node = target as TourNode;
    if (marked(node, "data-tour-next")) {
      moveTour(tour, 1);
      return;
    }
    if (marked(node, "data-tour-back")) moveTour(tour, -1);
  };
  const onKey = (event: TourKeyEvent): void => {
    // Document capture, not the tour plate. Focus may be on the body or the desk behind the plate.
    if ((event.key ?? "") !== "Escape") return;
    if (!handleTourKey(doc, event)) return;
    event.stopPropagation?.();
  };
  const host = doc as TourDocument & TourKeyHost;
  tour.addEventListener?.("click", onClick);
  host.addEventListener?.("keydown", onKey, true);
  return () => {
    tour.removeEventListener?.("click", onClick);
    host.removeEventListener?.("keydown", onKey, true);
  };
}

/**
 * Bring the open tour into view. `nearest` does not move the page when the
 * plate already fits. Callers that must land even if a smooth scroll stalls
 * pass `auto`. Omitted behavior follows prefers-reduced-motion.
 */
export function revealTour(doc: TourDocument, behavior?: "auto" | "smooth"): void {
  const tour = doc.querySelector("[data-tour]");
  if (tour === null || tour.scrollIntoView === undefined) return;
  const motion = behavior ?? (prefersReducedMotion() ? "auto" : "smooth");
  tour.scrollIntoView({ block: "nearest", inline: "nearest", behavior: motion });
}

function prefersReducedMotion(): boolean {
  const media = (globalThis as { matchMedia?: (query: string) => { matches: boolean } }).matchMedia;
  if (typeof media !== "function") return false;
  try {
    return media.call(globalThis, "(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function marked(node: TourNode, name: string): boolean {
  if (node.getAttribute?.(name) !== undefined && node.getAttribute?.(name) !== null) return true;
  const found = node.closest?.(`[${name}]`);
  return found !== null && found !== undefined;
}

/** True when the key was handled. Call before other desk shortcuts. */
export function handleTourKey(doc: TourDocument, event: TourKeyEvent): boolean {
  const tour = doc.querySelector("[data-tour]");
  if (tour === null) return false;
  if (doc.querySelector("dialog[open]") !== null) return false;
  const target = event.target;
  const key = event.key ?? "";
  if (key === "Escape") {
    // Splash still covers the page. 242e/242g own that key. Do not close the tour behind it.
    if (doc.querySelector("[data-splash-cover]") !== null) return false;
    if (isField(target) && insideTour(target, tour)) return false;
    // A listening mic owns Escape, including from the answer box. Skipping here
    // reloads the desk and drops the "Heard you" line.
    if (doc.querySelector("[data-voice='hold'][aria-pressed='true']") !== null) return false;
    // Idle Escape in the answer box leaves the draft. It must not submit Skip tour.
    if (isAnswerDraft(target)) return false;
    event.preventDefault?.();
    submitNamed(tour, "hh-tour-skip");
    return true;
  }
  if (!insideTour(target, tour) && doc.activeElement !== tour) return false;
  if (isField(target)) return false;
  if (key === "ArrowRight" || key === "ArrowDown") {
    event.preventDefault?.();
    moveTour(tour, 1);
    return true;
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    event.preventDefault?.();
    moveTour(tour, -1);
    return true;
  }
  if (key === "Home") {
    event.preventDefault?.();
    showTourIndex(tour, 0);
    return true;
  }
  if (key === "End") {
    event.preventDefault?.();
    const steps = listSteps(tour);
    showTourIndex(tour, Math.max(0, steps.length - 1));
    return true;
  }
  return false;
}

export function moveTour(tour: TourNode, delta: number): number {
  const steps = listSteps(tour);
  if (steps.length === 0) return 0;
  const current = currentIndex(tour, steps);
  const next = current + delta;
  if (next >= steps.length) {
    submitNamed(tour, "hh-tour-done");
    return current;
  }
  return showTourIndex(tour, Math.max(0, next));
}

export function showTourIndex(tour: TourNode, index: number): number {
  const steps = listSteps(tour);
  if (steps.length === 0) return 0;
  const next = Math.max(0, Math.min(steps.length - 1, index));
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step === undefined) continue;
    if (i === next) step.removeAttribute?.("hidden");
    else step.setAttribute?.("hidden", "");
  }
  tour.setAttribute?.("data-step", String(next));
  const count = tour.querySelector?.("[data-tour-count]");
  if (count !== null && count !== undefined) count.textContent = `${next + 1} of ${steps.length}`;
  const button = tour.querySelector?.("[data-tour-next]");
  if (button !== null && button !== undefined) {
    button.textContent = next === steps.length - 1 ? LAST_LABEL : NEXT_LABEL;
  }
  const id = steps[next]?.getAttribute?.("data-tour-step") ?? "";
  markTarget(tour, steps[next]?.getAttribute?.("data-tour-target") ?? "");
  if (id.length > 0) tour.setAttribute?.("data-current", id);
  return next;
}

function listSteps(tour: TourNode): TourNode[] {
  const found = tour.querySelectorAll?.("[data-tour-step]");
  return found === undefined ? [] : [...found];
}

function currentIndex(tour: TourNode, steps: readonly TourNode[]): number {
  const raw = tour.getAttribute?.("data-step") ?? "0";
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return 0;
  return Math.max(0, Math.min(steps.length - 1, parsed));
}

function insideTour(target: unknown, tour: TourNode): boolean {
  if (target === tour) return true;
  if (typeof target !== "object" || target === null || !("closest" in target)) return false;
  const node = target as TourNode;
  return node.closest?.("[data-tour]") === tour;
}

function isField(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  const tag = "tagName" in target ? String((target as { tagName?: string }).tagName ?? "") : "";
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isAnswerDraft(target: unknown): boolean {
  if (typeof target !== "object" || target === null || !("getAttribute" in target)) return false;
  const read = (target as TourNode).getAttribute;
  if (typeof read !== "function") return false;
  return read.call(target, "id") === "hh-card-draft";
}

function submitNamed(tour: TourNode, id: string): void {
  const form = tour.querySelector?.(`#${id}`);
  if (form === null || form === undefined) return;
  if (form.requestSubmit !== undefined) form.requestSubmit();
  else form.click?.();
}

function markTarget(tour: TourNode, name: string): void {
  const root = tour.closest?.("body") ?? tour.closest?.(".hh-shell");
  const scope = root ?? null;
  if (scope?.querySelectorAll === undefined) return;
  const marked = scope.querySelectorAll("[data-tour-current]");
  for (const node of marked) node.removeAttribute?.("data-tour-current");
  if (name.length === 0 || scope.querySelector === undefined) return;
  const hit = scope.querySelector(`[data-tour-spot="${name}"]`);
  hit?.setAttribute?.("data-tour-current", "true");
}
