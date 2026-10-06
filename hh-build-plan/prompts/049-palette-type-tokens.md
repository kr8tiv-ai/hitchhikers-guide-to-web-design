---
id: "049"
kind: build
phase: babel-fish
slice: Sens-O-Matic
title: "Build palettes, type pairs, and contrast tokens"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["046"]
files: ["packages/engine/src/brand/tokens.ts", "packages/engine/test/tokens.test.ts"]
requirements: ["HH-BRAND-04"]
review_checkpoint_embedded: false
---

# 049. Build palettes, type pairs, and contrast tokens

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

Emit three palettes in 60-30-10 form and one type pair using at most two families. Every text-on-background pair must meet WCAG 2.2 contrast: 4.5 to 1 for body and 3 to 1 for large text. Fail a palette that misses, rather than shipping it with a warning.

## Why this prompt exists

A beautiful muddy palette becomes an accessibility defect in Mostly Harmless. The token compiler is where that defect dies.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 9 and 14
- interview/tree.yaml DP-1.2 and DP-1.5
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 12 for contrast ratios
- context/research/08-brand-intake-frameworks.md
- CONTEXT-PACKAGE.md (v1) sections 9.1–9.6
- context/sources/build-a-brand-from-scratch-with-ai.plain.txt (Matt's method; verbatim prompts allowed with credit, D-005)

## Files to create or change

- packages/engine/src/brand/tokens.ts
- packages/engine/test/tokens.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Colors are hex. contrastRatio(a, b) implements the WCAG relative luminance formula. Test black on white is 21. Test #777777 on #ffffff is below 4.5. proposePalettes({ seedHex, vibe }) returns three palettes named paper, ink, and signal, or fewer if it cannot find three that pass. It must not return a failing one. If the user seed fails as body text, keep the seed as a signal swatch on a passing paper, not as body text. Type: choose from the six pairings in the tree unless the user named a family in DP-1.5. At most two families. Record a license note `Google Fonts or Fontshare. Confirm the license at install.` Do not download fonts. No default Tailwind indigo. No purple-to-blue gradient as a token. tokens.css.ts or a function renderCssVars(palette) returns a `:root` block.

## Interfaces and data shapes

```ts
export function contrastRatio(foreground: string, background: string): number;

export interface Palette {
  name: string;
  paper: string;
  ink: string;
  signal: string;
  ratioBody: number;
}

export function proposePalettes(input: { seedHex: string | null; vibe: string }): Palette[];
export function renderCssVars(palette: Palette): string;
```

## Steps

1. Implement contrastRatio and the two fixture tests named in the context. Use the official coefficients. Do not call a library.

2. proposePalettes builds candidates from the seed by mixing with white and near-black using a simple channel mix you write. Drop any candidate whose ink-on-paper is under 4.5.

3. Always include one high-contrast fallback: paper #f4f0e6 and ink #1c1915, if the seed cannot produce three. The test can force this with a mid-gray seed.

4. Reject a palette whose signal is the only difference if ink fails. The function's return length is 1, 2, or 3, never a fail.

5. Type pair function pickType(answer: string | null) returns `{ families: [string, string] | [string], source: 'user' | 'list' }`. Two families maximum. Test a user string that names three fonts and assert the result length is 2 and a warning `dropped extra family` is returned. Adjust the return type to include warnings.

6. renderCssVars emits --paper, --ink, --signal. No gradient function in the output.

7. A purple-blue pair #4f46e5 on #7c3aed is not proposed. Add a denylist of those two hex values.

8. Export the functions.

9. Do not fetch Google Fonts.

## Edge cases

- 3-digit hex is accepted and expanded.
- Invalid hex throws.
- Large-text ratio is computed by the same function. The caller decides 3 versus 4.5. Export a helper passes(ratio, kind: 'body' | 'large').

## Acceptance criteria

- [ ] Black on white is about 21.
- [ ] No returned palette is under 4.5 for ink on paper.
- [ ] At most two font families are returned.
- [ ] Indigo and violet denylist hex values are absent.

## must_haves

truths:

- Contrast is enforced in the compiler.
- Type is two families or one.
- Font files are not downloaded here.

artifacts:

- packages/engine/src/brand/tokens.ts

key_links:

- proposePalettes uses the DP-1.2 seed when the caller passes it.

prohibitions:

- Do not ship a failing contrast pair.
- Do not use the default Tailwind indigo palette.
- Do not download font binaries.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/049.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(brand): add contrast-safe palettes and type pairs
```
