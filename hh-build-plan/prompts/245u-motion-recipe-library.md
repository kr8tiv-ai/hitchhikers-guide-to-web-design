---
id: 245u
title: Motion recipe library - typed, tested GSAP/Lenis/Three recipes with designed reduced-motion versions, mapped to style worlds and appetite; prompts compose from recipes, never free-form GSAP
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245d
---

# 245u - Motion recipes as importable, tested modules in packages/design-system/motion, and the pattern-to-style-world map

## Context

245d created `packages/design-system` (`@hitchhiker/design-system`) with token sets per style world and a first set of recipes that pass `checkRecipes` (`packages/qa/src/recipe-check.ts`). Matt wants the winning award-site patterns shipped as a real library so page prompts compose from them and never write free-form GSAP. Sources to read first and encode faithfully: `packages/knowledge/skills/scroll-choreography.md`, `context/research/03-awwwards-anatomy.md`, `context/research/04-motion-taxonomy.md` (motion taxonomy A-H and appetite levels 1-10). Style worlds are `StyleWorld` / `styleWorldFrom` in the engine art-direction code. The stack stays Astro; React/R3F only inside islands where the 3D recipe needs it.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code. If 245d already put recipes under `packages/design-system/src/recipes`, move or re-export them from `packages/design-system/src/motion` (migrate callers, delete nothing that is used).

## Deliverables

1. `packages/design-system/src/motion/` with one module per recipe, each exporting a typed options interface and `create<Recipe>(target, options): MotionHandle` where `MotionHandle { kill(): void; refresh(): void; reduced: boolean }`:
   - `pinnedTimeline`: pin + scrub, `anticipatePin: 1`, `invalidateOnRefresh: true`, labels;
   - `horizontalTrack`: horizontal scroll track, end computed from track width (function-based `end`, invalidated on refresh), `ease: "none"`;
   - `kineticType`: SplitText reveal by `line | word | char`, masked (overflow clip wrapper), reverts the split on kill;
   - `scrollCamera`: scroll-driven 3D object or camera scrub for R3F/Three (camera path as a typed list of keyframes; GSAP drives a plain progress value, the render loop reads it; no second RAF);
   - `preloaderHandoff`: preloader-to-hero timeline that resolves after `document.fonts.ready` and the hero media decode, then hands off to the hero intro;
   - `frameSequence`: canvas frame-sequence scrub with `snap` to whole frames, preloading and a poster frame;
   - `pageTransition`: shared-element or page transitions via the View Transitions API with a GSAP Flip fallback;
   - `batchReveal`: `ScrollTrigger.batch` reveals for repeated cards;
   - `parallaxLayers`: subtle parallax (transform only, capped travel);
   - `snapToLabels`: snap a pinned timeline to its labels;
   - `microInteractions`: custom cursor (desktop and fine pointer only), one magnetic CTA (max one per page, enforced), media hover distortion (transform/opacity or a shader uniform, never layout).
   - shared `motionSetup()`: the one scroll owner: `new Lenis({ autoRaf: false })`, `lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker.add(t => lenis.raf(t * 1000))`, `gsap.ticker.lagSmoothing(0)`, `ScrollTrigger.refresh()` after `document.fonts.ready` and after image loads, all inside `gsap.matchMedia()` with a `(prefers-reduced-motion: reduce)` branch that disables Lenis.
2. Every recipe has a designed reduced-motion version (final state shown statically, or an opacity-only fade under 200ms; never just removed, never left hidden), and cleanup on unmount (`kill()` reverts SplitText, kills its ScrollTriggers and tweens, removes listeners; idempotent; Astro `astro:before-swap` hook helper exported).
3. Pattern-to-style-world map `packages/design-system/src/motion/world-map.ts`: `recipesFor({ world, appetite, taxonomy })` built from the taxonomy A-H and appetite 1-10 in 04-motion-taxonomy.md: immersive 3D worlds (appetite 9-10) get `scrollCamera` (+ `preloaderHandoff`); editorial and scroll-story sites get `pinnedTimeline` / `horizontalTrack` / `snapToLabels`; type-led studios get `kineticType` plus restrained `pageTransition`; low appetite (1-3) gets only `batchReveal`, `parallaxLayers` (subtle) and micro-interactions. Each entry cites the taxonomy letter. Export `signatureRecipeCandidates(world, appetite)` for 245v.
4. The page-prompt generator (245k reads this later) gets a constant `MOTION_COMPOSE_RULE`: "Compose motion only from `@hitchhiker/design-system/motion` recipes; do not write gsap.to/from/timeline or ScrollTrigger.create directly in site code." Add it to `SITE_RULES` now; 245w enforces it.
5. Docs: `packages/design-system/src/motion/README.md` with one usage snippet per recipe and its reduced-motion behaviour.

## Tests

Package tests in `packages/design-system/test/245u-motion-*.test.ts`, failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- each recipe's options type-check (a `tsd`-style compile test or `expectTypeOf`), and each recipe file passes `checkRecipes` with zero findings;
- with a fake gsap/ScrollTrigger/Lenis (jsdom), each recipe registers exactly its triggers, honours reduced motion (final state visible, no ScrollTrigger created, opacity-only allowed), and `kill()` leaves zero triggers, tweens and listeners and is idempotent;
- `motionSetup` creates one Lenis with `autoRaf: false`, adds exactly one ticker callback, calls `lagSmoothing(0)`, and refreshes after fonts and images;
- `horizontalTrack` end recomputes after a width change and refresh; `frameSequence` snaps to whole frames; `microInteractions` refuses a second magnetic CTA and skips the cursor on coarse pointers;
- `recipesFor` maps appetite 9 3d-world to `scrollCamera`, editorial to `pinnedTimeline`, type-led to `kineticType`;
- one Playwright smoke (existing local Chromium helper, static fixture page, no network) runs `pinnedTimeline` and `batchReveal` and checks that scrolling changes transforms only; skip cleanly if the browser helper is unavailable in CI the same way other qa browser tests do;
- all earlier 244 and 245 tests pass unchanged.

## Verification Gates

Run from the repository root (the driver's gate script runs these as TC / LINT / TEST1 / CLI / ORCH / ENGINE):
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter @hitchhiker/engine test`
- `pnpm --filter @hitchhiker/design-system test`
- `pnpm --filter @hitchhiker/qa test`
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
feat(design-system): typed motion recipe library with designed reduced-motion, cleanup and tests, mapped to style worlds and appetite (245u)
```
