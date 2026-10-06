---
id: "109"
kind: build
phase: improbability-drive
slice: Zaphod
title: "Check a prompt's truths against evidence"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["090"]
files: ["packages/qa/src/goal-backward.ts", "packages/qa/test/goal-backward.test.ts"]
requirements: ["HH-REVIEW-02"]
review_checkpoint_embedded: false
---

# 109. Check a prompt's truths against evidence

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

Given a prompt's must_haves and a list of evidence strings, mark each truth FOUND or MISSING. A green test name that does not mention the truth is not automatically FOUND. The caller passes explicit links. The checker does not assume a passing suite means the goal was met.

## Why this prompt exists

Goal-backward review is the GSD habit this product is built on. A checker that trusts coverage percentages will pass an empty feature.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11.3
- vendor/gsd-core/gsd-core/templates/verification-report.md
- packages/engine/src/spec/site-prompts.ts

## Files to create or change

- packages/qa/src/goal-backward.ts
- packages/qa/test/goal-backward.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

checkTruths(truths, evidence) returns rows `{ truth, status }`. evidence items are `{ truth, note }` supplied by the reviewer or by a test. A truth with no evidence row is MISSING. A note shorter than 10 characters is MISSING because `ok` is not evidence. Do not spawn tests. The function is pure.

## Interfaces and data shapes

```ts
export function checkTruths(truths: string[], evidence: Array<{ truth: string; note: string }>): Array<{ truth: string; status: "FOUND" | "MISSING" }>;
```

## Steps

1. Match evidence to truths by exact string.

2. Short notes count as missing.

3. Extra evidence for an unknown truth is ignored and does not create a row.

4. Empty truths throw. A prompt without must_haves is already invalid.

5. Test two truths, one evidenced, and expect FOUND and MISSING.

6. Test that the function source does not contain `child_process`. The test can read the file.

7. Export checkTruths.

8. No network.

## Edge cases

- Whitespace differences fail the match. Callers must pass the exact truth. Document that.
- Duplicate truths throw.

## Acceptance criteria

- [ ] Missing evidence is MISSING, not a soft pass.
- [ ] A short note does not count.
- [ ] The checker does not run the suite itself.

## must_haves

truths:

- A truth is found only when a note is attached.
- Passing tests are not implied evidence.

artifacts:

- packages/qa/src/goal-backward.ts

key_links:

- Truths come from SitePrompt.mustHaves or a Guide prompt's truths list.

prohibitions:

- Do not treat a green suite as proof.
- Do not auto-pass an empty note.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/109.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(qa): check truths goal-backward
```
