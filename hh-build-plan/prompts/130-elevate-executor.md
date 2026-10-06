---
id: "130"
kind: build
phase: mostly-harmless
slice: Total Perspective Vortex
title: "Apply an Elevate item only if the gates still pass"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["128", "123", "122"]
files: ["packages/qa/src/elevate-run.ts", "packages/qa/test/elevate-run.test.ts"]
requirements: ["HH-QA-07"]
review_checkpoint_embedded: false
---

# 130. Apply an Elevate item only if the gates still pass

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

Apply one planned edit through an injected mutator, then re-run injected gate functions. If a gate flips from PASS to BLOCKER, roll the edit back with the injected rollback and return refused. If the gates stay clear, return kept. Do not keep a prettier page that fails the phone gate.

## Why this prompt exists

Elevate that regresses accessibility is a launch bug with better spacing. The refuse path is the feature.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 12
- packages/qa/src/elevate.ts
- packages/qa/src/lighthouse-gate.ts
- packages/qa/src/a11y-gate.ts

## Files to create or change

- packages/qa/src/elevate-run.ts
- packages/qa/test/elevate-run.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

runElevate({ apply, rollback, gatesBefore, gatesAfter }) calls apply, then gatesAfter. Compare statuses. Any new BLOCKER triggers rollback and status refused. gatesBefore and gatesAfter are functions returning the structured statuses you already defined. The test uses counters to prove rollback ran and apply ran once. No real files.

## Interfaces and data shapes

```ts
export async function runElevate(input: {
  apply: () => Promise<void>;
  rollback: () => Promise<void>;
  before: () => { lh: "PASS" | "BLOCKER"; a11y: "PASS" | "BLOCKER" };
  after: () => { lh: "PASS" | "BLOCKER"; a11y: "PASS" | "BLOCKER" };
}): Promise<{ status: "kept" | "refused"; rolledBack: boolean }>;
```

## Steps

1. Happy path: both after PASS, rollback not called, status kept.

2. Regression path: after lh is BLOCKER, rollback called once, status refused.

3. If rollback throws, the returned promise rejects. Do not swallow it.

4. apply is called once. A second apply fails the test.

5. Do not import a browser.

6. Export runElevate.

7. No git commands.

8. Comment that a real caller wires these to the gate functions and a patch.

## Edge cases

- before already BLOCKER and after BLOCKER is refused too. Elevate may not keep a change while a gate is red. Document and test it.
- Empty functions are not allowed. They are required in the type.

## Acceptance criteria

- [ ] A regressed gate rolls back.
- [ ] A clean gate keeps the edit.
- [ ] apply runs once.

## must_haves

truths:

- Elevate cannot keep a gate regression.
- The executor is injectable and unit-tested.

artifacts:

- packages/qa/src/elevate-run.ts

key_links:

- It consumes the statuses from evaluateLh and evaluateA11y.

prohibitions:

- Do not keep a failing edit.
- Do not call live Lighthouse in the unit test.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/130.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(qa): refuse Elevate changes that fail a gate
```
