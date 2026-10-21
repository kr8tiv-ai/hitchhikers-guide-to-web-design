/**
 * Splash behaviour after first paint. Three.js loads on idle, and only when
 * the gate left the video allowed to play. The scroll cue and the skip link
 * both land focus on the first app heading.
 */

import type { SplashHandle } from "./scene.ts";

const root = document.querySelector("[data-splash]");
if (root instanceof HTMLElement) bootSplash(root);

function bootSplash(splash: HTMLElement): void {
  splash.setAttribute("data-splash-booted", "");
  const enter = splash.querySelector("[data-splash-enter]");
  if (enter instanceof HTMLButtonElement) enter.addEventListener("click", onEnter);
  const skip = document.querySelector('a.hh-skip[href="#desk-heading"]');
  if (skip instanceof HTMLAnchorElement) {
    // Capture so preventDefault runs before the link follows the hash.
    // The fragment scroll would otherwise fight the heading landing.
    skip.addEventListener("click", onEnter, true);
    // Enter and Space only, and only while the splash still covers the page.
    // Escape belongs to the tour. Do not stop the event.
    skip.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      onEnter(event);
    }, true);
  }

  const video = splash.querySelector("[data-splash-video]");
  if (video instanceof HTMLVideoElement) video.addEventListener("error", () => swapLoop(video));

  let offscreen = false;
  let scene: SplashHandle | null = null;
  let sceneStarted = false;

  function paused(): boolean {
    return document.hidden || offscreen;
  }

  function sync(): void {
    const hold = paused();
    if (video instanceof HTMLVideoElement && splash.getAttribute("data-splash-still") === null) {
      if (hold) video.pause();
      else {
        const pending = video.play();
        if (pending !== undefined) pending.catch(() => undefined);
      }
    }
    if (scene === null) return;
    if (hold) scene.stop();
    else scene.start();
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      offscreen = entry === undefined || entry.intersectionRatio < 0.12;
      if (offscreen) clearCover(splash);
      sync();
    },
    { threshold: [0, 0.12, 0.4] },
  );
  observer.observe(splash);
  document.addEventListener("visibilitychange", sync);

  if (splash.getAttribute("data-splash-still") !== null) return;

  const start = (): void => {
    if (sceneStarted) return;
    sceneStarted = true;
    void import("./scene.ts").then(async (mod) => {
      const handle = await mod.mountSplashScene(mediaOf(splash), {
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        reducedData: window.matchMedia("(prefers-reduced-data: reduce)").matches,
        saveData: saveDataOn(),
        width: window.innerWidth,
        devicePixelRatio: window.devicePixelRatio || 1,
      });
      if (handle === null) {
        splash.setAttribute("data-splash-gl-error", "no context");
        return;
      }
      scene = handle;
      sync();
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "scene failed";
      splash.setAttribute("data-splash-gl-error", message);
    });
  };

  const queue = (): void => {
    window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => start(), { timeout: 800 });
      } else {
        start();
      }
    }, 5000);
  };
  if (document.readyState === "complete") queue();
  else window.addEventListener("load", queue, { once: true });
}

function splashCovering(): boolean {
  if (document.documentElement.hasAttribute("data-splash-cover")) return true;
  const splash = document.querySelector("[data-splash]");
  return splash instanceof HTMLElement && splash.hasAttribute("data-splash-cover");
}

/**
 * True while the cue still owns focus. The tour and the rest of the desk do not.
 * A scroll after that must not pull focus back onto the heading.
 */
function landingOwnsFocus(heading: HTMLElement): boolean {
  const active = document.activeElement;
  if (
    active === null ||
    active === heading ||
    active === document.body ||
    active === document.documentElement
  ) {
    return true;
  }
  if (!(active instanceof Element)) return true;
  if (active.closest("[data-splash]") !== null) return true;
  return active.closest("a.hh-skip") !== null;
}

function onEnter(event: Event): void {
  // A second Enter, after the cover is gone, must follow the link and must
  // not lock focus. Stopping the event would swallow keys the tour still needs.
  if (!splashCovering()) return;
  event.preventDefault();
  const splash = document.querySelector("[data-splash]");
  if (splash instanceof HTMLElement) clearCover(splash);
  document.dispatchEvent(new Event("hh-splash-dismissed"));
  const heading = document.getElementById("desk-heading");
  if (!(heading instanceof HTMLElement)) return;
  if (heading.tabIndex < 0) heading.tabIndex = -1;
  // Instant. A smooth scroll of the shell races the skip link's fragment
  // navigation. Chromium then scrolls the focused heading to the nearest
  // edge and, on a headless compositor, the smooth animation never wins
  // back the top band. scrollIntoView honors scroll-margin-top.
  holdHeading(heading);
}

let landing = 0;

function holdHeading(heading: HTMLElement): void {
  const generation = ++landing;
  let snapping = false;
  let stopped = false;

  const owns = (): boolean => generation === landing && !stopped && landingOwnsFocus(heading);

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    document.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("focusin", onFocusIn, true);
  };

  const snap = (): void => {
    if (!owns() || snapping) return;
    snapping = true;
    heading.focus({ preventScroll: true });
    if (document.activeElement === heading) {
      heading.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    }
    snapping = false;
  };

  const onScroll = (): void => {
    // Focus has moved into the app, often the tour. Leave that key target alone.
    if (!owns()) {
      stop();
      return;
    }
    snap();
  };

  const onFocusIn = (): void => {
    if (!owns()) stop();
  };

  // Viewport scroll does not fire on the splash. Drop the listener as soon
  // as focus leaves the cue, and always once the landing burst is over.
  // scrollIntoView dispatches scroll synchronously; snapping blocks re-entry.
  document.addEventListener("scroll", onScroll, true);
  document.addEventListener("focusin", onFocusIn, true);
  snap();
  window.requestAnimationFrame(() => {
    snap();
    window.requestAnimationFrame(snap);
  });
  window.setTimeout(snap, 0);
  window.setTimeout(() => {
    snap();
    stop();
  }, 120);
}

function clearCover(splash: HTMLElement): void {
  document.documentElement.removeAttribute("data-splash-cover");
  splash.removeAttribute("data-splash-cover");
}

function saveDataOn(): boolean {
  const candidate = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return candidate?.saveData === true;
}

function mediaOf(splash: HTMLElement): HTMLElement {
  const media = splash.querySelector(".hh-splash__media");
  return media instanceof HTMLElement ? media : splash;
}

let swapped = false;

function swapLoop(video: HTMLVideoElement): void {
  if (swapped) return;
  swapped = true;
  const webm = video.dataset.fallbackWebm;
  const mp4 = video.dataset.fallbackMp4;
  if (webm === undefined || mp4 === undefined) return;
  for (const source of video.querySelectorAll("source")) source.remove();
  const narrow = document.createElement("source");
  narrow.src = webm;
  narrow.type = "video/webm";
  narrow.media = "(max-width: 900px)";
  const wide = document.createElement("source");
  wide.src = webm;
  wide.type = "video/webm";
  wide.media = "(min-width: 901px)";
  const nextMp4 = document.createElement("source");
  nextMp4.src = mp4;
  nextMp4.type = "video/mp4";
  video.append(narrow, wide, nextMp4);
  video.load();
  const pending = video.play();
  if (pending !== undefined) pending.catch(() => undefined);
}
