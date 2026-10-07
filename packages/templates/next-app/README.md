# Next starter

A blank Next.js app with the D-001 toolkit installed and kept off the blank page. `pnpm build` writes a static `out/` folder.

## Lenis on the app router

`src/hh/MotionRoot.tsx` is a client component. Mount it inside a page that chose Lenis. The root layout does not. That keeps Lenis and GSAP out of the blank bundle.

## Per-effect imports

Import one file from `src/hh/effects/`. `wireLenis` in `src/hh/motion.ts` drives `lenis.raf` from `gsap.ticker` and calls `ScrollTrigger.update` on scroll. CSS scroll-driven helpers do not run on a Lenis page.

`src/hh/webgl.ts` is one WebGL2 context, paused off-screen, with a poster on low-power devices. Theatre uses `@theatre/core` only.

`src/hh/Reveal.tsx` is the Motion island. Import it only where that reveal is used.

## Scripts

- `pnpm optimize-media -- --image photo.png --video reel.mov --out public/media`
- `pnpm fetch-assets -- --credits src/data/credits.json --out public/media`

If ffmpeg is missing, video encoding is skipped and the script says so.

`tests/qa.spec.ts` checks console errors, failed requests, screenshots at 375, 768, and 1440, and reduced motion. Install `@playwright/test@1.63.0` (Apache-2.0) to run it. That package is not part of the blank page.
