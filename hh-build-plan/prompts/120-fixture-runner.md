---
id: "120"
kind: build
phase: improbability-drive
slice: Eddie
title: "Run the drive loop against a fixture spawn"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["102", "105", "114", "117", "118"]
files: ["packages/orchestrator/src/fixture-run.ts", "packages/orchestrator/test/fixture-run.test.ts"]
requirements: ["HH-DRIVE-13"]
review_checkpoint_embedded: true
---

# 120. Run the drive loop against a fixture spawn

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

Drive three fake site prompts through schedule, approval, a fixture spawn, a mechanical failure, one retry, and a pass, writing the queue and STATE in a temp project. No real grok, no network, no push. This is the phase's proof that CI can exercise Eddie.

## Why this prompt exists

The pieces can pass alone and still fail to pause, retry, or record a commit. One fixture loop is the integration.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11
- hh-build-plan/ROADMAP.md Improbability Drive success criteria
- packages/orchestrator/src/runner.ts
- packages/orchestrator/src/triage.ts
- packages/orchestrator/src/schedule.ts
- packages/orchestrator/src/progress.ts

## Files to create or change

- packages/orchestrator/src/fixture-run.ts
- packages/orchestrator/test/fixture-run.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

runFixture(dir) builds three prompt ids, inserts reviews, requires an approval object you construct in the test, spawns via a stub that fails the first build once with a TS error string and then succeeds, and expects the triage to retry then pass. The review steps are recorded as passed without a browser by a stub reviewer that returns PASS. Assert the queue has no running item at the end, lastGoodCommit is set, and spawn was not the string grok. Also assert evaluateCommand would deny a push if the stub is asked to run one. Do not implement a new policy.

## Interfaces and data shapes

```ts
export function runFixture(dir: string, spawnImpl: (argv: string[]) => Promise<{ code: number; stderr: string }>): Promise<{ passed: number; retried: number }>;
```

## Steps

1. Write the fixture driver using the functions you already exported. If a glue function is missing, add it in fixture-run.ts rather than rewriting the others.

2. The stub counts calls. First call returns code 1 and stderr `error TS2322`. Later calls return 0.

3. Assert retried is at least 1 and the final queue has no `running` status.

4. Assert a push argv is denied by evaluateCommand inside the test.

5. Create the temp project with scaffold or by writing STATE yourself. Clean up in finally.

6. Do not call DNS. A test fails if fixture-run.ts imports `node:http` or `node:https`.

7. Approval is required. A second test calls the driver path with approved false and expects a throw before spawn.

8. This closes Improbability Drive. Do not add a host adapter.

9. Export runFixture.

## Edge cases

- If the stub always fails, the third strike returns rollback and the fixture stops. Add that as a separate test with a stub that always fails. It must not loop forever.
- Temp dirs are removed.

## Acceptance criteria

- [ ] A flaky first failure retries and then passes.
- [ ] An always-failing stub stops by rollback or escalate, not an infinite loop.
- [ ] Unapproved runs do not spawn.
- [ ] No network imports.

## must_haves

truths:

- CI can run the drive loop without SuperGrok.
- Approval, retry, and queue state meet in one test.
- Push stays denied.

artifacts:

- packages/orchestrator/src/fixture-run.ts

key_links:

- runFixture calls schedule, triage, queue, and the runner seam.

prohibitions:

- Do not call live grok.
- Do not push.
- Do not start Mostly Harmless gates here.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/orchestrator test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/120.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
test(orchestrator): run the drive against a fixture spawn
```

## REVIEW CHECKPOINT

This build closes a review group and the Improbability Drive phase. After this commit, the driver runs the fresh-session reviewer prompt `121-review-120.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `120` Run the drive loop against a fixture spawn (Eddie, Forty-Two, xhigh)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
