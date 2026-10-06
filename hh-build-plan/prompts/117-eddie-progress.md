---
id: "117"
kind: build
phase: improbability-drive
slice: Eddie
title: "Update STATE.md as each prompt finishes"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["114", "098"]
files: ["packages/orchestrator/src/progress.ts", "packages/orchestrator/test/progress.test.ts"]
requirements: ["HH-DRIVE-09"]
review_checkpoint_embedded: false
---

# 117. Update STATE.md as each prompt finishes

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

After a prompt passes, mark it passed in the queue and write STATE.md with the next id as next action. After an escalation, set the state blockers to that id. Use the existing lock. Do not invent a second state file.

## Why this prompt exists

The map and the dashboard must agree. Two writers with two formats will resume the wrong prompt.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 11.4
- packages/engine/src/state.ts
- packages/orchestrator/src/queue-file.ts

## Files to create or change

- packages/orchestrator/src/progress.ts
- packages/orchestrator/test/progress.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

advance({ projectDir, finishedId, outcome, commit }) loads the queue and state, updates both, and saves both inside one lock if you can. If the lock helper only wraps a callback, do both writes inside that callback. outcome is passed or escalated. commit is the sha string stored in lastGoodCommit only when passed. Escalation does not move lastGoodCommit.

## Interfaces and data shapes

```ts
export function advance(input: {
  projectDir: string;
  finishedId: string;
  outcome: "passed" | "escalated";
  commit: string | null;
}): Promise<{ nextId: string | null }>;
```

## Steps

1. On passed, set that item to passed and lastGoodCommit to the sha. nextAction becomes the next queued id or `Drive idle`.

2. On escalated, set the item to escalated, append the id to blockers, and do not change lastGoodCommit.

3. Unknown id throws.

4. A commit sha must match `/^[0-9a-f]{7,40}$/` or be null. Other strings throw.

5. Test in a temp git-less directory. You do not need a real commit. Pass a fake sha `abc1234`.

6. Use loadState and saveState. Create a minimal state if null.

7. Do not push.

8. Export advance.

## Edge cases

- Advancing the last item sets next id null.
- Advancing a paused queue throws. The user must resume first. Document it.

## Acceptance criteria

- [ ] A pass updates the queue and STATE together.
- [ ] An escalation records a blocker and keeps the old good commit.
- [ ] Bad shas are rejected.

## must_haves

truths:

- Progress uses GuideState, not a side channel.
- A good commit pointer only moves on success.

artifacts:

- packages/orchestrator/src/progress.ts

key_links:

- advance writes the same STATE.md the interview and the map use.

prohibitions:

- Do not create a second status markdown.
- Do not push.
- Do not clear blockers on escalation.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/orchestrator test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/117.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(orchestrator): record drive progress in STATE.md
```
