---
id: "240r"
kind: research
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["240c"]
title: "Research only: the best way to do every quality-gap audit item (fonts from artistic foundries, device matrix, mobile and Android polish, WebGL on mobile, Lighthouse per device, reduced motion, preloader, nav and footer)"
files: ["hh-build-plan/research/"]
---

# 240r. Research: how the best studios make every item on the quality-gap audit stunning, on every device

## WHY (read this first)

The desk exists to make Grok's sites orders of magnitude more beautiful than plain Grok from the same brief, at least level with aura.build, and stunning on every device a visitor uses. The quality-gap audit found the desk has no real font taste in code and only looks at Chromium at bare widths. Before we write the 241 build specs, we need the best known way to do each audit item, with sources. HARD RULE for every finding: it must look stunning on mobile and Android WITHOUT reducing site quality. Recommend adaptive techniques (DPR-aware rendering, tuned 3D, LOD, compressed textures and meshes, adaptive post chains, poster-first video) that keep the experience, never "strip the effect on mobile" as the default answer. Everything measures outcomes and never bans a library.

## RULES

- RESEARCH ONLY. Do not change product code, tests, prompts or config. The only files you write are under `hh-build-plan/research/240r-*.md`. Commit them when done.
- Use web search and fetch for public pages. Respect robots.txt and terms; no scraping behind logins; quote briefly, link sources, and mark anything you could not verify as unverified. Record license facts with the URL of the license page you read.
- Never download font files into the repo; record links, licenses and file formats only.
- Do not touch any Paradise Found project or a desk on port 4175. Do not run the library ingest or `bench --run`.

## Inputs (read first)

- `hh-build-plan/research/hh-quality-gap-audit-2026-10-19.md` (the 13 recommended items and the device addendum).
- `hh-build-plan/research/high-end-techniques-transcript-2026-10-19.md`.
- `hh-build-plan/research/hh-harness-research-2026-10-19.md` if present (study of aura.build and other Awwwards-level harnesses).
- The repo as it is now: `packages/engine/src/brand/tokens.ts`, `packages/engine/src/spec/design-outputs.ts`, `packages/qa/src/` (beauty gate, recipe check, Lighthouse, detail pass, screenshots, playwright opener), `packages/knowledge/packs/`, `templates/shared/webgl.ts`.

## Research tasks and outputs

### 1. Fonts: `hh-build-plan/research/240r-fonts.md`
Pull from artistic foundry directories, not generic ones: Fontshare, Velvetyne, Collletttivo, Open Foundry, Pangram Pangram free tiers, Uncut.wtf, Google Fonts' rarer display faces, plus pairings documented on Typewolf and Fonts In Use. Produce a curated pairing library (aim for 40+ pairs) organised by what the brand wants to express: mood, era, tone and industry. Per pair: display and body family, foundry, source URL, license (OFL-1.1 or free for commercial use only; read and link the license; note any free-tier limits such as Pangram Pangram's), whether self-hostable woff2 is available, variable axes / optical sizes, x-height and classification contrast, and a real pairing rationale in two or three sentences. Also: an evidence-backed overused-defaults list, recommended type-scale ratios per world, fallback-metric (size-adjust) technique, loading (preload, font-display, subsetting) and a byte budget. End with a machine-readable appendix (a fenced JSON or YAML block) the 241 spec can turn into code.

### 2. Every other audit item: `hh-build-plan/research/240r-devices-and-polish.md`
For each, the best current practice with sources and concrete parameters:
- Device matrix: Playwright `devices[...]` for WebKit iPhone, Android Chrome (Pixel), iPad portrait and landscape, Android tablets, desktop; what emulation catches and misses vs real devices; affordable real-device options (BrowserStack / LambdaTest / WebPageTest) noted as optional.
- Mobile and Android polish: dvh/svh/lvh, safe areas and `viewport-fit=cover`, tap targets, hover vs `pointer: coarse`, iOS and Android video autoplay rules, Android Chrome URL-bar and overscroll quirks, scroll and Lenis on touch, text rendering, menus and focus.
- WebGL on mobile WITHOUT losing quality: GPU tiering (e.g. detect-gpu), DPR clamping and adaptive DPR, `PerformanceMonitor`-style regression, LOD, KTX2 / Basis textures, Draco and Meshopt, instancing, adaptive post-processing, offscreen and hidden-tab pausing, context loss recovery, fallbacks that still look art-directed.
- Lighthouse per device: mobile, tablet and desktop configs, LCP / INP / CLS thresholds, lab vs field (CrUX), how to keep a WebGL hero LCP-safe (poster as LCP image).
- Reduced motion: what to keep (opacity, colour, still 3D) and what to remove, per technique.
- Preloader to intro handoff: patterns from SOTD sites, how to avoid blank frames and layout jumps.
- Navigation and footer craft: what scores on Awwwards, accessible menu patterns.

### 2b. Harness study ideas: `hh-build-plan/research/240r-harness-ideas.md`
Every idea in `hh-build-plan/research/hh-harness-research-2026-10-19.md` scored 7/10 or higher on absolute usefulness (not relative ranking; include ideas scored 7 even if not marked IMPLEMENT) MUST be carried forward, however many there are. For each: the idea, its score, the best way to build it in this repo (files, functions, how to measure it), sources, and which 241 spec it goes in. This includes the addendum items 19-37 (15 more IMPLEMENT ideas at 7+) as well as the original ideas; ideas scored below 7 stay out. None may be dropped or merged away; list them all with their original names.

### 3. Summary: `hh-build-plan/research/240r-summary.md`
One table: audit item, recommended approach, how to measure it in code, sources. Then a proposed split for the 241 build specs (241a, 241b, 241c ... as many as needed) that covers all 13 audit items AND every idea scored 7/10 or higher from the harness study, with a coverage table proving none is missing.

## Verification
Files exist, every claim that matters has a source link, the fonts appendix parses as JSON or YAML. `git status` clean after your commit.

## Commit
```
docs(research): 240r best practice for fonts, devices, mobile WebGL, Lighthouse per device, reduced motion, preloader, nav and footer (240r)
```