---
id: "240"
kind: checkpoint
phase: improbability-drive
slice: Forty-Two
title: "BUG-048 high-end technique vocabulary, on-demand reference packs, DESIGN.md + motion.ts as first-class outputs, GSAP/Lenis scroll recipes, Awwwards-style scoring with performance gates, and script test stubs for Windows Smart App Control; checkpoint 239a-240"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["239b"]
files: ["packages/knowledge/", "packages/engine/src/", "packages/qa/src/", "packages/cli/test/", "packages/*/test/", "packages/app/e2e/", "docs/", "bench/visual/"]
review_checkpoint_embedded: false
---

# 240. BUG-048: give Grok the precise creative-dev language and recipes of a high-end studio, on demand, and score it like Awwwards

## WHY (read this first)

The desk exists to make Grok's sites orders of magnitude more beautiful than what plain Grok makes from the same brief, and at least level with aura.build. 239a/239b gave every prompt art direction, imagery and a design library. What is still missing is the exact vocabulary and working recipes a senior creative developer reaches for, delivered per section only when that section needs them. aura.build's edge is dense, agent-readable references: precise technique names, parameter ranges and locked versions. This spec ENHANCES Grok; it never restricts it. Every pack, recipe and term is inspiration and a starting point that Grok remixes, improves and goes beyond. No library, technique or look is ever banned or mandated.

Source: `C:\Users\lucid\Desktop\hh-visual-research\HIGH-END-TECHNIQUES-CONVERSATION-2026-10-19.md` and `HIGH-END-TECHNIQUES-TRANSCRIPT-2026-10-19.md` (read both; copy the relevant recipes into the packs in our own words and code, with credit where a snippet comes from official docs).

## RULES

Same RULES block as 220-239b (TypeScript strict, tests ship with the behavior, spec first: failing regression test, then root-cause fix, then green; at most two real attempts per item, then revert that item's partial product change and mark it BLOCKED with the reason; never weaken, skip, quarantine, delete, gate or loosen a test; never lower any Grok call's model or effort from `grok-4.7-build-fast` at `xhigh`; never skip the pushback judge; commit as soon as each item is green, never hold more than one item uncommitted; if a commit hook fails because Git Bash cannot fork (`0xC0000142`) do not bypass hooks, leave the work staged, record it, stop; no new dependencies in the desk repo itself (sites Grok builds may use any appropriate library); no secrets; cross-platform: Windows, macOS and Linux).
- Keep the 239a no-AI-slop rule (slop fails the beauty gate) and the library-freedom rule (no pack, recipe, selector or prompt may ban a library; any appropriate library is allowed: GSAP + ScrollTrigger/SplitText/ScrollToPlugin, Lenis, Three.js r170+, React Three Fiber + drei, postprocessing / EffectComposer, maath, Theatre.js, OGL, Motion, anime.js, Lottie/Rive, Rapier, gltf-transform, Astro + React islands, Next.js, vanilla JS).
- Tests never spawn a real Grok session, never make a live model or Imagine call, never run the library ingest pipeline and never run `bench --run`.
- Do not touch any Paradise Found project or a running desk on port 4175.

## Items

### 1. Precise creative-dev vocabulary, injected per section
- [ ] A technique lexicon in `packages/knowledge` (our own words): each entry has a name, when to use it, parameter ranges, a tiny working snippet, performance notes and a reduced-motion path. Seed at least: camera paths on `CatmullRomCurve3` with lerp damping 0.12-0.18; `MeshPhysicalMaterial` with `transmission` 0.92-0.98, `thickness`, `ior` and `dispersion` (chromatic aberration); an `EffectComposer` post chain with ACES filmic tone mapping, `UnrealBloomPass`, film grain and vignette; shader hero (noise, fbm, domain warp); SplitText mask reveals; pinned scrub scenes; horizontal tracks; layered parallax; scroll-driven 3D cameras with `maath` damp.
- [ ] The section prompt builder picks lexicon entries from the art direction for each section and writes them into that section's prompt as precise language ("drive the camera along a CatmullRomCurve3, damp with lerp 0.14"), never as a mandate. Tests: a 3D product hero gets the camera-path, physical-material and post-chain terms; a plain text-led section gets typography and reveal terms, not WebGL; no prompt contains "only use" or "do not use <library>".

### 2. Local SKILL.md-style reference packs, loaded on demand
- [ ] `packages/knowledge/skills/<name>/SKILL.md` packs: object showcase, scroll choreography, shaders, post-processing chains, and a locked-versions pack (pinned library versions known to work together, with the import lines). Each SKILL.md has front matter (name, triggers, techniques, versions) and short recipes.
- [ ] The planner loads a pack into a prompt only when the section's art direction triggers it, within a size budget; packs are referenced by path for Grok to read on demand when they exceed the budget. Tests: triggers select the right packs; untriggered packs stay out; the budget is respected; versions in the locked pack match the import lines in its recipes.

### 3. DESIGN.md and motion.ts as first-class outputs
- [ ] The brand phase writes `DESIGN.md` (palette tokens, type scale, spacing, radii, imagery and art direction, signature techniques, do and don't for this brand) and the plan phase writes `motion.ts` (named easings, durations, stagger values, scroll-scene definitions, reduced-motion map) into the site project. Every later prompt references both by path, and the gate checks the built site uses `motion.ts` tokens. Tests with fixture briefs: both files are written, typed and referenced; a site that ignores them is flagged.

### 4. GSAP ScrollTrigger and Lenis recipes (scroll choreography pack)
- [ ] Recipes with working code: pin + scrub (`scrub: 1`, `anticipatePin`, `invalidateOnRefresh`); horizontal tracks (`ease: "none"`, function-based `end: () => "+=" + distance()`, `invalidateOnRefresh: true`); SplitText mask reveals (`type: "lines", mask: "lines"`); Lenis sync (`lenis.on("scroll", ScrollTrigger.update)`, `gsap.ticker.add((t) => lenis.raf(t * 1000))`, `gsap.ticker.lagSmoothing(0)`); snap and `getVelocity()`; `gsap.matchMedia()` with a reduced-motion branch; animate transform and opacity only; `ScrollTrigger.refresh()` after fonts and images load; 3D cameras driven by trigger progress with `maath` damp.
- [ ] Scroll-to guidance: prefer `lenis.scrollTo(target, { offset, duration, easing, lerp, immediate, lock, force, onComplete })` and `anchors: true` when Lenis drives scroll (reduced motion jumps instantly); use ScrollToPlugin (`offsetY`, `autoKill: true`) only without Lenis; with pinning resolve the real target via `ScrollTrigger.getById(id).start`.
- [ ] Smoothing guidance: GSAP has no lerp option; use a numeric `scrub` for scroll-linked smoothing, and `gsap.utils.interpolate` or `maath` damp inside the ticker for continuous values.
- [ ] A static checker in `packages/qa` flags built sites that break these rules (two scroll owners, Lenis without the ticker sync, animating layout properties, no refresh after fonts, horizontal track with a non-none ease, no reduced-motion branch). Tests with fixture pages for each rule, passing and failing.

### 5. Awwwards-style scoring and performance gates
- [ ] Extend the 239a beauty gate with Awwwards-style dimensions (design, usability, creativity, content; developer-award line for code quality) scored by the vision judge per page, plus hard performance gates: Lighthouse mobile >= 90, LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1, one WebGL context per page, a weight budget for 3D and video, mobile stills fallback. Slop and a template clone still fail. Failing pages feed the existing remediation loop. Tests with stubbed vision and stubbed Lighthouse results.

### 6. Windows Smart App Control: script stubs instead of compiled test exes (BUG-049)
- [ ] Windows Smart App Control blocked an unsigned test stub compiled into `%TEMP%\hh-bin-*` (CodeIntegrity event 3077, 2026-10-19 16:03 Costa Rica time). Find every test helper that compiles or copies a fake `grok.exe`, `pdftotext.exe` or other `.exe` (start at `packages/cli/test/hh-bin.test.ts`; search all packages) and replace it with script stubs: a `.cmd` shim calling `node <stub>.mjs` on Windows and an executable `#!/usr/bin/env node` script on macOS and Linux. Product code that resolves these tools must accept the `.cmd` form (spawn through `cmd.exe` for batch shims as it already does). Keep every assertion. Tests: no test writes or runs a `.exe`; the stubs run on all three platforms.

### 7. Checkpoint
- [ ] Review 239a-240 together: the provider chain and embedded-browser provider from 239b are wired into the asset step; packs, lexicon, DESIGN.md and motion.ts reach real prompts; no prompt bans a library; the slop rule holds.

## Verification
`pnpm -r test`, lint and typecheck green on Windows; the e2e suite green; no `.exe` created under `%TEMP%` during tests.

## Report back
Per item: commit SHA, pass or BLOCKED with the reason, and what Grok can now say and do that it could not before.

## Commit
```
feat(knowledge): BUG-048 technique lexicon, on-demand SKILL packs, DESIGN.md + motion.ts, GSAP/Lenis recipes and checker, Awwwards scoring and perf gates; BUG-049 script test stubs; checkpoint 239a-240 (240)
```