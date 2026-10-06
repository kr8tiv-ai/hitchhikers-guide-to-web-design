---
id: "126"
kind: build
phase: mostly-harmless
slice: Vogon Constructor Fleet
title: "Live drive, vision review, real gates, console gate, live dogfood"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["096", "104", "105", "108", "109", "110", "113", "114", "120", "122", "123", "124", "011", "086"]
files: ["packages/orchestrator/src/live-runner.ts", "packages/qa/src/playwright-opener.ts", "packages/qa/src/zaphod-vision.ts", "packages/qa/src/fix-prompts.ts", "packages/qa/src/lhci-run.ts", "packages/qa/src/axe-run.ts", "packages/qa/src/console-gate.ts", "packages/qa/src/link-check.ts", "packages/qa/src/site-once-over.ts", "packages/qa/test/live-gates.test.ts", "packages/orchestrator/test/live-runner.test.ts", "evals/dogfood-live/run.ts", "evals/dogfood-live/README.md"]
requirements: ["HH-DRIVE-09", "HH-QA-09"]
review_checkpoint_embedded: false
---

# 126. Live drive, vision review, real gates, console gate, live dogfood

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

Wire the drive to real Grok and the gates to real tools. The runner launches real `grok` sessions (096 argv). A Playwright opener implements 108 (full page, fold, scroll strip). Zaphod sends screenshots, diffs, and must_haves to Grok vision and fills 109, 110, and 127; on FIX it writes one to three fix prompts and runs them (at most two rounds). Real gates: LHCI on mobile (3 runs, assertions at 90 in all four categories), @axe-core/playwright, keyboard and reduced-motion runs, a console-error and failed-request gate (zero allowed) at four widths, a link checker, and the weight budget. A per-site final Forty-Two once-over runs before Mostly Harmless. An opt-in live dogfood builds a small Towel & Tea site end to end and records times and token counts (feeds 118).

## Why this prompt exists

Everything before this was contracts and fixtures. This prompt makes the Guide actually build and judge a site, which is the promise of the product.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 11 and 12
- CONTEXT-PACKAGE.md (v1) sections 11 and 12
- context/research/10-agent-orchestration-qa.md
- packages/orchestrator/src/runner.ts (096), policy.ts (097), and the Marvin modules (104, 105)
- packages/qa/src/ (108, 109, 110, 113, 122, 123, 124)
- packages/engine/src/ai/think.ts (017)
- packages/templates/ (106)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/orchestrator/src/live-runner.ts
- packages/qa/src/playwright-opener.ts
- packages/qa/src/zaphod-vision.ts
- packages/qa/src/fix-prompts.ts
- packages/qa/src/lhci-run.ts
- packages/qa/src/axe-run.ts
- packages/qa/src/console-gate.ts
- packages/qa/src/link-check.ts
- packages/qa/src/site-once-over.ts
- packages/qa/test/live-gates.test.ts
- packages/orchestrator/test/live-runner.test.ts
- evals/dogfood-live/run.ts
- evals/dogfood-live/README.md

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

live-runner.ts implements the runner interface with a real spawn of grok (argv from 096, permission policy from 097, prompts from .hitchhiker/prompts/), streams NDJSON to .hitchhiker/logs/drive/NNN.ndjson, and reports to Marvin's sensors (104). playwright-opener.ts starts the site's preview server, captures 375, 768, 1440, and 1920 full page and fold screenshots plus a scroll strip (8 frames) for motion-led sections. zaphod-vision.ts calls think() with images and the prompt's must_haves (schema matches 109/110/127 inputs), and fix-prompts.ts writes up to 3 fix prompts per FIX verdict into .hitchhiker/prompts/fix/ and runs them, max 2 rounds, then PASS_WITH_KNOWN_ISSUES or ESCALATE (113). lhci-run.ts runs @lhci/cli with the mobile preset, numberOfRuns 3, and assertions minScore 0.9 for performance, accessibility, best-practices, and seo on every route; results feed 122. axe-run.ts uses @axe-core/playwright (serious and critical fail); keyboard run tabs through every interactive element and checks visible focus; reduced-motion run emulates the media query and checks no animation runs longer than 0.2 s. console-gate.ts fails on any console error or failed request at any of the four widths. link-check.ts checks internal links and same-site assets. site-once-over.ts is the per-site Forty-Two once-over prompt run at xhigh before Mostly Harmless. evals/dogfood-live/run.ts runs only with HH_LIVE=1 and writes evals/dogfood-live/REPORT.md with per-prompt times and token counts.

## Interfaces and data shapes

```ts
export function runLivePrompt(file: string, deps: { spawnImpl: SpawnLike; projectDir: string; config: GuideConfig }): Promise<{ exitCode: number; durationMs: number; tokens?: { input: number; output: number } }>;
export function captureReviewShots(url: string, sections: string[], outDir: string): Promise<string[]>;
export function zaphodReview(input: { prompt: SitePrompt; shots: string[]; diff: string }, deps: { think: typeof think }): Promise<ReviewVerdict>;
export function runGates(url: string, routes: string[]): Promise<{ lighthouse: LhResult[]; axe: AxeResult; console: { errors: number; failedRequests: number }; links: LinkResult; weight: WeightResult; pass: boolean }>;
```

## Steps

1. Write live-runner.ts with a fake-spawn test path and the real spawn path.

2. Write playwright-opener.ts against a fixture site served from 106's astro-default template.

3. Write zaphodReview and fix-prompts with cassette tests, including a two-round FIX ending in PASS_WITH_KNOWN_ISSUES.

4. Write lhci-run, axe-run, keyboard and reduced-motion runs, console-gate, and link-check; test each against the fixture site (CI path) with real tools.

5. Write site-once-over.ts and add it to the drive queue before Mostly Harmless.

6. Write the opt-in live dogfood runner and README.

7. Make the fixture CI path green and record the commands in the summary.

## Edge cases

- Chrome missing: install via playwright, or fail with a one-line fix.
- A gate tool crashes: the gate fails closed (BLOCKER), never passes by default.
- Grok usage limit during a live run: stop the queue, mark the prompt paused, and surface it on the dashboard.

## Acceptance criteria

- [ ] The fixture CI path is green with real gates.
- [ ] The console-error and failed-request gate allows zero.
- [ ] LHCI mobile asserts 90 in all four categories.
- [ ] The live dogfood report is written to evals/ when HH_LIVE=1.

## must_haves

truths:

- The drive runs real Grok sessions.
- Zaphod judges with vision against must_haves.
- Gates use real tools and fail closed.

artifacts:

- packages/orchestrator/src/live-runner.ts
- packages/qa/src/zaphod-vision.ts
- packages/qa/src/console-gate.ts
- packages/qa/src/lhci-run.ts

key_links:

- zaphodReview feeds 109, 110, 127, and 113.
- lhci-run results are judged by 122's evaluateLh.

prohibitions:

- Do not let a crashed gate count as a pass.
- Do not lower any Lighthouse floor below 90.
- Do not run the live dogfood in CI without HH_LIVE=1.

## Verification

Run from the repo root:

```powershell
pnpm install
pnpm --filter @hitchhiker/orchestrator test
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/126.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(drive): live runner, Zaphod vision review, and real phone gates
```
