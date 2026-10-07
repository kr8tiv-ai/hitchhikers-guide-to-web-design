# Vite React world

A blank page and a separate world route. The blank page is static HTML and loads no motion library. The world route is the React entry and mounts the Motion island only.

`pnpm build` writes `dist/`.

## Per-effect imports

`src/hh/motion.ts` exports `registerEffect` and `wireLenis`. Import one file from `src/hh/effects/` on the page that needs it. Lenis uses `gsap.ticker`. CSS scroll-driven helpers do not run on a Lenis page.

`src/hh/webgl.ts` is one WebGL2 context, paused off-screen, with a poster on low-power devices. Theatre loads `@theatre/core` only.

## Scripts

- `pnpm optimize-media -- --image photo.png --video reel.mov --out public/media`
- `pnpm fetch-assets -- --credits src/data/credits.json --out public/media`

If ffmpeg is missing, video encoding is skipped and the script says so.

`tests/qa.spec.ts` checks the blank page: console errors, failed requests, screenshots at 375, 768, and 1440, and reduced motion. Install `@playwright/test@1.63.0` (Apache-2.0) to run it. That package is not part of the blank page.
