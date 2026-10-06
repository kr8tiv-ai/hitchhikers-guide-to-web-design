---
id: "127"
kind: build
phase: mostly-harmless
slice: Total Perspective Vortex
title: "Score the four-part jury"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["110", "122"]
files: ["packages/qa/src/jury.ts", "packages/qa/test/jury.test.ts"]
requirements: ["HH-QA-05"]
review_checkpoint_embedded: false
---

# 127. Score the four-part jury

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

Combine four weighted scores into a jury result. Three judges each score Design 40%, Usability 30%, Creativity 20%, Content 10% (Awwwards-style, v1 §12.1; "If it's a 6, say 6"). The scores come from Grok vision via 126; this function aggregates them. Any pillar BLOCKER or a failed phone gate forces the jury to fail even if the weighted total looks high. Scores are 0 to 10.

## Why this prompt exists

A weighted average will hide a broken phone page behind a charming brand. The force-fail is the point.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 12
- packages/qa/src/pillars.ts

## Files to create or change

- packages/qa/src/jury.ts
- packages/qa/test/jury.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

jury({ brand, craft, clarity, performance, blocked }) returns `{ total, status }`. total is the weighted sum divided by 10 so it stays on a 0-10 scale, or document the 0-100 scale and test it. Pick 0-100: brand*4 + craft*3 + clarity*2 + performance*1, with inputs 0-10, so max is 100. status FAIL if blocked or total < 70. Otherwise PASS. Do not present the number as a Lighthouse score.

## Interfaces and data shapes

```ts
export function jury(input: { brand: number; craft: number; clarity: number; performance: number; blocked: boolean }): { total: number; status: "PASS" | "FAIL" };
```

## Steps

1. Compute the weighted total. Test all 10s equals 100.

2. blocked true and total 100 is FAIL.

3. total 69 without a block is FAIL. 70 is PASS.

4. Scores outside 0-10 throw.

5. The result object does not contain the word lighthouse.

6. Export jury.

7. No randomness.

8. No network.

## Edge cases

- Fractional scores are allowed. 7.5 is valid.
- NaN throws.

## Acceptance criteria

- [ ] Weights are 40, 30, 20, and 10.
- [ ] A blocker fails a perfect score.
- [ ] The threshold is 70.

## must_haves

truths:

- The jury cannot outvote a blocker.
- The weights are fixed in code and in the test.

artifacts:

- packages/qa/src/jury.ts

key_links:

- blocked is true when pillars or the phone gate say BLOCKER.

prohibitions:

- Do not hide a blocker inside the average.
- Do not change the weights.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/127.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(qa): add the weighted jury
```
