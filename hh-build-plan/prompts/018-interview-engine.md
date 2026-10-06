---
id: "018"
kind: build
phase: dont-panic
slice: The Guide
title: "Run the interview one question at a time"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["007", "017"]
files: ["packages/engine/src/interview.ts", "packages/engine/test/interview.test.ts"]
requirements: ["HH-INT-04"]
review_checkpoint_embedded: false
---

# 018. Run the interview one question at a time

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

Drive the tree one question at a time. The user can Answer, Suggest, or Skip. Progress saves under the state lock so a killed process resumes on the same id. Suggest in this prompt returns the deterministic fallback (035 replaces it with a grounded live Grok Suggest through the 011 adapter): the question's suggest string, or a deterministic fallback.

## Why this prompt exists

This is the walking skeleton of Don't Panic. Chat UI and voice come later and must sit on a session object that already saves.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 6, 8.2, and 8.4
- packages/engine/src/tree.ts
- packages/engine/src/required.ts
- packages/engine/src/state.ts
- packages/engine/src/lock.ts

## Files to create or change

- packages/engine/src/interview.ts
- packages/engine/test/interview.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

InterviewSession is created with projectDir, depth, and a clock. start() loads the tree, filters by depth, and if STATE.md has promptId `interview:<id>` and that id is in the filtered list, resumes there. Otherwise it starts at the first question. command(input) accepts `{ type: 'answer', text }`, `{ type: 'suggest' }`, or `{ type: 'skip' }`. answer stores ANSWERED. suggest stores SUGGESTED and sets value to the question suggest or `No suggestion is written for this question yet.` skip stores SKIPPED and value skipDefault. After each command, persist answers to `.hitchhiker/interview.json` via temp file plus the state lock, and saveState with promptId `interview:<nextId>` or `interview:done`. next() returns the current question or null when done. One question is exposed. There is no method that returns the rest of the ask strings to the UI layer. A test can see them only through the tree loader, which is fine. Pushback is the next prompt. Do not call fetch.

## Interfaces and data shapes

```ts
export type InterviewCommand =
  | { type: "answer"; text: string }
  | { type: "suggest" }
  | { type: "skip" };

export interface InterviewSession {
  next(): Question | null;
  command(input: InterviewCommand): Promise<AnswerRecord>;
  coverage(): { answered: number; suggested: number; skipped: number; soft: number; imported: number };
}

export function openInterview(projectDir: string, depth: "express" | "standard" | "deep"): Promise<InterviewSession>;
```

## Steps

1. Implement openInterview. It mkdir .hitchhiker, loads answers if interview.json exists, and positions the cursor on the first unanswered id in depth order.

2. command rejects an empty answer string with InterviewError. The user must Skip to store an assumption. Do not coerce empty to skip.

3. After a successful command, write interview.json and STATE.md inside one withStateLock so the two files cannot diverge across a crash between them. Write both temp files, then rename answers, then rename state.

4. coverage() counts statuses in the saved list.

5. Resume test: answer two questions, construct a new session on the same temp dir, and assert next().id is the third question.

6. Suggest test: DP-0.7 returns a suggest that mentions Standard if you set suggest on that question. If the yaml suggest is missing, the fallback string is stored and status is SUGGESTED.

7. Skip test: DP-6.2 value equals the tree skip_default and missingRequired no longer lists it once the other required ids are filled in the fixture.

8. A second command when next() is null throws. It does not append a ghost answer.

9. Export openInterview from the engine index. Use node:fs and node:path only.

## Edge cases

- Corrupt interview.json throws a named error and does not delete the file. The test writes `{` and expects the throw.
- Depth express never returns DP-0.5. Resume must not stick on an id that is outside the depth.
- Concurrent command calls are not supported. The session is single-flight. Document it. A test may skip concurrency.

## Acceptance criteria

- [ ] Resume continues at the next unanswered question.
- [ ] Empty answers throw.
- [ ] Skip stores the tree default and the status SKIPPED.
- [ ] Suggest does not open a network socket. The test fails if interview.ts contains `fetch(`.

## must_haves

truths:

- Only one current question is offered by the session.
- Answers and STATE.md update under the same lock.
- Suggest is local text in this prompt.

artifacts:

- packages/engine/src/interview.ts
- .hitchhiker/interview.json is produced at runtime, not committed

key_links:

- openInterview calls loadTree, missingRequired's types, and withStateLock.
- STATE promptId is `interview:<id>` while a question remains.

prohibitions:

- Do not hand-roll a model call in this module. The live Grok call goes through the 011 adapter and is wired in 035; this module stays the deterministic validator and shaper underneath it, tested with fixtures and recorded cassettes. No direct network calls here.
- Do not show the full remaining questionnaire in the session API.
- Do not write into `.planning/`.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/018.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(engine): interview one question at a time with resume
```
