/**
 * DON'T PANIC splash markup.
 * The default loop is cosmos. `?splash=nebula` (or `cosmos`) overrides it.
 * The rendered `data-splash-loop` is that choice. If the chosen file fails,
 * the client swaps to the other loop.
 */

import { randomBytes } from "node:crypto";

export type SplashLoop = "cosmos" | "nebula";

/** Config value when the URL does not name a loop. */
export const DEFAULT_SPLASH_LOOP: SplashLoop = "cosmos";

interface LoopFiles {
  webm: string;
  mp4: string;
  avif: string;
  webp: string;
}

const FILES: Record<SplashLoop, LoopFiles> = {
  cosmos: {
    webm: "/public/splash/cosmos-720.webm",
    mp4: "/public/splash/cosmos-720.mp4",
    avif: "/public/splash/cosmos-poster.avif",
    webp: "/public/splash/cosmos-poster.webp",
  },
  nebula: {
    webm: "/public/splash/nebula-720.webm",
    mp4: "/public/splash/nebula-720.mp4",
    avif: "/public/splash/nebula-poster.avif",
    webp: "/public/splash/nebula-poster.webp",
  },
};

const CAPTIONS = "/public/splash/captions.vtt";

export function resolveSplashLoop(rawUrl: string): SplashLoop {
  try {
    const value = new URL(rawUrl, "http://localhost").searchParams.get("splash");
    if (value === "nebula" || value === "cosmos") return value;
  } catch {
    return DEFAULT_SPLASH_LOOP;
  }
  return DEFAULT_SPLASH_LOOP;
}

export function otherSplashLoop(loop: SplashLoop): SplashLoop {
  return loop === "cosmos" ? "nebula" : "cosmos";
}

function sources(loop: SplashLoop): string {
  const file = FILES[loop];
  return [
    `<source src="${file.webm}" type="video/webm" media="(max-width: 900px)">`,
    `<source src="${file.webm}" type="video/webm" media="(min-width: 901px)">`,
    `<source src="${file.mp4}" type="video/mp4">`,
  ].join("");
}

export function renderSplash(loop: SplashLoop): string {
  const chosen = FILES[loop];
  const fallback = FILES[otherSplashLoop(loop)];
  return `<section class="hh-splash" data-splash data-splash-loop="${loop}" data-splash-cover aria-labelledby="hh-splash-title">
      <div class="hh-splash__media">
        <picture>
          <source srcset="${chosen.avif}" type="image/avif" media="(min-width: 1100px)">
          <source srcset="${chosen.webp}" type="image/webp">
          <img src="${chosen.webp}" alt="" width="1280" height="720" fetchpriority="high" decoding="sync">
        </picture>
        <video class="hh-splash__video" data-splash-video muted playsinline loop preload="none" data-fallback-webm="${fallback.webm}" data-fallback-mp4="${fallback.mp4}">
          <track kind="captions" src="${CAPTIONS}" srclang="en" label="English">
        </video>
        <template data-splash-sources>${sources(loop)}</template>
      </div>
      <div class="hh-splash__scrim" aria-hidden="true"></div>
      <div class="hh-splash__copy">
        <h1 class="hh-splash__title" id="hh-splash-title"><span>DON'T</span><span>PANIC</span></h1>
        <p class="hh-splash__sub">The Hitchhiker's Guide to Web Design</p>
        <button class="hh-splash__enter" type="button" data-splash-enter>Enter the Guide <span aria-hidden="true">↓</span></button>
      </div>
    </section>`;
}

const DEFERRED_STYLES = new Set([
  "src/design/tokens.css",
  "src/design/type.css",
  "src/design/components.css",
  "src/shell.css",
  "src/card.css",
  "src/motion-previews/motion.css",
]);

/**
 * Stylesheets the hero does not need for its first paint. They stay in a
 * template so the preload scanner does not fetch them before LCP.
 */
function parkStyles(html: string): { html: string; hrefs: string[] } {
  const hrefs: string[] = [];
  const next = html.replace(/<link rel="stylesheet" href="([^"]+)"[^>]*>/g, (full, href: string) => {
    const bare = href.replace(/^\//, "");
    if (!DEFERRED_STYLES.has(bare)) return full;
    hrefs.push(`/${bare}`);
    return "";
  });
  return { html: next, hrefs };
}

/** Module scripts are real files. An unknown type is not preloaded or run. */
export function deferSplashModuleScripts(html: string): string {
  return html.replace(/<script type="module" src="([^"]+)"><\/script>/g, (_full, src: string) => {
    return `<script type="splash-defer" data-src="${src}"></script>`;
  });
}

/** The poster has to be in the first connection wave or simulated mobile queues it behind the stylesheets. */
function posterPreload(loop: SplashLoop): string {
  const file = FILES[loop];
  return [
    `<link rel="preload" as="image" href="${file.avif}" type="image/avif" media="(min-width: 1100px)" fetchpriority="high" />`,
    `<link rel="preload" as="image" href="${file.webp}" type="image/webp" media="(max-width: 1099px)" fetchpriority="high" />`,
  ].join("\n    ");
}

/** Live home only. The static shell and index.html stay without the splash. */
export function applySplash(html: string, loop: SplashLoop): string {
  const splash = renderSplash(loop);
  const preload = `    ${posterPreload(loop)}`;
  let next = html.replace(
    '<a class="hh-skip" href="#transcript">Skip to the transcript</a>',
    `<a class="hh-skip" href="#desk-heading">Skip to the app</a>\n    <a class="hh-skip" href="#transcript">Skip to the transcript</a>\n    ${splash}`,
  );
  next = next.replace(
    '<h1 class="hh-kicker">The Hitchhiker\'s Guide to Web Design</h1>',
    '<h1 class="hh-kicker" id="desk-heading" tabindex="-1">The Hitchhiker\'s Guide to Web Design</h1>',
  );
  next = next.replace('<html lang="en">', '<html lang="en" data-splash-cover>');
  // Font preloads take the first HTTP/1.1 sockets. The poster is the LCP
  // image, so it goes out first and the faces load from the stylesheet.
  next = next.replace(/[ \t]*<link rel="preload" href="\/public\/fonts\/[^"]+" as="font" type="font\/woff2" crossorigin \/>\r?\n/g, "");
  if (next.includes("<head>")) next = next.replace("<head>", `<head>\n${preload}`);
  const parked = parkStyles(next);
  next = parked.html;
  if (!next.includes("splash/splash.css")) {
    next = next.replace("<head>", '<head>\n    <link rel="stylesheet" href="/src/splash/splash.css" />');
  }
  next = deferSplashModuleScripts(next);
  const links = parked.hrefs.map((href) => `<link rel="stylesheet" href="${href}" />`).join("");
  const holdId = randomBytes(8).toString("hex");
  return next.replace(
    "</body>",
    `    <img src="/src/splash/hold?id=${holdId}" alt="" width="1" height="1" hidden data-splash-hold>\n    <template data-splash-deferred>${links}</template>\n    <script type="splash-defer" data-src="/src/splash/boot.js"></script>\n    <script src="/src/splash/gate.js"></script>\n  </body>`,
  );
}
