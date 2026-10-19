---
id: "240c"
kind: checkpoint
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["240b"]
title: "BUG-048 part 3 and BUG-049: Awwwards-style pattern-usage scoring, performance gates, script test stubs for Smart App Control; checkpoint 239a-240c"
files: ["packages/qa/src/", "packages/engine/src/", "packages/cli/", "packages/*/test/", "packages/app/e2e/", "docs/"]
---

# 240c. BUG-048 part 3 and BUG-049: Awwwards-style pattern-usage scoring and performance gates, script test stubs, checkpoint
## WHY (read this first)

The desk exists to make Grok's sites orders of magnitude more beautiful than what plain Grok makes from the same brief, and at least level with aura.build. 239a/239b gave every prompt art direction, imagery and a design library. What is still missing is the exact vocabulary and working recipes a senior creative developer reaches for, delivered per section only when that section needs it. Default Grok describes effects vaguely ("add a cool 3D scroll effect"); high-end sites use language that maps straight to implementation ("CatmullRomCurve3 path with 0.12-0.18 lerp damping via maath, FOV 35-45"). aura.build's edge is dense, agent-readable references and a skills layer. This series ENHANCES Grok; it never restricts it. Every pack, recipe and term is inspiration and a starting point that Grok remixes, improves and goes beyond. No library, technique or look is ever banned or mandated.

Source (read it in full first): `hh-build-plan/research/high-end-techniques-transcript-2026-10-19.md` (definitive transcript: all code, option tables, the skill-pack file list and exact parameter ranges) and `hh-build-plan/research/high-end-techniques-summary-2026-10-19.md`. Put the recipes into packs in our own words and code; credit official docs where a snippet follows them.

## RULES

Same RULES block as 220-239b (TypeScript strict, tests ship with the behavior, spec first: failing regression test, then root-cause fix, then green; at most two real attempts per item, then revert that item's partial product change and mark it BLOCKED with the reason; never weaken, skip, quarantine, delete, gate or loosen a test; never lower any Grok call's model or effort from `grok-4.7-build-fast` at `xhigh`; never skip the pushback judge; commit as soon as each item is green, never hold more than one item uncommitted; if a commit hook fails because Git Bash cannot fork (`0xC0000142`) do not bypass hooks, leave the work staged, record it, stop; no new dependencies in the desk repo itself (sites Grok builds may use any appropriate library); no secrets; cross-platform: Windows, macOS and Linux).
- Keep the 239a no-AI-slop rule (slop fails the beauty gate) and the library-freedom rule: no pack, recipe, selector or prompt may ban a library; any appropriate library is allowed (GSAP + ScrollTrigger/SplitText/ScrollToPlugin, Lenis, Three.js r170+, React Three Fiber + drei, pmndrs postprocessing or Three EffectComposer, maath, Theatre.js, OGL, Motion, anime.js, Lottie/Rive, Rapier, gltf-transform, Astro + React islands, Next.js, vanilla JS).
- Tests never spawn a real Grok session, never make a live model or Imagine call, never run the library ingest pipeline and never run `bench --run`. Do not touch any Paradise Found project or a running desk on port 4175.
## Items

### 1. Pattern-usage scoring (spec first)
- [ ] Gates check that high-appetite sites actually use advanced patterns, not just import libraries: an Awwwards-style pass scores pin/scrub density, material sophistication, post-processing, text reveals, camera choreography and reduced-motion fallbacks from the built DOM and scripts, alongside vision scores for design, usability, creativity and content (and a developer line for code quality). It measures; it never requires a specific library. Slop and template clones still fail. Failing pages feed the existing remediation loop. Tests with stubbed vision: a high-appetite fixture that imports GSAP and Three but uses no pin, scrub, material or post fails; one that composes them passes; a low-appetite text-led brief is not penalised.

### 2. Performance gates
- [ ] Hard gates: Lighthouse mobile >= 90, LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1, one WebGL context per page, weight budgets for 3D and video, mobile stills fallback, reduced-motion complete. Tests with stubbed Lighthouse results.

### 3. BUG-049: script stubs instead of compiled test exes
- [ ] Windows Smart App Control blocked an unsigned test stub compiled into `%TEMP%\hh-bin-*` (CodeIntegrity event 3077, 2026-10-19 16:03 Costa Rica time). Find every test helper that compiles or copies a fake `grok.exe`, `pdftotext.exe` or any other `.exe` (start at `packages/cli/test/hh-bin.test.ts`; search all packages) and replace it with script stubs: a `.cmd` shim that runs `node <stub>.mjs` on Windows, and an executable `#!/usr/bin/env node` script on macOS and Linux. Product code that resolves these tools must accept the `.cmd` form (spawn batch shims through `cmd.exe` as it already does). Keep every assertion. Tests: no test writes or runs a `.exe`; the stubs run on all three platforms.

### 4. Checkpoint 239a-240c
- [ ] Review 239a-240c together: the provider chain and embedded-browser provider are wired into the asset step; the language pack, skill packs, `@skill` lines, DESIGN.md and motion.ts reach real prompts; no prompt bans a library; the slop rule holds; the recipe checker and gates run in the jury.

## Verification
`pnpm -r test`, lint, typecheck and e2e green on Windows; no `.exe` created under `%TEMP%` during tests.

## Report back
Per item: commit SHA, pass or BLOCKED with the reason; what Grok can now say and do that it could not before.

## Commit
```
feat(qa): BUG-048 Awwwards-style pattern scoring and performance gates; BUG-049 script test stubs; checkpoint 239a-240c (240c)
```