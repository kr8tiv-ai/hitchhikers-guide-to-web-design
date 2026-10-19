---
id: "240a"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["239b"]
title: "BUG-048 part 1: high-end language pack, SKILL.md reference packs, @skill activation"
files: ["packages/knowledge/", "packages/engine/src/spec/", "packages/engine/test/", "packages/knowledge/test/", "docs/"]
---

# 240a. BUG-048 part 1: the High-End Language Pack, Aura-style skill packs, and @skill activation
## WHY (read this first)

The desk exists to make Grok's sites orders of magnitude more beautiful than what plain Grok makes from the same brief, and at least level with aura.build. 239a/239b gave every prompt art direction, imagery and a design library. What is still missing is the exact vocabulary and working recipes a senior creative developer reaches for, delivered per section only when that section needs it. Default Grok describes effects vaguely ("add a cool 3D scroll effect"); high-end sites use language that maps straight to implementation ("CatmullRomCurve3 path with 0.12-0.18 lerp damping via maath, FOV 35-45"). aura.build's edge is dense, agent-readable references and a skills layer. This series ENHANCES Grok; it never restricts it. Every pack, recipe and term is inspiration and a starting point that Grok remixes, improves and goes beyond. No library, technique or look is ever banned or mandated.

Source (read it in full first): `hh-build-plan/research/high-end-techniques-transcript-2026-10-19.md` (definitive transcript: all code, option tables, the skill-pack file list and exact parameter ranges) and `hh-build-plan/research/high-end-techniques-summary-2026-10-19.md`. Put the recipes into packs in our own words and code; credit official docs where a snippet follows them.

## RULES

Same RULES block as 220-239b (TypeScript strict, tests ship with the behavior, spec first: failing regression test, then root-cause fix, then green; at most two real attempts per item, then revert that item's partial product change and mark it BLOCKED with the reason; never weaken, skip, quarantine, delete, gate or loosen a test; never lower any Grok call's model or effort from `grok-4.7-build-fast` at `xhigh`; never skip the pushback judge; commit as soon as each item is green, never hold more than one item uncommitted; if a commit hook fails because Git Bash cannot fork (`0xC0000142`) do not bypass hooks, leave the work staged, record it, stop; no new dependencies in the desk repo itself (sites Grok builds may use any appropriate library); no secrets; cross-platform: Windows, macOS and Linux).
- Keep the 239a no-AI-slop rule (slop fails the beauty gate) and the library-freedom rule: no pack, recipe, selector or prompt may ban a library; any appropriate library is allowed (GSAP + ScrollTrigger/SplitText/ScrollToPlugin, Lenis, Three.js r170+, React Three Fiber + drei, pmndrs postprocessing or Three EffectComposer, maath, Theatre.js, OGL, Motion, anime.js, Lottie/Rive, Rapier, gltf-transform, Astro + React islands, Next.js, vanilla JS).
- Tests never spawn a real Grok session, never make a live model or Imagine call, never run the library ingest pipeline and never run `bench --run`. Do not touch any Paradise Found project or a running desk on port 4175.
## Items

### 1. High-End Language Pack (spec first)
- [ ] `packages/knowledge/language-pack/` with entries (name, when to use, exact parameter ranges, a tiny working snippet, performance notes, reduced-motion path). Seed with at least the transcript's ranges: camera on `CatmullRomCurve3` with 0.12-0.18 lerp damping via `maath`, lookAt target anticipating 0.3-0.5 s, FOV 35-45 with a slight dolly on scroll velocity; glass via `MeshPhysicalMaterial` (`transmission` 0.92-0.98, `thickness` 0.5-2, `roughness` 0.05-0.15, `ior` 1.5, `clearcoat` 1, `attenuationColor` from the brand) plus chromatic aberration / `dispersion`; post via `EffectComposer` with `UnrealBloomPass` (strength 0.3-0.8, radius 0.4, threshold 0.85) + FilmGrain + Vignette, ACES filmic tone mapping, exposure 1.1; scroll via ScrollTrigger pin with `scrub: 1`, `anticipatePin: 1`, `invalidateOnRefresh: true`, horizontal tracks with `ease: "none"`, SplitText lines with mask and `expo.out` stagger; iridescence, grain, caustics, shader hero (noise, fbm, domain warp).
- [ ] The prompt generator includes the pack whenever the brand kit's motion/3D appetite is high, and per section writes only the entries the art direction triggers, phrased as precise language Grok may build on, never as a mandate. Tests: a high-appetite 3D hero gets camera, material and post terms with ranges; a text-led section gets typography and reveal terms, not WebGL; a low-appetite brief gets no 3D terms; no prompt contains "only use" or "do not use <library>".

### 2. Skill packs (Aura-style)
- [ ] `packages/knowledge/skills/`: `object-showcase.md` (product/hero 3D: camera path, lighting, materials, post), `scroll-choreography.md` (pin + scrub, horizontal tracks, SplitText, shared-element transitions), `shader-recipes.md` (transmission, dispersion, iridescence, grain, caustics), `post-processing.md` (EffectComposer chains seen on SOTD sites), a locked-versions pack (library versions known to work together, with import lines), and `case-studies/awwwards-sotd-breakdowns.md` (8-12 recent high-scoring sites, annotated in our own words from public pages; links and our notes only, nothing scraped against terms). Each file has front matter: name, triggers (site type, motion appetite, section kinds), techniques, versions.
- [ ] Tests: every pack parses; versions in recipes match the locked pack; triggers are non-empty.

### 3. @skill activation, loaded on demand
- [ ] An include mechanism: `@skill:scroll-choreography` (and the other names) in a plan or section prompt expands to that pack within a size budget, or to a path reference Grok reads on demand when over budget. The planner adds `@skill:` lines automatically from the brand kit / PRD (motion appetite, site type) and the section's art direction. Tests: triggers select the right packs; untriggered packs stay out; budget respected; unknown skill names are reported, not silently dropped.

## Verification
`pnpm -r test`, lint and typecheck green.

## Report back
Per item: commit SHA, pass or BLOCKED with the reason, and an example section prompt before and after.

## Commit
```
feat(knowledge): BUG-048 High-End Language Pack, SKILL packs and @skill activation (240a)
```