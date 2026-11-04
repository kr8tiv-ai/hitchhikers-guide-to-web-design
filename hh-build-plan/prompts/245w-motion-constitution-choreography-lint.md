---
id: 245w
title: Motion constitution, choreography score and motion lint gates - brand-derived easing/duration limits, one scroll owner, static and runtime lint that fails the build
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245v
---

# 245w - Motion constitution, choreography score, and static + runtime motion lint as build gates

## Context

245o (later in the chain) adds a short motion code rule and extends `lintMotionSource` / `checkRecipes`. This prompt owns the motion constitution, the choreography score and the hard lint rules so 245o only wires them into page prompts; do not duplicate rules between the two. Existing pieces: `checkRecipes` (`packages/qa/src/recipe-check.ts`), `lintMotionSource` / `planMotion` (`packages/engine/src/spec/motion.ts`), 245u recipes and `motionSetup`, 245v signature contracts.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. Motion constitution: DESIGN.md `## Motion constitution` (lock-covered, written with the signature moments): at most 3 easings (named, e.g. `brand-out: power3.out`), at most 2 duration bands (e.g. `micro 0.2-0.35s`, `story 0.8-1.4s`), one scroll owner (Lenis via `motionSetup`), the Lenis ticker rules, and the recipes allowed. Derived from the Brand idea, style world and appetite (calm brands: fewer, softer easings; kinetic brands: sharper). Emitted as `src/styles/motion-tokens.ts` constants the recipes accept.
2. Static lint `lintMotion(projectDir)` (extend `checkRecipes`; `lintMotionSource` calls it), each finding with file:line and a fix line. Fails the build on:
   - more than one scroll owner, or a second RAF loop for Lenis (correct: `new Lenis({ autoRaf: false })`, `lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker.add(t => lenis.raf(t * 1000))`, `gsap.ticker.lagSmoothing(0)`);
   - `ScrollTrigger.refresh` missing after `document.fonts.ready` and after image loads;
   - layout properties or CSS filters animated in scrubbed timelines (transform and opacity only);
   - ScrollTriggers nested inside child tweens of a timeline;
   - duplicate `to()` tweens on the same property of the same element;
   - one ScrollTrigger per card in a repeated list where `ScrollTrigger.batch` / `batchReveal` should be used (3+ siblings);
   - missing `gsap.matchMedia` or prefers-reduced-motion handling;
   - no cleanup on unmount (no `kill`/`revert`/`ctx.revert` on `astro:before-swap` or component unmount);
   - direct `gsap.to/from/timeline` or `ScrollTrigger.create` in site code outside `@hitchhiker/design-system/motion` (the 245u MOTION_COMPOSE_RULE);
   - easings or durations outside the constitution.
3. Runtime lint `runMotionProbe(url)` on the 245c CDP surface: counts active `requestAnimationFrame` loops (instrumented via an init script), ScrollTrigger instances and Lenis instances, records which properties change during a scripted scroll (layout-property change on a scrubbed element = fail), checks refresh after fonts/images, and checks a route change or unmount leaves zero triggers.
4. Choreography score `scoreChoreography(projectDir, probe)`: reads the actual GSAP timelines (static parse plus the runtime registry `gsap.globalTimeline.getChildren()` captured by the probe) and scores 0-10 with findings for competing easings, more than 2 duration bands, layout-property tweens, multiple scroll owners, overlapping scrubs on one element, and anything competing with the 245v signature. Written to `qa/motion/choreography.json`.
5. Gates: static lint in the per-prompt close (one feedback rerun, 244k mechanism) and in `pnpm build` of generated sites (a `prebuild` script `hh-motion-lint`); runtime probe + score in the 245l loop and the final review. Elevate (245r) may change motion only within the constitution: export `withinConstitution(change)` and refuse menu items outside it.

## Tests

Add `packages/qa/test/245w-motion-lint.test.ts` and `packages/engine/test/desk-run11-245w.test.ts`, failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- one fixture per rule fails with file:line; the 245u recipes and `motionSetup` pass with zero findings;
- a second `requestAnimationFrame` loop calling `lenis.raf` fails; the correct ticker setup passes;
- a scrubbed `width` tween and a scrubbed `filter` tween fail; transform/opacity pass;
- four cards with four triggers fail; `batchReveal` passes;
- a fourth easing and a third duration band fail against the constitution;
- the choreography score drops for competing easings and names them; the runtime probe (fake page facts) flags two Lenis instances;
- `withinConstitution` refuses an elevate change that adds a new easing;
- all earlier 244 and 245 tests pass unchanged.

## Verification Gates

Run from the repository root (the driver's gate script runs these as TC / LINT / TEST1 / CLI / ORCH / ENGINE):
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter @hitchhiker/engine test`
- `pnpm --filter @hitchhiker/qa test`
- `pnpm --filter @hitchhiker/design-system test`
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
feat(qa): motion constitution, choreography score and static and runtime motion lint that fail the build (245w)
```
