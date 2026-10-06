---
id: "136"
kind: build
phase: mostly-harmless
slice: Towel & Tea
title: "Replay Towel and Tea through brief and brand compilers"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["135", "069", "073"]
files: ["packages/engine/test/dogfood.test.ts"]
requirements: ["HH-QA-10"]
review_checkpoint_embedded: true
---

# 136. Replay Towel and Tea through brief and brand compilers

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

Add a test that loads the fixture, builds a why, a voice snippet or brand parts you can construct without a model, a PRD, and a motion plan at the assumed appetite, and asserts the phone-path warning exists for nothing heavy. The test is the dogfood runner. It does not start the orchestrator.

## Why this prompt exists

A fixture that nobody replays will rot. This test is the replay. It ties the frozen tea-shop answers to the PRD, the truth linter, and the motion picker so a later edit cannot quietly assign a heavy library to a calm site.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- evals/towel-and-tea/transcript.json
- packages/engine/src/spec/prd.ts
- packages/engine/src/brand/brain.ts
- packages/engine/src/spec/motion.ts

## Files to create or change

- packages/engine/test/dogfood.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Use the public compilers. Where a compiler needs a field the fixture lacks, extend the fixture rather than weakening the compiler. Appetite from the skip default is 3. planMotion on a single light-reveal should pick css-scroll or vanilla, not three. Assert three is not assigned. Assert the PRD contains the assumptions list and the hosting value. No network.

## Interfaces and data shapes

```ts
export interface DogfoodResult {
  siteWhy: string;
  hosting: string;
  motionLibraries: string[];
  prdHasAssumptions: boolean;
}

export function summarizeDogfood(input: {
  answers: AnswerRecord[];
  prdMarkdown: string;
  libraries: string[];
}): DogfoodResult;
```

## Steps

1. Load the fixture in the test.

2. Run compileWhy or the closest exported function. If the fixture answers are shaped as AnswerRecord, pass them through.

3. renderPrd and assert `no idea` or the hosting string appears under assumptions or the body.

4. planMotion with a light reveal at appetite 3 and assert the library is not three and not theatre.

5. Assert lintClaims on the PRD is ok.

6. Do not spawn processes.

7. Keep the test under a few seconds.

8. If a type export blocks you, add the smallest export to the engine index and name it in the summary.

## Edge cases

- The test fails if the fixture and the compilers drift. Do not catch and ignore.
- No Date dependency.

## Acceptance criteria

- [ ] PRD, why, and motion plan build from the fixture.
- [ ] No heavy library is selected for appetite 3.
- [ ] The truth linter is clean.

## must_haves

truths:

- The fixture survives a compiler replay.
- Dogfood does not need a live model.

artifacts:

- packages/engine/test/dogfood.test.ts

key_links:

- The test calls renderPrd, planMotion, and the fixture files.

prohibitions:

- Do not call grok.
- Do not skip assertions with a try/catch.
- Do not assign Three at appetite 3.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/136.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
test: dogfood Towel and Tea through the compilers
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `137-review-134-136.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `134` Before-we-jump at every phase start (Before We Jump, Gargle Blaster, high)
- `135` Freeze the Towel and Tea eval fixture (Towel & Tea, Gargle Blaster, high)
- `136` Replay Towel and Tea through brief and brand compilers (Towel & Tea, Heart of Gold, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
