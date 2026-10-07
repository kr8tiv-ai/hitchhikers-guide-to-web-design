# Astro starter

A blank Astro site with the D-001 toolkit installed and kept off the blank page. `pnpm build` writes `dist/`.

## Per-effect imports

`src/hh/motion.ts` exports `registerEffect` and `wireLenis`. A page imports one file from `src/hh/effects/` and no others. Lenis runs on `gsap.ticker` and calls `ScrollTrigger.update`. CSS scroll-driven helpers in `src/hh/css-scroll.ts` throw if the page owner is Lenis.

`src/hh/webgl.ts` keeps one WebGL2 context. Three and OGL both use it. The loop pauses off-screen. A poster shows on a narrow or low-power device.

`src/hh/effects/theatre.ts` loads `@theatre/core` only, from `public/theatre/home.json`. Do not add `@theatre/studio`.

`src/hh/Reveal.tsx` is the Motion island. Add it with a client directive when a page needs it. The blank page does not.

## Scripts

- `pnpm optimize-media -- --image photo.png --video reel.mov --out public/media`
- `pnpm fetch-assets -- --credits src/data/credits.json --out public/media`

If ffmpeg is missing, video encoding is skipped and the script says so.

## Checks

`tests/qa.spec.ts` is Playwright. It watches console errors, failed requests, screenshots at 375, 768, and 1440, and reduced motion. Set `HH_QA_BASE` to the preview. Install `@playwright/test@1.63.0` (Apache-2.0) to run it. That package is not part of the blank page.

## Recipes

Feature recipes live in the Guide at `packages/templates/recipes/`. `scaffold()` copies the ones a site asks for. Env names are documented there. Values stay out of the repo.
