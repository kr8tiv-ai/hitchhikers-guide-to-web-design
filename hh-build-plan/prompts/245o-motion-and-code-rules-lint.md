---
id: 245o
title: Motion and code rules in generated prompts plus a lint - transform/opacity/clip-path/filter only, no transition all, set GSAP + Lenis setup, CLS under 0.05, 44px tap targets
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245n
---

# 245o - Motion and code rules in every page prompt, enforced by a close-time lint (BUG-151)

## Context

Run 11's prompts carried long lists of motion constants (scrub, fov, bloom, Lenis lerp ...) but no hard rules, and nothing checked the code. Existing pieces: `lintMotionSource`, `planMotion`, `renderMotionMd`, `MOTION_LIBS` in `packages/engine/src/spec/motion.ts`; `renderMotionModule` / `flagIgnoredMotionTokens` in `design-outputs.ts`; shared rules `SITE_RULES` in `packages/engine/src/spec/site-rules.ts`; goldens `packages/knowledge/golden/lenis.md`, `motion.md`, `reveals.md`; `MOTION_BIND_SENTENCE` in site-prompts.ts; `tests/cwv.spec.ts` generated for CLS. The stack stays Astro: no framework change.

## Deliverables

1. Add one short `MOTION_CODE_RULE` to site-rules.ts and include it in every page/section prompt's must_haves (245k format), at most about 6 lines:
   - animate only transform, opacity, clip-path and filter; never `transition: all`; never animate width/height/top/left/margin;
   - one shared setup: GSAP + ScrollTrigger + Lenis in `src/scripts/motion.ts` (Lenis `smoothTouch: false`, drives ScrollTrigger via `lenis.on('scroll', ScrollTrigger.update)` and `gsap.ticker`), and `prefers-reduced-motion: reduce` disables Lenis and shows final states;
   - CLS under 0.05 (reserve media space with width/height or aspect-ratio);
   - interactive targets at least 44x44 px at 375 wide.
2. Extend `lintMotionSource` (or add `lintSiteCode` beside it) to scan `src/**/*.{astro,css,ts,js}` template/style/script code (reuse the 244j frontmatter-aware scan where it applies) and report: `transition: all` / `transition-property: all`; CSS transitions/keyframes or GSAP tweens on layout properties; a second Lenis instance or Lenis without `smoothTouch: false`; motion code with no reduced-motion branch. Each hit names file and line.
3. Run the lint in the per-prompt close checks for files the prompt owns (fails with one feedback rerun, 244k mechanism). Add tap-target size (all `a, button, [role=button], input` visible at 375 at least 44x44) and CLS (< 0.05 measured with a PerformanceObserver over load + scroll) to the 245l shot step for the page, reported as faults.
4. Update the lenis/motion goldens to the one set setup. Generic; no site-c names.

5. 245w already owns the motion constitution, choreography score and the hard motion lint rules (scroll owner, Lenis ticker, refresh after fonts/images, scrubbed layout/filter tweens, nested triggers, duplicate tweens, batch, matchMedia/reduced motion, cleanup, free-form GSAP). This prompt only injects the short rule (including 245u `MOTION_COMPOSE_RULE` and 245v `SIGNATURE_RULE`) into page prompts and adds the non-motion code rules; call `lintMotion` from 245w, never reimplement it. Note: 245w allows transform and opacity only in scrubbed timelines; keep clip-path/filter allowed only in non-scrubbed tweens.
6. Wire, do not duplicate: `checkRecipes` in `packages/qa/src/recipe-check.ts` already covers two scroll owners, the Lenis ticker, layout-property tweens, reduced motion and more. Add only the rules it lacks (`transition: all`, Lenis `smoothTouch`) there, and have `lintMotionSource` call it rather than reimplementing. The pre-built recipes in `@hitchhiker/design-system` (245d) must pass this lint with zero findings.

## Tests

Add `packages/engine/test/desk-run11-245o.test.ts` (failing first, then green):
- each banned pattern (transition: all, a `width` tween, Lenis without smoothTouch false, no reduced-motion branch) is reported with file and line; a clean motion.ts passes;
- TypeScript in Astro frontmatter that mentions `width` is not reported;
- a generated page prompt contains the rule block once and is still within the 245k context budget;
- a prompt that adds `transition: all` to a file it owns fails close with one rerun; one in a file it does not own does not fail that prompt;
- the shot step reports a 30px button at 375 and a CLS of 0.12 as faults (fake measurements);
- the 245d recipes pass the lint with zero findings;
- all earlier 244 and 245 tests pass unchanged.

## Verification Gates

Run from the repository root (the driver's gate script runs these as TC / LINT / TEST1 / CLI / ORCH / ENGINE):
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter @hitchhiker/engine test`
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
feat(engine): page prompts carry the motion and code rules and a close-time lint enforces them (245o)
```
