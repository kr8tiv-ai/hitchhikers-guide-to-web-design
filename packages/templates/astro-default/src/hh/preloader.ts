/**
 * Preloader handoff for a WebGL hero.
 * The poster is already in the document at its final size.
 * The overlay is position fixed and leaves by opacity only.
 * Progress comes from a LoadingManager-shaped counter and fonts.ready.
 * A timer is not progress. Eight seconds only lifts a stuck overlay.
 * On that timeout the poster stays up and the scene may continue.
 * A return visit in the same tab skips the intro.
 * Reduced motion uses an opacity handoff of at most 200 ms and no camera move.
 * Call refresh after fonts and after the overlay lifts so scroll measures update.
 */

export const PRELOADER_TIMEOUT_MS = 8000;
export const PRELOADER_SESSION_KEY = "hh-preloader-seen";
export const HANDOFF_OPACITY_MS = 200;

export interface LoadCounts {
  loaded: number;
  total: number;
  fontsReady: boolean;
}

export interface SessionStore {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface LoadingManagerLike {
  onProgress?: (url: string, loaded: number, total: number) => void;
  onLoad?: () => void;
}

export interface FontReadyLike {
  ready: Promise<unknown>;
}

export interface LiftInput {
  seenThisSession: boolean;
  reducedMotion: boolean;
  fontsReady: boolean;
  firstFrame: boolean;
  elapsedMs: number;
}

export type LiftReason = "seen" | "reduced-motion" | "first-frame" | "timeout";

export type LiftDecision =
  | { lift: false; reason: "wait" }
  | {
      lift: true;
      reason: LiftReason;
      opacityMs: number;
      keepPoster: true;
      cameraMove: boolean;
    };

export interface FrameState {
  posterPresent: boolean;
  posterPainted: boolean;
  posterWidth: number;
  posterHeight: number;
  canvasClearedBeforePoster: boolean;
  overlayLiftedBeforeFirstDraw: boolean;
}

export interface PreloaderOptions {
  reducedMotion: boolean;
  session: SessionStore;
  fonts: FontReadyLike;
  now: () => number;
  refresh: () => void;
  manager?: LoadingManagerLike;
}

export interface PreloaderController {
  progress: () => number;
  decide: (firstFrame: boolean) => LiftDecision;
}

const HANDOFF_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>WebGL handoff</title>
<style>
.hh-preloader { position: fixed; inset: 0; opacity: 1; }
.hh-hero { position: relative; }
.hh-hero canvas { position: absolute; inset: 0; }
</style>
</head>
<body>
<main class="hh-hero">
<img class="hh-poster" src="/hero-still.webp" width="1440" height="900" alt="Art-directed hero still of the same camera, grade, and lighting." fetchpriority="high">
<canvas id="hh-hero"></canvas>
<div class="hh-preloader"></div>
</main>
</body>
</html>
`;

export function handoffDocument(): string {
  return HANDOFF_HTML;
}

export function progressFromLoads(counts: LoadCounts): number {
  if (!Number.isFinite(counts.loaded) || !Number.isFinite(counts.total) || counts.total <= 0) {
    return counts.fontsReady ? 1 : 0;
  }
  const ratio = counts.loaded / counts.total;
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(1, Math.max(0, ratio));
}

export function shouldLiftOverlay(input: LiftInput): LiftDecision {
  if (input.seenThisSession) {
    return { lift: true, reason: "seen", opacityMs: 0, keepPoster: true, cameraMove: false };
  }
  if (input.reducedMotion && input.fontsReady) {
    return {
      lift: true,
      reason: "reduced-motion",
      opacityMs: HANDOFF_OPACITY_MS,
      keepPoster: true,
      cameraMove: false,
    };
  }
  if (input.fontsReady && input.firstFrame) {
    return {
      lift: true,
      reason: "first-frame",
      opacityMs: HANDOFF_OPACITY_MS,
      keepPoster: true,
      cameraMove: false,
    };
  }
  if (input.elapsedMs >= PRELOADER_TIMEOUT_MS) {
    return {
      lift: true,
      reason: "timeout",
      opacityMs: HANDOFF_OPACITY_MS,
      keepPoster: true,
      cameraMove: false,
    };
  }
  return { lift: false, reason: "wait" };
}

export function clsFromOverlay(
  overlay: { position: string },
  poster: { width: number; height: number },
): number {
  if (overlay.position === "fixed" && poster.width > 0 && poster.height > 0) return 0;
  return 0.25;
}

export function firstFrameIsBlank(state: FrameState): boolean {
  if (!state.posterPresent) return true;
  if (!state.posterPainted) return true;
  if (state.posterWidth <= 0 || state.posterHeight <= 0) return true;
  if (state.canvasClearedBeforePoster) return true;
  if (state.overlayLiftedBeforeFirstDraw && !state.posterPainted) return true;
  return false;
}

export function auditHandoffMarkup(html: string): { cls: number; blankFirstFrame: boolean } {
  const posterAt = html.search(/<img\b[^>]*class="[^"]*\bhh-poster\b/);
  const canvasAt = html.search(/<canvas\b/i);
  const posterTag = posterAt >= 0 ? tagAt(html, posterAt) : "";
  const width = Number(/width="(\d+)"/.exec(posterTag)?.[1] ?? "0");
  const height = Number(/height="(\d+)"/.exec(posterTag)?.[1] ?? "0");
  const fetchHigh = /fetchpriority="high"/i.test(posterTag);
  const lazy = /loading="lazy"/i.test(posterTag);
  const posterBeforeCanvas = posterAt >= 0 && (canvasAt < 0 || posterAt < canvasAt);
  const sized = width > 0 && height > 0;
  const overlayFixed = /hh-preloader/.test(html) && /position:\s*fixed/.test(html);
  const cls = overlayFixed && sized ? 0 : 0.25;
  const blankFirstFrame = !posterBeforeCanvas || !sized || !fetchHigh || lazy || !overlayFixed;
  return { cls, blankFirstFrame };
}

export function bindLoadingProgress(
  manager: LoadingManagerLike,
  fonts: FontReadyLike,
  onChange: (progress: number, fontsReady: boolean) => void,
): () => void {
  let loaded = 0;
  let total = 0;
  let fontsReady = false;
  let stopped = false;
  const emit = (): void => {
    if (stopped) return;
    onChange(progressFromLoads({ loaded, total, fontsReady }), fontsReady);
  };
  manager.onProgress = (_url, nextLoaded, nextTotal) => {
    loaded = nextLoaded;
    total = nextTotal;
    emit();
  };
  manager.onLoad = () => {
    if (total > 0) loaded = total;
    emit();
  };
  void fonts.ready.then(() => {
    fontsReady = true;
    emit();
  });
  return () => {
    stopped = true;
  };
}

export function createPreloader(options: PreloaderOptions): PreloaderController {
  const started = options.now();
  let fontsReady = false;
  let refreshedFonts = false;
  let refreshedLift = false;
  let loaded = 0;
  let total = 0;
  void options.fonts.ready.then(() => {
    fontsReady = true;
    if (!refreshedFonts) {
      refreshedFonts = true;
      options.refresh();
    }
  });
  if (options.manager !== undefined) {
    const manager = options.manager;
    bindLoadingProgress(manager, options.fonts, () => {});
    const bound = manager.onProgress;
    manager.onProgress = (url, nextLoaded, nextTotal) => {
      loaded = nextLoaded;
      total = nextTotal;
      bound?.(url, nextLoaded, nextTotal);
    };
  }
  return {
    progress: () => progressFromLoads({ loaded, total, fontsReady }),
    decide: (firstFrame) => {
      const decision = shouldLiftOverlay({
        seenThisSession: options.session.getItem(PRELOADER_SESSION_KEY) === "1",
        reducedMotion: options.reducedMotion,
        fontsReady,
        firstFrame,
        elapsedMs: options.now() - started,
      });
      if (decision.lift) {
        if (options.session.getItem(PRELOADER_SESSION_KEY) !== "1") {
          options.session.setItem(PRELOADER_SESSION_KEY, "1");
        }
        if (!refreshedLift) {
          refreshedLift = true;
          options.refresh();
        }
      }
      return decision;
    },
  };
}

function tagAt(html: string, index: number): string {
  const end = html.indexOf(">", index);
  return end < 0 ? html.slice(index) : html.slice(index, end + 1);
}
