/**
 * One canvas and one WebGL2 context per page.
 * The phone keeps the scene. DPR, the post chain, and texture size follow the
 * GPU tier. Width and core count do not select the still.
 * Tier 0 is an art-directed still: reduced motion, no WebGL, a blocklisted
 * renderer, a major performance caveat, or two context losses.
 * Pass a getGPUTier report from @pmndrs/detect-gpu. Self-host benchmarksURL.
 * Do not load the benchmark JSON from unpkg. This file does not import that package.
 */

export const GPU_TIER_SOURCE =
  "Pass a getGPUTier report from @pmndrs/detect-gpu. Self-host benchmarksURL. Do not load the benchmark JSON from unpkg.";

export const DPR_STEP = 0.25;
export const DPR_FLOOR = 1;
export const DPR_MAX_FLIPS = 2;

export type GpuTier = 0 | 1 | 2 | 3;

export type GpuTierType =
  | "BENCHMARK"
  | "FALLBACK"
  | "BENCHMARK_FETCH_FAILED"
  | "BLOCKLISTED"
  | "WEBGL_UNSUPPORTED"
  | "SSR";

export interface GpuTierReport {
  tier: number;
  type: GpuTierType;
  fps?: number;
}

export interface PowerSignals {
  reducedMotion: boolean;
  viewportWidth: number;
  saveData: boolean;
  cores: number;
  webglAvailable?: boolean;
  gpu?: GpuTierReport;
  tierOverride?: GpuTier;
  contextLosses?: number;
  majorPerformanceCaveat?: boolean;
}

export interface BloomPass {
  strength: number;
  radius: number;
  threshold: number;
  halfResolution: boolean;
}

export interface PostChain {
  composer: boolean;
  bloom: BloomPass | null;
  grain: boolean;
  ssao: false;
  grade: boolean;
  antialias: false;
  lod: 0 | 1 | 2;
}

export interface TierSettings {
  tier: GpuTier;
  benchmarkTier: GpuTier;
  dprCap: number;
  post: PostChain;
  instancing: boolean;
  ktx2: { color: "etc1s"; normal: "uastc" } | null;
  meshopt: boolean;
  draco: "after-first-frame" | "off";
  textureScale: number;
  antialias: false;
}

export interface ArtDirectedStill {
  camera: {
    fov: number;
    position: readonly [number, number, number];
    lookAt: readonly [number, number, number];
  };
  grade: { name: string; exposure: number };
  lighting: { key: string };
}

export interface PosterImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface PosterAttributes {
  src: string;
  width: string;
  height: string;
  alt: string;
  fetchpriority: "high";
}

export interface ContextGuard {
  losses: number;
  stopped: boolean;
}

export interface DprMonitor {
  dpr: number;
  cap: number;
  flips: number;
  last: "down" | "up" | "none";
  held: boolean;
}

export interface PauseHost {
  hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export const HERO_POSE: ArtDirectedStill = {
  camera: { fov: 35, position: [0, 0, 4], lookAt: [0, 0, 0] },
  grade: { name: "cool-dark", exposure: 1.1 },
  lighting: { key: "hard-directional" },
};

export const DEFAULT_POSTER: PosterImage = {
  src: "/hero-still.webp",
  width: 1440,
  height: 900,
  alt: "Hero frame with the same camera, cool-dark grade, and hard directional light",
};

const POSE_EPSILON = 1e-6;
const GENERIC_STILL = /blank|placeholder|label|todo|^still\.?$/i;
const DPR_CAP: Record<GpuTier, number> = { 0: 1, 1: 1, 2: 1.5, 3: 2 };

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

export function resolveGpuTier(signals: PowerSignals): GpuTier {
  if (signals.webglAvailable === false) return 0;
  if (signals.majorPerformanceCaveat === true) return 0;
  if ((signals.contextLosses ?? 0) >= 2) return 0;
  const report = signals.gpu;
  if (report !== undefined && deadRenderer(report.type)) return 0;
  if (signals.tierOverride !== undefined) return signals.tierOverride;
  if (report === undefined) return 1;
  return tierFromReport(report);
}

export function shouldUsePoster(signals: PowerSignals): boolean {
  if (signals.reducedMotion) return true;
  return resolveGpuTier(signals) === 0;
}

export function shouldStartLoop(signals: PowerSignals): boolean {
  return !shouldUsePoster(signals);
}

export function tierSettings(signals: PowerSignals): TierSettings {
  const benchmarkTier = resolveGpuTier(signals);
  const tier: GpuTier = signals.reducedMotion
    ? 0
    : signals.saveData && benchmarkTier > 1
      ? 1
      : benchmarkTier;
  const scene = tier >= 1;
  return {
    tier,
    benchmarkTier,
    dprCap: DPR_CAP[tier],
    post: postChain(tier),
    instancing: scene,
    ktx2: scene ? { color: "etc1s", normal: "uastc" } : null,
    meshopt: scene,
    draco: scene ? "after-first-frame" : "off",
    textureScale: signals.saveData ? 0.5 : 1,
    antialias: false,
  };
}

export function capDpr(dprCap: number, devicePixelRatio: number): number {
  const device = positive(devicePixelRatio, 1);
  const cap = dprCap > 0 ? dprCap : 1;
  return Math.min(device, cap);
}

export function createDprMonitor(cap: number, devicePixelRatio: number): DprMonitor {
  const safeCap = cap > 0 ? cap : 1;
  return {
    dpr: Math.min(Math.max(positive(devicePixelRatio, 1), DPR_FLOOR), safeCap),
    cap: safeCap,
    flips: 0,
    last: "none",
    held: false,
  };
}

export function stepDpr(monitor: DprMonitor, declining: boolean): DprMonitor {
  if (monitor.held) return { ...monitor };
  const direction = declining ? "down" : "up";
  let flips = monitor.flips;
  if (monitor.last !== "none" && monitor.last !== direction) {
    flips += 1;
    if (flips >= DPR_MAX_FLIPS) {
      return { ...monitor, flips, last: direction, held: true };
    }
  }
  const next = declining
    ? Math.max(DPR_FLOOR, quantize(monitor.dpr - DPR_STEP))
    : Math.min(monitor.cap, quantize(monitor.dpr + DPR_STEP));
  return { dpr: next, cap: monitor.cap, flips, last: direction, held: false };
}

export function createContextGuard(): ContextGuard {
  return { losses: 0, stopped: false };
}

export function onContextLost(guard: ContextGuard, event: { preventDefault: () => void }): ContextGuard {
  event.preventDefault();
  const losses = guard.losses + 1;
  return { losses, stopped: losses >= 2 };
}

export function onContextRestored(guard: ContextGuard): "rebuild" | "still" {
  if (guard.stopped || guard.losses >= 2) return "still";
  return "rebuild";
}

export function pauseCommand(isIntersecting: boolean, hidden = false): "pause" | "resume" {
  if (hidden || !isIntersecting) return "pause";
  return "resume";
}

export function stillIsArtDirected(still: ArtDirectedStill): boolean {
  if (!Number.isFinite(still.camera.fov) || still.camera.fov <= 0) return false;
  if (!vecFinite(still.camera.position) || !vecFinite(still.camera.lookAt)) return false;
  if (!namedGrade(still.grade.name) || !Number.isFinite(still.grade.exposure)) return false;
  return namedGrade(still.lighting.key);
}

export function posesMatch(scene: ArtDirectedStill, still: ArtDirectedStill, epsilon = POSE_EPSILON): boolean {
  return (
    close(scene.camera.fov, still.camera.fov, epsilon) &&
    vecClose(scene.camera.position, still.camera.position, epsilon) &&
    vecClose(scene.camera.lookAt, still.camera.lookAt, epsilon) &&
    scene.grade.name === still.grade.name &&
    close(scene.grade.exposure, still.grade.exposure, epsilon) &&
    scene.lighting.key === still.lighting.key
  );
}

export function posterAttributes(image: PosterImage): PosterAttributes {
  if (image.src.trim() === "") throw new Error("The poster needs an image.");
  if (!Number.isFinite(image.width) || image.width <= 0 || !Number.isFinite(image.height) || image.height <= 0) {
    throw new Error("The poster needs an explicit width and height.");
  }
  if (!namedGrade(image.alt)) throw new Error("The tier-0 still is not art-directed.");
  return {
    src: image.src,
    width: String(image.width),
    height: String(image.height),
    alt: image.alt.trim(),
    fetchpriority: "high",
  };
}

export function posterImageFrom(host: HTMLElement, fallback: PosterImage = DEFAULT_POSTER): PosterImage {
  const img = host instanceof HTMLImageElement ? host : imageChild(host);
  const src = (img?.getAttribute("src") ?? host.dataset.still ?? fallback.src).trim();
  const width = positive(Number(img?.getAttribute("width") ?? host.dataset.width), fallback.width);
  const height = positive(Number(img?.getAttribute("height") ?? host.dataset.height), fallback.height);
  const alt = (img?.getAttribute("alt") ?? host.dataset.alt ?? fallback.alt).trim();
  return { src: src === "" ? fallback.src : src, width, height, alt: alt === "" ? fallback.alt : alt };
}

export function showArtDirectedStill(
  host: HTMLElement,
  scene: ArtDirectedStill,
  still: ArtDirectedStill,
  image: PosterImage,
): void {
  if (!stillIsArtDirected(scene) || !stillIsArtDirected(still) || !posesMatch(scene, still)) {
    throw new Error("The tier-0 still does not match the scene camera, grade, and lighting.");
  }
  const attrs = posterAttributes(image);
  const img = host instanceof HTMLImageElement ? host : (imageChild(host) ?? host.ownerDocument.createElement("img"));
  img.src = attrs.src;
  img.width = image.width;
  img.height = image.height;
  img.alt = attrs.alt;
  img.setAttribute("fetchpriority", "high");
  if (img.getAttribute("loading") === "lazy") img.removeAttribute("loading");
  if (img !== host && img.parentElement !== host) host.append(img);
  host.hidden = false;
}

export function showPoster(host: HTMLElement, label: string): void {
  if (GENERIC_STILL.test(label.trim())) {
    throw new Error("Use an art-directed still. A label is not a poster.");
  }
  host.hidden = false;
  if (host.textContent !== label) host.textContent = label;
}

export interface OpenedScene {
  mode: "loop";
  gl: WebGL2RenderingContext;
  settings: TierSettings;
}

export function beginScene(
  canvas: HTMLCanvasElement,
  poster: HTMLElement,
  signals: PowerSignals,
): OpenedScene | { mode: "still" } {
  const pose = HERO_POSE;
  const image = posterImageFrom(poster);
  if (!shouldStartLoop(signals)) {
    showArtDirectedStill(poster, pose, pose, image);
    return { mode: "still" };
  }
  try {
    return { mode: "loop", gl: getContext(canvas), settings: tierSettings(signals) };
  } catch {
    showArtDirectedStill(poster, pose, pose, image);
    return { mode: "still" };
  }
}

export function bindContextLoss(
  canvas: HTMLCanvasElement,
  guard: ContextGuard,
  onStill: () => void,
  onRebuild: () => void,
): () => void {
  const lost = (event: Event): void => {
    const next = onContextLost(guard, event);
    guard.losses = next.losses;
    guard.stopped = next.stopped;
    if (next.stopped) onStill();
  };
  const restored = (): void => {
    if (onContextRestored(guard) === "still") onStill();
    else onRebuild();
  };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  return () => {
    canvas.removeEventListener("webglcontextlost", lost);
    canvas.removeEventListener("webglcontextrestored", restored);
  };
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
    failIfMajorPerformanceCaveat: false,
  });
  if (gl === null) throw new Error("WebGL2 is unavailable");
  activeId = claimed;
  activeGl = gl;
  return gl;
}

export function pauseOffscreen(
  target: Element,
  onChange: (state: "pause" | "resume") => void,
  host?: PauseHost,
): () => void {
  let intersecting = true;
  const visibility = host ?? documentHost();
  let hidden = visibility?.hidden === true;
  const emit = (): void => {
    onChange(pauseCommand(intersecting, hidden));
  };
  const stops: Array<() => void> = [];
  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry === undefined) return;
      intersecting = entry.isIntersecting;
      emit();
    });
    observer.observe(target);
    stops.push(() => {
      observer.disconnect();
    });
  }
  if (visibility !== undefined) {
    const onVisibility = (): void => {
      hidden = visibility.hidden;
      emit();
    };
    visibility.addEventListener("visibilitychange", onVisibility);
    stops.push(() => {
      visibility.removeEventListener("visibilitychange", onVisibility);
    });
  }
  return () => {
    for (const stop of stops) stop();
  };
}

function documentHost(): PauseHost | undefined {
  if (typeof document === "undefined") return undefined;
  return {
    get hidden() {
      return document.hidden;
    },
    addEventListener(type, listener) {
      document.addEventListener(type, listener);
    },
    removeEventListener(type, listener) {
      document.removeEventListener(type, listener);
    },
  };
}

function postChain(tier: GpuTier): PostChain {
  if (tier >= 3) {
    return {
      composer: true,
      bloom: { strength: 0.3, radius: 0.4, threshold: 0.85, halfResolution: true },
      grain: true,
      ssao: false,
      grade: true,
      antialias: false,
      lod: 0,
    };
  }
  if (tier === 2) {
    return {
      composer: true,
      bloom: null,
      grain: true,
      ssao: false,
      grade: true,
      antialias: false,
      lod: 1,
    };
  }
  if (tier === 1) {
    return {
      composer: false,
      bloom: null,
      grain: false,
      ssao: false,
      grade: true,
      antialias: false,
      lod: 2,
    };
  }
  return {
    composer: false,
    bloom: null,
    grain: false,
    ssao: false,
    grade: false,
    antialias: false,
    lod: 2,
  };
}

function tierFromReport(report: GpuTierReport): GpuTier {
  if (deadRenderer(report.type)) return 0;
  if (report.fps !== undefined && Number.isFinite(report.fps)) {
    if (report.fps < 15) return 0;
    if (report.fps < 30) return 1;
    if (report.fps < 60) return 2;
    return 3;
  }
  if (report.type === "FALLBACK" || report.type === "BENCHMARK_FETCH_FAILED") return 1;
  return clampTier(report.tier);
}

function deadRenderer(type: GpuTierType): boolean {
  return type === "WEBGL_UNSUPPORTED" || type === "BLOCKLISTED" || type === "SSR";
}

function clampTier(value: number): GpuTier {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 2) return 1;
  if (value < 3) return 2;
  return 3;
}

function namedGrade(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && !GENERIC_STILL.test(trimmed);
}

function imageChild(host: HTMLElement): HTMLImageElement | null {
  const found = host.querySelector("img");
  return found instanceof HTMLImageElement ? found : null;
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function quantize(value: number): number {
  return Math.round(value * 4) / 4;
}

function close(left: number, right: number, epsilon: number): boolean {
  return Math.abs(left - right) <= epsilon;
}

function vecFinite(vec: readonly [number, number, number]): boolean {
  return vec.every((value) => Number.isFinite(value));
}

function vecClose(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
  epsilon: number,
): boolean {
  return left.every((value, index) => {
    const other = right[index];
    return other !== undefined && close(value, other, epsilon);
  });
}
