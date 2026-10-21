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

function onEnter(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
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
  const snap = (): void => {
    if (generation !== landing || snapping) return;
    snapping = true;
    heading.focus({ preventScroll: true });
    if (document.activeElement === heading) {
      heading.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    }
    snapping = false;
  };
  const onScroll = (): void => {
    snap();
  };
  // The hash scroll and the keydown focus scroll run after this handler,
  // sometimes a frame later. Correct them until that burst is over.
  // scrollIntoView dispatches scroll synchronously; snapping blocks re-entry.
  document.addEventListener("scroll", onScroll, true);
  snap();
  window.requestAnimationFrame(() => {
    snap();
    window.requestAnimationFrame(snap);
  });
  window.setTimeout(snap, 0);
  window.setTimeout(() => {
    document.removeEventListener("scroll", onScroll, true);
    snap();
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
