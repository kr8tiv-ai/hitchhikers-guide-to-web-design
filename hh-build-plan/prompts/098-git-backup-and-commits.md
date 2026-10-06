---
id: "098"
kind: build
phase: improbability-drive
slice: Vogon Constructor Fleet
title: "Back up the branch and commit one prompt at a time"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["097", "007"]
files: ["packages/orchestrator/src/git-flow.ts", "packages/orchestrator/test/git-flow.test.ts"]
requirements: ["HH-DRIVE-03"]
review_checkpoint_embedded: true
---

# 098. Back up the branch and commit one prompt at a time

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

Create a backup ref `hh/backup-<date>`, then one commit per successful prompt on the build branch. Protected paths `.hitchhiker/config.json` secrets and `.env` files cannot be in the commit. The test uses a temp git repo. Do not push.

## Why this prompt exists

Rollback needs a commit boundary per prompt. A squash of twenty prompts makes Marvin useless.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11.1 preflight
- packages/orchestrator/src/policy.ts

## Files to create or change

- packages/orchestrator/src/git-flow.ts
- packages/orchestrator/test/git-flow.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

prepareRepo(dir, date) creates the backup branch if git is available. commitPrompt(dir, message) runs git add -A then a denylist check of staged names, then git commit. If a staged path matches `.env` or ends with `.pem` or is `credentials.json`, unstage it and throw if it was the only change. Message is required and must not be empty. Never call git push. The test inits a repo in os.tmpdir(). Skip the test with a clear message if git is missing, but the policy unit test still checks the path denylist without git via a pure function assertNoSecrets(paths).

## Interfaces and data shapes

```ts
export function assertNoSecrets(paths: string[]): void;
export function backupBranchName(date: string): string;
export function commitPrompt(dir: string, message: string, runner: (args: string[]) => Promise<void>): Promise<void>;
```

## Steps

1. backupBranchName returns `hh/backup-YYYY-MM-DD`. Invalid date throws.

2. assertNoSecrets throws on `.env`, `.env.local`, and `*.pem`.

3. commitPrompt calls the runner with git add and git commit. It never calls push. The test runner throws if args include push.

4. Empty message throws.

5. If assertNoSecrets throws, commit is not called. Order the checks first.

6. Use node:path for path suffixes.

7. Do not set user.email in the global git config. If the temp repo needs a user, set it in the local repo only inside the test.

8. Export the functions.

## Edge cases

- A path `notenv` is allowed. Match segment `.env` exactly.
- Message with a newline throws so the subject stays one line.
- runner failures propagate.

## Acceptance criteria

- [ ] Backup name is stable.
- [ ] Secret paths block the commit.
- [ ] Push is not invoked.

## must_haves

truths:

- One prompt is one commit.
- Secrets are not staged by this helper.
- Nothing is pushed.

artifacts:

- packages/orchestrator/src/git-flow.ts

key_links:

- commitPrompt uses assertNoSecrets and the command policy's spirit. Call evaluateCommand on the argv too.

prohibitions:

- Do not git push.
- Do not change global git config.
- Do not commit .env files.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/orchestrator test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/098.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(orchestrator): back up the branch and commit per prompt
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `099-review-096-098.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `096` Launch one site prompt as a fresh headless session (Vogon Constructor Fleet, Forty-Two, xhigh)
- `097` Deny push, deploy, and unapproved destructive actions (Vogon Constructor Fleet, Heart of Gold, xhigh)
- `098` Back up the branch and commit one prompt at a time (Vogon Constructor Fleet, Heart of Gold, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
