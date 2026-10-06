---
id: "152"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Share and Enjoy
title: "Reveals and agency exports"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["065", "126", "146"]
files: ["packages/app/src/reveals/brand-reveal.ts", "packages/app/src/reveals/journey-reveal.ts", "packages/app/src/reveals/reveals.css", "packages/engine/src/exports/prd-pdf.ts", "packages/engine/src/exports/brand-kit-pdf.ts", "packages/engine/test/exports.test.ts", "packages/app/e2e/reveals.spec.ts"]
requirements: ["HH-APP-09"]
review_checkpoint_embedded: false
---

# 152. Reveals and agency exports

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

Add the two reveal moments and agency exports (Q1, Q33): the brand-kit reveal at the end of Babel Fish, the end-of-journey reveal (the Site Brief beside the live site, the scores, and a Don't Panic towel badge), and client-ready PRD and brand-kit PDF exports for agency mode.

## Why this prompt exists

Reveals are where users feel the value of a long interview, and agencies need documents they can hand to a client (Q1, Q33).

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/matt-answers.md Q1 and Q33
- packages/app/src/brand-kit.ts or the 065 brand-kit module
- packages/qa/src/ gate results (142) and packages/deploy/ records (146)
- packages/app/src/design/ (015)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/app/src/reveals/brand-reveal.ts
- packages/app/src/reveals/journey-reveal.ts
- packages/app/src/reveals/reveals.css
- packages/engine/src/exports/prd-pdf.ts
- packages/engine/src/exports/brand-kit-pdf.ts
- packages/engine/test/exports.test.ts
- packages/app/e2e/reveals.spec.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

brand-reveal.ts sequences the approved brand items (palette, type, logo, voice, taglines) with 015 motion tokens and a reduced-motion path. journey-reveal.ts shows the approved Site Brief next to an iframe or screenshot of the live URL, the Lighthouse mobile scores, axe, and the jury score, and awards a towel badge (SVG from the design system) when every gate passed. prd-pdf.ts and brand-kit-pdf.ts render print HTML with the design system's print styles and convert with Playwright's page.pdf (A4 and Letter), writing .hitchhiker/exports/PRD.pdf and brand-kit.pdf with the agency or client name on the cover when agency mode is on.

## Interfaces and data shapes

```ts
export function renderBrandReveal(model: BrandKitModel): string;
export function renderJourneyReveal(input: { brief: SiteBrief; liveUrl: string; scores: GateSummary; jury: number }): string;
export function exportPdf(kind: "prd" | "brand-kit", projectDir: string, opts: { paper: "A4" | "Letter"; agency?: { name: string; client: string } }): Promise<string>;
```

## Steps

1. Write both reveals with reduced-motion paths using 015 tokens.

2. Write the PDF exports with Playwright page.pdf.

3. Test that both PDFs are written, non-empty, and contain the brand name text.

4. Write a Playwright e2e that screenshots both reveals at 375 and 1440.

## Edge cases

- The site is not deployed yet: the journey reveal uses the local preview and says so.
- A gate failed: no badge, and the reveal says which gate to fix.
- Agency mode off: no agency cover page.

## Acceptance criteria

- [ ] Screenshots of both reveals at 375 and 1440 in the summary.
- [ ] PRD.pdf and brand-kit.pdf are written.
- [ ] Reduced motion shows the reveals without animation.

## must_haves

truths:

- Users get a designed reveal at the end of Babel Fish and at the end of the journey.
- Agencies can export client-ready PDFs.
- Badges are earned by passing gates, not given.

artifacts:

- packages/app/src/reveals/brand-reveal.ts
- packages/app/src/reveals/journey-reveal.ts
- packages/engine/src/exports/prd-pdf.ts

key_links:

- The brand reveal reads the 065 brand-kit model.
- The journey reveal reads 142 gate results and 146 deploy records.

prohibitions:

- Do not award the badge when a gate failed.
- Do not show unapproved brand items in the reveal.
- Do not add an exclamation mark to reveal copy.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
pnpm --filter @hitchhiker/app exec playwright test e2e/reveals.spec.ts
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/152.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(app): brand and journey reveals with agency PDF exports
```
