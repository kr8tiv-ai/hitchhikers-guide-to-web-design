---
id: 245d
title: Design-system package part 1 - token sets per style world and pre-built GSAP/Lenis recipes
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245x
---

# 245d - packages/design-system part 1: token sets per style world and motion recipes (BUG-140)

## Context

Run 11 had no shared design primitives; each prompt invented layout and motion. Existing pieces: style worlds `StyleWorld = "editorial" | "3d-world" | "playful" | "brutalist"` and `styleWorldFrom` in `packages/engine/src/spec/art-direction.ts`; palettes and `TYPE_PAIRINGS` in `packages/engine/src/brand/tokens.ts` (from `type-library.ts`); motion planning in `packages/engine/src/spec/motion.ts` (`MOTION_LIBS`, `planMotion`) and `renderMotionModule` in design-outputs.ts; the recipe checker `packages/qa/src/recipe-check.ts`; templates in `packages/templates` (astro-default has only Base.astro, index and credits pages; `templates/recipes` holds integration recipes, not motion). Keep Astro.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. Create `packages/design-system` (name `@hitchhiker/design-system`, same tsconfig/lint/vitest setup as sibling packages, added to the workspace) or, if package boundaries (`003-package-boundaries`) make a new package wrong, a `design-system/` folder inside `packages/templates`; say which and why.
2. `tokens/`: one token set per style world (editorial, 3d-world, playful, brutalist): a fluid type scale with real display/body contrast (display at least 2.5x body at 1440, built with clamp()), spacing scale, radii, motion durations and easings, colour roles (paper, ink, accent, muted, surface) as slots the brand palette fills. A function `tokensFor(world, brand)` merges brand colours and the picked font pair into the world set; DESIGN.md's Tokens section is rendered from it (wire into `writeDesignMd` so DESIGN.md and the package never disagree).
3. `recipes/`: pre-built motion recipes as plain TS modules for Astro islands/scripts: Lenis + GSAP ScrollTrigger setup (one scroll owner, `lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker` drive, `smoothTouch: false`, reduced motion disables Lenis and shows end states), reveal (fade/translate), split-line headline reveal, parallax media, pinned horizontal scroll, marquee, hover lift. Transform/opacity/clip-path/filter only.
4. Every recipe passes `checkRecipes` with zero findings; add that as a package test.

## Tests

Add `packages/engine/test/desk-run11-245d.test.ts` (and package-local tests where the code lives), failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- `tokensFor` for each world gives display >= 2.5x body at 1440 and uses clamp() for every type step; brand colours land in the right roles;
- DESIGN.md Tokens section equals the package output for a fixture;
- every recipe file passes `checkRecipes` with zero findings; the Lenis setup has smoothTouch false and a reduced-motion branch;
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
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
feat(design-system): token sets per style world and motion recipes that pass the recipe checker (245d)
```
