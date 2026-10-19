---
id: "240b"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["240a"]
title: "BUG-048 part 2: DESIGN.md + motion.ts first-class outputs, GSAP/Lenis/Three recipes"
files: ["packages/knowledge/", "packages/engine/src/", "packages/qa/src/", "packages/*/test/", "docs/"]
---

# 240b. BUG-048 part 2: DESIGN.md and motion.ts as first-class outputs, and the GSAP / Lenis / Three recipes
## WHY (read this first)

The desk exists to make Grok's sites orders of magnitude more beautiful than what plain Grok makes from the same brief, and at least level with aura.build. 239a/239b gave every prompt art direction, imagery and a design library. What is still missing is the exact vocabulary and working recipes a senior creative developer reaches for, delivered per section only when that section needs it. Default Grok describes effects vaguely ("add a cool 3D scroll effect"); high-end sites use language that maps straight to implementation ("CatmullRomCurve3 path with 0.12-0.18 lerp damping via maath, FOV 35-45"). aura.build's edge is dense, agent-readable references and a skills layer. This series ENHANCES Grok; it never restricts it. Every pack, recipe and term is inspiration and a starting point that Grok remixes, improves and goes beyond. No library, technique or look is ever banned or mandated.

Source (read it in full first): `hh-build-plan/research/high-end-techniques-transcript-2026-10-19.md` (definitive transcript: all code, option tables, the skill-pack file list and exact parameter ranges) and `hh-build-plan/research/high-end-techniques-summary-2026-10-19.md`. Put the recipes into packs in our own words and code; credit official docs where a snippet follows them.

## RULES

Same RULES block as 220-239b (TypeScript strict, tests ship with the behavior, spec first: failing regression test, then root-cause fix, then green; at most two real attempts per item, then revert that item's partial product change and mark it BLOCKED with the reason; never weaken, skip, quarantine, delete, gate or loosen a test; never lower any Grok call's model or effort from `grok-4.7-build-fast` at `xhigh`; never skip the pushback judge; commit as soon as each item is green, never hold more than one item uncommitted; if a commit hook fails because Git Bash cannot fork (`0xC0000142`) do not bypass hooks, leave the work staged, record it, stop; no new dependencies in the desk repo itself (sites Grok builds may use any appropriate library); no secrets; cross-platform: Windows, macOS and Linux).
- Keep the 239a no-AI-slop rule (slop fails the beauty gate) and the library-freedom rule: no pack, recipe, selector or prompt may ban a library; any appropriate library is allowed (GSAP + ScrollTrigger/SplitText/ScrollToPlugin, Lenis, Three.js r170+, React Three Fiber + drei, pmndrs postprocessing or Three EffectComposer, maath, Theatre.js, OGL, Motion, anime.js, Lottie/Rive, Rapier, gltf-transform, Astro + React islands, Next.js, vanilla JS).
- Tests never spawn a real Grok session, never make a live model or Imagine call, never run the library ingest pipeline and never run `bench --run`. Do not touch any Paradise Found project or a running desk on port 4175.
## Items

### 1. DESIGN.md and motion.ts (spec first)
- [ ] The brand phase writes `DESIGN.md` into the site project: tokens, type scale, color, spacing, component rules, motion principles with exact durations, eases and distances, signature techniques. The plan phase writes `motion.ts`: typed constants for GSAP, Lenis and Three (scrub values, damping factors, bloom settings, easings, durations, staggers, scroll-scene definitions, a reduced-motion map). Every later build prompt references both by path. Tests with fixture briefs: both files are written and typed; every build prompt references them; a fixture site that ignores the `motion.ts` tokens is flagged.

### 2. Scroll choreography recipes (into `skills/scroll-choreography.md`, working code)
- [ ] Pin + scrub (`start: "top top"`, `end: "+=150%"`, `pin: true`, `scrub: 1`, `anticipatePin: 1`, `invalidateOnRefresh: true`); horizontal track (`xPercent: -100 * (panels.length - 1)`, `ease: "none"`, `end: () => "+=" + distance()`, `invalidateOnRefresh: true`); SplitText mask reveals (`type: "lines", mask: "lines"`, `yPercent: 100`, `duration: 1.2`, `ease: "expo.out"`, `stagger: 0.08`); Lenis sync (`lenis.on("scroll", ScrollTrigger.update)`, `gsap.ticker.add((t) => lenis.raf(t * 1000))`, `gsap.ticker.lagSmoothing(0)`); snap (`snapTo: "labelsDirectional"`, duration 0.2-0.8, delay 0.1) and `self.getVelocity()`; advanced pinning (`anticipatePin`, `pinSpacing: false`, multiple pins, `endTrigger`); Three.js driven by `self.progress` with `maath` damp; performance rules (transform/opacity only, `invalidateOnRefresh`, `ScrollTrigger.refresh()` after fonts, images and layout changes, `gsap.matchMedia()` for reduced motion and mobile, `ScrollTrigger.batch()` for many elements).
- [ ] Scroll-to: prefer `lenis.scrollTo(target, { offset, duration, easing, lerp, immediate, lock, force, onStart, onComplete, userData })` and `new Lenis({ anchors: true })` (or `anchors: { offset: -80, duration: 1.2 }`) when Lenis drives scroll; reduced motion jumps instantly (Lenis 1.3.26+); Lenis `lerp` 0.08-0.12 for a premium feel, and it takes priority over duration/easing. ScrollToPlugin (`offsetY`, `autoKill: true`, "max") only without Lenis; with pinning resolve the target via `ScrollTrigger.getById(id).start` or getScrollLookup.
- [ ] Smoothing: GSAP has no lerp option; use numeric `scrub`, `gsap.utils.interpolate(current, target, 0.1)` in the ticker, `maath` damp for critically damped follow, or a normal tween + ease for one-shots.

### 3. Recipe checker
- [ ] A static checker in `packages/qa` flags built sites that break the recipes: two scroll owners, Lenis without ticker sync, animating layout properties, no refresh after fonts/images, a horizontal track with a non-`none` ease, ScrollToPlugin with Lenis active, no reduced-motion branch, more than one WebGL context. Tests: one passing and one failing fixture page per rule.

## Verification
`pnpm -r test`, lint and typecheck green.

## Report back
Per item: commit SHA, pass or BLOCKED with the reason.

## Commit
```
feat(engine): BUG-048 DESIGN.md + motion.ts first-class outputs, scroll/Three recipes and recipe checker (240b)
```