---
id: "063"
kind: build
phase: babel-fish
slice: Magrathean Logo Works
title: "Logo clean-up and export set"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["055", "011"]
files: ["packages/assets/src/logo/clean.ts", "packages/assets/src/logo/checks.ts", "packages/assets/src/logo/export-set.ts", "packages/assets/src/logo/ico.ts", "packages/assets/test/logo-clean.test.ts", "packages/assets/test/logo-export.test.ts", "packages/assets/package.json", "NOTICE"]
requirements: ["HH-LOGO-04"]
review_checkpoint_embedded: true
---

# 063. Logo clean-up and export set

## RULES

You are Grok 4.7 in Grok Build, building The Hitchhiker's Guide to Web Design. This prompt builds the Guide app itself, not a client's website.

- TypeScript strict. No `any` unless a line in this prompt names the exception and the reason.
- Tests ship with the behavior. Run the verification commands before you finish.
- No secrets in source, fixtures, logs, or commits. Keys come from the environment or the OS keychain.
- MIT-compatible dependencies only. Before adding a package, check the registry: exact name, license field, repository URL, and that the repo is the project you meant. Record the result in NOTICE. GPL and AGPL are out. Apache-2.0, BSD, ISC, MIT, Unlicense, Zlib, and MPL-2.0 (file-level, noted in NOTICE) are allowed. Font files may be SIL OFL-1.1. Media assets (models, HDRIs, textures, images) may be CC0 or CC-BY-4.0 with a CREDITS.json entry.
- Do not bundle `@theatre/studio` (AGPL-3.0). Theatre runtime means `@theatre/core` only, pinned, never `@latest`.
- Motion toolkit (D-001): GSAP is the base engine (ScrollTrigger, SplitText, and the other free plugins), and Three.js, raw WebGL/GLSL (OGL or WebGL2), Motion, anime.js, Theatre.js core, Lenis, CSS scroll-driven animations, and vanilla JS all ship. The picker chooses per effect. No replacement or fallback paths.
- One job. Do not implement the next prompt.
- The app UI obeys the anti-slop rulebook: no purple-to-blue gradients, no magnetic buttons, no default Tailwind indigo look, no lorem, no banned words in user-facing copy, no exclamation marks. App screens use the Guide design system in packages/app/src/design/ (tokens, type, motion, components). Never ship an unstyled or default-looking screen. The app must look agency-grade with Don't Panic energy.
- Windows, macOS, and Linux. Use `node:path` and `node:os`. No hardcoded POSIX paths. No required `pdftotext`, Homebrew, or apt.
- If a doc in the repo disagrees with this prompt, stop and write the conflict in the summary. Do not invent an API.
- Authority: context/matt-answers.md (Matt's 40 answers) and DECISIONS.md override everything, including this prompt and CONTEXT-PACKAGE.v2.md. CONTEXT-PACKAGE.md (v1) holds full detail where v2 says "as in v1". If this prompt contradicts Matt, follow Matt and record the conflict.
- Commit when the checks pass. Do not push. Do not create a GitHub repo. Do not deploy.

## Goal

Turn the traced logo into a professional export set (Q12, v1 §9.4). Grok cleans the traced SVG (stray nodes, grid snap, unified strokes, a clean viewBox) through the 017 adapter, then SVGO optimizes it. Checks render it at 32 and 16 px, one-colour, reversed, and a squint (blur) test. Export: master SVG, one-colour black and white SVGs, square profile image, favicon.svg plus 32 and 16 ICO and PNG, app icon 512, transparent PNG at 4096, 1024, and 512, and a print PDF, named `[brand]-logo-[version]-[size].png`. The Guide asks "happy with this? want me to improve it?"

## Why this prompt exists

A trace straight out of vtracer is lumpy and heavy. Agencies hand over a clean master and a full export set; the Guide should too.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- CONTEXT-PACKAGE.md (v1) section 9.4 (logo deliverables)
- context/matt-answers.md Q12
- packages/assets/src/wordmark.ts and packages/assets/src/symbol-trace.ts (055)
- packages/engine/src/ai/think.ts (017)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/assets/src/logo/clean.ts
- packages/assets/src/logo/checks.ts
- packages/assets/src/logo/export-set.ts
- packages/assets/src/logo/ico.ts
- packages/assets/test/logo-clean.test.ts
- packages/assets/test/logo-export.test.ts
- packages/assets/package.json
- NOTICE

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

clean.ts sends the SVG text to think() with schema { svg: string, changes: string[] } and instructions to keep the shape, remove stray nodes under 0.5% of the viewBox area, snap to a 0.5-unit grid, unify stroke widths, and set a tight square-safe viewBox. assertLogoSvg (from 055, or added here) validates the result: parses as SVG, has a viewBox, has at least one path, no raster images, no text elements, under 30 KB after SVGO. If the model output fails, keep the SVGO-only version and note it. checks.ts renders with @resvg/resvg-js (MPL-2.0, file-level; record in NOTICE) at 32 and 16 px and computes simple legibility metrics (filled-pixel ratio, connected components) and a squint score after a Gaussian blur; failing checks produce advice, not silent changes. export-set.ts writes every file under .hitchhiker/brand/logo/ with the naming rule; ico.ts writes ICO from PNG buffers (png-to-ico, MIT, or a small writer); the print PDF uses pdf-lib (MIT) with the path data drawn via drawSvgPath.

## Interfaces and data shapes

```ts
export function cleanLogo(svg: string, deps: { think: typeof think }): Promise<{ svg: string; changes: string[]; usedModel: boolean }>;
export function checkLogo(svg: string): Promise<{ px32: LegibilityScore; px16: LegibilityScore; squint: number; advice: string[] }>;
export function exportLogoSet(svg: string, brand: string, version: string, outDir: string): Promise<string[]>;
```

## Steps

1. Write cleanLogo with schema validation and the SVGO pass; cassette test.

2. Write assertLogoSvg if 055 did not export one, and test it.

3. Write checkLogo with resvg rendering and the squint score.

4. Write exportLogoSet producing every file in the goal; the test asserts each file exists, PNG sizes are exact, and every SVG passes assertLogoSvg.

5. Record new dependencies and licences in NOTICE.

## Edge cases

- Model output changes the silhouette (area differs by more than 5%): reject and keep the SVGO version.
- Very thin strokes vanish at 16 px: advice suggests a simplified favicon mark.
- Brand names with spaces or accents are slugified in file names.

## Acceptance criteria

- [ ] Every export file exists and every SVG passes assertLogoSvg.
- [ ] 32 and 16 px checks and the squint score are reported.
- [ ] The user is asked whether they are happy and offered an improvement.

## must_haves

truths:

- The logo ships as a complete, clean export set.
- Model clean-up cannot distort the mark.
- Small-size legibility is measured.

artifacts:

- packages/assets/src/logo/clean.ts
- packages/assets/src/logo/export-set.ts

key_links:

- cleanLogo consumes the 055 trace.
- 065 shows the export set in the brand kit.

prohibitions:

- Do not embed raster images in the master SVG.
- Do not trace Imagine's letters as the wordmark.
- Do not add GPL or LGPL rendering libraries.

## Verification

Run from the repo root:

```powershell
pnpm install
pnpm --filter @hitchhiker/assets test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/063.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(logo): clean the traced mark and export the full logo set
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `064-review-061-063.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `061` Model-authored brand modules with validators (Deep Why, Forty-Two, xhigh)
- `062` Imagine asset jobs end to end (Hyperspace Bypass, Heart of Gold, xhigh)
- `063` Logo clean-up and export set (Magrathean Logo Works, Heart of Gold, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
