---
id: "007"
kind: build
phase: dont-panic
slice: Towel Check
title: "Lock STATE.md writes with a stale-pid takeover"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["002"]
files: ["packages/engine/src/lock.ts", "packages/engine/src/state.ts", "packages/engine/src/home-index.ts", "packages/engine/test/lock.test.ts", "packages/engine/test/state.test.ts"]
requirements: ["HH-STATE-02"]
review_checkpoint_embedded: true
---

# 007. Lock STATE.md writes with a stale-pid takeover

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

Write `.hitchhiker/STATE.md` and the home index without two processes corrupting them. The lock is an exclusive create of `.hitchhiker/state.lock`. A stale lock whose pid is dead can be taken over after the recorded time is older than 30 seconds. Writers write a temp file in the same directory and rename it over the target.

## Why this prompt exists

The interview, the orchestrator, and the dashboard all write STATE. A torn write on Windows looks like a corrupt project. The lock is the whole reliability story for unattended runs.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 10.1 and 19
- packages/engine/templates/gsd/state.md
- packages/engine/src/templates.ts

## Files to create or change

- packages/engine/src/lock.ts
- packages/engine/src/state.ts
- packages/engine/src/home-index.ts
- packages/engine/test/lock.test.ts
- packages/engine/test/state.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Lock file JSON: `{ pid, acquiredAt }`. Create it with flag `wx`, which fails if it exists. On EEXIST, read the lock. If the pid is alive, throw LockHeld with the pid. Alive means `process.kill(pid, 0)` does not throw ESRCH. On Windows, ESRCH still means dead. EPERM means alive. If the pid is dead and acquiredAt is older than 30s, remove the lock and retry once. If it is dead but younger than 30s, throw LockHeld so a slow crash cannot be stolen mid-write. withStateLock(projectDir, fn) always releases in a finally, and only deletes the lock if the pid still matches. state.ts stores GuideState: phase, slice, promptId, lastGoodCommit, blockers string[], nextAction, updatedAt ISO. saveState renders nothing by hand: it writes a short markdown document with those fields as headings, through a temp file. home-index.ts uses os.homedir() joined with `.hitchhiker` and `index.json`, which is an array of `{ name, path, updatedAt }`. Never hardcode `/Users` or `C:\\`. Index updates take their own lock file `index.lock` beside the index, using the same helper.

## Interfaces and data shapes

```ts
export interface LockInfo { pid: number; acquiredAt: string; }

export class LockHeld extends Error { pid: number; }

export function withStateLock<T>(projectDir: string, fn: () => Promise<T> | T): Promise<T>;

export interface GuideState {
  phase: string;
  slice: string;
  promptId: string;
  lastGoodCommit: string;
  blockers: string[];
  nextAction: string;
  updatedAt: string;
}

export function loadState(projectDir: string): GuideState | null;
export function saveState(projectDir: string, state: GuideState): Promise<void>;

export interface HomeProject { name: string; path: string; updatedAt: string; }
export function upsertHomeProject(entry: HomeProject): Promise<void>;
```

## Steps

1. Implement acquire and release in lock.ts using node:fs open with the `wx` flag. Store JSON with pid and acquiredAt. Do not use a third-party lock package.

2. Implement the stale rules in the context, including the 30 second floor and a single retry. A second failure throws LockHeld.

3. withStateLock creates `.hitchhiker` if needed (recursive mkdir) before the exclusive create. Release runs in finally even when fn throws.

4. saveState writes `STATE.md.tmp-<pid>` in `.hitchhiker` and fs.rename onto `STATE.md`. loadState parses the headings back. A missing file returns null.

5. Round-trip test: save a state whose nextAction contains a colon and a quote, load it, deep-equal the fields.

6. Lock test: hold a lock with a live pid in a temp project, call saveState, expect LockHeld. Then write a lock whose pid is 2147483646 (unlikely to exist) and acquiredAt is two minutes ago, and expect takeover to succeed.

7. A young dead lock (acquiredAt now, fake dead pid) still throws. That test freezes time by passing a clock function into acquire, defaulting to Date.now, so you do not sleep 30 seconds.

8. upsertHomeProject creates the home directory if needed, locks, updates or inserts by path, and writes index.json via temp plus rename. Two upserts of the same path leave one row.

9. Export the functions from the engine index. Do not log the home path at info level. Tests may print it.

## Edge cases

- pid reuse: the 30 second floor is the mitigation. Document it in a one-line comment on the constant.
- rename over an existing STATE.md must succeed on Windows. Node's fs.rename replaces. Do not unlink first in a way that leaves a gap without the temp file still present.
- A project path that does not exist throws before taking the home lock, so a typo cannot insert a ghost row. upsertHomeProject does not require the project to exist, because /hh-new will call it after mkdir. Document that callers mkdir first. The test mkdirs.
- Concurrent saves are serialized by the lock, not by hope. The test can run two acquires. The second sees LockHeld.

## Acceptance criteria

- [ ] A live lock blocks a second writer.
- [ ] A stale dead lock older than 30 seconds is recoverable.
- [ ] STATE.md round-trips punctuation.
- [ ] The home index path is os.homedir() plus `.hitchhiker/index.json`.

## must_haves

truths:

- Writers use exclusive create and same-directory rename.
- A lock is released when the writer throws.
- The home index dedupes by project path.

artifacts:

- packages/engine/src/lock.ts
- packages/engine/src/state.ts
- packages/engine/src/home-index.ts

key_links:

- saveState calls withStateLock.
- upsertHomeProject uses the same acquire helper and os.homedir().

prohibitions:

- Do not use `.planning/` as the state directory.
- Do not shell out to `ln` or `lockfile` Unix tools.
- Do not sleep 30 seconds inside the test suite.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/007.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(engine): lock STATE.md and the home project index
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `008-review-005-007.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `005` CI workflows (Towel Check, Cup of Tea, medium)
- `006` Validate .hitchhiker config.json (Towel Check, Cup of Tea, medium)
- `007` Lock STATE.md writes with a stale-pid takeover (Towel Check, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
