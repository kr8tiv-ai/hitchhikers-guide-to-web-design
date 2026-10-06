---
id: "122"
kind: build
phase: mostly-harmless
slice: Nutrimatic Test
title: "Gate Lighthouse on real mobile runs: all four scores at 90"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["074", "108"]
files: ["packages/qa/src/lighthouse-gate.ts", "packages/qa/test/lighthouse-gate.test.ts"]
requirements: ["HH-QA-01"]
review_checkpoint_embedded: false
---

# 122. Gate Lighthouse on real mobile runs: all four scores at 90

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

Interpret Lighthouse results from real mobile runs (LHCI mobile preset: emulated mid-range phone, simulated slow 4G, CPU throttling, median of 3 runs per route) of every route exactly as a phone receives it. Performance, accessibility, best practices, and SEO must each be at least 90 on every route's mobile run (Matt, D-006). If a heavy desktop scene is swapped for a phone fallback, the mobile run measures that fallback, because it is what the phone gets. Desktop runs are informational and never waive the phone. A missing mobile run is a BLOCKER, not a waiver.

## Why this prompt exists

A single desktop score was going to bless a phone that never loads. The gate is the correction.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 12
- packages/engine/src/config.ts
- packages/engine/src/spec/motion.ts

## Files to create or change

- packages/qa/src/lighthouse-gate.ts
- packages/qa/test/lighthouse-gate.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Score inputs are numbers from 0 to 1 as Lighthouse emits, or 0 to 100. Detect which by treating values <= 1 as fractions. evaluateLh({ phone, desktop }) returns PASS or BLOCKER with reasons. phone is required. desktop is optional. phone null is always BLOCKER. All four phone categories use the config floors, default 90 each, and floors below 90 are rejected. Do not shell out to lhci in the unit test. A parser accepts a tiny fixture object shaped like `{ categories: { performance: { score: 0.91 } } }`.

## Interfaces and data shapes

```ts
export function evaluateLh(input: {
  phone: { performance: number; accessibility: number; bestPractices: number; seo: number } | null;
  desktop?: { performance: number; accessibility: number; bestPractices: number; seo: number } | null;
  heavy: boolean;
  floors: { phonePerfMin: number; a11yMin: number; bestPracticesMin: number; seoMin: number };
}): { status: "PASS" | "BLOCKER"; reasons: string[] };
```

## Steps

1. Normalize fractions to 0-100.

2. A missing phone run returns BLOCKER and the reason says a real mobile run is required.

3. Phone performance 89 fails. 90 passes if the other three are >= 90.

4. Desktop performance 40 does not fail when the phone run passed; the result lists the desktop score as informational.

5. Phone accessibility 89 fails, phone SEO 89 fails, phone best practices 89 fails. Each has its own test.

6. A test fixture of the category shape maps into the input via a function fromLhci(json).

7. Do not download Chrome.

8. Export both functions.

## Edge cases

- Scores above 100 throw.
- Negative scores throw.
- heavy false and phone null is still BLOCKER. Phone is always required.

## Acceptance criteria

- [ ] All four phone categories use the floor of 90.
- [ ] A missing phone run blocks.
- [ ] Desktop 3D performance does not waive the phone, and the mobile run measures what the phone actually gets.

## must_haves

truths:

- Real mobile runs are the gate: all four categories at 90 or more on every route.
- A11y, best practices, and SEO stay at 90 anywhere they are measured.

artifacts:

- packages/qa/src/lighthouse-gate.ts

key_links:

- Floors come from GuideConfig.gates.

prohibitions:

- Do not lower the phone floor to 70.
- Do not require a live Chrome in the unit test.
- Do not ignore a missing phone run.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/122.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(qa): gate Lighthouse on real mobile runs at 90 in all four categories
```
