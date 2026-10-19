/**
 * Hero film slots and the opt-in sound control.
 * Decorative video stays silent. Sound never starts by itself.
 */

import type { ArtDirection } from "./art-direction.ts";

export const FILM_CREDIT = "Concept video, generated with Grok Imagine";

export function artCallsForFilm(brief: string, art: Pick<ArtDirection, "signatureHero" | "scroll" | "motionCharacter" | "motion">): boolean {
  const text = [brief, art.signatureHero, art.scroll, art.motionCharacter, art.motion.techniques.join(" ")].join("\n");
  return /hero film|scroll film|scroll-scrubbed video|image sequence/i.test(text);
}

export function filmVideoSlot(art: Pick<ArtDirection, "light" | "motion">, brief: string): {
  id: string;
  kind: "video";
  model: string;
  prompt: string;
  aspect: string;
  n: number;
  subjectIsReal: false;
  light: string;
  seconds: number;
  resolution: "480p" | "720p";
  generateAudio: false;
} {
  const tight = art.motion.performanceCost === "high";
  const loop = /pinned last frame|\bloop\b/i.test(brief);
  return {
    id: "hero-film",
    kind: "video",
    model: loop ? "grok-imagine-video-1.5" : "grok-imagine-video-1.5-lite",
    prompt: "A silent concept film from the approved hero still. No real person, place, product, or listing. No spoken audio.",
    aspect: "16:9",
    n: 1,
    subjectIsReal: false,
    light: art.light,
    seconds: tight ? 6 : 8,
    resolution: tight ? "480p" : "720p",
    generateAudio: false,
  };
}

export function filmVideoMarkup(src: string, poster: string): string {
  return [
    `<video autoplay muted loop playsinline poster="${poster}" data-film="hero">`,
    `  <source src="${src}" type="video/mp4" />`,
    "</video>",
    `<p>${FILM_CREDIT}</p>`,
    "<script>",
    "(() => {",
    "  const video = document.querySelector('[data-film=\"hero\"]');",
    "  if (video === null) return;",
    "  const quiet = window.matchMedia('(prefers-reduced-motion: reduce)').matches;",
    "  const phone = window.matchMedia('(max-width: 767px)').matches;",
    "  if (quiet || phone) { video.removeAttribute('autoplay'); video.pause(); return; }",
    "  const played = video.play();",
    "  if (played !== undefined && typeof played.then === 'function') played.then(() => undefined, () => { video.removeAttribute('autoplay'); });",
    "})();",
    "</script>",
  ].join("\n");
}

export function briefOptsIntoSound(text: string): boolean {
  return /\b(ambient sound|sound on|with sound)\b/i.test(text) && !/\bno sound\b|\bsound off\b|\bwithout sound\b/i.test(text);
}

export function ambientSoundMarkup(optIn: boolean): string {
  if (!optIn) return "";
  return [
    '<button type="button" data-ambient-sound="off" aria-pressed="false">Ambient sound, off. This choice is remembered in this browser.</button>',
    "<script>",
    "(() => {",
    "  const button = document.querySelector('[data-ambient-sound]');",
    "  if (button === null) return;",
    "  const key = 'hh-ambient-sound';",
    "  const quiet = window.matchMedia('(prefers-reduced-motion: reduce)').matches;",
    "  const saved = window.localStorage.getItem(key) === 'on' && quiet === false;",
    "  const paint = (on) => {",
    "    button.setAttribute('data-ambient-sound', on ? 'on' : 'off');",
    "    button.setAttribute('aria-pressed', on ? 'true' : 'false');",
    "    button.textContent = on ? 'Ambient sound, on. This choice is remembered in this browser.' : 'Ambient sound, off. This choice is remembered in this browser.';",
    "  };",
    "  paint(saved);",
    "  button.addEventListener('click', () => {",
    "    const AudioContext = window.AudioContext || window.webkitAudioContext;",
    "    const context = button.__audio || (AudioContext ? new AudioContext() : null);",
    "    button.__audio = context;",
    "    if (context === null) { /* the click still records the choice */ } else if (context.state === 'suspended' && typeof context.resume === 'function') context.resume();",
    "    const next = button.getAttribute('data-ambient-sound') === 'on' ? false : true;",
    "    if (quiet && next === false) { paint(false); window.localStorage.setItem(key, 'off'); return; }",
    "    paint(next);",
    "    window.localStorage.setItem(key, next ? 'on' : 'off');",
    "  });",
    "})();",
    "</script>",
  ].join("\n");
}
