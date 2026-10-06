---
id: "113"
kind: build
phase: improbability-drive
slice: Zaphod
title: "Write PASS, FIX, or ESCALATE after at most two fix rounds"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["109", "110", "112"]
files: ["packages/qa/src/verdict.ts", "packages/qa/test/verdict.test.ts"]
requirements: ["HH-REVIEW-05"]
review_checkpoint_embedded: false
---

# 113. Write PASS, FIX, or ESCALATE after at most two fix rounds

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

Combine truth rows, pillar summary, and slop hits into PASS, FIX, or ESCALATE. A BLOCKER is ESCALATE. A FIX may be retried at most twice. The third failure of the same truth is a known issue only if the site still builds. If the app or site cannot start, it stays ESCALATE. This function does not apply the fix.

## Why this prompt exists

The review loop is the product's quality bar. An unlimited fix loop is a stall with extra steps.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11.3
- packages/qa/src/goal-backward.ts
- packages/qa/src/pillars.ts
- packages/qa/src/antislop.ts

## Files to create or change

- packages/qa/src/verdict.ts
- packages/qa/test/verdict.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

decideReview({ truths, worstPillar, slopHits, fixRound, boots }) returns the verdict and reasons. fixRound is 0, 1, or 2. PASS requires all truths FOUND, worst PASS, no slop hits. FIX is for FIX pillars, MISSING truths, or slop hits while fixRound < 2 and boots is true. At fixRound 2 with boots true and no BLOCKER, the verdict is PASS_WITH_KNOWN_ISSUES and the reasons are written to the review's Known issues list (v1 §11.3). BLOCKER or boots false is ESCALATE.

## Interfaces and data shapes

```ts
export function decideReview(input: {
  truthStatuses: Array<"FOUND" | "MISSING">;
  worstPillar: "PASS" | "FIX" | "BLOCKER";
  slopHits: number;
  fixRound: number;
  boots: boolean;
}): { verdict: "PASS" | "PASS_WITH_KNOWN_ISSUES" | "FIX" | "ESCALATE"; reasons: string[] };
```

## Steps

1. Implement the table in the context. Test PASS on a clean input.

2. MISSING truth at round 0 with boots true is FIX.

3. The same at round 2 is ESCALATE.

4. BLOCKER is ESCALATE even at round 0.

5. boots false is ESCALATE even if everything else passes.

6. fixRound 3 throws. The caller should have stopped.

7. Reasons name the failing input. No exclamation marks.

8. Export decideReview.

## Edge cases

- slopHits above 0 prevents PASS and is FIX until the round cap.
- Empty truth list throws.

## Acceptance criteria

- [ ] Two fix rounds are the maximum.
- [ ] A site that does not boot escalates.
- [ ] Clean input passes.

## must_haves

truths:

- The verdict is computed from evidence fields.
- The function does not edit source.

artifacts:

- packages/qa/src/verdict.ts

key_links:

- Inputs come from checkTruths, summarizePillars, and lintSlop.

prohibitions:

- Do not apply a fix in this function.
- Do not allow a third silent retry.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/113.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(qa): decide PASS, FIX, or ESCALATE
```
