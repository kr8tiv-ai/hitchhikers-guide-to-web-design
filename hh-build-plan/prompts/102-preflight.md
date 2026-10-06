---
id: "102"
kind: build
phase: improbability-drive
slice: Vogon Constructor Fleet
title: "Run preflight checks before the queue starts"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["098", "093"]
files: ["packages/orchestrator/src/preflight.ts", "packages/orchestrator/test/preflight.test.ts"]
requirements: ["HH-DRIVE-05"]
review_checkpoint_embedded: true
---

# 102. Run preflight checks before the queue starts

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

Before the first prompt, check approval, a clean enough git status, the backup branch name, and that a baselines directory exists or can be created. Do not start a dev server in the unit test. Report a missing server as a warning unless the prompt package says a server is required.

## Why this prompt exists

Marvin cannot screenshot a site that was never going to boot, and a dirty tree makes the backup useless.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11.1
- packages/orchestrator/src/git-flow.ts
- packages/engine/src/spec/approve-drive.ts

## Files to create or change

- packages/orchestrator/src/preflight.ts
- packages/orchestrator/test/preflight.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

preflight(input) returns `{ ok, warnings, backup }`. ok is false if approval is missing or if git status contains unparsed secrets. Warnings include `dev server not checked` when no probe function is passed. If probe is passed and returns false, ok is false with reason `dev server down`. Create `baselines/` under the project via an injected mkdir. Do not delete existing baselines. Date comes from the caller.

## Interfaces and data shapes

```ts
export function preflight(input: {
  approved: boolean;
  statusPorcelain: string;
  date: string;
  serverProbe?: () => boolean;
}): { ok: boolean; warnings: string[]; backup: string; reasons: string[] };
```

## Steps

1. Unapproved returns ok false and does not name a backup as ready. Still return the branch name so the UI can explain.

2. Porcelain containing `.env` fails ok.

3. serverProbe omitted adds the warning and can still be ok.

4. serverProbe false fails ok.

5. Test a clean porcelain string `## main` as ok when approved.

6. Do not spawn git. The porcelain is an argument so the test stays pure. A separate thin wrapper may exist but the test covers the pure function.

7. No network.

8. Export preflight.

## Edge cases

- Empty porcelain is ok.
- Reasons are human-readable and contain no exclamation marks.

## Acceptance criteria

- [ ] Missing approval fails preflight.
- [ ] A down server fails only when a probe is provided.
- [ ] Backup name matches the git helper.

## must_haves

truths:

- The queue does not start unapproved.
- Preflight is testable without a dev server.

artifacts:

- packages/orchestrator/src/preflight.ts

key_links:

- preflight uses backupBranchName and the approval boolean.

prohibitions:

- Do not start the queue from preflight.
- Do not delete baselines.
- Do not push.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/orchestrator test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/102.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(orchestrator): add drive preflight
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `103-review-100-102.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `100` Discover and install tools, APIs, and MCP servers (Somebody Else's Problem Field, Heart of Gold, high)
- `101` Route effort, bump it once on retry, and gate the worktrees flag (Vogon Constructor Fleet, Gargle Blaster, high)
- `102` Run preflight checks before the queue starts (Vogon Constructor Fleet, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
