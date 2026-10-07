/**
 * One canvas and one WebGL2 context per page.
 * Three.js and OGL both call getContext. A second canvas throws.
 * The loop pauses off-screen. Low-power devices keep a poster.
 */

export interface PowerSignals {
  reducedMotion: boolean;
  viewportWidth: number;
  saveData: boolean;
  cores: number;
}

let activeId: string | null = null;
let activeGl: WebGL2RenderingContext | null = null;

export function claimCanvas(current: string | null, next: string): string {
  if (next.length === 0) throw new Error("Canvas id is empty.");
  if (current !== null && current !== next) throw new Error("one context per page");
  return next;
}

export function resetSharedContext(): void {
  activeId = null;
  activeGl = null;
}

export function activeCanvasId(): string | null {
  return activeId;
}

export function shouldUsePoster(signals: PowerSignals): boolean {
  return signals.reducedMotion || signals.viewportWidth <= 430 || signals.saveData || signals.cores <= 4;
}

export function pauseCommand(isIntersecting: boolean): "pause" | "resume" {
  return isIntersecting ? "resume" : "pause";
}

interface NetworkInformationLike {
  saveData?: boolean;
}

function readSaveData(): boolean {
  if (typeof navigator === "undefined") return false;
  const candidate = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return candidate?.saveData === true;
}

export function readPowerSignals(): PowerSignals {
  const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const cores = typeof navigator === "undefined" ? 8 : navigator.hardwareConcurrency;
  return {
    reducedMotion,
    viewportWidth,
    saveData: readSaveData(),
    cores: typeof cores === "number" && cores > 0 ? cores : 8,
  };
}

export function getContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const id = canvas.id.length > 0 ? canvas.id : "hh-canvas";
  if (canvas.id.length === 0) canvas.id = id;
  const claimed = claimCanvas(activeId, id);
  if (activeGl !== null && activeId === claimed) return activeGl;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    powerPreference: "high-performance",
  });
  if (gl === null) throw new Error("WebGL2 is unavailable");
  activeId = claimed;
  activeGl = gl;
  return gl;
}

export function pauseOffscreen(target: Element, onChange: (state: "pause" | "resume") => void): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {};
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (entry === undefined) return;
    onChange(pauseCommand(entry.isIntersecting));
  });
  observer.observe(target);
  return () => {
    observer.disconnect();
  };
}

export function showPoster(host: HTMLElement, label: string): void {
  host.hidden = false;
  if (host.textContent !== label) host.textContent = label;
}
