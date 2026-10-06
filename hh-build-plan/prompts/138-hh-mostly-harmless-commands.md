---
id: "138"
kind: build
phase: mostly-harmless
slice: Towel & Tea
title: "Add hh mostly-harmless and hh elevate commands with the QA report"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["132", "130", "122", "123", "124", "127"]
files: ["packages/cli/src/main.ts", "packages/cli/test/mostly-harmless.test.ts", "packages/qa/src/report.ts", "packages/qa/test/report.test.ts"]
requirements: ["HH-QA-12", "HH-QA-11"]
review_checkpoint_embedded: true
---

# 138. Add hh mostly-harmless and hh elevate commands with the QA report

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

Add `hh mostly-harmless --project <dir>` which prints the QA report path it would write and the before-we-jump questions, and `hh elevate --project <dir>` which prints the planned items and refuses to run without `--yes`. Neither command deploys. This closes the phase.

Merged scope (formerly a separate prompt, "Write QA-REPORT.md from the gate results"): Render QA-REPORT.md with one section per gate and an overall PASS or BLOCKER. Include the jury total, the phone performance decision, a11y, and weight. Omit dollar costs. A BLOCKER section lists reasons. The report is markdown, not a screenshot.

## Why this prompt exists

The gates are libraries until a command runs them. The command is also where a stray yes must not appear.

The launch command needs one artifact a human can read. Scattered booleans will be summarized optimistically.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 18
- hh-build-plan/ROADMAP.md Mostly Harmless success criteria
- packages/qa/src/report.ts
- packages/engine/src/spec/before-jump.ts
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 12
- packages/qa/src/lighthouse-gate.ts
- packages/qa/src/jury.ts

## Files to create or change

- packages/cli/src/main.ts
- packages/cli/test/mostly-harmless.test.ts
- packages/qa/src/report.ts
- packages/qa/test/report.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Wire the CLI. For the unit test, inject the report and the questions so you do not need a built site. `--yes` is absent by default. elevate without `--yes` exits 2 and prints `Elevate does not run without --yes.` mostly-harmless does not need --yes because it does not edit. It exits 1 if the report overall is BLOCKER. Use a pure parser extension next to the existing doctor and pause commands. Do not spawn a browser.

Merged scope, "Write QA-REPORT.md from the gate results": renderQaReport(input) returns markdown. Headings: Phone, Accessibility, Weight, Jury, Overall. Overall is BLOCKER if any input status is BLOCKER or the jury failed. Otherwise PASS. The phone section says `real mobile` and lists all four scores when it passes. No exclamation marks. No claim that the site won an award.

## Interfaces and data shapes

```ts
export function parseQaArgs(argv: string[]): { cmd: "mostly-harmless" | "elevate"; project: string; yes: boolean };
```

```ts
export function renderQaReport(input: {
  phone: { status: "PASS" | "BLOCKER"; reasons: string[] };
  a11y: { status: "PASS" | "BLOCKER"; notes: string[] };
  weight: { status: "PASS" | "BLOCKER"; reasons: string[] };
  juryStatus: "PASS" | "FAIL";
  juryTotal: number;
}): string;
```

## Steps

1. Extend the CLI parser. Unknown flags throw.

2. Test elevate without yes does not call an apply function. Pass apply as a stub that throws if called.

3. Test elevate with yes calls apply once.

4. Test mostly-harmless prints a question from a stub beforeWeJump result.

5. Exit codes are asserted by returning them from a function runQa(argv, deps) so you do not have to spawn the bin.

6. No deploy argv is constructed. The test reads that runQa source does not contain `deploy`.

7. Keep doctor, pause, and resume working.

8. This is the phase end. Do not add a host adapter.

9. Render all headings.

10. A single BLOCKER flips overall.

11. Jury FAIL flips overall even if the other statuses are PASS.

12. Escape nothing into HTML. Strip `<` from reasons to keep the markdown boring.

13. Test the real mobile phrase and the four scores on a pass.

14. The report does not contain `$`.

15. Export the function.

16. Keep it under 400 words for the fixture input.

## Edge cases

- Missing --project exits 2.
- --yes on mostly-harmless is ignored or rejected. Reject it so yes does not spread. Test that.
- Empty reasons on a BLOCKER still block and say `no detail`.
- juryTotal is printed with one decimal.

## Acceptance criteria

- [ ] Elevate will not apply without --yes.
- [ ] The report command does not deploy.
- [ ] Existing CLI tests still pass.
- [ ] Overall reflects the worst gate.
- [ ] The real-mobile run and its four scores are named.
- [ ] No prices appear.

## must_haves

truths:

- QA commands exist and are safe by default.
- The phase stops before deploy.
- The report does not hide a blocker.
- It is generated from structured results.

artifacts:

- packages/cli/src/main.ts
- packages/qa/src/report.ts

key_links:

- Commands call the report and Elevate seams.
- Inputs are the gate return values.

prohibitions:

- Do not deploy.
- Do not default --yes to true.
- Do not start So Long.
- Do not omit a failing section.
- Do not add a price.
- Do not claim an award.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/cli test
pnpm --filter @hitchhiker/qa test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/138.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(cli): add mostly-harmless and elevate commands
```

## REVIEW CHECKPOINT

This build closes a review group and the Mostly Harmless phase. After this commit, the driver runs the fresh-session reviewer prompt `139-review-138.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `138` Add hh mostly-harmless and hh elevate commands with the QA report (Towel & Tea, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
