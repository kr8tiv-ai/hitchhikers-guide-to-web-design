---
id: "114"
kind: build
phase: improbability-drive
slice: Eddie
title: "Read the drive queue from disk and schedule its reviews"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["007", "113", "090"]
files: ["packages/orchestrator/src/queue-file.ts", "packages/orchestrator/test/queue-file.test.ts", "packages/orchestrator/src/schedule.ts", "packages/orchestrator/test/schedule.test.ts"]
requirements: ["HH-DRIVE-07", "HH-DRIVE-06"]
review_checkpoint_embedded: true
---

# 114. Read the drive queue from disk and schedule its reviews

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

Persist the queue as `.hitchhiker/queue.json` using the state lock and temp-file rename. The dashboard can read it without starting a prompt. Status values are queued, running, passed, fixing, escalated, paused. A pause flips running back to paused and does not delete finished rows.

Merged scope (formerly a separate prompt, "Schedule a review every three site prompts and at phase end"): Given an ordered list of site prompts, mark every third one and the last prompt in each group as needing a review before the next build prompt. The function returns the queue with review steps inserted. It does not run them.

## Why this prompt exists

If queue state lives in a process, a crash forgets which prompt was next. The file is the source of truth.

The user's process is a reviewer every three prompts. If the scheduler is a comment, the drive will skip it when it is tired.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11.4
- packages/engine/src/state.ts
- packages/orchestrator/src/schedule.ts
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11.3
- packages/engine/src/spec/site-prompts.ts

## Files to create or change

- packages/orchestrator/src/queue-file.ts
- packages/orchestrator/test/queue-file.test.ts
- packages/orchestrator/src/schedule.ts
- packages/orchestrator/test/schedule.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

QueueFile is `{ items: Array<{ id, kind, status }> }`. load and save go through withStateLock. save writes temp then rename. pause(queue) sets any running item to paused. It refuses to pause an escalated item into queued. Tests use a temp project dir and the real lock.

Merged scope, "Schedule a review every three site prompts and at phase end": insertReviews(ids) returns items `{ id, kind: 'build' | 'review' }`. Input is an ordered list of {id, phase}. After every third build within a phase, and after the last build of each phase, insert `review-after-<id>` with `phaseEnd: true` on phase-end reviews. Phase-end reviews run at xhigh; others at high. Groups are contiguous. Do not insert a review before the first build. A list of 1 returns the build plus one review. A list of 3 returns three builds and one review.

## Interfaces and data shapes

```ts
export type QueueStatus = "queued" | "running" | "passed" | "fixing" | "escalated" | "paused";
export interface QueueFile { items: Array<{ id: string; kind: "build" | "review"; status: QueueStatus }>; }
export function saveQueue(projectDir: string, queue: QueueFile): Promise<void>;
export function loadQueue(projectDir: string): Promise<QueueFile | null>;
export function pauseQueue(queue: QueueFile): QueueFile;
```

```ts
export function insertReviews(prompts: Array<{ id: string; phase: string }>): Array<{ id: string; kind: "build" | "review"; phaseEnd?: boolean; effort?: "high" | "xhigh" }>;
```

## Steps

1. Implement save and load. Missing file returns null.

2. Round-trip a two-item queue in a temp dir.

3. pauseQueue changes running to paused and leaves passed alone.

4. Corrupt JSON throws and does not delete the file.

5. Use the engine lock. Orchestrator already depends on engine.

6. Do not start grok.

7. Export the functions.

8. Assert a secret-looking string in an id throws. Ids must match `/^[a-z0-9-]+$/`.

9. Implement the cadence. Test length 3 and length 1 and length 4.

10. Length 4 expects a review after the third and after the fourth.

11. Duplicate ids in the input throw.

12. Empty input throws.

13. Review ids are deterministic.

14. Do not call the runner.

15. Export insertReviews.

16. Assert the first item is always a build.

## Edge cases

- Two saves serialize. You do not have to spawn processes. A comment points at the lock.
- Empty items array is valid and means the drive has not been planned.
- A single id still gets a trailing review because it is the phase end of a tiny package.
- Ids that already start with `review-` throw so the caller cannot double-schedule.

## Acceptance criteria

- [ ] Queue round-trips under the lock.
- [ ] Pause does not erase history.
- [ ] Bad ids are rejected.
- [ ] Reviews land on multiples of three and at the end.
- [ ] The queue never starts with a review.
- [ ] Ids are unique.

## must_haves

truths:

- The dashboard can read status from disk.
- Pause is a status change, not a deletion.
- The cadence is data.
- Nothing is executed here.

artifacts:

- packages/orchestrator/src/queue-file.ts
- packages/orchestrator/src/schedule.ts

key_links:

- Items are the output of insertReviews plus statuses.
- Prompt ids come from generateSitePrompts.

prohibitions:

- Do not store API keys in the queue file.
- Do not delete passed rows on pause.
- Do not skip the final review.
- Do not run grok.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/orchestrator test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/114.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(orchestrator): persist the drive queue
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `115-review-112-114.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `112` Lint generated copy for slop and allow Elevate only as a product name (Zaphod, Gargle Blaster, high)
- `113` Write PASS, FIX, or ESCALATE after at most two fix rounds (Zaphod, Heart of Gold, high)
- `114` Read the drive queue from disk and schedule its reviews (Eddie, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
