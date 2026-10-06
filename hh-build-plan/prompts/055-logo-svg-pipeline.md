---
id: "055"
kind: build
phase: babel-fish
slice: Magrathean Logo Works
title: "Set the wordmark in a real font and trace the symbol"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["054"]
files: ["packages/assets/src/wordmark.ts", "packages/assets/src/symbol-trace.ts", "packages/assets/test/logo-svg.test.ts", "packages/assets/test/fixtures/README.md", "NOTICE"]
requirements: ["HH-LOGO-02"]
review_checkpoint_embedded: true
---

# 055. Set the wordmark in a real font and trace the symbol

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

Export an SVG wordmark by shaping text with opentype.js from a real font file, and an SVG symbol by tracing a raster through `@visioncortex/vtracer`. Never trace the wordmark. Never use potrace. Never install the npm package named `vtracer` at 1.0.8. Run SVGO. Ship a golden test that a known PNG becomes an SVG with a path, not with a foreignObject or an embedded image.

## Why this prompt exists

Tracing Imagine's letters produces a logo that falls apart at 16 pixels and that you do not legally or technically control. A real font stays a font. The symbol can be a trace because it is a shape.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 9 logo pipeline steps 3 through 6
- hh-build-plan/RESEARCH-ADDENDUM.md notes on opentype.js, @visioncortex/vtracer, and potrace
- packages/assets/src/logo-concepts.ts

## Files to create or change

- packages/assets/src/wordmark.ts
- packages/assets/src/symbol-trace.ts
- packages/assets/test/logo-svg.test.ts
- packages/assets/test/fixtures/README.md
- NOTICE

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Pin versions you install and write NOTICE. opentype.js is MIT. `@visioncortex/vtracer` is MIT OR Apache-2.0 and the tag you pin is 1.0.0-alpha.4 unless the registry shows a newer stable that is still that package name and that license. If the API differs, wrap it and document the actual call in the summary. If install fails, stop. Do not fall back to potrace, which is GPL. wordmarkSvg({ fontPath, text, fontSize }) returns an SVG string whose paths came from the font. The test uses a font you are allowed to commit. SIL Open Font License is not MIT. Do not commit a SIL font without a NOTICE line and a file-level note. Prefer generating the test with a font already on the machine only if the path is injected. Commit one small OFL font (for example a single weight of an OFL family) under packages/assets/test/fixtures/fonts/ with its OFL.txt, recorded in NOTICE. The wordmark test shapes real glyphs from that font with opentype.js. In production, the font file comes from the type pair approved in 049 (download with the user's yes, licence recorded). Also test that the wordmark function rejects an input flagged `source: 'imagine-raster'`. symbolTrace calls the wasm tracer. Keep traceRaster(png, impl) for unit tests, but vtracer.integration.test.ts must run (not skip) on Windows, macOS, and Linux in CI and trace packages/assets/test/fixtures/symbol.png into an SVG with at least one <path>. If the wasm package cannot load, stop and ESCALATE. Do not ship a skipped test. The exported SVG must contain `<path` and must not contain `<image`. svgoOptimize is a function. If you add svgo, record its license. Grid and viewBox are set to 0 0 32 32 for the small test and the path is non-empty.

## Interfaces and data shapes

```ts
export function buildWordmarkSvg(opts: {
  text: string;
  glyphToPath: (ch: string) => string;
  source: "font" | "imagine-raster";
}): string;

export function traceSymbol(png: Buffer, impl: (png: Buffer) => string): string;

export function assertLogoSvg(svg: string): void;
```

## Steps

1. buildWordmarkSvg throws if source is imagine-raster. The error says to set the wordmark in a font.

2. With a fake glyphToPath that returns `M0 0 L10 0 L10 10 Z` for `T`, the SVG contains that path data and the text characters are not left as `<text>` only. A `<text>` fallback is forbidden.

3. assertLogoSvg throws if the svg contains `<image`, `foreignObject`, or `data:image`.

4. traceSymbol returns the impl result after assertLogoSvg. The test impl returns a path svg. An impl that returns an `<image>` fails.

5. Add the dependency `@visioncortex/vtracer` only if `pnpm view` or the installed package.json license matches MIT OR Apache-2.0. Record the version. Do not add a package named `vtracer` without the scope.

6. Do not add potrace or a binding to it. The test reads package.json and fails on the dependency name potrace.

7. Write a 32 and 16 viewBox helper setViewBox(svg, size) and test size 16 still has a path.

8. One-color rule: reject a svg with two different stroke colors in this helper. Fill `#111111` is the default.

9. Document the alpha pin and the golden rule in the fixture README in one short paragraph.

## Edge cases

- Empty text throws.
- A glyph callback that returns an empty string for a character throws and names the character.
- SVG is prefixed with the XML declaration or without. Pick one. The test uses includes `<path`.

## Acceptance criteria

- [ ] Imagine-raster wordmarks throw.
- [ ] Output SVG has a path and no embedded image.
- [ ] package.json does not depend on potrace or unscoped vtracer 1.0.8.
- [ ] NOTICE records opentype.js, @visioncortex/vtracer, svgo, and the fixture font licence.

## must_haves

truths:

- Wordmarks come from glyph paths, not from a traced painting of letters.
- Symbols are traces through the visioncortex package, behind a testable seam.
- Potrace cannot be a dependency.

artifacts:

- packages/assets/src/wordmark.ts
- packages/assets/src/symbol-trace.ts

key_links:

- assertLogoSvg is used by both exporters.
- logo-concepts.ts promised letters would be set in a font. This prompt is that step.

prohibitions:

- Do not trace Imagine's letters.
- Do not depend on potrace or GPL.
- Do not embed a PNG inside the SVG as the logo.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/assets test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/055.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(assets): export font wordmarks and traced symbols
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `056-review-053-055.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `053` Price Imagine jobs and stop at the cap (Magrathean Logo Works, Forty-Two, high)
- `054` List ten logo directions and render four flats (Magrathean Logo Works, Heart of Gold, high)
- `055` Set the wordmark in a real font and trace the symbol (Magrathean Logo Works, Forty-Two, xhigh)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
