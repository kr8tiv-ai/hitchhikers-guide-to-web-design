---
id: "105"
kind: build
phase: improbability-drive
slice: Marvin
title: "Triage failures with three strikes and a rollback"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["104", "098", "101"]
files: ["packages/orchestrator/src/triage.ts", "packages/orchestrator/test/triage.test.ts"]
requirements: ["HH-MARVIN-02"]
review_checkpoint_embedded: false
---

# 105. Triage failures with three strikes and a rollback

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

Map a verdict to an action using GSD's executor deviation rules (vendor/gsd-core/agents/gsd-executor.md): Rule 1 bug, Rule 2 missing critical piece, Rule 3 blocker are fixed immediately in a fresh session at one effort step higher, with the error, the diff, and the prompt's must_haves. Rule 4 architectural change (framework swap, new backend) or a failed package install escalates and never swaps the package. Three strikes on the same error, or two stalls in a row, roll the build branch back to the last hh-good-* tag, retry once at higher effort, then escalate with two or three options. Never roll back main.

## Why this prompt exists

Automatic fixing is how the drive finishes. Automatic invention is how it wrecks the repo. The strike limit is the difference.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11.2
- vendor/gsd-core/gsd-core/templates/verification-report.md (shape only)
- packages/orchestrator/src/sensors.ts
- packages/orchestrator/src/git-flow.ts
- vendor/gsd-core/agents/gsd-executor.md (deviation rules section)

## Files to create or change

- packages/orchestrator/src/triage.ts
- packages/orchestrator/test/triage.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

decide({ verdict, attempt, rule, branch }) returns retry, stop, escalate, or rollback. attempt starts at 1. Mechanical build-failed is rule 1 and retries while attempt < 3, with effort bumped. On attempt 3, rollback. A package install failure is rule 4 even if the log looks like a build failure. The caller passes `packageFailed: true`. Rollback's target ref is `hh-good-<promptId>` if present in `tags`, else the backup branch name. Never return a remote name. Never include a push. The test walks three attempts and expects rollback on the third.

## Interfaces and data shapes

```ts
export type TriageAction =
  | { type: "retry"; effort: "medium" | "high" | "xhigh" }
  | { type: "stop"; note: string }
  | { type: "escalate"; reason: string }
  | { type: "rollback"; ref: string };

export function decideTriage(input: {
  verdict: "ok" | "stall" | "crash" | "build-failed";
  attempt: number;
  rule: 1 | 2 | 3 | 4;
  packageFailed: boolean;
  promptId: string;
  tags: string[];
  backup: string;
  effort: "medium" | "high" | "xhigh";
}): TriageAction;
```

## Steps

1. ok returns stop with note `already green` so the caller does not retry a success.

2. rule 4 or packageFailed returns escalate and the reason says do not swap the package.

3. rule 1 attempt 1 and 2 return retry with bumped effort.

4. rule 1 attempt 3 returns rollback. If tags contain `hh-good-p1`, ref is that tag when promptId is p1. Otherwise backup.

5. rule 3 returns stop with a note to edit the spec, not a retry.

6. rule 2 attempt 1 retries. attempt 2 stops.

7. Test that rollback ref is never `origin/main`.

8. Do not invoke git in decideTriage.

9. Export it.

## Edge cases

- attempt 0 throws.
- rule 4 with verdict ok still escalates if packageFailed is true. The flag wins.
- Missing backup and missing tag throws rather than rolling back to HEAD~20.

## Acceptance criteria

- [ ] Three mechanical strikes roll back to a good tag or the backup.
- [ ] A failed install escalates and does not suggest a different package.
- [ ] Success does not retry.

## must_haves

truths:

- Rollback stays on the build branch's good tag or backup.
- Package swaps are not a Marvin action.
- Strikes are capped at three.

artifacts:

- packages/orchestrator/src/triage.ts

key_links:

- decideTriage uses bumpEffort and SensorVerdict.

prohibitions:

- Do not push.
- Do not roll back main.
- Do not recommend a replacement package.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/orchestrator test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/105.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(orchestrator): triage failures and cap strikes
```
